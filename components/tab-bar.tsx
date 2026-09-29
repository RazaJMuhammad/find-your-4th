"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LayoutList, Plus, User, Users } from "lucide-react";

const tabs = [
  { href: "/", label: "Feed", icon: LayoutList, match: (path: string) => path === "/" || (path.startsWith("/games/") && path !== "/games/new") },
  { href: "/me", label: "Games", icon: Users, match: (path: string) => path.startsWith("/me") },
  { href: "/games/new", label: "Post", icon: Plus, match: (path: string) => path.startsWith("/games/new") },
  { href: "/inbox", label: "Inbox", icon: Bell, match: (path: string) => path.startsWith("/inbox") },
  { href: "/you", label: "You", icon: User, match: (path: string) => path.startsWith("/you") || path.startsWith("/onboarding") || path.startsWith("/profile") || path.startsWith("/install") },
] as const;

export function TabBar() {
  const path = usePathname();
  if (["/login", "/signup", "/forgot-password", "/reset-password"].some((item) => path === item || path.startsWith(`${item}/`))) return null;

  return (
    <nav aria-label="Main" className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)]">
      <ul className="grid h-16 grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match(path);
          const Icon = tab.icon;
          if (tab.href === "/games/new") {
            return (
              <li key={tab.href} className="flex items-center justify-center">
                <Link href={tab.href} className="flex -mt-5 flex-col items-center gap-0.5" aria-current={active ? "page" : undefined}>
                  <span className="post-btn" data-active={active ? "true" : undefined}>
                    <Icon size={22} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className={`text-[11px] font-semibold ${active ? "text-court-teal" : "text-ink-soft"}`}>{tab.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={tab.href}>
              <Link href={tab.href} className={`flex h-full flex-col items-center justify-center gap-0.5 ${active ? "text-court-teal" : "text-ink-soft"}`} aria-current={active ? "page" : undefined}>
                <Icon size={22} strokeWidth={1.5} aria-hidden />
                <span className="text-[11px] font-semibold">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
