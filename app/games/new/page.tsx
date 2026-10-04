import { redirect } from "next/navigation";
import { GameForm } from "@/components/game-form";
import { Notice, SetupNotice } from "@/components/shell";
import { snapshotClubs } from "@/lib/clubs-snapshot";
import { loadClubs } from "@/lib/games";
import { getProfile } from "@/lib/session";

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ error?: string; from?: string }> }) {
  const params = await searchParams;
  const fromDb = await loadClubs();
  const profile = await getProfile();
  if (fromDb && !profile) redirect("/login?next=/games/new");
  if (fromDb && profile && !profile.onboarded_at) redirect("/onboarding?next=/games/new");
  const clubs = fromDb ?? snapshotClubs();
  const connected = fromDb !== null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Post a game</h1>
      <p className="text-ink-soft">Times are South African. You take one spot. A new account can host one game for the first 3 days, then up to three.</p>
      {params.error ? <Notice>{params.error}</Notice> : null}
      {!connected ? <SetupNotice /> : null}
      <GameForm clubs={clubs} reinviteFrom={params.from} />
    </div>
  );
}
