import {safeDevice, hasMeteredPlugCategory} from '../smartthings.mjs';

/** An authenticated SmartThings SDK client and a single outlet already selected by its owner. */
export async function readMeterHistory(client, outlet, from, until) {
  const metered = outlet?.components?.filter(hasMeteredPlugCategory) ?? [];
  if (!outlet?.deviceId || !outlet.locationId || safeDevice(outlet).isVirtual !== false || metered.length !== 1 ||
      !Number.isSafeInteger(from) || !Number.isSafeInteger(until) || from >= until || until - from > 7 * 86_400_000) {
    throw Error('Expected one selected physical metered outlet and up to seven days');
  }
  const request = {deviceId:outlet.deviceId, locationId:outlet.locationId, oldestFirst:false, limit:300};
  const readings = new Map(), cursors = new Set();
  let cursor = {before:until + 1000};
  for (let pageNumber = 0; pageNumber < 60; pageNumber++) {
    const {items} = await client.history.devices({...request, ...cursor});
    if (!Array.isArray(items)) throw Error('Invalid history response');
    for (const e of items) {
      const at = Date.parse(e.time);
      if (e.deviceId !== outlet.deviceId || e.component !== metered[0].id || e.capability !== 'powerMeter' ||
          e.attribute !== 'power' || e.unit !== 'W' || !Number.isFinite(e.value) || e.value < 0 ||
          !Number.isFinite(at) || at < from || at > until) continue;
      if (readings.has(at) && readings.get(at) !== e.value) throw Error('Conflicting source observations');
      readings.set(at, e.value);
    }
    const last = items.at(-1);
    if (!last || Date.parse(last.time) < from) {
      return [...readings].sort(([a],[b]) => a - b).map(([at,watts]) => ({at,watts}));
    }
    // Several distinct attributes often share a millisecond. The official API's
    // second cursor field distinguishes those events at page boundaries.
    if (!Number.isSafeInteger(last.epoch) || last.hash == null) throw Error('Missing history cursor');
    const key = String(last.epoch) + '/' + String(last.hash);
    if (cursors.has(key)) throw Error('History pagination did not advance');
    cursors.add(key);
    cursor = {before:last.epoch, beforeHash:last.hash};
  }
  throw Error('History exceeded the bounded request');
}
