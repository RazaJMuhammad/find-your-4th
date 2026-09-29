import type { Metadata } from "next";
import { Notice } from "@/components/shell";

export function authMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export function AuthScreen({
  title,
  lede,
  error,
  success,
  children,
}: {
  title: string;
  lede: string;
  error?: string;
  success?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-ink-soft">{lede}</p>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {success ? <Notice tone="ok">{success}</Notice> : null}
      {children}
    </div>
  );
}
