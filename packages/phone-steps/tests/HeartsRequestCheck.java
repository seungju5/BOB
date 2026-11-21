package com.bapmunna.phonesteps;

import java.util.HashMap;
import java.util.Map;

public final class HeartsRequestCheck {
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void reject(String action, Map<String, Object> body) {
        try { HeartsRequestPolicy.validate(action, body); throw new AssertionError("Accepted unsafe request: " + action); }
        catch (IllegalArgumentException expected) { require("invalid_heart_request".equals(expected.getMessage()), "Error is bounded"); }
    }
    private static void rejectConsent(String scope, String version, boolean share, Object ranking) {
        try { WalkingSharingPolicy.confirm(scope, version, share, ranking); throw new AssertionError("Unsafe sharing consent accepted"); }
        catch (IllegalArgumentException expected) { require("consent_required".equals(expected.getMessage()), "Bounded consent error"); }
    }
    public static void main(String[] args) {
        require("public".equals(WalkingSharingPolicy.scope(null)), "Legacy scope remains public");
        require("private".equals(WalkingSharingPolicy.scope("private")), "Private scope is preserved");
        for (Object wrong : new Object[]{"PRIVATE", "friends", false, 0}) {
            try { WalkingSharingPolicy.scope(wrong); throw new AssertionError("Invalid scope accepted"); }
            catch (IllegalArgumentException expected) { require("invalid_response".equals(expected.getMessage()), "Invalid scope is rejected"); }
        }
        WalkingSharingPolicy.confirm("private", "2026-11-17-private", true, false);
        WalkingSharingPolicy.confirm("public", "2026-11-17", true, null);
        WalkingSharingPolicy.confirm("public", "2026-11-17", true, true);
        for (Object wrong : new Object[]{true, "false", 0}) rejectConsent("private", "2026-11-17-private", true, wrong);
        rejectConsent("private", "2026-11-17-private", true, null);
        rejectConsent("private", "2026-11-17", true, false);
        rejectConsent("private", "2026-11-17-private", false, false);
        rejectConsent("public", "2026-11-17-private", true, false);
        rejectConsent("public", "2026-11-17", true, false);
        rejectConsent("friends", "2026-11-17", true, null);
        for (String action : new String[]{"hearts", "heartleague"}) {
            require("GET".equals(HeartsRequestPolicy.validate(action, null)), "Read must be GET");
            reject(action, Map.of());
        }
        Map<String, Object> join = Map.of("consentVersion", "2026-11-17-hearts", "enabled", true, "goal", 5000, "leagueEnabled", false, "region", "");
        require("POST".equals(HeartsRequestPolicy.validate("heartjoin", join)), "Explicit consent is valid");
        for (Object goal : new Object[]{0, 499, 20100, 550, Double.NaN, Double.POSITIVE_INFINITY, true, "5000"}) {
            Map<String, Object> wrong = new HashMap<>(join); wrong.put("goal", goal); reject("heartjoin", wrong);
        }
        for (Object goal : new Object[]{500, 5000.0, 20000}) require("POST".equals(HeartsRequestPolicy.validate("heartsettings", Map.of("goal", goal))), "Valid integer goals");
        for (String action : new String[]{"heartmessage", "heartgift", "pair", "sync", "https://evil.test", "../hearts", "hearts?token=x", "Hearts", ""}) reject(action, Map.of());
        Map<String, Object> noConsent = new HashMap<>(join); noConsent.put("enabled", false); reject("heartjoin", noConsent);
        Map<String, Object> wrongVersion = new HashMap<>(join); wrongVersion.put("consentVersion", "old"); reject("heartjoin", wrongVersion);
        Map<String, Object> count = new HashMap<>(join); count.put("count", 5000); reject("heartjoin", count);
        reject("heartsettings", Map.of("url", "https://evil.test"));
        reject("heartsettings", Map.of("token", "secret"));
        reject("heartsettings", Map.of("enabled", "true"));
        reject("heartsettings", Map.of("region", "지역\n개인정보"));
        reject("heartsettings", Map.of("region", "a".repeat(61)));
        reject("heartsettings", Map.of());
        require("POST".equals(HeartsRequestPolicy.validate("heartsettings", Map.of("enabled", false))), "Pause can be requested");
        for (String action : new String[]{"heartbuy", "heartequip"}) {
            require("POST".equals(HeartsRequestPolicy.validate(action, Map.of("itemId", "straw-hat"))), "Known shape is valid");
            reject(action, Map.of("itemId", "../private"));
            reject(action, Map.of("itemId", "hat", "price", 0));
            reject(action, Map.of());
        }
        require("POST".equals(HeartsRequestPolicy.validate("heartread", Map.of("id", "msg_123"))), "Own opaque message ID allowed");
        reject("heartread", Map.of("id", "x", "uid", "someone"));
        require("POST".equals(HeartsRequestPolicy.validate("heartleave", Map.of())), "Empty deletion request only");
        reject("heartleave", Map.of("uid", "someone"));
        reject("heartleave", null);
        System.out.println("HeartsRequestPolicy and WalkingSharingPolicy: fixed routes, pinned private/public consent, constrained goals, and no guardian/token/count/URL payload passed.");
    }
}
