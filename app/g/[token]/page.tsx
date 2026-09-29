import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resendConfirmation, signIn } from "@/app/login/actions";
import { Honeypot, PasswordField, SubmitButton } from "@/components/auth-fields";
import { Notice } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { clubLabel, loadMatch, visibleClubs } from "@/lib/games";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join a game",
  robots: { index: false, follow: false },
};

export default async function GuestGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; sent?: string; email?: string; from?: string; confirm?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) return <p>This invite opens once Supabase is connected.</p>;
  const found = await supabase.from("matches").select("id").eq("share_token", token).maybeSingle();
  if (found.error || !found.data) notFound();
  const match = await loadMatch(found.data.id);
  if (!match) notFound();
  const from = query.from ? `?from=${encodeURIComponent(query.from)}` : "";
  const next = `/games/${match.id}${from}`;
  const returnTo = `/g/${token}${from}`;
  const where = visibleClubs(match).map((item) => clubLabel(item.club)).join(" · ");

  return (
    <div className="space-y-4">
      <h1>{formatWhen(match.starts_at)}</h1>
      <p className="text-ink-soft">{where || "Club still open"}</p>
      <p className="text-sm">Sign in to join. You can install the app after you are in.</p>
      {query.error ? <Notice tone="warn">{query.error}</Notice> : null}
      {query.sent === "1" ? <Notice tone="ok">If that account is waiting for confirmation, we sent another email.</Notice> : null}
      <form action={signIn} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="return" value={returnTo} />
        <label className="field">
          Email
          <input name="email" type="email" required autoComplete="username" maxLength={320} defaultValue={query.email ?? ""} />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <Honeypot />
        <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
      </form>
      {query.confirm === "1" && query.email ? (
        <form action={resendConfirmation} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={query.email} />
          <input type="hidden" name="return" value={returnTo} />
          <SubmitButton pendingLabel="Sending">Send the confirmation email again</SubmitButton>
        </form>
      ) : null}
      <p className="text-sm">
        <Link className="font-semibold text-court-teal" href={`/signup?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </p>
      <p className="text-sm">
        <Link className="font-semibold text-court-teal" href={`/forgot-password?next=${encodeURIComponent(next)}`}>
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
