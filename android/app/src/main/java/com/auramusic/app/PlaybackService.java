package com.auramusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Foreground service that keeps the app (and the music) alive with the screen off, and shows
// the lock-screen / notification player (title, cover, previous / play-pause / next) through a
// MediaSession. What is playing comes from the web page through AuraBridge.
public class PlaybackService extends Service {
    private static final String CHANNEL_ID = "aura_playback";
    private static final int NOTIFICATION_ID = 1;

    static final String ACTION_PLAY = "com.auramusic.app.PLAY";
    static final String ACTION_PAUSE = "com.auramusic.app.PAUSE";
    static final String ACTION_NEXT = "com.auramusic.app.NEXT";
    static final String ACTION_PREV = "com.auramusic.app.PREV";

    // Now-playing state, written by the web page (AuraBridge) and read when rendering.
    private static volatile String title = "";
    private static volatile String artist = "";
    private static volatile String artUrl = "";
    private static volatile Bitmap art = null;
    private static volatile boolean playing = false;
    private static volatile long durationMs = 0;
    private static volatile long positionMs = 0;
    private static volatile PlaybackService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private String loadingArtUrl = "";

    // ---- called from the JavaScript bridge (any thread) ----

    static void setMetadata(String newTitle, String newArtist, String newArtUrl) {
        title = newTitle;
        artist = newArtist;
        if (!newArtUrl.equals(artUrl)) {
            artUrl = newArtUrl;
            art = null;
        }
        notifyChanged();
    }

    static void setPlaying(boolean isPlaying) {
        playing = isPlaying;
        notifyChanged();
    }

    static void setPosition(long duration, long position) {
        durationMs = duration;
        positionMs = position;
        notifyChanged();
    }

    private static void notifyChanged() {
        PlaybackService s = instance;
        if (s != null) s.handler.post(s::refresh);
    }

    // ---- service lifecycle ----

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        session = new MediaSession(this, "AuraMusic");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MainActivity.dispatch("play", null); }
            @Override public void onPause() { MainActivity.dispatch("pause", null); }
            @Override public void onSkipToNext() { MainActivity.dispatch("nexttrack", null); }
            @Override public void onSkipToPrevious() { MainActivity.dispatch("previoustrack", null); }
            @Override public void onSeekTo(long pos) { MainActivity.dispatch("seekto", pos / 1000.0); }
        });
        session.setActive(true);

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PLAY.equals(action)) MainActivity.dispatch("play", null);
        else if (ACTION_PAUSE.equals(action)) MainActivity.dispatch("pause", null);
        else if (ACTION_NEXT.equals(action)) MainActivity.dispatch("nexttrack", null);
        else if (ACTION_PREV.equals(action)) MainActivity.dispatch("previoustrack", null);

        refresh(); // must call startForeground promptly after startForegroundService

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraMusic:playback");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        }

        // Keep Wi-Fi at full speed with the screen off, or the stream stalls once the buffer runs out.
        if (wifiLock == null) {
            try {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "AuraMusic:wifi");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            } catch (Exception ignored) { }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        wifiLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ---- rendering ----

    private void refresh() {
        if (session == null) return;
        loadArtwork();

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        positionMs, 1f)
                .build());

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        Bitmap cover = art;
        if (cover != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cover);
        session.setMetadata(meta.build());

        Notification notification = buildNotification(cover);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification(Bitmap cover) {
        boolean hasTrack = !title.isEmpty();

        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setContentTitle(hasTrack ? title : "AuraMusic")
                .setContentText(hasTrack ? artist : "Playing in the background")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (cover != null) b.setLargeIcon(cover);

        if (hasTrack) {
            b.addAction(action(android.R.drawable.ic_media_previous, "Previous", ACTION_PREV, 1));
            if (playing) b.addAction(action(android.R.drawable.ic_media_pause, "Pause", ACTION_PAUSE, 2));
            else b.addAction(action(android.R.drawable.ic_media_play, "Play", ACTION_PLAY, 3));
            b.addAction(action(android.R.drawable.ic_media_next, "Next", ACTION_NEXT, 4));
            b.setStyle(new Notification.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }
        return b.build();
    }

    private Notification.Action action(int icon, String label, String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class).setAction(action);
        PendingIntent pi = PendingIntent.getService(
                this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build();
    }

    // Downloads the cover image once per track, then redraws.
    private void loadArtwork() {
        final String url = artUrl;
        if (url.isEmpty() || art != null || url.equals(loadingArtUrl)) return;
        loadingArtUrl = url;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    Bitmap raw = BitmapFactory.decodeStream(in);
                    if (raw != null && url.equals(artUrl)) {
                        int max = 512;
                        int w = raw.getWidth(), h = raw.getHeight();
                        float scale = Math.min(1f, (float) max / Math.max(w, h));
                        art = scale < 1f
                                ? Bitmap.createScaledBitmap(raw, Math.round(w * scale), Math.round(h * scale), true)
                                : raw;
                        handler.post(this::refresh);
                    }
                }
            } catch (Exception ignored) {
                // no cover is fine
            } finally {
                if (url.equals(loadingArtUrl) && art == null) loadingArtUrl = "";
            }
        }).start();
    }
}
