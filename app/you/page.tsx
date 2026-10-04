import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { levelScoreLabel } from "@/config/copy";
import { deleteAccount, suggestClub, unblock } from "@/app/onboarding/actions";
import { signOut } from "@/app/login/actions";
import { Notice } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUserId } from "@/lib/session";

export default async function YouPage({ searchParams }: { searchParams: Promise<{ error?: string; suggested?: string }> }) {
  const params = await searchParams;
  const profile = await getProfile();
  const userId = await getUserId();
  const supabase = await createClient();
  const blocks = supabase && userId
    ? (await supabase.from("blocks").select("blocked_id").eq("blocker_id", userId)).data ?? []
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">You</h1>
      {params.error ? <Notice>{params.error}</Notice> : null}
      {params.suggested ? <Notice>Club suggestion sent.</Notice> : null}
      {profile ? (
        <div className="card">
          <p className="text-lg font-semibold">{profile.first_name && profile.surname ? `${profile.first_name} ${profile.surname}` : profile.display_name}</p>
          <p className="text-sm text-ink-soft">
            {profile.preferred_levels.length > 0
              ? profile.preferred_levels.map((score) => levelScoreLabel[score] ?? score).join(", ")
              : profile.level_score != null
                ? levelScoreLabel[profile.level_score]
                : "Level not set"}
          </p>
          {profile.fantasy_opt_in ? <a className="text-sm" href="https://fantasypadel.com">Fantasy Padel</a> : null}
        </div>
      ) : (
        <p className="text-ink-soft">Sign in to post, join, and keep your games on this device.</p>
      )}
      <ThemeToggle />
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-raised">
        {profile ? <Row href="/onboarding" label="Edit profile" /> : <Row href="/login?next=/you" label="Sign in" />}
        {userId ? <Row href="/you/password" label="Password" /> : null}
        <Row href="/me" label="Your games" />
        <Row href="/inbox" label="Inbox" />
        <Row href="/leaderboard" label="Club leaderboard" />
        <Row href="/install" label="Install the app" />
        {profile?.is_admin ? <Row href="/admin" label="Admin" /> : null}
        <Row href="/legal/terms" label="Terms" />
        <Row href="/legal/privacy" label="Privacy" />
        {profile ? <Row href="/api/me/export" label="Download my data" /> : null}
      </ul>
      {profile ? (
        <form action={suggestClub} className="card space-y-2">
          <h2 className="font-semibold">Suggest a club</h2>
          <label className="field">Name<input name="name" required /></label>
          <label className="field">City<input name="city" required /></label>
          <label className="field">Note<input name="note" /></label>
          <button className="btn btn-quiet" type="submit">Send</button>
        </form>
      ) : null}
      {blocks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Blocked</h2>
          {blocks.map((block) => (
            <form key={block.blocked_id} action={unblock} className="flex items-center justify-between text-sm">
              <Link href={`/players/${block.blocked_id}`}>Player</Link>
              <input type="hidden" name="player_id" value={block.blocked_id} />
              <button type="submit">Unblock</button>
            </form>
          ))}
        </section>
      ) : null}
      {profile ? (
        <form action={deleteAccount} className="card space-y-2">
          <h2 className="font-semibold">Delete account</h2>
          <p className="text-sm text-ink-soft">Type DELETE. This removes your profile and the games you host.</p>
          <input name="confirm" className="input" />
          <button className="text-sm text-danger" type="submit">Delete account</button>
        </form>
      ) : null}
      {profile ? (
        <form action={signOut}>
          <button className="text-sm text-danger" type="submit">Sign out</button>
        </form>
      ) : null}
    </div>
  );
}

function Row({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between px-4 py-3 text-sm font-medium">
        {label}
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-ink-faint" />
      </Link>
    </li>
  );
}
