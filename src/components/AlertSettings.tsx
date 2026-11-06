"use client";

import { useCallback, useEffect, useState } from "react";
import { Busy } from "@/components/Busy";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { disablePush, enablePush, readPushState, type PushState } from "@/lib/push";

const NEARBY_RADII = [10, 25, 50, 100];

const REASONS = [
  "A new game is posted near you.",
  "Someone joins a game you posted, or asks you to approve them.",
  "A host accepts or declines your request.",
  "A game you are in is cancelled, or the host removes you.",
  "Your game fills up.",
];

export function AlertSettings({ compact = false }: { compact?: boolean }) {
  const { userId, profile, refreshProfile } = useAuth();
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

  async function saveNearby(enabled: boolean, radius: number) {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_nearby_alerts", {
      p_enabled: enabled,
      p_radius_km: radius,
    });
    if (rpcError) setError(rpcError.message);
    else await refreshProfile();
    setPending(false);
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

  const nearbyOn = profile.nearby_alerts ?? true;
  const nearbyRadius = profile.nearby_radius_km ?? 25;

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
            : "FindYour4th pings you about games you host or have joined, and new games posted near you."}
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
      {state === "on" && !compact ? (
        <div className="space-y-3 border-t border-line pt-3">
          <div role="group" aria-label="Games near me">
            <p className="mb-2 text-sm font-semibold">New games near me</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="chip chip-pill"
                type="button"
                data-on={nearbyOn}
                aria-pressed={nearbyOn}
                disabled={pending}
                onClick={() => void saveNearby(true, nearbyRadius)}
              >
                On
              </button>
              <button
                className="chip chip-pill"
                type="button"
                data-on={!nearbyOn}
                aria-pressed={!nearbyOn}
                disabled={pending}
                onClick={() => void saveNearby(false, nearbyRadius)}
              >
                Off
              </button>
            </div>
          </div>
          {nearbyOn ? (
            <div role="group" aria-label="Alert distance">
              <p className="mb-2 text-sm font-semibold">Within</p>
              <div className="flex flex-wrap gap-2">
                {NEARBY_RADII.map((km) => (
                  <button
                    key={km}
                    className="chip chip-pill"
                    type="button"
                    data-on={nearbyRadius === km}
                    aria-pressed={nearbyRadius === km}
                    disabled={pending}
                    onClick={() => void saveNearby(true, km)}
                  >
                    {km} km
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                {profile.lat == null || profile.lng == null
                  ? "Open the games feed and allow location so we know what is near you."
                  : "Measured from where you last opened the games feed with location on. You get at most 5 of these a day."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {state === "off" ? (
        <button className="btn btn-primary w-full" type="button" disabled={pending} aria-busy={pending} onClick={() => void turnOn()}>
          <Busy on={pending} wait="Turning on…">Turn on alerts</Busy>
        </button>
      ) : null}
      {state === "on" && !compact ? (
        <button className="btn btn-secondary w-full" type="button" disabled={pending} aria-busy={pending} onClick={() => void turnOff()}>
          <Busy on={pending} wait="Turning off…">Turn off alerts</Busy>
        </button>
      ) : null}
    </section>
  );
}
