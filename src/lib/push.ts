import { createClient } from "@/lib/supabase/client";
import { isIos, isStandalone } from "@/lib/install-prompt";

export type PushState = "unsupported" | "needs-install" | "denied" | "on" | "off" | "missing-key";

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!registration) {
    registration = navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => null);
  }
  return registration;
}

function vapidKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function readPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (!vapidKey()) return "missing-key";
  if (Notification.permission === "denied") return "denied";
  const current = await navigator.serviceWorker.getRegistration("/");
  const subscription = await current?.pushManager.getSubscription();
  if (Notification.permission === "granted" && subscription) return "on";
  return "off";
}

export async function enablePush() {
  if (isIos() && !isStandalone()) return { ok: false as const, message: "Add FindYour4th to your home screen first." };
  const key = vapidKey();
  if (!key) return { ok: false as const, message: "Alerts are not configured on this server yet." };
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false as const, message: "This browser cannot show alerts." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false as const,
      message: permission === "denied" ? "Alerts are blocked in your browser settings." : "Alerts stayed off.",
    };
  }

  const worker = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const existing = await worker.pushManager.getSubscription();
  const subscription =
    existing ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return { ok: false as const, message: "This phone did not return a push subscription." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 240),
  });
  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const };
}

export async function disablePush() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const current = await navigator.serviceWorker.getRegistration("/");
  const subscription = await current?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    const supabase = createClient();
    await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  } catch {
    // The browser subscription is still removed below.
  }
  await subscription.unsubscribe();
}
