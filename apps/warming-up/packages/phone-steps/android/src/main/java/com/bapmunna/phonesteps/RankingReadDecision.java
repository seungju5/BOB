package com.bapmunna.phonesteps;

/** A stable unavailable read is different from revocation during an in-flight read. */
public final class RankingReadDecision {
    public enum Action { UPLOAD, SKIP, STALE }
    public static Action afterRead(String status, boolean sameRevision, boolean consent, boolean foreground) {
        if (!sameRevision) return Action.STALE;
        if (!"ready".equals(status)) return Action.SKIP;
        return consent && foreground ? Action.UPLOAD : Action.STALE;
    }
}
