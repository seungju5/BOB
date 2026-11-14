import { WebPlugin } from '@capacitor/core';

function unavailable() {
  const now = new Date();
  const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  return {
    schemaVersion: 1,
    status: 'unsupported',
    count: null,
    localDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    updatedAt: null,
    source: null,
    partialDay: false,
    trackingSince: null,
    reason: 'native-unavailable',
  };
}

/** Browser fallback deliberately does not read motion, storage, or network. */
export class PhoneStepsWeb extends WebPlugin {
  async status() { return unavailable(); }
  async connect() { return unavailable(); }
  async readToday() { return unavailable(); }
  async disconnect() { return unavailable(); }
  async openSettings() { throw this.unavailable('휴대폰 앱에서 설정을 열 수 있어요.'); }
}
