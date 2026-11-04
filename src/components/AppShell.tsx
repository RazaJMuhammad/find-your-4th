"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { PwaManager } from "@/components/PwaManager";

const TAB_ROOTS = new Set(["/", "/post", "/me"]);
const HIDE_NAV = [/^\/login$/, /^\/signup$/];
const TAB_KEY = "fy4-tab";
const CURRENT_KEY = "fy4-current-path";
const PREV_KEY = "fy4-prev-path";

function subscribeTab(onChange: () => void) {
  window.addEventListener("fy4-tab", onChange);
  return () => window.removeEventListener("fy4-tab", onChange);
}

function readTab() {
  const value = sessionStorage.getItem(TAB_KEY);
  return value === "1" || value === "2" ? value : "0";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !HIDE_NAV.some((pattern) => pattern.test(pathname));
  const showBack = !TAB_ROOTS.has(pathname);
  const pathTab = pathname === "/me" ? "2" : pathname === "/post" ? "1" : pathname === "/" ? "0" : null;
  const storedTab = useSyncExternalStore(subscribeTab, readTab, () => "0");
  const tab = pathTab ?? storedTab;
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let next: URL;
      try {
        next = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      setNavigating(true);
    }
    function onStart() {
      setNavigating(true);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("fy4-nav-start", onStart);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("fy4-nav-start", onStart);
    };
  }, []);

  useEffect(() => {
    if (!navigating) return;
    const timer = window.setTimeout(() => setNavigating(false), 10000);
    return () => window.clearTimeout(timer);
  }, [navigating]);

  useEffect(() => {
    const current = sessionStorage.getItem(CURRENT_KEY);
    if (current && current !== pathname) sessionStorage.setItem(PREV_KEY, current);
    sessionStorage.setItem(CURRENT_KEY, pathname);
    if (!pathTab) return;
    sessionStorage.setItem(TAB_KEY, pathTab);
    window.dispatchEvent(new Event("fy4-tab"));
  }, [pathname, pathTab]);

  return (
    <AuthProvider>
      <div className="mx-auto min-h-dvh w-full max-w-lg bg-canvas">
        {navigating ? (
          <>
            <div className="nav-progress" role="progressbar" aria-label="Opening" />
            <div className="nav-shield" />
          </>
        ) : null}
        <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line/80 bg-card/80 px-2 py-2 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur-xl">
          {showBack ? <BackButton /> : null}
          <Link href="/" className="px-2 text-xl font-semibold tracking-tight">
            FindYour<span className="text-accent">4</span>th
          </Link>
        </header>
        <PwaManager />
        <main key={pathname} aria-busy={navigating} className={`page-in ${showNav ? "px-4 pb-32 pt-4" : "px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4"}`}>
          {children}
        </main>
        {showNav ? <BottomNav tab={tab} /> : null}
      </div>
    </AuthProvider>
  );
}

function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  function goBack() {
    window.dispatchEvent(new Event("fy4-nav-start"));
    const prev = sessionStorage.getItem(PREV_KEY);
    if (prev && prev !== pathname && prev.startsWith("/") && !prev.startsWith("//")) {
      router.push(prev);
      return;
    }
    router.push("/");
  }

  return (
    <button type="button" className="flex size-11 items-center justify-center rounded-full text-ink" aria-label="Back" onClick={goBack}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </button>
  );
}

function BottomNav({ tab }: { tab: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg border-t border-line/80 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Primary">
      <div className="nav-track" data-tab={tab}>
        <span className="nav-pill" aria-hidden="true" />
        <NavLink href="/" active={tab === "0"} icon={<FeedIcon />}>
          Feed
        </NavLink>
        <NavLink href="/post" active={tab === "1"} icon={<PostIcon />}>
          Post
        </NavLink>
        <NavLink href="/me" active={tab === "2"} icon={<MineIcon />}>
          Mine
        </NavLink>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative z-10 flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors duration-200 ${active ? "text-accent" : "text-muted"}`}
    >
      {icon}
      {children}
    </Link>
  );
}

function FeedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2" />
    </svg>
  );
}
