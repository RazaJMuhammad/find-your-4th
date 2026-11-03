"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  dismissInstallBanner,
  installBannerHidden,
  installKind,
  isStandalone,
  promptInstall,
  subscribeHide,
  subscribeInstall,
  wasJustInstalled,
} from "@/lib/install-prompt";
import { registerServiceWorker } from "@/lib/push";

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline-block size-5 align-text-bottom">
      <path
        d="M12 3.5v11M8.5 7 12 3.5 15.5 7M6 11.5V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm leading-snug">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
            {index + 1}
          </span>
          <span className="pt-1">{step}</span>
        </li>
      ))}
    </ol>
  );
}

const IOS_STEPS = {
  "ios-safari": [
    "Tap the Share button in Safari, the square with an arrow pointing up.",
    "Scroll the share sheet and tap Add to Home Screen.",
    "Tap Add.",
  ],
  "ios-other": [
    "Open this page in Safari. In Chrome, tap Share, then Open in Safari.",
    "In Safari, tap the Share button, the square with an arrow pointing up.",
    "Tap Add to Home Screen, then tap Add.",
  ],
};

function installedNow() {
  return isStandalone() || wasJustInstalled();
}

export function HomeScreenCard({ dismissible = false, onDismiss }: { dismissible?: boolean; onDismiss?: () => void }) {
  const kind = useSyncExternalStore(subscribeInstall, installKind, () => "pending" as const);
  const installed = useSyncExternalStore(subscribeInstall, installedNow, () => false);
  const [adding, setAdding] = useState(false);

  async function add() {
    setAdding(true);
    await promptInstall();
    setAdding(false);
  }

  if (installed || kind === "pending") return null;
  if (dismissible && kind === "generic") return null;

  const card = (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-xl">Add to your home screen</h2>
        {dismissible ? (
          <button className="text-sm text-muted" type="button" onClick={onDismiss}>
            Not now
          </button>
        ) : null}
      </div>
      {kind === "prompt" ? (
        <>
          <p className="text-sm text-muted">Keep the feed and your games one tap away.</p>
          <button className="btn btn-primary w-full" type="button" disabled={adding} onClick={() => void add()}>
            {adding ? "Opening…" : "Add to Home Screen"}
          </button>
        </>
      ) : null}
      {kind === "ios-safari" || kind === "ios-other" ? (
        <>
          <p className="text-sm leading-relaxed">
            {kind === "ios-safari" ? (
              <>
                Safari has no install button. Use Share <ShareIcon /> and add the app yourself.
              </>
            ) : (
              "iPhone can only add this app from Safari."
            )}
          </p>
          <StepList steps={IOS_STEPS[kind]} />
          <p className="text-sm text-muted">
            Then open FindYour4th from the new icon. On iPhone, game alerts only arrive in that home screen app.
          </p>
        </>
      ) : null}
      {kind === "desktop-safari" ? (
        <p className="text-sm leading-relaxed">
          In Safari, open the File menu and choose Add to Dock. Open FindYour4th from that icon next time.
        </p>
      ) : null}
      {kind === "generic" ? (
        <p className="text-sm leading-relaxed">
          In the browser menu, choose Install app or Add to Home Screen. The install icon can also sit in the address bar.
        </p>
      ) : null}
    </section>
  );

  if (!dismissible) return card;
  return <div className="px-4 pt-4">{card}</div>;
}

export function PwaManager() {
  const pathname = usePathname();
  const hidden = useSyncExternalStore(subscribeHide, installBannerHidden, () => true);

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  if (hidden || pathname === "/me") return null;

  return <HomeScreenCard dismissible onDismiss={dismissInstallBanner} />;
}
