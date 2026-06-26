// Native iOS push notification registration.
//
// • requestPushPermission() shows the OS permission dialog — call this ONLY
//   right after a fresh, explicit login (see SessionProvider), never on cold
//   app launch. If the user already answered before (granted or denied),
//   this never re-prompts — iOS wouldn't show the dialog again anyway.
// • refreshPushRegistration() is silent (no dialog) and safe to call every
//   time the app opens with an existing signed-in session — it just
//   re-registers (and re-saves) the token if permission was already granted,
//   which is how token refresh/rotation gets picked up.
// • Every exported function swallows its own errors — push setup must never
//   block or crash the rest of the app.
// • No-ops entirely on web (Capacitor.isNativePlatform() === false), so this
//   never touches/breaks the website.
//
// Callers pass the current access token explicitly rather than this module
// re-fetching it — important for unregisterPushOnSignOut(), which must run
// with the OUTGOING session's token, after Supabase has already cleared it
// from its own client-side cache.
import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from "@capacitor/push-notifications";

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

let listenersAttached = false;
let lastRegisteredToken: string | null = null;
let currentAccessToken: string | null = null;

async function saveTokenToServer(token: string) {
  try {
    if (!currentAccessToken) return; // not signed in — nothing to tie this token to
    const res = await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentAccessToken}` },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
    if (res.ok) lastRegisteredToken = token;
  } catch (err) {
    console.error("[push] failed to save token", err);
  }
}

function attachListenersOnce() {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener("registration", (token: Token) => {
    void saveTokenToServer(token.value);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registration error", err);
  });

  // No custom in-app notification UI — let iOS handle display. We only log,
  // so a tap/receipt is visible in diagnostics without faking any UI.
  PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
    console.log("[push] received", notification.title);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    console.log("[push] action performed", action.notification.title);
  });
}

/**
 * Silent, no-prompt re-registration. Safe to call on every app open for a
 * signed-in user — only actually registers if permission was already
 * granted in a previous session, which is how token rotation gets handled.
 * Never throws.
 */
export async function refreshPushRegistration(accessToken: string) {
  if (!isNative()) return;
  try {
    currentAccessToken = accessToken;
    attachListenersOnce();
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err) {
    console.error("[push] refresh failed", err);
  }
}

/**
 * Shows the OS permission prompt if (and only if) the user hasn't already
 * made a decision. Call this right after a successful, explicit login —
 * never on cold app launch. Never throws.
 */
export async function requestPushPermission(accessToken: string) {
  if (!isNative()) return;
  try {
    currentAccessToken = accessToken;
    attachListenersOnce();
    const status = await PushNotifications.checkPermissions();

    if (status.receive === "granted") {
      await PushNotifications.register();
      return;
    }
    if (status.receive === "denied") return; // respect the prior decision — never nag

    const result = await PushNotifications.requestPermissions();
    if (result.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err) {
    console.error("[push] permission request failed", err);
  }
}

/**
 * Call on sign-out (with the OUTGOING session's access token, captured
 * before it's cleared) so a shared device stops receiving push for the
 * account that just signed out. Never throws.
 */
export async function unregisterPushOnSignOut(outgoingAccessToken: string | null) {
  if (!isNative()) return;
  const token = lastRegisteredToken;
  currentAccessToken = null;
  lastRegisteredToken = null;
  if (!token || !outgoingAccessToken) return;
  try {
    await fetch("/api/push/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${outgoingAccessToken}` },
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.error("[push] unregister failed", err);
  }
}
