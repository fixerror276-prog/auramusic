package com.auramusic.app;

import android.webkit.JavascriptInterface;

// Receives updates from the web page and triggers Android native bottom-sheet Google Account Chooser
public class AuraBridge {
    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    @JavascriptInterface
    public void setMetadata(String title, String artist, String artworkUrl) {
        String art = clip(artworkUrl, 600);
        if (!art.startsWith("http://") && !art.startsWith("https://")) art = "";
        PlaybackService.setMetadata(clip(title, 200), clip(artist, 200), art);
    }

    @JavascriptInterface
    public void setPlaying(boolean playing) {
        PlaybackService.setPlaying(playing);
    }

    @JavascriptInterface
    public void setPosition(long durationMs, long positionMs) {
        PlaybackService.setPosition(Math.max(0, durationMs), Math.max(0, positionMs));
    }

    // Opens Android's official One-Tap / Google Play Services Account Chooser
    @JavascriptInterface
    public void requestNativeGoogleSignIn() {
        MainActivity activity = MainActivity.getInstance();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.launchGoogleSignInPrompt();
            });
        }
    }

    // Identifies that this client is the native Android App
    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    // Build number of this APK, so the update popup can skip builds that are already new enough.
    @JavascriptInterface
    public int getVersionCode() {
        return BuildConfig.VERSION_CODE;
    }

    // Opens APK download or external URL directly in device browser (Intent.ACTION_VIEW)
    @JavascriptInterface
    public void openBrowser(String url) {
        MainActivity activity = MainActivity.getInstance();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.openExternalBrowser(url);
            });
        }
    }
}
