package com.bapmunna.phonesteps;

import java.util.Map;
import java.util.Set;

/** Pure request boundary. It cannot accept a URL, a bearer, or invented steps. */
public final class HeartsRequestPolicy {
    private HeartsRequestPolicy() {}
    private static final Set<String> READS = Set.of("hearts", "heartleague");
    private static final Set<String> WRITES = Set.of("heartjoin", "heartsettings", "heartbuy", "heartequip", "heartread", "heartleave");

    public static boolean permits(String action) { return READS.contains(action) || WRITES.contains(action); }

    public static String validate(String action, Map<String, Object> body) {
        if (!permits(action)) throw invalid();
        if (READS.contains(action)) {
            if (body != null) throw invalid();
            return "GET";
        }
        if (body == null) throw invalid();
        switch (action) {
            case "heartjoin":
                fields(body, Set.of("consentVersion", "enabled", "goal", "leagueEnabled", "region"));
                if (!"2026-11-17-hearts".equals(body.get("consentVersion")) || !Boolean.TRUE.equals(body.get("enabled"))) throw invalid();
                goal(body.get("goal"));
                if (!(body.get("leagueEnabled") instanceof Boolean)) throw invalid();
                region(body.get("region"));
                break;
            case "heartsettings":
                fields(body, Set.of("goal", "enabled", "leagueEnabled", "region"));
                if (body.isEmpty()) throw invalid();
                if (body.containsKey("goal")) goal(body.get("goal"));
                for (String key : Set.of("enabled", "leagueEnabled")) if (body.containsKey(key) && !(body.get(key) instanceof Boolean)) throw invalid();
                if (body.containsKey("region")) region(body.get("region"));
                break;
            case "heartbuy":
            case "heartequip":
                fields(body, Set.of("itemId"));
                identifier(body.get("itemId"), 64);
                break;
            case "heartread":
                fields(body, Set.of("id"));
                identifier(body.get("id"), 128);
                break;
            case "heartleave": fields(body, Set.of()); break;
            default: throw invalid();
        }
        return "POST";
    }

    private static void fields(Map<String, Object> body, Set<String> allowed) {
        if (!allowed.containsAll(body.keySet())) throw invalid();
    }
    private static void goal(Object value) {
        if (!(value instanceof Number)) throw invalid();
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < 500 || number > 20000 || number % 100 != 0) throw invalid();
    }
    private static void region(Object value) {
        if (!(value instanceof String) || ((String) value).length() > 60 || ((String) value).matches("(?s).*[\\p{Cntrl}].*")) throw invalid();
    }
    private static void identifier(Object value, int max) {
        if (!(value instanceof String) || ((String) value).length() > max || !((String) value).matches("[A-Za-z0-9_-]+")) throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("invalid_heart_request"); }
}
