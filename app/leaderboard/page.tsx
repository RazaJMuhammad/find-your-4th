import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const rows = supabase ? ((await supabase.rpc("club_leaderboard")).data as { club_id: string; club_name: string; games: number }[] | null) : null;
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">Clubs this month</h1>
      <p className="text-ink-soft">Completed games in the last 30 days.</p>
      {(rows ?? []).length === 0 ? <p className="text-sm text-ink-soft">No completed games yet.</p> : null}
      <ol className="space-y-2">
        {(rows ?? []).map((row, index) => (
          <li key={row.club_id} className="card flex justify-between text-sm">
            <span><span className="mono">{index + 1}</span>. {row.club_name}</span>
            <span className="mono">{row.games}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
