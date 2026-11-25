import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEART_ITEMS, HEART_POLICY, HEART_LEAGUE_TIERS, HeartError,
  heartDate, heartWeek, heartProgress, createHeartState, advanceHearts,
  setHeartGoal, buyHeartItem, grantHeartItem, equipHeartItem,
  heartSummary, heartLeague, validateHeartState,
} from '../core.mjs';

const day = '2026-11-17';
const clock = hour => `${day}T${hour}:00:00+09:00`;
const fresh = () => createHeartState({date: day});
const advance = (state, count, hour = '12', cooking = false) => advanceHearts(state, {date: day, count, now: clock(hour), cooking});
const error = code => reason => reason instanceof HeartError && reason.code === code;
const clone = value => JSON.parse(JSON.stringify(value));
const offset = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test('Korean midnight is 15:00 UTC, independent of the host time zone', () => {
  assert.equal(heartDate('2026-11-17T14:59:59.999Z'), '2026-11-17');
  assert.equal(heartDate('2026-11-17T15:00:00.000Z'), '2026-11-18');
  assert.equal(heartDate(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.equal(heartDate(Date.parse('2028-02-28T15:00:00Z')), '2028-02-29');
});

test('invalid timestamps never silently become today', () => {
  for (const input of [undefined, null, NaN, Infinity, {}, '', 'unavailable', '2026-11-17', '2026-11-17T12:00:00', '2026-02-30T12:00:00Z', new Date(NaN)]) {
    assert.throws(() => heartDate(input), error('invalid_heart_observation'));
  }
});

test('week is Monday to Sunday across a year boundary', () => {
  assert.deepEqual(heartWeek('2027-01-01'), {start: '2026-12-28', end: '2027-01-03'});
  assert.deepEqual(heartWeek('2026-11-15'), {start: '2026-11-09', end: '2026-11-15'});
  assert.deepEqual(heartWeek('2026-11-16'), {start: '2026-11-16', end: '2026-11-22'});
});

test('strict calendar dates reject rollover, malformed, missing and out-of-month days', () => {
  for (const date of ['2026-02-29', '2026-11-31', '2026-00-02', '2026-1-01', '2026-11-17T00:00:00Z', null, undefined]) {
    assert.throws(() => createHeartState({date}), error('invalid_heart_date'));
  }
  assert.equal(createHeartState({date: '2028-02-29'}).date, '2028-02-29');
});

test('unknown reading stays different from a measured zero', () => {
  const unknown = heartProgress({count: null, goal: 5000});
  const zero = heartProgress({count: 0, goal: 5000});
  assert.equal(unknown.percent, null);
  assert.equal(zero.percent, 0);
  assert.equal(unknown.rewardTotal, 0);
  assert.equal(zero.rewardTotal, 0);
  assert.equal(heartSummary(fresh(), day).count, null);
  assert.equal(heartSummary(advance(fresh(), 0), day).count, 0);
});

test('count, goal and cooking are not coerced', () => {
  for (const count of [-1, NaN, Infinity, 1.2, '2500', undefined, 1000001]) assert.throws(() => heartProgress({count, goal: 5000}), error('invalid_step_count'));
  for (const goal of [0, -500, 499, 20001, 550, '5000', null, Infinity]) assert.throws(() => createHeartState({date: day, goal}), error('invalid_heart_goal'));
  assert.throws(() => heartProgress({count: 10, goal: 5000, cooking: 'yes'}), error('invalid_cooking'));
});

test('each progress threshold changes on its exact step boundary', () => {
  for (const threshold of [25, 50, 100, 200]) {
    const boundary = 5000 * threshold / 100;
    assert.equal(heartProgress({count: boundary - 1, goal: 5000}).milestones.find(item => item.threshold === threshold).achieved, false);
    assert.equal(heartProgress({count: boundary, goal: 5000}).milestones.find(item => item.threshold === threshold).achieved, true);
  }
});

test('a short goal does not receive a threshold early through display rounding', () => {
  const below = heartProgress({count: 174, goal: 700});
  const reached = heartProgress({count: 175, goal: 700});
  assert.equal(below.percent, 24.85);
  assert.equal(below.milestones[1].achieved, false);
  assert.equal(reached.milestones[1].achieved, true);
});

test('cooking signal is separate from walking and cannot create step rewards', () => {
  const result = heartProgress({count: null, goal: 5000, cooking: true});
  assert.equal(result.filled, 1);
  assert.equal(result.percent, null);
  assert.equal(result.rewardTotal, 0);
  assert.equal(heartProgress({count: 10000, goal: 5000, cooking: false}).filled, 4);
});

test('display progress exceeds 300 while a daily league contribution stops at 300', () => {
  const result = heartProgress({count: 24000, goal: 5000, cooking: true});
  assert.equal(result.percent, 480);
  assert.equal(result.weeklyPoints, 300);
  assert.equal(result.rewardTotal, 5);
  assert.equal(result.filled, 5);
});

test('automatic rewards are cumulative 1, 3 and 5, not 1+3+5', () => {
  let state = advance(fresh(), 2499, '09');
  assert.equal(state.balance, 0);
  state = advance(state, 2500, '10');
  assert.equal(state.balance, 1);
  state = advance(state, 5000, '11');
  assert.equal(state.balance, 3);
  state = advance(state, 10000, '12');
  assert.equal(state.balance, 5);
  assert.equal(state.totalEarned, 5);
  assert.equal(heartSummary(state, day).todayEarned, 5);
});

test('refresh and repeated delivery never reissue rewards', () => {
  const once = advance(fresh(), 5000);
  const twice = advance(once, 5000);
  const later = advance(twice, 5000, '13');
  assert.deepEqual(twice, once);
  assert.equal(later.balance, 3);
  assert.equal(later.days[day].awarded, 3);
});

test('a newer correction lowers current progress without charging the wallet', () => {
  const corrected = advance(advance(fresh(), 10000, '10'), 2000, '11');
  const summary = heartSummary(corrected, day);
  assert.equal(summary.percent, 40);
  assert.equal(summary.rewardTotal, 0);
  assert.equal(summary.todayEarned, 5);
  assert.equal(summary.balance, 5);
  const returned = advance(corrected, 10000, '12');
  assert.equal(returned.balance, 5);
});

test('older same-day readings cannot undo a correction or issue an early reward', () => {
  const newest = advance(fresh(), 2000, '12');
  const stale = advance(newest, 10000, '11');
  assert.deepEqual(stale, newest);
  const conflict = advance(newest, 10000, '12');
  assert.deepEqual(conflict, newest);
});

test('a missing observation timestamp cannot replace a timestamped reading', () => {
  const state = advance(fresh(), 2000, '12');
  assert.deepEqual(advanceHearts(state, {date: day, count: 10000}), state);
});

test('clockless local demo observations remain deterministic', () => {
  const first = advanceHearts(fresh(), {date: day, count: 2500});
  const next = advanceHearts(first, {date: day, count: 5000});
  assert.equal(next.balance, 3);
  assert.equal(next.days[day].observedAt, null);
  assert.deepEqual(advanceHearts(next, {date: day, count: 5000}), next);
});

test('record absence/permission failure does not erase a verified count or become zero', () => {
  const state = advance(fresh(), 2500, '10');
  assert.deepEqual(advance(state, null, '11'), state);
  assert.deepEqual(advance(fresh(), null), fresh());
});

test('trusted cooking can merge independently of a stale step timestamp', () => {
  const state = advance(fresh(), 2500, '12');
  const cooking = advance(state, 10000, '10', true);
  assert.equal(cooking.days[day].count, 2500);
  assert.equal(cooking.days[day].cooking, true);
  assert.equal(cooking.balance, 1);
  assert.equal(advance(cooking, 3000, '13', false).days[day].cooking, true);
});

test('a timestamp belonging to another Korean day is rejected', () => {
  assert.throws(() => advanceHearts(fresh(), {date: day, count: 5000, now: '2026-11-17T15:00:00Z'}), error('invalid_heart_observation'));
  assert.throws(() => advanceHearts(fresh(), {date: day, count: 5000, now: '2026-11-16T14:00:00Z'}), error('invalid_heart_observation'));
});

test('goal edits before the first signal may take effect today', () => {
  const state = setHeartGoal(fresh(), 6000);
  assert.equal(state.goal, 6000);
  assert.equal(state.days[day].goal, 6000);
  assert.equal(advance(state, 2500).balance, 0);
});

test('observed zero freezes the daily goal and later setting edits apply tomorrow', () => {
  const state = setHeartGoal(advance(fresh(), 0, '09'), 1000);
  assert.equal(state.goal, 1000);
  assert.equal(state.days[day].goal, 5000);
  assert.equal(advance(state, 1000, '12').balance, 0);
  const tomorrow = advanceHearts(state, {date: '2026-11-18', count: 1000, now: '2026-11-18T09:00:00+09:00'});
  assert.equal(tomorrow.days['2026-11-18'].goal, 1000);
  assert.equal(tomorrow.balance, 3);
});

test('a cooking-only day also freezes the goal', () => {
  const state = advanceHearts(fresh(), {date: day, count: null, cooking: true});
  assert.equal(setHeartGoal(state, 1000).days[day].goal, 5000);
});

test('midnight resets the visible day and retains the wallet and owned outfit', () => {
  let state = buyHeartItem(advance(fresh(), 5000), 'scarf');
  state = equipHeartItem(state, 'scarf');
  state = advanceHearts(state, {date: '2026-11-18', count: null});
  const summary = heartSummary(state, '2026-11-18');
  assert.equal(summary.count, null);
  assert.equal(summary.todayEarned, 0);
  assert.equal(summary.totalEarned, 3);
  assert.equal(summary.balance, 0);
  assert.deepEqual(summary.owned, ['scarf']);
  assert.equal(summary.equipped.accessory, 'scarf');
});

test('a past day cannot be reopened for another award after midnight', () => {
  const yesterday = advance(fresh(), 5000);
  const state = advanceHearts(yesterday, {date: '2026-11-18', count: 0});
  assert.deepEqual(advance(state, 10000, '13', true), state);
});

test('large date gaps prune bounded summaries but preserve lifetime balance', () => {
  let state = fresh();
  for (let i = 0; i < 45; i++) state = advanceHearts(state, {date: offset(day, i), count: 5000});
  assert.equal(Object.keys(state.days).length, 35);
  assert.equal(state.balance, 135);
  assert.equal(state.totalEarned, 135);
  assert.ok(!Object.hasOwn(state.days, day));
  state = advanceHearts(state, {date: '2027-06-01', count: null});
  assert.equal(Object.keys(state.days).length, 1);
  assert.equal(state.balance, 135);
});

test('monthly earned differs from the wallet after spending and across months', () => {
  let state = createHeartState({date: '2026-10-31'});
  state = advanceHearts(state, {date: '2026-10-31', count: 10000});
  state = advanceHearts(state, {date: '2026-11-01', count: 5000});
  state = buyHeartItem(state, 'straw-hat');
  const summary = heartSummary(state, '2026-11-01');
  assert.equal(summary.monthEarned, 3);
  assert.equal(summary.totalEarned, 8);
  assert.equal(summary.balance, 2);
});

test('weekly score uses all seven days with a daily cap and resets Monday', () => {
  let state = createHeartState({date: '2026-11-16'});
  for (let i = 0; i < 7; i++) state = advanceHearts(state, {date: offset('2026-11-16', i), count: 20000});
  assert.equal(heartSummary(state, '2026-11-22').weeklyPoints, 2100);
  assert.equal(heartSummary(state, '2026-11-23').weeklyPoints, 0);
  assert.equal(heartSummary(state, '2026-11-23').count, null);
});

test('purchase is atomic, does not automatically equip, and is idempotent', () => {
  const original = frozen(advance(fresh(), 10000));
  const bought = buyHeartItem(original, 'scarf');
  assert.equal(original.balance, 5);
  assert.equal(bought.balance, 2);
  assert.equal(bought.equipped.accessory, null);
  assert.deepEqual(buyHeartItem(bought, 'scarf'), bought);
  assert.throws(() => buyHeartItem(bought, 'basket'), error('insufficient_hearts'));
  assert.equal(bought.balance, 2);
  assert.throws(() => buyHeartItem(original, 'fake-item'), error('unknown_heart_item'));
});

test('the constellation cape costs twelve hearts once and remains wearable after reloading', () => {
  let state = fresh();
  assert.throws(() => buyHeartItem(state, 'star-cape'), error('insufficient_hearts'));
  for (let i = 0; i < 4; i++) state = advanceHearts(state, {date: offset(day, i), count: 5000});
  assert.equal(state.balance, 12);
  const worn = equipHeartItem(buyHeartItem(state, 'star-cape'), 'star-cape');
  assert.equal(worn.balance, 0);
  const restored = equipHeartItem(clone(worn), 'default-outfit');
  assert.deepEqual(equipHeartItem(buyHeartItem(restored, 'star-cape'), 'star-cape'), worn);
});

test('equipment requires ownership, swaps within a category and supports defaults', () => {
  const start = fresh();
  assert.throws(() => equipHeartItem(start, 'scarf'), error('heart_item_not_owned'));
  let state = grantHeartItem(grantHeartItem(grantHeartItem(start, 'scarf'), 'basket'), 'straw-hat');
  state = equipHeartItem(equipHeartItem(state, 'scarf'), 'straw-hat');
  state = equipHeartItem(state, 'basket');
  assert.equal(state.equipped.accessory, 'basket');
  assert.equal(state.equipped.hat, 'straw-hat');
  assert.deepEqual(equipHeartItem(state, 'basket'), state);
  state = equipHeartItem(state, 'default-accessory');
  assert.equal(state.equipped.accessory, null);
  assert.equal(state.equipped.hat, 'straw-hat');
  assert.deepEqual(equipHeartItem(state, 'default').equipped, {hat: null, outfit: null, accessory: null, background: null});
  assert.throws(() => equipHeartItem(state, 'default-unknown'), error('unknown_heart_item'));
});

test('trusted noncash item gifts are idempotent and cannot mint wallet hearts', () => {
  const state = grantHeartItem(fresh(), 'hanbok');
  assert.deepEqual(state.owned, ['hanbok']);
  assert.equal(state.balance, 0);
  assert.equal(state.totalEarned, 0);
  assert.deepEqual(grantHeartItem(state, 'hanbok'), state);
});

test('seven observed signal days unlock hanbok without pretending to verify food intake', () => {
  let state = fresh();
  for (let i = 0; i < 6; i++) state = advanceHearts(state, {date: offset(day, i), count: null, cooking: true});
  assert.equal(state.owned.includes('hanbok'), false);
  state = advanceHearts(state, {date: offset(day, 6), count: null, cooking: true});
  assert.equal(state.owned.includes('hanbok'), true);
  assert.equal(state.balance, 0);
  assert.equal(heartSummary(state, offset(day, 6)).streak, 7);
});

test('thirty observed signal days unlock crown and a missed day cannot be assumed present', () => {
  let state = fresh();
  for (let i = 0; i < 30; i++) state = advanceHearts(state, {date: offset(day, i), count: null, cooking: true});
  assert.ok(state.owned.includes('crown'));
  const tomorrow = advanceHearts(state, {date: offset(day, 30), count: null});
  assert.equal(heartSummary(tomorrow, offset(day, 30)).streak, 30);
  const following = advanceHearts(tomorrow, {date: offset(day, 31), count: null, cooking: true});
  assert.equal(heartSummary(following, offset(day, 31)).streak, 1);
  assert.ok(following.owned.includes('crown'));
});

test('purchase and streak unlock converge on a single owned item', () => {
  let state = fresh();
  for (let i = 0; i < 6; i++) state = advanceHearts(state, {date: offset(day, i), count: 5000, cooking: true});
  state = buyHeartItem(state, 'hanbok');
  const balance = state.balance;
  state = advanceHearts(state, {date: offset(day, 6), count: null, cooking: true});
  assert.equal(state.owned.filter(id => id === 'hanbok').length, 1);
  assert.equal(state.balance, balance);
});

test('all public mutations leave deeply frozen input untouched and clone nested fields', () => {
  const original = frozen(fresh()), expected = clone(original);
  const changed = advance(original, 10000);
  const goalChanged = setHeartGoal(original, 8000);
  const gift = grantHeartItem(original, 'scarf');
  assert.deepEqual(original, expected);
  changed.days[day].count = 1;
  goalChanged.equipped.hat = 'crown';
  gift.owned.push('basket');
  assert.deepEqual(original, expected);
});

test('persisted state roundtrips and rejects malformed, unbounded or mismatched ledgers', () => {
  const state = advance(fresh(), 5000);
  assert.deepEqual(validateHeartState(clone(state)), state);
  const mutations = [
    value => { value.version = 2; },
    value => { value.balance = -1; },
    value => { value.balance = 4; },
    value => { value.totalEarned = 0; value.balance = 0; },
    value => { value.owned = ['scarf', 'scarf']; },
    value => { value.equipped.hat = 'scarf'; },
    value => { value.days[day].goal = 0; },
    value => { value.days[day].count = '5000'; },
    value => { value.days[day].awarded = 9; },
    value => { value.days[day].date = '2026-11-18'; },
    value => { value.days[day].observedAt = '2026-11-18T00:00:00.000Z'; },
    value => { value.days = {}; },
    value => { value.days['2026-11-18'] = {...value.days[day], date: '2026-11-18'}; },
    value => { value.days['2026-10-01'] = {...value.days[day], date: '2026-10-01'}; },
    value => { value.arbitrary = 'not stored'; },
    value => { value.days[day].rawReadings = [1, 2, 3]; },
  ];
  for (const mutate of mutations) { const invalid = clone(state); mutate(invalid); assert.throws(() => validateHeartState(invalid), error('invalid_heart_state')); }
});

test('league uses capped percentages rather than raw counts and shares tied ranks', () => {
  const largerGoal = advanceHearts(createHeartState({date: day, goal: 10000}), {date: day, count: 10000});
  const smallerGoal = advance(fresh(), 5000);
  const lower = advance(fresh(), 4000);
  const board = heartLeague([
    {publicId: 'b', nickname: '햇살', region: '세종', state: largerGoal},
    {publicId: 'c', nickname: '바람', state: lower, tier: 1},
    {publicId: 'a', nickname: '풀잎', state: smallerGoal},
  ], day);
  assert.deepEqual(board.entries.map(row => [row.publicId, row.points, row.rank]), [['a', 100, 1], ['b', 100, 1], ['c', 80, 3]]);
  assert.equal(board.entries[2].tier, 1);
  assert.equal(board.weekStart, '2026-11-16');
  assert.equal(board.total, 3);
  assert.ok(board.entries.every(row => !('state' in row) && !('count' in row)));
});

test('league accepts no participants and never manufactures entries or an arbitrary tier', () => {
  assert.deepEqual(heartLeague([], day).entries, []);
  const row = {publicId: 'a', nickname: '새싹', state: fresh()};
  assert.equal(heartLeague([row], day).entries[0].tier, 0);
  assert.throws(() => heartLeague([row, row], day), error('invalid_heart_league'));
  assert.throws(() => heartLeague([{...row, tier: 5}], day), error('invalid_heart_league'));
  assert.throws(() => heartLeague([{...row, nickname: 'bad\nname'}], day), error('invalid_heart_league'));
});

test('catalog and policy are immutable and every collectible has its own identifier', () => {
  assert.deepEqual(HEART_ITEMS.map(item => item.id).sort(), ['autumn','basket','crown','hanbok','hiking-cap','scarf','star-cape','straw-hat','vest']);
  assert.equal(new Set(HEART_ITEMS.map(item => item.id)).size, HEART_ITEMS.length);
  assert.equal(HEART_LEAGUE_TIERS.length, 5);
  assert.throws(() => { HEART_ITEMS[0].price = 0; }, TypeError);
  assert.throws(() => { HEART_POLICY.rewardThresholds[0].total = 99; }, TypeError);
  for (const category of ['hat', 'outfit', 'accessory', 'background']) assert.ok(HEART_ITEMS.filter(item => item.category === category).length <= 4);
});

test('all goal/count threshold combinations remain monotonic and bounded without rewarding twice', () => {
  for (let goal = 500; goal <= 20000; goal += 100) {
    let state = createHeartState({date: day, goal});
    let previous = -1;
    for (const count of [0, Math.ceil(goal * .25), Math.ceil(goal * .5), goal, goal * 2, goal * 3, goal * 4]) {
      state = advanceHearts(state, {date: day, count});
      const progress = heartSummary(state, day);
      assert.ok(progress.percent >= previous);
      assert.ok(progress.todayPoints <= 300);
      assert.ok(state.balance <= 5);
      assert.equal(progress.todayEarned, state.balance);
      previous = progress.percent;
    }
    assert.equal(state.balance, 5);
    assert.deepEqual(advanceHearts(state, {date: day, count: goal * 4}), state);
  }
});
