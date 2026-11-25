const timeOfDay = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** @param {unknown} value @returns {value is {start:string,end:string}} */
export function isQuietHours(value) {
  return !!value && typeof value === 'object' && 'start' in value && 'end' in value &&
    typeof value.start === 'string' && typeof value.end === 'string' &&
    timeOfDay.test(value.start) && timeOfDay.test(value.end) && value.start !== value.end;
}

function withinDay(value) {
  const [h, m] = value.split(':').map(Number);
  return (h * 60 + m) * 60_000;
}

/** Time remaining before the chosen KST quiet hours. Zero means already quiet. */
export function untilQuiet(at, quiet) {
  if (!isQuietHours(quiet)) return Infinity;
  const t = (at + KST) % DAY, start = withinDay(quiet.start), end = withinDay(quiet.end);
  if (start < end ? t >= start && t < end : t >= start || t < end) return 0;
  return (start - t + DAY) % DAY;
}
