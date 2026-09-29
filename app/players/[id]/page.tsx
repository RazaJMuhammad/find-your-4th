import { notFound } from "next/navigation";
import { levelLabel, levelScoreLabel } from "@/config/copy";
import { percent } from "@/lib/format";
import { loadReliability } from "@/lib/games";
import { reliabilitySummary, type SkillLevel } from "@/lib/domain/rules";
import { createClient } from "@/lib/supabase/server";

type Card = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  level_score: number | null;
  level_source: "self" | "community";
  community_level: number | null;
  games_played: number;
  member_since: string;
  show_ups: number;
  misses: number;
  badges: string[];
};

const badgeLabel: Record<string, string> = {
  first_game: "First game",
  five_games: "Five games",
  reliable: "Reliable",
};

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) return <p>Player profiles open once Supabase is connected.</p>;
  const cardResult = await supabase.rpc("player_card", { p_player: id });
  const card = cardResult.data as Card | null;
  if (card?.display_name) {
    const score = card.level_source === "community" && card.community_level != null ? card.community_level : card.level_score;
    const resolved = card.show_ups + card.misses;
    return (
      <div className="space-y-3">
        {card.avatar_url ? <img src={card.avatar_url} alt="" className="h-20 w-20 rounded-avatar object-cover" /> : null}
        <h1 className="text-3xl font-semibold tracking-tight">{card.display_name}</h1>
        <p className="text-ink-soft">
          {score != null ? levelScoreLabel[score] : "Level not set"}
          {" · "}{card.level_source === "community" ? "Community confirmed" : "Self-declared"}
        </p>
        <p>{resolved < 3 ? "Reliability: New" : <>Shows up <span className="mono">{percent(card.show_ups / resolved)}</span></>}</p>
        <p className="text-sm text-ink-soft">{card.games_played} games played · member since {new Date(card.member_since).getFullYear()}</p>
        {card.badges?.length ? (
          <ul className="flex flex-wrap gap-2 text-xs">
            {card.badges.map((badge) => <li key={badge} className="chip chip-quiet">{badgeLabel[badge] ?? badge}</li>)}
          </ul>
        ) : null}
      </div>
    );
  }

  const { data } = await supabase.from("profiles").select("id, display_name, level").eq("id", id).maybeSingle();
  if (!data) notFound();
  const profile = data as { id: string; display_name: string; level: SkillLevel | null };
  const reliability = await loadReliability(id);
  const summary = reliability
    ? reliabilitySummary({
        showUps: reliability.show_ups,
        misses: reliability.misses,
        playAgainYes: reliability.play_again_yes,
        playAgainCount: reliability.play_again_count,
      })
    : null;

  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">{profile.display_name}</h1>
      <p className="text-ink-soft">{profile.level ? levelLabel[profile.level] : "Level not set"} · self-declared</p>
      <p>{summary?.showUpRate == null ? "Reliability: New" : <>Shows up <span className="mono">{percent(summary.showUpRate)}</span></>}</p>
    </div>
  );
}
