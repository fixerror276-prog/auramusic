package com.auramusic.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int BG = Color.parseColor("#090A0F");
    private WebView webView;
    private String appHost = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        try {
            String host = Uri.parse(BuildConfig.APP_URL).getHost();
            if (host != null) appHost = host;
        } catch (Exception ignored) { }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
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

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(BuildConfig.APP_URL);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        startPlaybackService();
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
        webView.saveState(outState);
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
