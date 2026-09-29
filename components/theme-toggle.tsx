"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function publish() {
  listeners.forEach((listener) => listener());
}

function setTheme(dark: boolean) {
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("theme", dark ? "dark" : "light");
  publish();
}

export function ThemeSync() {
  useLayoutEffect(() => {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      publish();
    }
  }, []);
  return null;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button type="button" className="btn btn-quiet w-full" onClick={() => setTheme(!dark)}>
      {dark ? "Switch to day" : "Switch to evening"}
    </button>
  );
}
