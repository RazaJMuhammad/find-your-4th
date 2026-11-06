"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Busy } from "@/components/Busy";
import { useAuth } from "@/components/AuthProvider";
import { HomeScreenCard } from "@/components/PwaManager";
import { clearAlertPrompt, readAlertPrompt, subscribeAlertPrompt } from "@/lib/alert-prompt";
import { enablePush, readPushState, type PushState } from "@/lib/push";

const HIDE_ON = new Set(["/login", "/signup"]);

const BENEFITS = [
  "New games posted near you, the moment they go up.",
  "When someone joins your game or asks for a spot.",
  "When a host accepts you, or a game you are in changes.",
];

export function AlertPrompt() {
  const pathname = usePathname();
  const titleId = useId();
  const { ready, userId, profile } = useAuth();
  const queuedFor = useSyncExternalStore(subscribeAlertPrompt, readAlertPrompt, () => null);
  const active = ready && !!userId && !!profile && queuedFor === userId && !HIDE_ON.has(pathname);
  const [state, setState] = useState<PushState | "loading">("loading");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let live = true;
    void readPushState().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [active]);

  const settled = state === "on" || state === "unsupported" || state === "denied" || state === "missing-key";
  useEffect(() => {
    if (active && settled) clearAlertPrompt();
  }, [active, settled]);

  const open = active && (state === "off" || state === "needs-install");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearAlertPrompt();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  async function turnOn() {
    setPending(true);
    setError(null);
    const result = await enablePush();
    setPending(false);
    if (result.ok) clearAlertPrompt();
    else setError(result.message);
  }

  if (!open) return null;

  return (
    <PromptSheet titleId={titleId} onClose={clearAlertPrompt}>
      <div className="space-y-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-sunken text-accent">
          <BellIcon />
        </div>
        <div className="space-y-1">
          <h2 id={titleId} className="font-semibold text-2xl">Never miss a game</h2>
          <p className="text-sm text-muted">Padel games fill fast. Alerts are how you get in before they do.</p>
        </div>
        <ul className="space-y-2 text-sm">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        {state === "needs-install" ? (
          <>
            <p className="text-sm leading-relaxed">iPhone only delivers alerts to the home screen app. Add it first, then open it from the icon.</p>
            <HomeScreenCard />
          </>
        ) : null}
        {error ? <p className="text-sm text-warn">{error}</p> : null}
        <div className="space-y-2">
          {state === "off" ? (
            <button className="btn btn-primary w-full" type="button" disabled={pending} aria-busy={pending} onClick={() => void turnOn()}>
              <Busy on={pending} wait="Turning on…">Turn on alerts</Busy>
            </button>
          ) : null}
          <button className="btn btn-secondary w-full" type="button" disabled={pending} onClick={clearAlertPrompt}>
            {state === "needs-install" ? "Got it" : "Not now"}
          </button>
        </div>
      </div>
    </PromptSheet>
  );
}

function PromptSheet({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="sheet-scrim fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-4 mb-1 h-1 w-9 shrink-0 rounded-full bg-line" />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
