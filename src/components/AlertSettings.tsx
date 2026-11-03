"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { disablePush, enablePush, readPushState, type PushState } from "@/lib/push";

const REASONS = [
  "Someone joins a game you posted, or asks you to approve them.",
  "A host accepts or declines your request.",
  "A game you are in is cancelled, or the host removes you.",
  "Your game fills up.",
  "A reminder about two hours before you play.",
];

export function AlertSettings({ compact = false }: { compact?: boolean }) {
  const { userId, profile } = useAuth();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!userId) return;
    void readPushState().then(setState);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!userId) return null;
  if (state === "loading") return null;
  if (compact && (state === "on" || state === "unsupported")) return null;

  async function turnOn() {
    setPending(true);
    setError(null);
    const result = await enablePush();
    setPending(false);
    if (!result.ok) setError(result.message);
    refresh();
  }

  async function turnOff() {
    setPending(true);
    setError(null);
    await disablePush();
    setPending(false);
    refresh();
  }

  if (!profile) {
    return (
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold text-xl">Game alerts</h2>
        <p className="mt-2 text-sm text-muted">Finish your profile to turn on alerts for your games.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold text-xl">Game alerts</h2>
      {state === "needs-install" ? (
        <p className="text-sm leading-relaxed">
          Add FindYour4th to your home screen, then open it from the icon. iPhone only delivers alerts to that app.
        </p>
      ) : null}
      {state === "unsupported" ? <p className="text-sm text-muted">This browser cannot show alerts.</p> : null}
      {state === "missing-key" ? <p className="text-sm text-warn">Alerts are not configured on this server yet.</p> : null}
      {state === "denied" ? (
        <p className="text-sm leading-relaxed">
          Alerts are blocked. Allow notifications for FindYour4th in your browser settings, then come back.
        </p>
      ) : null}
      {state === "on" ? <p className="text-sm text-muted">Alerts are on for this phone.</p> : null}
      {state === "off" ? (
        <p className="text-sm leading-relaxed text-muted">
          {compact
            ? "Get a ping when someone joins, a host answers, or a game changes."
            : "FindYour4th pings you only about games you host or have joined."}
        </p>
      ) : null}
      {!compact && state !== "needs-install" && state !== "unsupported" && state !== "missing-key" ? (
        <ul className="space-y-2 text-sm">
          {REASONS.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {state === "off" ? (
        <button className="btn btn-primary w-full" type="button" disabled={pending} onClick={() => void turnOn()}>
          {pending ? "Turning on…" : "Turn on alerts"}
        </button>
      ) : null}
      {state === "on" && !compact ? (
        <button className="btn btn-ghost w-full" type="button" disabled={pending} onClick={() => void turnOff()}>
          {pending ? "Turning off…" : "Turn off alerts"}
        </button>
      ) : null}
    </section>
  );
}
