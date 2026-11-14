package com.bapmunna.senior;

/** No URI normalization, payloads, encoded paths, query strings or account data. */
public final class HealthLaunchLink {
    public static final String LOCAL_HEALTH_URL = "https://localhost/health/";
    private HealthLaunchLink() {}

    public static boolean accepts(String value) {
        return "bapmunna://health".equals(value)
            || "bapmunna://health/".equals(value)
            || "https://impact-series.web.app/bapmunna/app/health".equals(value)
            || "https://impact-series.web.app/bapmunna/app/health/".equals(value);
    }
}
