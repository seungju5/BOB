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
  async openWebApp() { throw this.unavailable('휴대폰 앱에서 웹앱으로 돌아갈 수 있어요.'); }
  async readRankingToday() { return unavailable(); }
  async rankingStatus() { return {linked: false, confirmed: false, revokePending: false}; }
  async rankingLink() { throw this.unavailable('걸음수 공유는 설치한 휴대폰 앱에서 연결해 주세요.'); }
  async rankingConfirm() { throw this.unavailable('걸음수 공유는 설치한 휴대폰 앱에서 확인해 주세요.'); }
  async rankingSync() { return {ok: false, reason: 'native-unavailable'}; }
  async rankingBoard() { throw this.unavailable('설치한 휴대폰 앱에서 순위를 확인해 주세요.'); }
  async rankingDisconnect() { return; }
  async heartsRequest() { throw this.unavailable('하트 연결은 설치한 휴대폰 앱에서 확인해 주세요.'); }
  async walkReminderStatus() { return {enabled: false, times: [], bloodSugarReminder: false, permission: 'unsupported'}; }
  async configureWalkReminders() { throw this.unavailable('산책 알림은 설치한 휴대폰 앱에서 설정해 주세요.'); }
  async openWalkingWebApp() { throw this.unavailable('휴대폰 앱에서 웹앱을 열 수 있어요.'); }
}
