package com.wwscj.weeklyplanner;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// Capacitor core (without the @capacitor/app plugin) doesn't route the
// hardware/gesture back action into the WebView at all — the default
// AppCompatActivity behavior just finishes the activity immediately, so
// JS-side history.pushState()/popstate handling (e.g. closing a modal on
// back) never gets a chance to run. Overriding the legacy onBackPressed()
// alone doesn't work on this project's androidx.activity version (it's
// bypassed by the OnBackPressedDispatcher), so we register a proper
// OnBackPressedCallback instead: let the WebView consume the back action
// when it has its own history to go back to, otherwise fall through to the
// normal system behavior (finish the activity).
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }
}
