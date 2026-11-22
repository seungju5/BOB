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

// A gap in reception always ends the observed run. Short stretches of sampled
// low power can connect two high readings from the same cooker cycle.
export function continuesCookRun(time, previousTime, lastHighTime,
  maxGap = criteria.maxGapMinutes, mergeGap = criteria.mergeGapMinutes, interval = criteria.readingIntervalMinutes) {
  return previousTime != null && lastHighTime != null &&
    time - previousTime <= maxGap * 60000 && time - lastHighTime <= (mergeGap + interval) * 60000;
}
