export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORE = "__fy4Install";
const HIDE_KEY = "fy4-hide-install-banner";
const HIDE_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const hideListeners = new Set<() => void>();

type Store = {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  listening: boolean;
  listeners: Set<() => void>;
};

function store(): Store {
  const target = window as Window & { [STORE]?: Store };
  if (!target[STORE]) {
    target[STORE] = { deferred: null, installed: false, listening: false, listeners: new Set() };
  }
  return target[STORE];
}

function emit() {
  store().listeners.forEach((listener) => listener());
}

export function ensureInstallListener() {
  if (typeof window === "undefined") return;
  const current = store();
  if (current.listening) return;
  current.listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    store().deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    const currentStore = store();
    currentStore.deferred = null;
    currentStore.installed = true;
    emit();
  });
}

export function subscribeInstall(listener: () => void) {
  ensureInstallListener();
  const current = store();
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
  };
}

export function getDeferredPrompt() {
  if (typeof window === "undefined") return null;
  return store().deferred;
}

export function wasJustInstalled() {
  if (typeof window === "undefined") return false;
  return store().installed;
}

export async function promptInstall() {
  ensureInstallListener();
  const event = store().deferred;
  if (!event) return "unavailable" as const;
  store().deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      store().installed = true;
      emit();
      return "accepted" as const;
    }
    return "dismissed" as const;
  } catch {
    return "dismissed" as const;
  }
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean(nav.standalone)
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function iosBrowser(): "safari" | "other" | null {
  if (!isIos()) return null;
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent) ? "other" : "safari";
}

export function isDesktopSafari() {
  if (typeof navigator === "undefined" || isIos()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android|CriOS|FxiOS/.test(ua);
}

export function installBannerHidden() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(HIDE_KEY);
  const at = raw ? Number(raw) : NaN;
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < HIDE_FOR_MS;
}

export function subscribeHide(listener: () => void) {
  hideListeners.add(listener);
  return () => {
    hideListeners.delete(listener);
  };
}

export function dismissInstallBanner() {
  window.localStorage.setItem(HIDE_KEY, String(Date.now()));
  hideListeners.forEach((listener) => listener());
}

export type InstallKind = "pending" | "prompt" | "ios-safari" | "ios-other" | "desktop-safari" | "generic";

export function installKind(): InstallKind {
  if (typeof window === "undefined") return "pending";
  if (getDeferredPrompt()) return "prompt";
  const ios = iosBrowser();
  if (ios === "safari") return "ios-safari";
  if (ios === "other") return "ios-other";
  if (isDesktopSafari()) return "desktop-safari";
  return "generic";
}

if (typeof window !== "undefined") ensureInstallListener();
