/**
 * Shared deterministic heart accounting. Only callers with authenticated,
 * consented observations may persist its output. This module has no I/O,
 * calorie/meal inference or health recommendation.
 */
export const HEART_POLICY = Object.freeze({
  version: 1,
  timeZone: 'Asia/Seoul',
  defaultGoal: 5000,
  minGoal: 500,
  maxGoal: 20000,
  goalStep: 100,
  maxCount: 1000000,
  retentionDays: 35,
  dailyLeagueCap: 300,
  rewardThresholds: Object.freeze([
    Object.freeze({percent: 50, total: 1}),
    Object.freeze({percent: 100, total: 3}),
    Object.freeze({percent: 200, total: 5}),
  ]),
});

export const HEART_ITEMS = Object.freeze([
  {id: 'scarf', name: '포근한 목도리', category: 'accessory', price: 3, icon: '🧣', unlockDays: null},
  {id: 'basket', name: '산책 바구니', category: 'accessory', price: 3, icon: '🧺', unlockDays: null},
  {id: 'straw-hat', name: '햇살 밀짚모자', category: 'hat', price: 6, icon: '👒', unlockDays: null},
  {id: 'hiking-cap', name: '가벼운 산책모자', category: 'hat', price: 6, icon: '🧢', unlockDays: null},
  {id: 'vest', name: '따뜻한 털조끼', category: 'outfit', price: 9, icon: '🧶', unlockDays: null},
  {id: 'hanbok', name: '고운 한복', category: 'outfit', price: 15, icon: '🌸', unlockDays: 7},
  {id: 'star-cape', name: '별자수 망토', category: 'outfit', price: 12, icon: '🌙', unlockDays: null},
  {id: 'crown', name: '반짝 왕관', category: 'hat', price: 15, icon: '👑', unlockDays: 30},
  {id: 'autumn', name: '가을 산책길', category: 'background', price: 3, icon: '🍂', unlockDays: null},
].map(Object.freeze));

export const HEART_LEAGUE_TIERS = Object.freeze(['쌀알', '주먹밥', '공깃밥', '도시락', '황금밥상']);
const categories = ['hat', 'outfit', 'accessory', 'background'];
const validAwards = [0, ...HEART_POLICY.rewardThresholds.map(value => value.total)];
const dayMs = 86400000;
const kstOffset = 9 * 3600000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed) => Object.keys(value).length === allowed.length && allowed.every(key => Object.hasOwn(value, key));
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const items = new Map(HEART_ITEMS.map(item => [item.id, item]));

export class HeartError extends Error {
  constructor(code) { super(code); this.name = 'HeartError'; this.code = code; }
}
const fail = code => { throw new HeartError(code); };
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const millis = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value;
}
function dateValue(value) { if (!validDate(value)) fail('invalid_heart_date'); return value; }
function goalValue(value) {
  if (!integer(value, HEART_POLICY.minGoal, HEART_POLICY.maxGoal) || value % HEART_POLICY.goalStep !== 0) fail('invalid_heart_goal');
  return value;
}
function countValue(value) { if (value !== null && !integer(value, 0, HEART_POLICY.maxCount)) fail('invalid_step_count'); return value; }
function addDays(date, amount) { return new Date(Date.parse(dateValue(date) + 'T00:00:00.000Z') + amount * dayMs).toISOString().slice(0, 10); }
function isoValue(value) {
  if (!(value instanceof Date) && typeof value !== 'number' && typeof value !== 'string') fail('invalid_heart_observation');
  if (typeof value === 'string' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validDate(value.slice(0, 10)))) fail('invalid_heart_observation');
  const millis = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(millis)) fail('invalid_heart_observation');
  return new Date(millis).toISOString();
}
function itemValue(value) { const item = items.get(value); if (!item) fail('unknown_heart_item'); return item; }
const emptyEquip = () => ({hat: null, outfit: null, accessory: null, background: null});
const emptyDay = (date, goal) => ({date, goal, count: null, cooking: false, awarded: 0, observedAt: null});
const copyState = state => ({...state, owned: [...state.owned], equipped: {...state.equipped}, days: Object.fromEntries(Object.entries(state.days).map(([key, value]) => [key, {...value}]))});

/** Convert a timestamp to the Korean calendar date. Callers supply their clock. */
export function heartDate(now) {
  const iso = isoValue(now);
  return new Date(Date.parse(iso) + kstOffset).toISOString().slice(0, 10);
}

/** Monday through Sunday, expressed as inclusive Korean calendar dates. */
export function heartWeek(date) {
  dateValue(date);
  const weekday = new Date(date + 'T00:00:00.000Z').getUTCDay();
  const start = addDays(date, -(weekday + 6) % 7);
  return {start, end: addDays(start, 6)};
}

export function heartProgress({count, goal, cooking = false}) {
  countValue(count); goalValue(goal);
  if (typeof cooking !== 'boolean') fail('invalid_cooking');
  // Threshold checks use integers so floating-point rounding never awards early.
  const achieved = threshold => count !== null && count * 100 >= goal * threshold;
  const percent = count === null ? null : Math.floor(count * 10000 / goal) / 100;
  const milestones = [
    {id: 'cooking', threshold: null, achieved: cooking},
    ...[25, 50, 100, 200].map(threshold => ({id: String(threshold), threshold, achieved: achieved(threshold)})),
  ];
  const rewardTotal = HEART_POLICY.rewardThresholds.reduce((total, rule) => achieved(rule.percent) ? rule.total : total, 0);
  return {percent, weeklyPoints: percent === null ? 0 : Math.min(HEART_POLICY.dailyLeagueCap, percent), milestones, filled: milestones.filter(value => value.achieved).length, rewardTotal};
}

/** Validate persisted server state or an untrusted local demo without coercion. */
export function validateHeartState(value) {
  if (!record(value) || !exactKeys(value, ['version', 'date', 'goal', 'balance', 'totalEarned', 'owned', 'equipped', 'days']) || value.version !== HEART_POLICY.version || !validDate(value.date) || !integer(value.balance) || !integer(value.totalEarned) || value.balance > value.totalEarned || !Array.isArray(value.owned) || !record(value.equipped) || !record(value.days)) fail('invalid_heart_state');
  try { goalValue(value.goal); } catch { fail('invalid_heart_state'); }
  if (value.owned.length > HEART_ITEMS.length || new Set(value.owned).size !== value.owned.length || value.owned.some(id => !items.has(id))) fail('invalid_heart_state');
  if (Object.keys(value.equipped).length !== categories.length) fail('invalid_heart_state');
  for (const category of categories) {
    const id = value.equipped[category];
    if (id !== null && (!value.owned.includes(id) || items.get(id)?.category !== category)) fail('invalid_heart_state');
  }
  const entries = Object.entries(value.days);
  if (entries.length < 1 || entries.length > HEART_POLICY.retentionDays || !Object.hasOwn(value.days, value.date)) fail('invalid_heart_state');
  const earliest = addDays(value.date, 1 - HEART_POLICY.retentionDays);
  let retainedAwards = 0;
  for (const [key, day] of entries) {
    if (!record(day) || !exactKeys(day, ['date', 'goal', 'count', 'cooking', 'awarded', 'observedAt']) || !validDate(key) || day.date !== key || key > value.date || key < earliest || typeof day.cooking !== 'boolean' || !validAwards.includes(day.awarded)) fail('invalid_heart_state');
    try { goalValue(day.goal); countValue(day.count); } catch { fail('invalid_heart_state'); }
    if (day.observedAt !== null) {
      try { if (isoValue(day.observedAt) !== day.observedAt || heartDate(day.observedAt) !== key) fail('invalid_heart_state'); } catch { fail('invalid_heart_state'); }
    }
    retainedAwards += day.awarded;
  }
  if (retainedAwards > value.totalEarned) fail('invalid_heart_state');
  return value;
}

export function createHeartState({date, goal = HEART_POLICY.defaultGoal}) {
  dateValue(date); goalValue(goal);
  return {version: HEART_POLICY.version, date, goal, balance: 0, totalEarned: 0, owned: [], equipped: emptyEquip(), days: {[date]: emptyDay(date, goal)}};
}

function signalStreak(state, date) {
  // Today's not-yet-received signal does not erase yesterday's active streak.
  let cursor = state.days[date]?.cooking ? date : addDays(date, -1);
  let streak = 0;
  while (state.days[cursor]?.cooking) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

/**
 * count is a verified whole-day aggregate, never a delta. now is its observed
 * timestamp, not a later read/refresh time. null supplies no new step reading;
 * it never replaces a previously verified aggregate with zero or unknown.
 * A true cooking flag is a trusted independent signal and is sticky that day.
 */
export function advanceHearts(state, {date, count, cooking = false, now}) {
  validateHeartState(state); dateValue(date); countValue(count);
  if (typeof cooking !== 'boolean') fail('invalid_cooking');
  const observedAt = now === undefined ? null : isoValue(now);
  if (observedAt !== null && heartDate(observedAt) !== date) fail('invalid_heart_observation');
  // Past days are closed: late or replayed data never recreates a reward day.
  if (date < state.date) return copyState(state);
  const next = copyState(state);
  if (date > next.date) {
    next.date = date;
    const earliest = addDays(date, 1 - HEART_POLICY.retentionDays);
    next.days = Object.fromEntries(Object.entries(next.days).filter(([key]) => key >= earliest));
    next.days[date] = emptyDay(date, next.goal);
  }
  const day = next.days[date];
  const isNewer = day.observedAt === null || (observedAt !== null && observedAt > day.observedAt);
  const exactRepeat = observedAt !== null && observedAt === day.observedAt && count === day.count;
  if (count !== null && (isNewer || exactRepeat)) {
    day.count = count;
    day.observedAt = observedAt;
  }
  day.cooking = day.cooking || cooking;
  const eligible = heartProgress(day).rewardTotal;
  const additional = Math.max(0, eligible - day.awarded);
  if (!integer(next.balance + additional) || !integer(next.totalEarned + additional)) fail('invalid_heart_state');
  day.awarded = Math.max(day.awarded, eligible);
  next.balance += additional;
  next.totalEarned += additional;
  const streak = signalStreak(next, date);
  for (const item of HEART_ITEMS) if (item.unlockDays !== null && streak >= item.unlockDays && !next.owned.includes(item.id)) next.owned.push(item.id);
  return next;
}

/** A change applies tomorrow after today's first verified observation. */
export function setHeartGoal(state, goal) {
  validateHeartState(state); goalValue(goal);
  const next = copyState(state);
  next.goal = goal;
  const today = next.days[next.date];
  if (today.count === null && today.observedAt === null && !today.cooking && today.awarded === 0) today.goal = goal;
  return next;
}

export function buyHeartItem(state, itemId) {
  validateHeartState(state);
  const item = itemValue(itemId);
  if (state.owned.includes(item.id)) return copyState(state);
  if (state.balance < item.price) fail('insufficient_hearts');
  const next = copyState(state);
  next.balance -= item.price;
  next.owned.push(item.id);
  return next;
}

/** Internal, non-cash gift/unlock. Never expose arbitrary grants to clients. */
export function grantHeartItem(state, itemId) {
  validateHeartState(state);
  const item = itemValue(itemId), next = copyState(state);
  if (!next.owned.includes(item.id)) next.owned.push(item.id);
  return next;
}

export function equipHeartItem(state, itemId) {
  validateHeartState(state);
  const next = copyState(state);
  if (itemId === 'default') { next.equipped = emptyEquip(); return next; }
  if (typeof itemId === 'string' && itemId.startsWith('default-')) {
    const category = itemId.slice('default-'.length);
    if (!categories.includes(category)) fail('unknown_heart_item');
    next.equipped[category] = null;
    return next;
  }
  const item = itemValue(itemId);
  if (!next.owned.includes(item.id)) fail('heart_item_not_owned');
  next.equipped[item.category] = item.id;
  return next;
}

export function heartSummary(state, date) {
  validateHeartState(state); dateValue(date);
  const day = state.days[date] ?? emptyDay(date, state.goal);
  const progress = heartProgress(day), week = heartWeek(date);
  const month = date.slice(0, 7);
  const within = Object.values(state.days).filter(value => value.date <= date);
  const weeklyPoints = Math.round(within.filter(value => value.date >= week.start && value.date <= week.end).reduce((sum, value) => sum + heartProgress(value).weeklyPoints, 0) * 100) / 100;
  return {
    date, count: day.count, goal: day.goal, configuredGoal: state.goal, cooking: day.cooking,
    ...progress, weeklyPoints, todayPoints: progress.weeklyPoints,
    todayEarned: day.awarded, balance: state.balance, totalEarned: state.totalEarned,
    monthEarned: within.filter(value => value.date.startsWith(month)).reduce((sum, value) => sum + value.awarded, 0),
    streak: signalStreak(state, date), owned: [...state.owned], equipped: {...state.equipped},
    observedAt: day.observedAt,
  };
}

/** Supply only currently consented members of the same region/group. */
export function heartLeague(rows, date) {
  dateValue(date);
  if (!Array.isArray(rows) || rows.length > 10000) fail('invalid_heart_league');
  const identifiers = new Set();
  const entries = rows.map(row => {
    if (!record(row) || typeof row.publicId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.publicId) || identifiers.has(row.publicId) || typeof row.nickname !== 'string' || !row.nickname.trim() || row.nickname.length > 40 || /[\u0000-\u001f\u007f]/.test(row.nickname) || (row.region !== undefined && (typeof row.region !== 'string' || row.region.length > 40 || /[\u0000-\u001f\u007f]/.test(row.region))) || (row.tier !== undefined && !integer(row.tier, 0, HEART_LEAGUE_TIERS.length - 1))) fail('invalid_heart_league');
    identifiers.add(row.publicId);
    const summary = heartSummary(row.state, date);
    return {publicId: row.publicId, nickname: row.nickname, region: row.region ?? '', points: summary.weeklyPoints, streak: summary.streak, tier: row.tier ?? 0};
  }).sort((a, b) => b.points - a.points || (a.publicId < b.publicId ? -1 : a.publicId > b.publicId ? 1 : 0));
  let previous = null, rank = 0;
  const ranked = entries.map((row, index) => {
    if (previous === null || row.points !== previous) rank = index + 1;
    previous = row.points;
    return {...row, rank};
  });
  const week = heartWeek(date);
  return {weekStart: week.start, weekEnd: week.end, entries: ranked, total: ranked.length};
}
