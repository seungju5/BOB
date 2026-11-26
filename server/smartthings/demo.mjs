import { meterSignal } from './cooking-signal.mjs';
import { ApiError, equal, identifier, random } from './security.mjs';
import { meterObservation, safeDevice } from './smartthings.mjs';

const ttl = 10 * 60_000;
const prefix = '/api/demo/smartthings/';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers });

function meterChoices(devices) {
  const choices = [];
  for (const device of devices) {
    if (!identifier(device?.deviceId)) continue;
    const meters = device.components?.filter(part => part.capabilities?.some(cap => cap.id === 'powerMeter'));
    // Select the same outlet for both power and energy, including multi-outlet devices.
    for (const meter of meters ?? []) {
      if (!identifier(meter.id)) continue;
      const { label, isVirtual } = safeDevice({ ...device, components: [meter] });
      choices.push({
        deviceId: device.deviceId, componentId: meter.id,
        label: meters.length === 1 ? label : label + ' · ' + (meter.label || meter.id),
        deviceKind: isVirtual === true ? 'virtual' : isVirtual === false ? 'recognized' : 'unknown',
      });
    }
  }
  return choices;
}

// One presenter per local server. A new successful setup replaces the previous grant.
export function createDemoApi({ origin, smartthings, now = Date.now }) {
  let pending = null;
  let expiry;
  function clear() {
    clearTimeout(expiry);
    pending = null;
  }
  async function handle(request) {
    try {
      const url = new URL(request.url);
      if (url.origin !== origin || request.headers.get('host') !== url.host)
        throw new ApiError(403, 'local_only');
      if (url.search || !url.pathname.startsWith(prefix)) throw new ApiError(404, 'not_found');
      const action = url.pathname.slice(prefix.length);
      if (action === 'ready' && request.method === 'GET') return json({ available: true });
      if (!['prepare', 'read', 'cancel'].includes(action)) throw new ApiError(404, 'not_found');
      if (request.method !== 'POST') throw new ApiError(405, 'method_not_allowed');
      if (request.headers.get('origin') !== origin) throw new ApiError(403, 'local_only');
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
        throw new ApiError(415, 'invalid_request');
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_request');
      if (action === 'prepare') {
        const pat = body.pat;
        if (typeof pat !== 'string' || !/^[A-Za-z0-9._~+/=-]{1,2048}$/.test(pat))
          throw new ApiError(400, 'invalid_token_input');
        const choices = meterChoices(await smartthings.devices(pat));
        if (!choices.length) throw new ApiError(422, 'no_meters');
        clear();
        const grant = random();
        const expiresAt = now() + ttl;
        pending = { grant, pat, choices, expiresAt };
        expiry = setTimeout(clear, ttl);
        expiry.unref();
        return json({ grant, expiresAt, choices: choices.map(({ label }, index) => ({ index, label })) });
      }
      if (pending && now() >= pending.expiresAt) clear();
      if (!pending || !equal(request.headers.get('authorization'), 'Bearer ' + pending.grant))
        throw new ApiError(410, 'grant_ended');
      if (action === 'cancel') {
        clear();
        return json({ cancelled: true });
      }
      const choice = Number.isInteger(body.choice) && pending.choices[body.choice];
      if (!choice) throw new ApiError(400, 'choose_device');
      const { pat } = pending;
      // Consume before the first await so retries and simultaneous clicks cannot read twice.
      clear();
      const status = await smartthings.status(pat, choice.deviceId);
      const checkedAt = now();
      return json({
        deviceKind: choice.deviceKind, checkedAt,
        ...meterSignal(meterObservation(status, checkedAt, choice.componentId)),
      });
    } catch (error) {
      return error instanceof ApiError ? json({ error: error.code }, error.status)
        : json({ error: 'upstream_unavailable' }, 502);
    }
  }
  return { handle, clear };
}
