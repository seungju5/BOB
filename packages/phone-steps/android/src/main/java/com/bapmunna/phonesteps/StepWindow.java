package com.bapmunna.phonesteps;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Pure time/total rules, independent of Android and of the meal judgement code. */
final class StepWindow {
    final ZoneId zone;
    final LocalDate date;
    final Instant start;
    final Instant end;
    StepWindow(Instant now, ZoneId zone) {
        this.zone = zone;
        this.date = now.atZone(zone).toLocalDate();
        this.start = date.atStartOfDay(zone).toInstant();
        this.end = now;
    }

    boolean isCurrent(Instant now, ZoneId currentZone) {
        return zone.equals(currentZone) && date.equals(now.atZone(currentZone).toLocalDate());
    }

    static Long validateCount(Long count) {
        if (count != null && (count < 0 || count > 9_007_199_254_740_991L)) {
            throw new IllegalArgumentException("Invalid step total");
        }
        return count;
    }
}
