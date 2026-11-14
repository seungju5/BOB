package com.bapmunna.senior;

import android.content.Intent;
import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle state) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(state);
    }

    @Override
    protected void load() {
        Intent incoming = getIntent();
        if (incoming != null && Intent.ACTION_VIEW.equals(incoming.getAction())
                && !HealthLaunchLink.accepts(incoming.getDataString())) {
            finish();
            return;
        }
        // The bridge never receives an outside URL, extras, account or token.
        setIntent(new Intent(Intent.ACTION_MAIN));
        super.load();
    }

    @Override
    protected void onNewIntent(Intent incoming) {
        if (incoming == null) return;
        boolean openHealth = Intent.ACTION_VIEW.equals(incoming.getAction());
        if (openHealth && !HealthLaunchLink.accepts(incoming.getDataString())) return;
        Intent sanitized = new Intent(Intent.ACTION_MAIN);
        super.onNewIntent(sanitized);
        setIntent(sanitized);
        if (openHealth && bridge != null &&
                !HealthLaunchLink.LOCAL_HEALTH_URL.equals(bridge.getWebView().getUrl())) {
            bridge.getWebView().loadUrl(HealthLaunchLink.LOCAL_HEALTH_URL);
        }
    }
}
