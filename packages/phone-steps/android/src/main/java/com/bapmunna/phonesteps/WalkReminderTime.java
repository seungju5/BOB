package com.bapmunna.phonesteps;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Calendar schedule, not a fixed 24-hour timer; handles DST and zone changes. */
public final class WalkReminderTime {
    public static boolean valid(String time) { return time != null && time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"); }
    public static Instant next(String time, Instant now, ZoneId zone) {
        if (!valid(time)) throw new IllegalArgumentException("Invalid reminder time");
        ZonedDateTime current = now.atZone(zone);
        ZonedDateTime next = current.toLocalDate().atTime(LocalTime.parse(time)).atZone(zone);
        if (!next.toInstant().isAfter(now)) next = current.toLocalDate().plusDays(1).atTime(LocalTime.parse(time)).atZone(zone);
        return next.toInstant();
    }
}
