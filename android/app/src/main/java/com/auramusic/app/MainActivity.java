package com.auramusic.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int BG = Color.parseColor("#090A0F");
    private static MainActivity current;
    public static MainActivity getInstance() { return current; }
    private WebView webView;
    private String appHost = "";

    // Sends a lock-screen / notification button press to the site's own media handlers.
    static void dispatch(String action, Double value) {
        final MainActivity activity = current;
        if (activity == null || activity.webView == null) return;
        final String js = "window.__auraAction&&window.__auraAction('" + action + "',"
                + (value == null ? "null" : value.toString()) + ")";
        activity.webView.post(() -> {
            activity.webView.resumeTimers();
            activity.webView.evaluateJavascript(js, null);
        });
    }

    private void injectBridge(WebView view, String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && host.equals(appHost)) view.evaluateJavascript(BridgeScript.JS, null);
        } catch (Exception ignored) { }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        } else {
            askToIgnoreBatteryOptimizations();
        }

        webView = new KeepAliveWebView(this);
        webView.setBackgroundColor(BG);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // Fit every phone: ignore the system font-size setting and pinch-zoom, which break the layout.
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        String defaultUa = s.getUserAgentString();
        s.setUserAgentString(defaultUa.replace("; wv", "").replace("Version/4.0 ", ""));

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        try {
            String host = Uri.parse(BuildConfig.APP_URL).getHost();
            if (host != null) appHost = host;
        } catch (Exception ignored) { }

        webView.addJavascriptInterface(new AuraBridge(), "AuraNative");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popup = new WebView(MainActivity.this);
                WebSettings ps = popup.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                ps.setUserAgentString(webView.getSettings().getUserAgentString());
                CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);

                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView pView, WebResourceRequest req) {
                        Uri pUri = req.getUrl();
                        String pHost = pUri.getHost();
                        if (pHost != null && pHost.equals(appHost)) {
                            // Returned to AuraMusic host, close popup and load into main webView
                            webView.loadUrl(pUri.toString());
                            popup.destroy();
                            return true;
                        }
                        return false;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectBridge(view, url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectBridge(view, url);
            }

            // Static files (JS, CSS, artist and avatar images) are bundled in the APK, so the UI
            // opens instantly. index.html and every /api call still come from the server, and
            // the hashed file names mean a newer site never picks up an outdated bundled file.
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"GET".equals(request.getMethod()) || uri.getHost() == null || !uri.getHost().equals(appHost)) {
                    return null;
                }
                String path = uri.getPath();
                if (path == null || !(path.startsWith("/assets/") || path.startsWith("/artists/") || path.startsWith("/avatars/"))) {
                    return null;
                }
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    return new WebResourceResponse(mimeFor(path), "utf-8", 200, "OK", headers, in);
                } catch (IOException notBundled) {
                    return null; // fall back to the network
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                String host = uri.getHost();
                String scheme = uri.getScheme();
                boolean web = "http".equals(scheme) || "https".equals(scheme);
                if (!web || (host != null && host.equals(appHost))) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }
        });

        // Run the bridge before the site's own scripts, so nothing it publishes is missed.
        try {
            Uri base = Uri.parse(BuildConfig.APP_URL);
            if (base.getScheme() != null && base.getHost() != null
                    && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                String origin = base.getScheme() + "://" + base.getHost()
                        + (base.getPort() != -1 ? ":" + base.getPort() : "");
                Set<String> origins = new HashSet<>();
                origins.add(origin);
                WebViewCompat.addDocumentStartJavaScript(webView, BridgeScript.JS, origins);
            }
        } catch (Exception ignored) { }

        // Always load fresh URL so app reloads cleanly when opened
        webView.loadUrl(BuildConfig.APP_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        startPlaybackService();
        handleAuthDeepLink(getIntent());
    }

    private void handleAuthDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri data = intent.getData();
        if ("auramusic".equals(data.getScheme()) && "auth".equals(data.getHost())) {
            String token = data.getQueryParameter("token");
            String userJson = data.getQueryParameter("user");
            if (webView != null) {
                final String js = "window.__handleNativeAuthCallback&&window.__handleNativeAuthCallback("
                        + (userJson != null ? userJson : "null") + ");";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAuthDeepLink(intent);
    }


    // The WebView is deliberately NOT paused here: pausing it is what stops the music when the
    // screen turns off or the app goes to the background. PlaybackService keeps the process alive.
    @Override
    protected void onPause() {
        super.onPause();
        webView.resumeTimers();
    }

    @Override
    protected void onStop() {
        super.onStop();
        webView.resumeTimers();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        // Do not freeze webview state so reopening reloads fresh
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true); // keep playing in the background
        }
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) stopService(new Intent(this, PlaybackService.class));
        if (current == this) current = null;
        webView.destroy();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        askToIgnoreBatteryOptimizations();
    }

    // Phone makers (Xiaomi, Oppo, Vivo, Samsung...) kill background apps unless the user exempts
    // them. Ask once.
    private void askToIgnoreBatteryOptimizations() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            SharedPreferences prefs = getSharedPreferences("aura", MODE_PRIVATE);
            if (prefs.getBoolean("batteryAsked", false)) return;
            prefs.edit().putBoolean("batteryAsked", true).apply();
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) { }
    }

    // Without this, Chromium sees the window as hidden when the screen turns off, throttles the
    // page and stops the music. Always reporting "visible" keeps it running.
    private static class KeepAliveWebView extends WebView {
        KeepAliveWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    private static String mimeFor(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        int dot = lower.lastIndexOf('.');
        String type = dot >= 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(lower.substring(dot + 1)) : null;
        return type != null ? type : "application/octet-stream";
    }

    private void startPlaybackService() {
        Intent intent = new Intent(this, PlaybackService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
        } catch (Exception ignored) { }
    }
}
