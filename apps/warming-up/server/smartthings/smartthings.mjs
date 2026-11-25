import { ApiError, identifier } from './security.mjs';

export function smartThingsClient(config, fetcher = fetch) {
  async function request(path, { token, method = 'GET', body, form } = {}) {
    const response = await fetcher(`https://api.smartthings.com${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: 'application/json',
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {
              Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
            }),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      // OAuth errors describe a rejected grant or client configuration. Never
      // expose the upstream body (which may echo credentials) to callers.
      if (form && [400, 401].includes(response.status)) {
        const raw = await response.text();
        let code;
        if (raw.length <= 16384)
          try {
            code = JSON.parse(raw).error;
          } catch {}
        if (code === 'invalid_grant') throw new ApiError(401, 'reconnect_required');
        if (
          [
            'invalid_client',
            'invalid_request',
            'invalid_scope',
            'unauthorized_client',
            'unsupported_grant_type',
          ].includes(code)
        )
          throw new ApiError(503, 'oauth_configuration_required');
      }
      const code =
        {
          401: 'reconnect_required',
          402: 'plan_required',
          403: 'permission_required',
          404: 'device_missing',
          409: 'subscription_exists',
          429: 'rate_limited',
        }[response.status] || 'upstream_unavailable';
      throw new ApiError(response.status === 401 ? 401 : response.status === 429 ? 429 : 502, code);
    }
    if (response.status === 204) return {};
    const raw = await response.text();
    if (raw.length > 2097152) throw new ApiError(502, 'upstream_unavailable');
    return raw ? JSON.parse(raw) : {};
  }
  const devicePath = (id) => {
    if (!identifier(id)) throw new ApiError(400, 'invalid_device');
    return `/v1/devices/${id}`;
  };
  const installationPath = (id) => {
    if (!identifier(id)) throw new ApiError(400, 'invalid_installation');
    return `/v1/installedapps/${id}`;
  };
  const subscriptions = (id) => installationPath(id) + '/subscriptions';
  return {
    installation(token, id) {
      return request(installationPath(id), { token });
    },
    async exchange(code) {
      return request(`/v1/oauth/token`, {
        method: 'POST',
        form: {
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          redirect_uri: config.redirect,
        },
      });
    },
    async refresh(refreshToken) {
      return request(`/v1/oauth/token`, {
        method: 'POST',
        form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.clientId },
      });
    },
    async devices(token) {
      const items = [];
      let path = '/v1/devices?capability=powerMeter';
      for (let page = 0; path && page < 5; page++) {
        const data = await request(path, { token });
        items.push(...(data.items || []));
        if (!data._links?.next?.href) return items;
        const next = new URL(data._links.next.href, 'https://api.smartthings.com');
        if (next.origin !== 'https://api.smartthings.com' || next.pathname !== '/v1/devices')
          throw new ApiError(502, 'upstream_unavailable');
        path = next.pathname + next.search;
      }
      throw new ApiError(422, 'too_many_devices');
    },
    device: (token, id) => request(devicePath(id), { token }),
    status: (token, id) => request(`${devicePath(id)}/status`, { token }),
    async subscribe(token, installId, deviceId) {
      const path = subscriptions(installId);
      const name = 'warmingUpPower';
      const matches = (item) =>
        item?.sourceType === 'DEVICE' &&
        item.device?.deviceId === deviceId &&
        (!item.installedAppId || item.installedAppId === installId) &&
        (!item.device.capability || ['*', 'powerMeter'].includes(item.device.capability)) &&
        (!item.device.attribute || ['*', 'power'].includes(item.device.attribute)) &&
        (!(item.subscriptionName || item.device.subscriptionName) ||
          (item.subscriptionName || item.device.subscriptionName) === name);
      try {
        const created = await request(path, {
          token,
          method: 'POST',
          body: {
            sourceType: 'DEVICE',
            device: { deviceId },
            subscriptionName: name,
          },
        });
        if (!matches(created)) throw new ApiError(502, 'subscription_unconfirmed');
        return created;
      } catch (error) {
        if (error.code !== 'subscription_exists') throw error;
      }
      const existing = await request(path, { token });
      const match = (Array.isArray(existing.items) ? existing.items : []).find(matches);
      if (!match) throw new ApiError(409, 'subscription_conflict');
      return match;
    },
    async unsubscribe(token, installId) {
      try {
        await request(subscriptions(installId), { token, method: 'DELETE' });
      } catch (error) {
        if (error.code !== 'device_missing') throw error;
      }
    },
    async confirm(url) {
      const target = new URL(url);
      if (
        target.origin !== 'https://api.smartthings.com' ||
        target.username ||
        target.password ||
        target.hash ||
        target.pathname !== `/v1/apps/${config.appId}/confirm-registration` ||
        !target.searchParams.get('token')
      )
        throw new ApiError(400, 'invalid_confirmation');
      const response = await fetcher(target, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new ApiError(502, 'confirmation_failed');
    },
  };
}

const knownTransports = new Set(['BLE', 'BLE_D2D', 'LAN', 'MATTER', 'ZIGBEE', 'ZWAVE']);

export function hasMeteredPlugCategory(component) {
  return component.categories?.some(category => category.name === 'SmartPlug' && category.categoryType === 'manufacturer') &&
    component.capabilities?.some(capability => capability.id === 'powerMeter');
}

export function safeDevice(device) {
  const components = device.components || [];
  const capabilities = new Set(
    components.flatMap((component) =>
      (component.capabilities || []).map((item) => item.id),
    ),
  );
  // Samsung reports direct Wi-Fi devices as MQTT and partner Schema devices as
  // VIPER. In both cases classify the outlet from its manufacturer's profile.
  const meteredPlug = (device.type === 'MQTT' || device.type === 'VIPER') && components.some(hasMeteredPlugCategory);
  const virtual =
    device.type === 'VIRTUAL' ? true : knownTransports.has(device.type) || meteredPlug ? false : undefined;
  return {
    id: device.deviceId,
    label: String(device.label || device.name || '이름 없는 기기').slice(0, 100),
    power: capabilities.has('powerMeter'),
    energy: capabilities.has('energyMeter') || capabilities.has('powerConsumptionReport'),
    ...(virtual !== undefined ? { isVirtual: virtual } : {}),
  };
}

// SmartThings webhook events use an ISO eventTime. Attribute status uses its own
// ISO timestamp. Receipt time never substitutes for measurement time.
export function measuredTime(value, now) {
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:[0-5]\d)$/.exec(
    value,
  );
  if (!iso) return null;
  const [, year, month, day, hour] = iso.map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23
  )
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= now ? parsed : null;
}

// Compare only attributes from the same outlet. On multi-outlet devices, a
// newer reading on outlet B must never be paired with outlet A's energy.
export function meterObservation(status, now, componentId) {
  const outlets = status?.components ?? {};
  const components = componentId === undefined ? Object.values(outlets) :
    Object.hasOwn(outlets, componentId) ? [outlets[componentId]] : [];
  let reading = null, selected = null;
  for (const component of components) {
    const power = component?.powerMeter?.power;
    const time = measuredTime(power?.timestamp, now);
    if (
      time === null ||
      typeof power?.value !== 'number' ||
      !Number.isFinite(power.value) ||
      power.value < 0 ||
      power.unit !== 'W'
    )
      continue;
    if (!reading || time > reading.measuredAt) {
      reading = { watts: power.value, measuredAt: time };
      selected = component;
    }
  }
  if (!selected && components.length === 1) selected = components[0];
  const meter = selected?.energyMeter?.energy;
  const energyAt = measuredTime(meter?.timestamp, now);
  const kwh = meter?.unit === 'kWh' ? meter.value : meter?.unit === 'Wh' && typeof meter.value === 'number' ? meter.value / 1000 : null;
  const energy = typeof kwh === 'number' && Number.isFinite(kwh) && kwh >= 0 && energyAt !== null
    ? { kwh, measuredAt: energyAt } : null;
  return { reading, energy };
}

export function readingSummary(status, now) {
  return meterObservation(status, now).reading;
}
