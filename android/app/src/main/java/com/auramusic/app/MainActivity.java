package com.auramusic.app;

import android.Manifest;
import android.accounts.AccountManager;
import android.app.Activity;
import android.app.Dialog;
import android.view.ViewGroup;
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
import android.widget.Toast;
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
import org.json.JSONObject;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

public class MainActivity extends Activity {
    private static final int BG = Color.parseColor("#090A0F");
    private static final int RC_SIGN_IN = 9001;
    private static final int RC_PICK_ACCOUNT = 9002;
    // Same web client ID the site uses; the server only accepts ID tokens issued for it.
    private static final String WEB_CLIENT_ID = "254466692985-6f6a09ehv1dvg2g4cr14m0ktqu2553vh.apps.googleusercontent.com";
    private GoogleSignInClient googleSignInClient;
    private static MainActivity current;
    public static MainActivity getInstance() { return current; }
    private WebView webView;
    private Dialog authPopupDialog;
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

        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(WEB_CLIENT_ID) // signed proof the server verifies with Google
                .requestEmail()
                .requestProfile()
                .build();
        googleSignInClient = GoogleSignIn.getClient(this, gso);

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
                if (authPopupDialog != null && authPopupDialog.isShowing()) {
                    authPopupDialog.dismiss();
                }

                authPopupDialog = new Dialog(MainActivity.this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
                WebView popup = new WebView(MainActivity.this);
                WebSettings ps = popup.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                ps.setSupportMultipleWindows(true);
                ps.setJavaScriptCanOpenWindowsAutomatically(true);
                ps.setUserAgentString(webView.getSettings().getUserAgentString());
                CookieManager.getInstance().setAcceptThirdPartyCookies(popup, true);

                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView pView, WebResourceRequest req) {
                        Uri pUri = req.getUrl();
                        String pHost = pUri.getHost();
                        if (pHost != null && pHost.equals(appHost)) {
                            // Returned to AuraMusic host, dismiss in-app popup dialog and reload in main view
                            if (authPopupDialog != null && authPopupDialog.isShowing()) {
                                authPopupDialog.dismiss();
                                authPopupDialog = null;
                            }
                            webView.loadUrl(pUri.toString());
                            return true;
                        }
                        return false;
                    }
                });

                popup.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        if (authPopupDialog != null && authPopupDialog.isShowing()) {
                            authPopupDialog.dismiss();
                            authPopupDialog = null;
                        }
                    }
                });

                authPopupDialog.setContentView(popup, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                authPopupDialog.show();

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
        checkAppUpdate();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        startPlaybackService();
        handleAuthDeepLink(getIntent());
        checkAppUpdate();
    }

    // Only plain https links may be opened (the page inside the WebView can call this too).
    private static boolean isHttpsUrl(String url) {
        return url != null && url.trim().toLowerCase(java.util.Locale.ROOT).startsWith("https://");
    }

    public void openExternalBrowser(String url) {
        if (!isHttpsUrl(url)) {
            Toast.makeText(this, "Invalid update link", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open browser for update", Toast.LENGTH_SHORT).show();
        }
    }

    private Dialog updatePopupDialog;

    // Checks server for force update popup (Runs in background)
    public void checkAppUpdate() {
        new Thread(() -> {
            try {
                String baseUrl = BuildConfig.APP_URL;
                if (baseUrl == null || baseUrl.isEmpty()) return;
                if (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
                String apiUrl = baseUrl + "/api/app-update";
                java.net.URL url = new java.net.URL(apiUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setUseCaches(false);
                if (conn.getResponseCode() == 200) {
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    if (json.optBoolean("success", false)) {
                        JSONObject update = json.optJSONObject("update");
                        boolean show = false;
                        String title = "New Update Available!";
                        String msg = "Please update to get latest features & faster streaming.";
                        String apkUrl = "";
                        if (update != null && update.optBoolean("enabled", false)) {
                            title = update.optString("title", title);
                            msg = update.optString("message", msg);
                            apkUrl = update.optString("apkUrl", "");
                            // Optional: only builds older than this number need the update (0 = every build).
                            int minVersion = update.optInt("minVersionCode", 0);
                            boolean needsUpdate = minVersion <= 0 || BuildConfig.VERSION_CODE < minVersion;
                            show = needsUpdate && isHttpsUrl(apkUrl);
                        }
                        final boolean showFinal = show;
                        final String t = title, m = msg, u = apkUrl;
                        // Admin turned it off (or this build is new enough): take the popup away.
                        runOnUiThread(() -> { if (showFinal) showUpdatePopup(t, m, u); else hideUpdatePopup(); });
                    }
                }
            } catch (Exception ignored) { }
        }).start();
    }

    private void hideUpdatePopup() {
        if (updatePopupDialog != null && updatePopupDialog.isShowing()) {
            try { updatePopupDialog.dismiss(); } catch (Exception ignored) { }
        }
    }

    // Displays Fullscreen Force Update Dialog
    public void showUpdatePopup(String title, String message, String apkUrl) {
        if (isFinishing() || isDestroyed()) return;
        if (updatePopupDialog != null && updatePopupDialog.isShowing()) {
            return; // Already showing
        }

        updatePopupDialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        updatePopupDialog.setCancelable(false); // Force Update: user cannot back out or dismiss!
        updatePopupDialog.setCanceledOnTouchOutside(false);

        android.widget.LinearLayout root = new android.widget.LinearLayout(this);
        root.setOrientation(android.widget.LinearLayout.VERTICAL);
        root.setGravity(android.view.Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#090A0F"));
        int pad = (int) (28 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        // Icon Container
        android.widget.TextView iconView = new android.widget.TextView(this);
        iconView.setText("🚀");
        iconView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 64);
        iconView.setGravity(android.view.Gravity.CENTER);
        root.addView(iconView);

        // Title View
        android.widget.TextView titleView = new android.widget.TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 24);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        titleView.setGravity(android.view.Gravity.CENTER);
        android.widget.LinearLayout.LayoutParams titleParams = new android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = (int) (20 * getResources().getDisplayMetrics().density);
        root.addView(titleView, titleParams);

        // Message View
        android.widget.TextView msgView = new android.widget.TextView(this);
        msgView.setText(message);
        msgView.setTextColor(Color.parseColor("#94A3B8"));
        msgView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15);
        msgView.setGravity(android.view.Gravity.CENTER);
        msgView.setLineSpacing(0, 1.25f);
        android.widget.LinearLayout.LayoutParams msgParams = new android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
        );
        msgParams.topMargin = (int) (14 * getResources().getDisplayMetrics().density);
        root.addView(msgView, msgParams);

        // Update Now Button
        android.widget.Button btn = new android.widget.Button(this);
        btn.setText("UPDATE NOW");
        btn.setTextColor(Color.parseColor("#000000"));
        btn.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15);
        btn.setTypeface(null, android.graphics.Typeface.BOLD);
        btn.setBackgroundColor(Color.parseColor("#10B981")); // Emerald
        android.widget.LinearLayout.LayoutParams btnParams = new android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                (int) (52 * getResources().getDisplayMetrics().density)
        );
        btnParams.topMargin = (int) (32 * getResources().getDisplayMetrics().density);
        btn.setOnClickListener(v -> {
            openExternalBrowser(apkUrl);
        });
        root.addView(btn, btnParams);

        // Subtext notice
        android.widget.TextView noticeView = new android.widget.TextView(this);
        noticeView.setText("This update is required to continue enjoying lossless music.");
        noticeView.setTextColor(Color.parseColor("#64748B"));
        noticeView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 12);
        noticeView.setGravity(android.view.Gravity.CENTER);
        android.widget.LinearLayout.LayoutParams noticeParams = new android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
        );
        noticeParams.topMargin = (int) (16 * getResources().getDisplayMetrics().density);
        root.addView(noticeView, noticeParams);

        updatePopupDialog.setContentView(root);
        updatePopupDialog.show();
    }

    // Verified login needs Google's own chooser (set this to true once the Android OAuth client exists): it returns a signed ID token the server checks with Google.
    // It requires an Android OAuth client (package com.auramusic.app + this APK's SHA-1) in Google Cloud,
    // otherwise it fails with error 10 and we fall back to the plain phone account list (unverified).
    private static final boolean USE_GOOGLE_SIGN_IN = false;

    public void launchGoogleSignInPrompt() {
        if (!USE_GOOGLE_SIGN_IN) {
            launchAccountPicker("direct phone account list");
            return;
        }
        if (googleSignInClient == null) {
            launchAccountPicker("Google sign-in is not ready");
            return;
        }
        try {
            // Sign out first so Google always lists every account on the device.
            googleSignInClient.signOut().addOnCompleteListener(this, task -> {
                try {
                    startActivityForResult(googleSignInClient.getSignInIntent(), RC_SIGN_IN);
                } catch (Exception e) {
                    android.util.Log.e("AuraMusicAuth", "Could not open Google sign-in", e);
                    launchAccountPicker("Could not open Google sign-in");
                }
            });
        } catch (Exception e) {
            android.util.Log.e("AuraMusicAuth", "Google sign-in start failed", e);
            launchAccountPicker("Google sign-in start failed");
        }
    }

    // Plain Android account chooser (no OAuth client / SHA-1 setup needed). It lists every Google
    // account on the phone and returns the one the user taps. Used when Google Sign-In fails.
    @SuppressWarnings("deprecation")
    private void launchAccountPicker(String reason) {
        android.util.Log.w("AuraMusicAuth", "Using phone account picker: " + reason);
        try {
            Intent pick = AccountManager.newChooseAccountIntent(
                    null, null, new String[]{"com.google"}, false, null, null, null, null);
            startActivityForResult(pick, RC_PICK_ACCOUNT);
        } catch (Exception e) {
            android.util.Log.e("AuraMusicAuth", "Account picker failed", e);
            sendAuthError("Could not open the Google account list on this phone.");
        }
    }

    private void sendAuthUser(JSONObject user) {
        if (webView == null) return;
        final String js = "window.__handleNativeAuthCallback&&window.__handleNativeAuthCallback("
                + user.toString() + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void sendAuthError(String message) {
        if (webView == null) return;
        final String js = "window.__nativeAuthError&&window.__nativeAuthError(" + JSONObject.quote(message) + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private static String nameFromEmail(String email) {
        String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        local = local.replaceAll("[._\\-]+", " ").replaceAll("\\d+$", "").trim();
        if (local.isEmpty()) return "Google User";
        StringBuilder sb = new StringBuilder();
        for (String part : local.split("\\s+")) {
            if (part.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.length() > 0 ? sb.toString() : "Google User";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == RC_SIGN_IN) {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            try {
                GoogleSignInAccount account = task.getResult(ApiException.class);
                if (account == null || account.getEmail() == null) {
                    launchAccountPicker("Google returned no account");
                    return;
                }
                JSONObject user = new JSONObject();
                user.put("id", account.getId() != null ? account.getId() : "user_" + System.currentTimeMillis());
                user.put("name", account.getDisplayName() != null ? account.getDisplayName() : nameFromEmail(account.getEmail()));
                user.put("email", account.getEmail());
                user.put("avatar", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : "/avatars/p1.jpg");
                user.put("provider", "google");
                if (account.getIdToken() != null) user.put("idToken", account.getIdToken());
                sendAuthUser(user);
            } catch (ApiException e) {
                int code = e.getStatusCode();
                android.util.Log.e("AuraMusicAuth", "Google sign-in failed, code " + code, e);
                if (code == 12501) { // user closed the chooser
                    sendAuthError("Sign-in cancelled.");
                } else {
                    // Typically 10 (APK SHA-1 not registered in Google Cloud) or 12500.
                    Toast.makeText(this, "Google verification not set up (error " + code + "). Using phone accounts.", Toast.LENGTH_LONG).show();
                    launchAccountPicker("ApiException " + code);
                }
            } catch (Exception e) {
                android.util.Log.e("AuraMusicAuth", "Google sign-in result error", e);
                launchAccountPicker("Exception " + e.getMessage());
            }
            return;
        }

        if (requestCode == RC_PICK_ACCOUNT) {
            String email = (resultCode == RESULT_OK && data != null)
                    ? data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) : null;
            if (email == null || email.isEmpty()) {
                sendAuthError("Sign-in cancelled.");
                return;
            }
            try {
                JSONObject user = new JSONObject();
                user.put("id", "user_" + email.toLowerCase().hashCode());
                user.put("name", nameFromEmail(email));
                user.put("email", email.toLowerCase());
                user.put("avatar", "/avatars/p1.jpg");
                user.put("provider", "google");
                sendAuthUser(user);
            } catch (Exception e) {
                sendAuthError("Could not read the selected account.");
            }
        }
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
        if (authPopupDialog != null && authPopupDialog.isShowing()) {
            authPopupDialog.dismiss();
            authPopupDialog = null;
            return;
        }
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
