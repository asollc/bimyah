/* Bimyah web push + PWA install, mirroring the Creator Shout system.
   Subscriptions live in the push_subscriptions table; saving goes through
   the savePushSubscription server function (service role), never a direct
   client write. VAPID public key is public by design; the private key is
   a Worker secret. */
import { isDiscordActivity } from "@/discord/detection";

const VAPID_PUBLIC_KEY =
  "BOzsknB3JGw7VAcGjSvIZKJnLleKCM_0OGQc1z6TO4cqBXCcRckHNWPv8cpiLBEFOJQctv3eJd3VHpQ5nM4Sgi8";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ---------------- Service worker ---------------- */

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (isDiscordActivity()) return; // SWs do not apply inside the Discord client.
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* unsupported - ignore */
    });
  };
  // A page restored from a tab snapshot or bfcache never fires `load` again,
  // so waiting for it can leave the worker unregistered for the whole
  // session. Register right away when loading already finished.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // Never wait on navigator.serviceWorker.ready here: it pends forever when
  // no worker is registered yet, which silently froze the bell's Enable
  // button. Look the registration up, or create it on the spot.
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/* Registration whose worker is active; pushManager.subscribe() needs one.
   The worker skipWaiting()s, so activation is normally instant. Bounded
   wait: callers get a clear error instead of an endless hang. */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await registration();
  if (!reg) return null;
  if (reg.active) return reg;
  const ready = await withTimeout(navigator.serviceWorker.ready, 6000, null);
  return ready ?? (reg.active ? reg : null);
}

/* ---------------- Install prompt ---------------- */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // hold it so our own Download button can fire it
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem("bimyah_installed", "1");
    } catch {
      /* ignore */
    }
  });
}

export function isInstalled(): boolean {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
    if (localStorage.getItem("bimyah_installed") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

/** Returns 'installed' | 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall(): Promise<string> {
  if (isInstalled()) return "installed";
  if (deferredPrompt) {
    const ev = deferredPrompt;
    deferredPrompt = null;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      return choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
    } catch {
      return "dismissed";
    }
  }
  return "unavailable";
}

/* ---------------- Device helpers ---------------- */

export function isIOSDevice(): boolean {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
}

export function isIOSInstalledApp(): boolean {
  try {
    return (
      isIOSDevice() &&
      ((window.navigator as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches)
    );
  } catch {
    return false;
  }
}

/* True when running as the installed app (opened from the home-screen
   icon), false in a browser tab. The two worlds unblock notifications in
   different places (the app's own App info page vs Chrome's site
   settings), so status copy and guides branch on this. Display mode only:
   the localStorage flag is deliberately NOT trusted here. */
export function isRunningStandalone(): boolean {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
      return true;
    if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/* ---------------- Push status (the live checker) ---------------- */

export type PushStatus = "unsupported" | "blocked" | "on" | "off";

/* The single source of truth for "are notifications really on?".
   Asks the browser every time it is called: never cached, never inferred
   from a button click. "on" requires BOTH a granted permission AND a real
   push subscription on this device. A permission the user flips manually
   in their phone settings shows up here on the very next call, so callers
   re-run this on open, on focus, and whenever the tab becomes visible. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!Push.supported()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "denied") return "blocked";
  if (perm !== "granted") return "off";
  return (await Push.isSubscribed()) ? "on" : "off";
}

/* ---------------- Notification settings deep link ---------------- */

/* Android: fire the system notification-settings screen for the browser
   app via an intent URL. This is the only settings deep link the web can
   open, and only from a browser tab: inside the installed app the intent
   cannot resolve (the web app's package name is not exposed to the page),
   so callers must not offer it there. Note this page is the browser APP's
   toggle; a per-site block inside Chrome is a second, separate layer the
   guide covers with steps. iOS has no equivalent at all (Apple blocks
   settings links from web pages), so this returns false there. */
export function openNotificationSettings(): boolean {
  try {
    if (isIOSDevice()) return false;
    const ua = navigator.userAgent;
    let pkg = "com.android.chrome";
    if (/SamsungBrowser/.test(ua)) pkg = "com.sec.android.app.sbrowser";
    else if (/EdgA/.test(ua)) pkg = "com.microsoft.emmx";
    else if (/Firefox/.test(ua)) pkg = "org.mozilla.firefox";
    else if (/Brave/.test(ua)) pkg = "com.brave.browser";
    window.location.href =
      "intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;" +
      "package=com.android.settings;" +
      `S.android.provider.extra.APP_PACKAGE=${pkg};` +
      `S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
    return true;
  } catch {
    return false;
  }
}

/* ---------------- Push ---------------- */

export type BrowserPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
};

export const Push = {
  supported(): boolean {
    return (
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    );
  },
  permission(): NotificationPermission {
    return "Notification" in window ? Notification.permission : "denied";
  },
  async isSubscribed(): Promise<boolean> {
    const reg = await registration();
    if (!reg || !reg.pushManager) return false;
    try {
      const sub = await withTimeout(reg.pushManager.getSubscription(), 3000, null);
      return !!sub;
    } catch {
      return false;
    }
  },
  /* Browser half of signing up, mirrored from Creator Shout's push.js:
     take the subscription the browser already holds, or create one,
     and hand the payload back. SAVING it is the caller's job, through
     the syncPushSubscription server function. Deliberately absent:
     any unsubscribe-and-remint logic. Earlier builds compared the
     stored VAPID key and force-replaced "mismatched" subscriptions,
     and minted fresh ones whenever a send verdict said "expired";
     that churn retired address after address right after it was
     saved (the debug log shows first sends accepted, every later send
     refused, nothing ever displayed). CS never re-registers, and CS
     works. */
  async subscribeBrowser(): Promise<BrowserPushSubscription> {
    if (!this.supported()) throw new Error("Push is not supported on this browser.");
    if (Notification.permission === "denied") {
      throw new Error("Notifications are blocked. Allow them in your browser settings first.");
    }
    const reg = await activeRegistration();
    if (!reg) {
      throw new Error("Notifications are still starting up. Wait a few seconds and tap again.");
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("Could not read the push subscription.");
    }
    try {
      localStorage.setItem("bimyah_push", "1");
    } catch {
      /* ignore */
    }
    return {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    };
  },
  async currentEndpoint(): Promise<string | null> {
    const reg = await registration();
    if (!reg || !reg.pushManager) return null;
    try {
      const sub = await withTimeout(reg.pushManager.getSubscription(), 3000, null);
      return sub?.endpoint ?? null;
    } catch {
      return null;
    }
  },
  /* Browser half of turning off. The caller deletes the server row via
     the deletePushSubscription server function using currentEndpoint()
     BEFORE calling this (the endpoint is gone afterwards). */
  async unsubscribeBrowser(): Promise<void> {
    const reg = await registration();
    if (reg && reg.pushManager) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          /* ignore */
        }
      }
    }
    try {
      localStorage.removeItem("bimyah_push");
    } catch {
      /* ignore */
    }
    try {
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
    } catch {
      /* ignore */
    }
  },
};
