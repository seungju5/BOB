import {
  ApiError,
  hash,
  random,
  identifier,
  equal,
  vault,
  TEAM_PROJECT_ID,
  CONSENT,
} from './security.mjs';
import { safeDevice, meterObservation, measuredTime } from './smartthings.mjs';
import { hasPowerChecks, matchesPowerCheck, POWER_CHECK_MINUTES, POWER_CHECK_MS, POWER_NOTICE_CONSENT } from './power-notice.mjs';
import { isCookingPower, meterSignal } from './cooking-signal.mjs';

const PREFIX = '/api/smartthings';
export { CONSENT };
export const configured = (config) =>
  Boolean(
    identifier(config.appId) &&
    config.clientId &&
    config.secret &&
    config.projectId === TEAM_PROJECT_ID &&
    Buffer.from(config.key || '', 'base64').length === 32,
  );
const response = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  });
function publicConnection(current) {
  if (!current) return { stage: 'disconnected' };
  const device = current.deviceId
    ? {
        id: current.deviceId,
        label: current.deviceLabel,
        ...(typeof current.deviceIsVirtual === 'boolean' ? { isVirtual: current.deviceIsVirtual } : {}),
      }
    : null;
  return {
    stage: current.stage,
    device,
    connectedAt: current.connectedAt,
    lastSignalAt: current.lastSignalAt ?? null,
    lastEventAt: current.lastEventAt ?? null,
    lastReceivedAt: current.lastReceivedAt ?? null,
    lastCheckedAt: current.lastCheckedAt ?? null,
    hasPower: current.hasPower ?? null,
    ...(hasPowerChecks(current) && {powerChecks: {nextAt: current.powerChecks.nextAt,
      checkedAt: current.powerChecks.checkedAt ?? null, measuredAt: current.powerChecks.measuredAt ?? null}}),
    ...(current.stage === 'connected' && current.deviceIsVirtual === false &&
      current.powerNotice?.version === POWER_NOTICE_CONSENT && {
        powerNotice: { enabled: true, lastObservedAt: current.powerNotice.lastObservedAt ?? null },
      }),
  };
}
const DAY = 86400000;
const nextRefresh = (tokens, now) => new Date(now + Math.min((tokens.expiresAt - now) * 0.75, 7 * DAY));
function tokenBundle(data, now, previous) {
  if (
    typeof data.access_token !== 'string' ||
    !data.access_token ||
    typeof data.refresh_token !== 'string' ||
    !data.refresh_token ||
    !Number.isFinite(Number(data.expires_in)) ||
    Number(data.expires_in) <= 0
  )
    throw new ApiError(502, 'reconnect_required');
  if (data.token_type !== undefined && String(data.token_type).toLowerCase() !== 'bearer')
    throw new ApiError(502, 'oauth_configuration_required');
  if (
    data.scope !== undefined &&
    (typeof data.scope !== 'string' ||
      !data.scope
        .trim()
        .split(/\s+/)
        .every((scope) => /^r:devices:(?:\*|[A-Za-z0-9_-]+)$/.test(scope)))
  )
    throw new ApiError(502, 'oauth_configuration_required');
  if (data.installed_app_id && previous && data.installed_app_id !== previous)
    throw new ApiError(502, 'reconnect_required');
  const expiresAt = now + Number(data.expires_in) * 1000;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(new Date(expiresAt).getTime()))
    throw new ApiError(502, 'reconnect_required');
  return { access: data.access_token, refresh: data.refresh_token, expiresAt };
}

// One owner lease covers refresh and the API operation. A persisted attempt
// marker prevents reusing a single-use refresh token after a process crash or
// an ambiguous network failure, even after the lease itself expires.
export function createTokenManager({
  store,
  secrets,
  smartthings,
  verifyAccount,
  verifyConsent,
  now = () => Date.now(),
}) {
  async function authorized(uid, operation, { maintenance = false, allowWithoutConsent = false, reserve } = {}) {
    return store.withLease(uid, async () => {
      if (reserve && !(await reserve())) return false;
      let current = await store.get(uid);
      if (!current) throw new ApiError(409, 'reconnect_required');
      if (current.stage === 'reconnect_required') {
        if (current.refreshDueAt)
          await store.patch(uid, { refreshDueAt: null }, { installId: current.installId });
        throw new ApiError(409, 'reconnect_required');
      }
      if (!allowWithoutConsent) await verifyConsent(uid);
      if (!allowWithoutConsent) {
        if (current.consentVersion !== CONSENT) throw new ApiError(403, 'consent_required');
        try {
          await verifyAccount(uid, current.authTime);
        } catch (error) {
          if (error.code === 'login_required')
            await store.patch(
              uid,
              { stage: 'reconnect_required', refreshDueAt: null },
              { installId: current.installId },
            );
          throw error;
        }
      }
      if (current.refreshAttemptId) {
        await store.patch(
          uid,
          { stage: 'reconnect_required', refreshDueAt: null },
          { installId: current.installId },
        );
        throw new ApiError(409, 'reconnect_required');
      }
      let tokens;
      try {
        tokens = secrets.open(current.tokens, `${uid}:${current.installId}`);
      } catch {
        await store.patch(
          uid,
          { stage: 'reconnect_required', refreshDueAt: null },
          { installId: current.installId },
        );
        throw new ApiError(409, 'reconnect_required');
      }
      async function refresh() {
        if (current.refreshRetryAt > now()) throw new ApiError(429, 'check_later');
        const attemptId = random(),
          expected = { installId: current.installId, attemptId };
        current = await store.patch(
          uid,
          { refreshAttemptId: attemptId },
          { installId: current.installId },
        );
        try {
          tokens = tokenBundle(await smartthings.refresh(tokens.refresh), now(), current.installId);
          current = await store.patch(
            uid,
            {
              tokens: secrets.seal(tokens, `${uid}:${current.installId}`),
              refreshAttemptId: null,
              refreshRetryAt: null,
              refreshDueAt: nextRefresh(tokens, now()),
              lastRefreshedAt: now(),
            },
            expected,
          );
          if (current.stage === 'reconnect_required') throw new ApiError(409, 'reconnect_required');
        } catch (error) {
          if (
            [
              'rate_limited',
              'plan_required',
              'permission_required',
              'oauth_configuration_required',
            ].includes(error.code)
          ) {
            // These are explicit rejections, not a lost response after rotation.
            const retryAt = now() + (error.code === 'rate_limited' ? 300000 : DAY);
            await store.patch(
              uid,
              { refreshAttemptId: null, refreshRetryAt: retryAt, refreshDueAt: new Date(retryAt) },
              expected,
            );
            throw error;
          }
          await store.patch(uid, { stage: 'reconnect_required', refreshDueAt: null }, expected);
          throw new ApiError(409, 'reconnect_required');
        }
      }
      const due =
        current.refreshDueAt instanceof Date
          ? current.refreshDueAt.getTime()
          : current.refreshDueAt?.toMillis?.();
      if (maintenance && Number.isFinite(due) && due > now()) return 'skipped';
      if (maintenance || tokens.expiresAt < now() + 30000) await refresh();
      if (!allowWithoutConsent) await verifyConsent(uid);
      async function run() {
        const result = await operation(current, tokens.access);
        if (!allowWithoutConsent) {
          await verifyConsent(uid);
          await verifyAccount(uid, current.authTime);
        }
        return result;
      }
      try {
        return await run();
      } catch (error) {
        if (error.code !== 'reconnect_required') throw error;
        await refresh();
        if (!allowWithoutConsent) await verifyConsent(uid);
        try {
          return await run();
        } catch (retry) {
          if (retry.code === 'reconnect_required')
            await store.patch(
              uid,
              { stage: 'reconnect_required', refreshDueAt: null },
              { installId: current.installId },
            );
          throw retry;
        }
      }
    });
  }
  async function maintain({ limit = 20, budgetMs = 120000 } = {}) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 20 ||
      !Number.isFinite(budgetMs) ||
      budgetMs < 1 ||
      budgetMs > 120000
    )
      throw new RangeError('Invalid maintenance budget.');
    const started = Date.now(),
      candidates = await store.dueConnections({ limit }),
      result = {
        scanned: candidates.length,
        processed: 0,
        refreshed: 0,
        skipped: 0,
        deferred: 0,
        reconnectRequired: 0,
        suspended: 0,
        limitReached: candidates.length === limit,
        timeBudgetReached: false,
      };
    for (const candidate of candidates) {
      if (Date.now() - started >= budgetMs) {
        result.timeBudgetReached = true;
        break;
      }
      result.processed++;
      try {
        const outcome = await authorized(candidate.uid, async () => 'refreshed', { maintenance: true });
        result[outcome === 'skipped' ? 'skipped' : 'refreshed']++;
      } catch (error) {
        if (['consent_required', 'login_required'].includes(error.code)) {
          try {
            await store.withLease(candidate.uid, () =>
              store.patch(
                candidate.uid,
                { stage: 'reconnect_required', refreshDueAt: null },
                { installId: candidate.installId },
              ),
            );
            result.suspended++;
          } catch {
            result.deferred++;
          }
        } else if (error.code === 'reconnect_required') result.reconnectRequired++;
        else result.deferred++;
      }
    }
    return result;
  }
  return { authorized, maintain };
}

// Dependencies are injected so authorization and OAuth can be tested without
// contacting a real household, sending email, or changing a production database.
export function createService({
  config,
  store,
  verifyUser,
  verifyAccount = async () => {
    throw new ApiError(503, 'setup_required');
  },
  verifyConsent = async () => {
    throw new ApiError(503, 'setup_required');
  },
  smartthings,
  verifyWebhook,
  now = () => Date.now(),
}) {
  const ready = configured(config),
    secrets = ready ? vault(config.key) : null;
  const tokens = createTokenManager({ store, secrets, smartthings, verifyAccount, verifyConsent, now });
  const authorized = tokens.authorized;
  async function pollPower(uid, deviceId, installId) {
    let claim;
    return authorized(uid, async (current, token) => {
      if (!matchesPowerCheck(current, claim)) return false;
      const status = await smartthings.status(token, deviceId);
      const at = now();
      const {reading} = meterObservation(status, at, claim.component);
      const observation = reading && reading.measuredAt >= claim.enabledAt && at - reading.measuredAt <= POWER_CHECK_MS
        ? {kind: 'power', component: claim.component, time: reading.measuredAt, high: isCookingPower(reading.watts)} : null;
      return store.finishPowerCheck(uid, claim, observation, at);
    }, {reserve: async () => {
      claim = await store.claimPowerCheck(uid, deviceId, installId);
      return claim !== null;
    }}).catch(error => {
      if (!claim && error.code === 'busy') return false;
      throw error;
    });
  }
  // Firebase Hosting forwards only __session to Cloud Run. Restrict this nonce
  // cookie to the integration path so it does not replace an app-wide session.
  const cookieName = '__session';
  const cookie = (value, age) =>
    `${cookieName}=${value}; Path=${PREFIX}; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
  const landing = (result) => {
    const url = new URL(config.appUrl);
    url.searchParams.set('smartthings', result);
    return url.href;
  };
  async function user(request) {
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization') || '');
    if (!match) throw new ApiError(401, 'login_required');
    let claims;
    try {
      claims = await verifyUser(match[1]);
    } catch {
      throw new ApiError(401, 'login_required');
    }
    if (
      typeof claims?.uid !== 'string' ||
      !claims.uid ||
      claims.uid.length > 128 ||
      claims.uid.includes('/') ||
      ['.', '..'].includes(claims.uid) ||
      claims.email_verified !== true
    )
      throw new ApiError(403, 'verified_email_required');
    return { uid: claims.uid, authTime: claims.auth_time };
  }
  async function json(request) {
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApiError(415, 'invalid_request');
    const text = await request.text();
    if (text.length > 16384) throw new ApiError(413, 'request_too_large');
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
      return value;
    } catch {
      throw new ApiError(400, 'invalid_request');
    }
  }
  async function webhook(request, url) {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > 1048576) throw new ApiError(413, 'request_too_large');
    await verifyWebhook({
      headers: request.headers,
      method: request.method,
      path: url.pathname + url.search,
      raw,
    });
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'invalid_request');
    }
    if (!message || typeof message !== 'object') throw new ApiError(400, 'invalid_request');
    if (message.messageType === 'CONFIRMATION') {
      if (!identifier(config.appId) || message.confirmationData?.appId !== config.appId)
        throw new ApiError(400, 'invalid_confirmation');
      await smartthings.confirm(message.confirmationData.confirmationUrl);
      return response({ ok: true });
    }
    if (!ready) throw new ApiError(503, 'setup_required');
    if (message.messageType !== 'EVENT') throw new ApiError(400, 'unsupported_event');
    const data = message.eventData,
      installId = data?.installedApp?.installedAppId;
    if (!identifier(installId) || !Array.isArray(data.events) || data.events.length > 100)
      throw new ApiError(400, 'invalid_event');
    const owner = await store.installation(installId);
    if (!owner) return response({ ok: true });
    let accountChecked = false,
      selectedDevice = null;
    for (const event of data.events) {
      const lifecycle = event.installedAppLifecycleEvent;
      if (
        event.eventType === 'INSTALLED_APP_LIFECYCLE_EVENT' &&
        lifecycle?.lifecycle === 'DELETE' &&
        lifecycle.installedAppId === installId &&
        lifecycle.appId === config.appId
      ) {
        await store.withLease(owner.uid, () => store.remove(owner.uid, installId));
        continue;
      }
      const device = event.deviceEvent,
        time = measuredTime(event.eventTime, now());
      if (
        event.eventType !== 'DEVICE_EVENT' ||
        !identifier(device?.eventId) ||
        !identifier(device?.deviceId) ||
        time === null
      )
        continue;
      const power =
        device.capability === 'powerMeter' &&
        device.attribute === 'power' &&
        typeof device.value === 'number' &&
        Number.isFinite(device.value) &&
        device.value >= 0 &&
        (!device.unit || device.unit === 'W');
      const energy =
        (device.capability === 'energyMeter' &&
          device.attribute === 'energy' &&
          typeof device.value === 'number' &&
          Number.isFinite(device.value) &&
          device.value >= 0) ||
        (device.capability === 'powerConsumptionReport' &&
          device.attribute === 'powerConsumption' &&
          device.value &&
          typeof device.value === 'object');
      if (!power && !energy) continue;
      if (device.subscriptionName && device.subscriptionName !== 'warmingUpPower') continue;
      if (!accountChecked) {
        accountChecked = true;
        const connection = await store.get(owner.uid);
        // Samsung may send its first signed event while the subscribe request is still in flight.
        if (connection && ['subscribing', 'connected'].includes(connection.stage) && connection.consentVersion === CONSENT) {
          try {
            await verifyAccount(owner.uid, connection.authTime);
            await verifyConsent(owner.uid);
            selectedDevice = connection.deviceId;
          } catch (error) {
            if (!['consent_required', 'login_required'].includes(error.code)) throw error;
          }
        }
      }
      // Rejected data must not skip a later DELETE lifecycle event in this batch.
      if (selectedDevice !== device.deviceId) continue;
      // Only signal arrival metadata is retained; never a raw power time series.
      await store.receive(owner.uid, installId, {
        id: device.eventId,
        deviceId: device.deviceId,
        time,
        kind: power ? 'power' : 'energy',
        ...(power && device.unit === 'W' && typeof device.componentId === 'string' && {
          component: device.componentId, high: isCookingPower(device.value),
        }),
      });
    }
    return response({ ok: true });
  }
  const handle = async (request) => {
    const url = new URL(request.url),
      path = url.pathname.slice(PREFIX.length);
    try {
      if (!url.pathname.startsWith(PREFIX + '/')) throw new ApiError(404, 'not_found');
      if (path === '/config' && request.method === 'GET')
        return response({
          projectId: TEAM_PROJECT_ID,
          ...(ready && { appId: config.appId }),
          enabled: ready,
          connectionReady: ready && config.connectionEnabled === true,
          consentVersion: CONSENT,
        });
      if (path === '/events' && request.method === 'POST' && identifier(config.appId))
        return await webhook(request, url);
      if (!ready) throw new ApiError(503, 'setup_required');
      if (path === '/callback' && request.method === 'GET') {
        const state = url.searchParams.get('state'),
          code = url.searchParams.get('code');
        const browserNonce = (request.headers.get('cookie') || '')
          .split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith(cookieName + '='))
          ?.slice(cookieName.length + 1);
        if (!identifier(state) || !identifier(browserNonce)) throw new ApiError(400, 'invalid_state');
        const pending = await store.consumeState(state, hash(browserNonce));
        let outcome = 'connected';
        if (url.searchParams.has('error')) outcome = 'cancelled';
        else
          try {
            if (!code || code.length > 2048) throw new ApiError(400, 'invalid_request');
            await store.withLease(pending.uid, async () => {
              await verifyAccount(pending.uid, pending.authTime);
              await verifyConsent(pending.uid);
              const data = await smartthings.exchange(code),
                installId = data.installed_app_id;
              if (!identifier(installId)) throw new ApiError(502, 'reconnect_required');
              const bundle = tokenBundle(data, now());
              const installation = await smartthings.installation(bundle.access, installId);
              if (installation?.installedAppId !== installId || installation.appId !== config.appId)
                throw new ApiError(502, 'oauth_configuration_required');
              const old = await store.get(pending.uid);
              // Reauthorization may replace an expired grant, but must not silently
              // orphan an active subscription from a different installation.
              if (old && old.installId !== installId) throw new ApiError(409, 'disconnect_first');
              await verifyAccount(pending.uid, pending.authTime);
              await verifyConsent(pending.uid);
              await store.saveConnection(
                pending.uid,
                {
                  uid: pending.uid,
                  authTime: pending.authTime,
                  installId,
                  tokens: secrets.seal(bundle, `${pending.uid}:${installId}`),
                  refreshDueAt: nextRefresh(bundle, now()),
                  stage: old?.deviceId ? 'subscribing' : 'choose_device',
                  connectedAt: old?.connectedAt || now(),
                  consentVersion: CONSENT,
                  consentedAt: pending.consentedAt,
                  ...(old?.deviceId
                    ? {
                        deviceId: old.deviceId,
                        deviceLabel: old.deviceLabel,
                        ...(typeof old.deviceIsVirtual === 'boolean'
                          ? { deviceIsVirtual: old.deviceIsVirtual }
                          : {}),
                      }
                    : {}),
                },
                { state, nonceHash: hash(browserNonce) },
              );
            });
          } catch (error) {
            outcome = error.code === 'disconnect_first' ? 'disconnect_first' : 'failed';
          }
        if (outcome !== 'connected') await store.cancelState(state, pending.uid);
        return new Response(null, {
          status: 303,
          headers: {
            Location: landing(outcome),
            'Set-Cookie': cookie('', 0),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }
      const requestOrigin = request.headers.get('origin') || '';
      // Browser mutations must originate on this project's Firebase Hosting site.
      if (request.method !== 'GET' && !equal(requestOrigin, config.origin))
        throw new ApiError(403, 'invalid_origin');
      const account = await user(request),
        uid = account.uid;
      if (path === '/status' && request.method === 'GET') {
        const current = await store.get(uid);
        if (!current) return response({ stage: 'disconnected' });
        try {
          await verifyConsent(uid);
        } catch (error) {
          if (error.code === 'consent_required')
            return response({
              stage: 'reconnect_required',
              reason: 'consent_required',
              device: null,
              lastSignalAt: null,
              lastEventAt: null,
              lastReceivedAt: null,
              lastCheckedAt: null,
            });
          throw error;
        }
        if (current.consentVersion !== CONSENT)
          return response({ stage: 'reconnect_required', reason: 'consent_required', device: null });
        try {
          await verifyAccount(uid, current.authTime);
        } catch (error) {
          if (error.code !== 'login_required') throw error;
          const marked = await store.patch(
            uid,
            { stage: 'reconnect_required', refreshDueAt: null },
            { installId: current.installId },
          );
          return response({ stage: marked.stage, device: null });
        }
        return response(publicConnection(current));
      }
      if (path === '/cancel-start' && request.method === 'POST') {
        const body = await json(request);
        if (!identifier(body.attemptId) || body.attemptId.length < 32)
          throw new ApiError(400, 'invalid_request');
        await store.cancelState(body.attemptId, uid);
        return response({ ok: true });
      }
      if (path === '/start' && request.method === 'POST') {
        if (config.connectionEnabled !== true) throw new ApiError(503, 'setup_required');
        if (!Number.isInteger(account.authTime) || account.authTime < 0)
          throw new ApiError(401, 'login_required');
        const body = await json(request);
        if (body.consentVersion !== CONSENT) throw new ApiError(400, 'consent_required');
        if (body.attemptId !== undefined && (!identifier(body.attemptId) || body.attemptId.length < 32))
          throw new ApiError(400, 'invalid_request');
        await verifyConsent(uid);
        const current = await store.get(uid);
        if (current && current.consentVersion === CONSENT && current.stage !== 'reconnect_required')
          throw new ApiError(409, 'already_connected');
        const state = body.attemptId || random(),
          nonce = random();
        await store.saveState(state, {
          uid,
          authTime: account.authTime,
          nonceHash: hash(nonce),
          until: now() + 600000,
          consentedAt: now(),
          consentVersion: CONSENT,
        });
        const target = new URL('https://api.smartthings.com/v1/oauth/authorize');
        target.search = new URLSearchParams({
          client_id: config.clientId,
          response_type: 'code',
          redirect_uri: config.redirect,
          scope: 'r:devices:*',
          state,
        }).toString();
        return response({ url: target.href }, 200, { 'Set-Cookie': cookie(nonce, 600) });
      }
      if (path === '/devices' && request.method === 'GET')
        return response(
          await authorized(uid, async (current, token) => {
            if (current.deviceListCheckedAt && now() - current.deviceListCheckedAt < 30000)
              throw new ApiError(429, 'check_later');
            const devices = (await smartthings.devices(token))
              .filter((x) => identifier(x.deviceId))
              .map(safeDevice)
              .filter((x) => x.power);
            await store.patch(
              uid,
              { deviceListCheckedAt: now() },
              { installId: current.installId, requireConsent: true },
            );
            return { devices };
          }),
        );
      if (path === '/device' && request.method === 'POST') {
        const body = await json(request);
        if (!identifier(body.deviceId)) throw new ApiError(400, 'invalid_device');
        return response(
          await authorized(uid, async (current, token) => {
            if (current.deviceId && current.deviceId !== body.deviceId)
              throw new ApiError(409, 'disconnect_first');
            if (
              current.stage === 'connected' &&
              current.lastCheckedAt &&
              now() - current.lastCheckedAt < 30000
            )
              throw new ApiError(429, 'check_later');
            // Never trust the client-supplied device label/capability or a cached list.
            const device = safeDevice(await smartthings.device(token, body.deviceId));
            if (device.id !== body.deviceId || !device.power)
              throw new ApiError(422, 'power_not_supported');
            await verifyConsent(uid);
            const meter = meterObservation(await smartthings.status(token, device.id), now());
            await store.patch(
              uid,
              {
                deviceId: device.id,
                deviceLabel: device.label,
                deviceIsVirtual: device.isVirtual ?? null,
                ...((device.isVirtual !== false || current.deviceId !== device.id) && { powerNotice: null, powerChecks: null }),
                stage: 'subscribing',
              },
              { installId: current.installId, requireConsent: true },
            );
            await verifyConsent(uid);
            await smartthings.subscribe(token, current.installId, device.id);
            const updated = await store.patch(
              uid,
              {
                stage: 'connected',
                hasPower: meter.reading !== null,
                lastCheckedAt: now(),
                lastSignalAt: meter.reading?.measuredAt ?? null,
              },
              { installId: current.installId, requireConsent: true },
            );
            return { ...publicConnection(updated), ...meterSignal(meter) };
          }),
        );
      }
      if (path === '/power-notice' && request.method === 'POST') {
        const body = await json(request);
        if (!identifier(body?.deviceId) || typeof body.enabled !== 'boolean' ||
            (body.checkIntervalMinutes !== undefined && (!body.enabled || body.checkIntervalMinutes !== POWER_CHECK_MINUTES)) ||
            (body.enabled && body.consentVersion !== POWER_NOTICE_CONSENT)) throw new ApiError(400, 'invalid_request');
        if (!body.enabled) {
          return response(await store.withLease(uid, async () => {
            const current = await store.get(uid);
            if (!current || current.deviceId !== body.deviceId) throw new ApiError(409, 'choose_device');
            await store.patch(uid, {powerNotice: null, powerChecks: null}, {installId: current.installId});
            return {enabled: false};
          }));
        }
        return response(await authorized(uid, async (current, token) => {
          if (current.stage !== 'connected' || current.deviceId !== body.deviceId) throw new ApiError(409, 'choose_device');
          const details = await smartthings.device(token, current.deviceId);
          if (details?.deviceId !== current.deviceId) throw new ApiError(409, 'choose_device');
          const device = safeDevice(details);
          if (device.isVirtual === true) throw new ApiError(422, 'test_device');
          if (device.isVirtual !== false) throw new ApiError(422, 'unclassified_device');
          const meters = (details.components ?? []).filter(c => c.capabilities?.some(k => k.id === 'powerMeter'));
          if (meters.length !== 1 || !identifier(meters[0].id)) throw new ApiError(422, 'ambiguous_meter');
          const existing = current.powerNotice;
          const powerNotice = existing?.version === POWER_NOTICE_CONSENT && existing.component === meters[0].id
            ? existing : {version: POWER_NOTICE_CONSENT, enabledAt: now(), component: meters[0].id, lastObservedAt: null};
          const freshNotice = powerNotice !== existing;
          const startChecks = body.checkIntervalMinutes === POWER_CHECK_MINUTES && (freshNotice || !hasPowerChecks(current));
          if (freshNotice || startChecks || current.deviceIsVirtual !== false) {
            const at = now();
            await store.patch(uid, {deviceIsVirtual: false, ...(freshNotice && {powerNotice, powerChecks: null}),
              ...(startChecks && {powerChecks: {enabledAt: at, nextAt: at + POWER_CHECK_MS}})},
            {installId: current.installId, requireConsent: true});
          }
          else await verifyConsent(uid);
          return {enabled: true};
        }));
      }
      if (path === '/poll' && request.method === 'POST') {
        const body = await json(request);
        if (!identifier(body?.deviceId)) throw new ApiError(400, 'invalid_device');
        return response({checked: await pollPower(uid, body.deviceId)});
      }
      if (path === '/check' && request.method === 'POST') {
        const body = await json(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
          throw new ApiError(400, 'invalid_request');
        return response(
          await authorized(uid, async (current, token) => {
            if (!current.deviceId || current.stage !== 'connected')
              throw new ApiError(409, 'choose_device');
            if (current.lastCheckedAt && now() - current.lastCheckedAt < 30000)
              throw new ApiError(429, 'check_later');
            let classification;
            if (typeof current.deviceIsVirtual !== 'boolean') {
              const detail = await smartthings.device(token, current.deviceId);
              if (detail?.deviceId !== current.deviceId) throw new ApiError(409, 'choose_device');
              classification = safeDevice(detail).isVirtual;
            }
            const meter = meterObservation(await smartthings.status(token, current.deviceId), now());
            const updated = await store.patch(
              uid,
              {
                hasPower: meter.reading !== null,
                lastCheckedAt: now(),
                lastSignalAt: Math.max(current.lastSignalAt || 0, meter.reading?.measuredAt || 0) || null,
                ...(typeof classification === 'boolean' && {deviceIsVirtual: classification}),
                ...(classification === true && {powerNotice: null, powerChecks: null}),
              },
              { installId: current.installId, requireConsent: true },
            );
            return { ...publicConnection(updated), ...meterSignal(meter) };
          }),
        );
      }
      if (path === '/connection' && request.method === 'DELETE') {
        const body = await json(request);
        if (body.confirm !== true) throw new ApiError(400, 'confirmation_required');
        await store.cancelPending(uid);
        const current = await store.get(uid);
        if (!current) return response({ stage: 'disconnected' });
        if (current.stage === 'reconnect_required') {
          // An expired grant cannot unsubscribe. Explicit local removal is only
          // offered after the user is told to revoke it in SmartThings as well.
          if (body.forgetExpired !== true) throw new ApiError(409, 'revoke_in_smartthings');
          await store.withLease(uid, () => store.remove(uid, current.installId));
        } else
          await authorized(
            uid,
            async (saved, token) => {
              await smartthings.unsubscribe(token, saved.installId);
              await store.remove(uid, saved.installId);
            },
            { allowWithoutConsent: true },
          );
        return response({ stage: 'disconnected' });
      }
      throw new ApiError(404, 'not_found');
    } catch (error) {
      // Never serialize exception messages, upstream bodies, credentials, or IDs.
      return response(
        { error: error instanceof ApiError ? error.code : 'temporarily_unavailable' },
        error instanceof ApiError ? error.status : 503,
      );
    }
  };
  handle.maintain = (options) => {
    if (!ready) throw new ApiError(503, 'setup_required');
    return tokens.maintain(options);
  };
  handle.pollDuePower = async () => {
    if (!ready) throw new ApiError(503, 'setup_required');
    const candidates = await store.duePowerChecks();
    const result = {due: candidates.length, checked: 0, deferred: 0};
    for (const {uid, deviceId, installId} of candidates) {
      try {
        if (await pollPower(uid, deviceId, installId)) result.checked++;
      } catch { result.deferred++; }
    }
    return result;
  };
  return handle;
}
