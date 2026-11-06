const KEY = "fy4-alert-prompt";
const EVENT = "fy4-alert-prompt";

export function queueAlertPrompt(userId: string) {
  localStorage.setItem(KEY, userId);
  window.dispatchEvent(new Event(EVENT));
}

export function clearAlertPrompt() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function readAlertPrompt() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function subscribeAlertPrompt(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
