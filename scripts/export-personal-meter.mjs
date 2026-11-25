import { execFile } from 'node:child_process';
import { link, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { PERSONAL_METER_FORMAT, parsePersonalMeter } from '../lib/smartthings/personal-meter.ts';
import { hasMeteredPlugCategory, meterObservation, safeDevice } from '../server/smartthings/smartthings.mjs';
import { meterSignal } from '../server/smartthings/cooking-signal.mjs';
import criteria from '../server/smartthings/power-criteria.json' with { type: 'json' };

const execute = promisify(execFile);
const usage = 'node scripts/export-personal-meter.mjs (--only-smart-plug | --device "내 플러그 이름 또는 ID") --out "개인점검.json" [--fresh] [--profile 내프로필]';
const interval = criteria.checkIntervalMinutes * 60_000;

async function nextPhysicalReading(read, first, startedAt, now, wait) {
  const baseline = first?.reading?.measuredAt ?? 0;
  const deadline = startedAt + 3 * interval;
  for (let attempt = 0; attempt < 3; attempt++) {
    await wait(interval);
    if (now() > deadline + 30_000) break;
    const sample = await read();
    const time = sample?.reading?.measuredAt;
    if (time > baseline && time >= startedAt && time <= deadline && sample.checkedAt - time <= interval) return sample;
  }
  throw new Error('새 전력 측정이 확인되지 않아 파일을 만들지 않았어요. SmartThings에서 실물 플러그의 연결과 마지막 측정 시각을 확인해 주세요.');
}

// The official CLI owns its credentials. The exported file includes only the
// chosen outlet's threshold result, dates and broad device classification.
export async function exportPersonalMeter({ device, onlySmartPlug = false, fresh = false, target, list, status, now = Date.now, wait = milliseconds => delay(milliseconds) }) {
  const selector = device?.trim().normalize('NFC');
  if (Boolean(selector) === onlySmartPlug || !target?.trim()) throw new Error(usage);
  const devices = await list();
  if (!Array.isArray(devices)) throw new Error('삼성 기기 목록의 형식을 확인할 수 없어요.');
  const matches = onlySmartPlug
    ? devices.filter(item => item && safeDevice(item).isVirtual === false && item.components?.some(hasMeteredPlugCategory))
    : devices.filter(item => item?.deviceId === selector || String(item?.label || item?.name || '').normalize('NFC') === selector);
  if (onlySmartPlug && matches.length !== 1)
    throw new Error('이 삼성 계정에서 실물 전력 플러그 한 대를 특정할 수 없어요. --device로 사용할 플러그를 직접 지정해 주세요.');
  if (!matches.length) throw new Error('선택한 계정에서 이 이름의 전력 측정 플러그를 찾지 못했어요.');
  if (matches.length !== 1) throw new Error('이름이 같은 플러그가 있어요. 삼성 기기 ID로 한 대를 지정해 주세요.');
  const selected = matches[0];
  const meters = (selected.components ?? []).filter(part => part.capabilities?.some(cap => cap.id === 'powerMeter'));
  if (meters.length !== 1 || typeof meters[0].id !== 'string' || !meters[0].id ||
      typeof selected.deviceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/i.test(selected.deviceId)) {
    throw new Error('전력계 한 개를 구분할 수 있는 플러그를 선택해 주세요.');
  }
  const { isVirtual } = safeDevice(selected);
  const deviceKind = isVirtual === true ? 'virtual' : isVirtual === false ? 'recognized' : 'unknown';
  if (fresh && deviceKind !== 'recognized') throw new Error('새 측정 점검에는 실물 기기로 분류된 플러그가 필요해요. SmartThings에 밥솥에 꽂힌 플러그를 등록해 주세요.');
  async function read() {
    const response = await status(selected.deviceId);
    const checkedAt = now();
    const component = response?.components?.[meters[0].id];
    const observation = meterObservation({ components: { meter: component } }, checkedAt);
    return parsePersonalMeter({ format: PERSONAL_METER_FORMAT, deviceKind, checkedAt, ...meterSignal(observation) }, checkedAt);
  }
  const startedAt = now();
  const first = await read();
  const result = fresh ? await nextPhysicalReading(read, first, startedAt, now, wait) : first;
  if (!result) throw new Error('이 플러그에 측정 시각이 있는 전력 또는 누적 전력량 기록이 아직 없어요.');
  const staging = join(dirname(target), '.bapmunna-meter-' + randomUUID() + '.tmp');
  const file = await open(staging, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(result, null, 2) + '\n');
    await link(staging, target);
  } finally {
    await file.close();
    await unlink(staging);
  }
  return result;
}

async function main() {
  const { values } = parseArgs({ options: {
    device: {type:'string'}, 'only-smart-plug': {type:'boolean'}, fresh: {type:'boolean'}, out: {type:'string'}, profile: {type:'string'}, help: {type:'boolean'},
  } });
  if (values.help) { console.log(usage); return; }
  async function cli(args) {
    try {
      const profile = values.profile ? ['--profile', values.profile] : [];
      const { stdout } = await execute('smartthings', [...args, '--json', ...profile], { timeout: 30000, maxBuffer: 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('삼성 공식 SmartThings CLI를 설치한 컴퓨터에서 실행해 주세요.');
      throw new Error('삼성 조회를 마치지 못했어요. 공식 SmartThings CLI에 내 계정으로 로그인했는지 확인해 주세요.');
    }
  }
  await exportPersonalMeter({
    device: values.device, onlySmartPlug: values['only-smart-plug'], fresh: values.fresh, target: values.out,
    list: () => cli(['devices', '--capability', 'powerMeter']),
    status: id => cli(['devices:status', id]),
  });
  console.log('개인 점검 파일을 저장했어요. 밥뭇나 기기 연결 화면에서 파일을 열어 주세요.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const message = error.code === 'EEXIST' ? '같은 파일이 있어요. 다른 파일 이름으로 저장해 주세요.' : error.message;
    console.error(message);
    process.exitCode = 1;
  });
}
