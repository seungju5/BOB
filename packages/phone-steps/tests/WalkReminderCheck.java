package com.bapmunna.phonesteps;

import java.time.Instant;
import java.time.ZoneId;

public final class WalkReminderCheck {
    private static void check(boolean condition, String explanation) {
        if (!condition) throw new AssertionError(explanation);
    }
    public static void main(String[] args) {
        ZoneId seoul = ZoneId.of("Asia/Seoul");
        check(WalkReminderTime.next("13:00", Instant.parse("2026-11-17T03:30:00Z"), seoul)
            .equals(Instant.parse("2026-11-17T04:00:00Z")), "Upcoming local meal time stays today");
        check(WalkReminderTime.next("13:00", Instant.parse("2026-11-17T04:00:00Z"), seoul)
            .equals(Instant.parse("2026-11-18T04:00:00Z")), "Delivered alarm must move to tomorrow, never loop immediately");
        check(WalkReminderTime.next("00:00", Instant.parse("2026-11-17T14:59:00Z"), seoul)
            .equals(Instant.parse("2026-11-17T15:00:00Z")), "Calendar midnight is KST midnight");
        ZoneId newYork = ZoneId.of("America/New_York");
        check(WalkReminderTime.next("08:30", Instant.parse("2026-03-07T14:00:00Z"), newYork)
            .equals(Instant.parse("2026-03-08T12:30:00Z")), "Spring DST keeps 08:30 wall time instead of adding 24 hours");
        check(WalkReminderTime.next("08:30", Instant.parse("2026-10-31T13:00:00Z"), newYork)
            .equals(Instant.parse("2026-11-01T13:30:00Z")), "Autumn DST keeps 08:30 wall time");
        check(WalkReminderTime.next("02:30", Instant.parse("2026-03-08T06:00:00Z"), newYork)
            .equals(Instant.parse("2026-03-08T07:30:00Z")), "A missing DST hour moves forward safely");
        for (String invalid : new String[]{null,"","8:30","24:00","12:60","08:00:00","08:00 ","-1:00"}) {
            check(!WalkReminderTime.valid(invalid), "Reject non-HH:mm input");
            try { WalkReminderTime.next(invalid, Instant.now(), seoul); throw new AssertionError("Invalid time accepted"); }
            catch (IllegalArgumentException expected) { }
        }
        check(RankingReadDecision.afterRead("not-connected",true,false,true) == RankingReadDecision.Action.SKIP, "Initially disconnected health must skip upload while leaving the board available");
        check(RankingReadDecision.afterRead("permission-denied",true,true,true) == RankingReadDecision.Action.SKIP, "Denied data remains absent, not a stale credential error");
        check(RankingReadDecision.afterRead("not-connected",false,false,true) == RankingReadDecision.Action.STALE, "Consent revoked during read must invalidate the request");
        check(RankingReadDecision.afterRead("ready",true,false,true) == RankingReadDecision.Action.STALE, "A ready result cannot upload after consent is disabled");
        check(RankingReadDecision.afterRead("ready",true,true,false) == RankingReadDecision.Action.STALE, "Background upload is blocked");
        check(RankingReadDecision.afterRead("ready",true,true,true) == RankingReadDecision.Action.UPLOAD, "Current ready data may upload after both consents");
        System.out.println("WalkReminderTime: local daily schedule, delivered alarm rollover, DST and invalid times passed.");
    }
}
