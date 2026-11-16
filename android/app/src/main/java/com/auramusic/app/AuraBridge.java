package com.auramusic.app;

import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

// Receives "now playing" updates from the web page and handles native Google Auth / Actions
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

    // Opens Google OAuth directly in the device's system browser (Chrome/Edge) with full accounts chooser
    @JavascriptInterface
    public void openSystemGoogleAuth(String authUrl) {
        if (authUrl == null || authUrl.isEmpty()) return;
        MainActivity activity = MainActivity.getInstance();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(authUrl));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                } catch (Exception ignored) {}
            });
        }
    }
}
