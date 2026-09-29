import Link from "next/link";
import { brand } from "@/config/copy";
import { TabBar } from "@/components/tab-bar";
import { ThemeSync } from "@/components/theme-toggle";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x border-border bg-surface">
      <ThemeSync />
      <header className="sticky top-0 z-20 border-b border-border bg-surface-raised pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="wordmark">
            {brand.name}
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 py-5 pb-28">{children}</main>
      <TabBar />
    </div>
  );
}

export function Notice({ children, tone }: { children: React.ReactNode; tone?: "warn" | "ok" }) {
  const ok = tone === "ok";
  return (
    <p className={ok ? "notice notice-ok" : "notice"} role={tone ? (ok ? "status" : "alert") : undefined}>
      {children}
    </p>
  );
}

export function SetupNotice() {
  return (
    <Notice>
      Supabase is not connected yet. The screens are here, and posting a real game waits on the steps in docs/MANUAL-SETUP.md.
    </Notice>
  );
}
