import { afterGuardianLogin, type AppView } from '@/lib/data/view';
import { noticeDay, recordNoticePath } from '@/public/notification-content';

type LoginAccount = {
  user?: { verified: boolean } | null;
  operator: boolean;
  view: Pick<AppView, 'onboardingStep' | 'seniorConsent'> | null;
};

/** The requested screen determines the destination. Operator access only gates Studio. */
export function firebaseLoginDestination(account: LoginAccount, next: string | null, day: string | null, slot: string | null): string | null {
  if (!account.user?.verified) return null;
  if (next === 'studio') return account.operator ? '/admin/' : null;
  if (!account.view) return null;

  if (account.view.seniorConsent) {
    if (next === 'record') {
      const date = noticeDay(day);
      if (date) return recordNoticePath(date, slot);
    }
    if (next === 'household-notice') return '/alerts/';
  }
  return afterGuardianLogin(account.view.onboardingStep, next);
}
