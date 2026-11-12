import { describe, expect, it } from 'vitest';
import { detectEvents } from '../../lib/judge/detectEvents';
import { resolveMealSlots } from '../../lib/judge/resolveMealSlots';
import { evaluateAlerts } from '../../lib/judge/evaluateAlerts';
import { DEFAULT_WINDOWS, patternReport } from '../../lib/data/view';
import { detectEvents as firebaseDetect } from '../../integrations/bapmunna-firebase/docs/shared/lib/judge/detectEvents.mjs';
import { resolveMealSlots as firebaseResolve } from '../../integrations/bapmunna-firebase/docs/shared/lib/judge/resolveMealSlots.mjs';
import { evaluateAlerts as firebaseAlerts } from '../../integrations/bapmunna-firebase/docs/shared/lib/judge/evaluateAlerts.mjs';
import { patternReport as firebaseReport } from '../../integrations/bapmunna-firebase/docs/shared/lib/data/view.mjs';
import type { ResolveInput } from '../../lib/judge/resolveMealSlots';
import type { AlertInput } from '../../lib/judge/evaluateAlerts';
import type { AppView } from '../../lib/data/view';

describe('Firebase uses the canonical Supabase rules, not a parallel reimplementation', () => {
  it('matches event detection over deterministic changing readings and gaps', () => {
    let seed = 7;
    for (let sample = 0; sample < 80; sample++) {
      let minute = 0;
      const readings = Array.from({ length: 100 }, () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        minute += seed % 11 === 0 ? 5 : 1;
        return { measuredAt: new Date(minute * 60000), watts: [0, 30, 45, 60, 120, 799, 800, 900][seed % 8] };
      });
      expect(firebaseDetect(readings)).toEqual(detectEvents(readings));
    }
  });
  it('matches meal windows, outside-window eat-out checks and absence precedence', () => {
    for (const hour of [0, 6, 9, 10, 11, 14, 15, 17, 20, 21, 23]) {
      for (const absent of [true, false]) {
        const now = new Date(`2026-10-16T${String(hour).padStart(2, '0')}:00:00+09:00`);
        const args: ResolveInput = { date: '2026-10-16', windows: DEFAULT_WINDOWS, now,
          events: [{ type: 'cook', startedAt: new Date('2026-10-16T07:00:00+09:00'), endedAt: new Date('2026-10-16T07:05:00+09:00') }],
          eatOutChecks: [now], absences: absent ? [{ startDate: '2026-10-16', endDate: '2026-10-17' }] : [] };
        expect(firebaseResolve(args)).toEqual(resolveMealSlots(args));
      }
    }
  });
  it('matches 48/72-hour boundaries, outages, absence, and deduplication', () => {
    for (const hours of [0, 47.99, 48, 71.99, 72, 100]) for (const offline of [true, false]) for (const away of [true, false]) {
      const now = new Date(Date.parse('2026-10-16T08:00:00+09:00') + hours * 3600000);
      const args: AlertInput = { now, slots: [], lastActivityAt: new Date('2026-10-16T08:00:00+09:00'),
        settings: { missedMealsThreshold: 2, fastingHours: 48, emergencyHours: 72 },
        absences: away ? [{ startDate: '2026-10-16', endDate: '2026-10-30' }] : [],
        lastReadingAt: offline ? new Date(now.getTime() - 2 * 3600000) : now,
        openAlerts: ['fasting'], offlineMsSinceLastActivity: 0 };
      expect(firebaseAlerts(args)).toEqual(evaluateAlerts(args));
    }
  });
  it('matches the seven-day versus preceding twenty-eight-day report', () => {
    const view = { slots: [{ date: '2026-10-15', slot: 'breakfast', status: 'confirmed', source: 'cooker' },
      { date: '2026-10-01', slot: 'lunch', status: 'unconfirmed', source: null }],
      mealProfile: { windows: DEFAULT_WINDOWS }, absences: [] } as unknown as AppView;
    const now = new Date('2026-10-16T12:00:00+09:00');
    expect(firebaseReport(view, now)).toEqual(patternReport(view, now));
  });
});
