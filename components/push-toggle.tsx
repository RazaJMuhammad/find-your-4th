"use client";

import { useState } from "react";
import { savePushSubscription } from "@/app/inbox/actions";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  if (!publicKey) return <p className="text-sm text-ink-soft">Push is not configured yet. The inbox still records every alert.</p>;

  return (
    <div className="space-y-2">
      <button
        className="btn btn-quiet"
        type="button"
        onClick={async () => {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          const json = subscription.toJSON();
          const result = await savePushSubscription({
            endpoint: subscription.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          });
          setMessage("error" in result ? result.error ?? "Could not save this device." : "This device will get alerts.");
        }}
      >
        Enable alerts on this device
      </button>
      {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}
