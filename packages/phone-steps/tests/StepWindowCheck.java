package com.bapmunna.phonesteps;

import java.time.Instant;
import java.time.ZoneId;
import java.time.Duration;

public final class StepWindowCheck {
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] arguments) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        StepWindow midnight = new StepWindow(Instant.parse("2026-11-14T15:00:01Z"), seoul);
        require(midnight.date.toString().equals("2026-11-15"), "Device-local date must change at local midnight");
        require(midnight.start.equals(Instant.parse("2026-11-14T15:00:00Z")), "KST midnight is not UTC midnight");
        require(!midnight.isCurrent(Instant.parse("2026-11-15T15:00:01Z"), seoul), "Yesterday's asynchronous result must be rejected");
        require(!midnight.isCurrent(midnight.end, ZoneId.of("UTC")), "Time-zone changes invalidate in-flight queries");
        require(midnight.isCurrent(Instant.parse("2026-11-14T15:05:00Z"), seoul), "Same-day result remains valid");
        StepWindow spring = new StepWindow(Instant.parse("2026-03-09T03:59:59Z"), ZoneId.of("America/New_York"));
        require(Duration.between(spring.start, spring.end).getSeconds() == 23 * 3600 - 1, "DST day must not assume 24 hours");
        StepWindow autumn = new StepWindow(Instant.parse("2026-11-02T04:59:59Z"), ZoneId.of("America/New_York"));
        require(Duration.between(autumn.start, autumn.end).getSeconds() == 25 * 3600 - 1, "Long DST day must be covered");
        require(StepWindow.validateCount(null) == null, "No records cannot become zero");
        require(StepWindow.validateCount(0L) == 0, "Explicit zero is valid data");
        require(StepWindow.validateCount(3210L) == 3210, "The provider aggregate must be preserved");
        for (long bad : new long[]{-1L, 9_007_199_254_740_992L}) {
            try { StepWindow.validateCount(bad); throw new AssertionError("Invalid count accepted"); }
            catch (IllegalArgumentException expected) { }
        }
        System.out.println("StepWindow: local day, rollover, zone, DST, empty/zero and integer limits passed.");
    }
}
