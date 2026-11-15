package com.auramusic.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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
        }

        webView = new WebView(this);
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

    private void startPlaybackService() {
        Intent intent = new Intent(this, PlaybackService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent);
            else startService(intent);
        } catch (Exception ignored) { }
    }
}
