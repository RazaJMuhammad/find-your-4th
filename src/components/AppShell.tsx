"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/AuthProvider";
import { PwaManager } from "@/components/PwaManager";

const HIDE_NAV = [/^\/games\/[^/]+$/, /^\/post$/, /^\/login$/, /^\/signup$/];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !HIDE_NAV.some((pattern) => pattern.test(pathname));

  return (
    <AuthProvider>
      <div className="mx-auto min-h-dvh w-full max-w-lg bg-canvas">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/80 bg-card/80 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            FindYour<span className="text-accent">4</span>th
          </Link>
          <Link href="/me" className="text-sm font-medium text-muted">
            My games
          </Link>
        </header>
        <PwaManager />
        <main key={pathname} className={`page-in ${showNav ? "px-4 pb-24 pt-4" : "px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4"}`}>
          {children}
        </main>
        {showNav ? <BottomNav pathname={pathname} /> : null}
      </div>
    </AuthProvider>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg border-t border-line/80 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="nav-track" data-tab={pathname === "/me" ? "2" : pathname === "/post" ? "1" : "0"}>
        <span className="nav-pill" aria-hidden="true" />
        <NavLink href="/" active={pathname === "/"}>
          Feed
        </NavLink>
        <NavLink href="/post" active={pathname === "/post"}>
          Post
        </NavLink>
        <NavLink href="/me" active={pathname === "/me"}>
          Mine
        </NavLink>
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`relative z-10 flex min-h-12 items-center justify-center text-sm font-semibold transition-colors duration-200 ${active ? "text-accent" : "text-muted"}`}
    >
      {children}
    </Link>
  );
}
