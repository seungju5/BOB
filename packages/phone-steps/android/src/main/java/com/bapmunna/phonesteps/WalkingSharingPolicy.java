package com.bapmunna.phonesteps;

/** The pairing preview pins the destination; confirmation cannot widen it. */
public final class WalkingSharingPolicy {
    private WalkingSharingPolicy() {}

    public static String scope(Object value) {
        if (value == null) return "public"; // Legacy connections were public.
        if ("private".equals(value) || "public".equals(value)) return (String) value;
        throw new IllegalArgumentException("invalid_response");
    }

    public static void confirm(String scope, String version, boolean shareToday, Object shareRanking) {
        boolean valid = "private".equals(scope)
            ? "2026-11-17-private".equals(version) && Boolean.FALSE.equals(shareRanking)
            : "public".equals(scope) && "2026-11-17".equals(version) && (shareRanking == null || Boolean.TRUE.equals(shareRanking));
        if (!shareToday || !valid) throw new IllegalArgumentException("consent_required");
    }
}
