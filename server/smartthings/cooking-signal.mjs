import criteria from './power-criteria.json' with { type: 'json' };

export function isCookingPower(watts, threshold = criteria.highWatts) {
  return Number.isFinite(watts) && watts >= threshold;
}

export function meterSignal({ reading, energy }) {
  return {
    reading: reading && { cooking: isCookingPower(reading.watts), measuredAt: reading.measuredAt },
    energy: energy && { measuredAt: energy.measuredAt },
  };
}

// Group two actual qualifying observations. No assumption about watts in between.
export function continuesCookRun(time, lastHighTime, mergeGapMinutes = criteria.mergeGapMinutes) {
  return lastHighTime != null && time >= lastHighTime && time - lastHighTime <= mergeGapMinutes * 60000;
}
