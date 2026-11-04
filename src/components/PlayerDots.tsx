import { joinedPlayers } from "@/lib/games";
import type { Game } from "@/lib/types";

export function PlayerDots({ game }: { game: Game }) {
  const joined = joinedPlayers(game);
  const partners = 3 - game.spots_needed;
  const slots = [
    { key: "host", filled: true },
    ...Array.from({ length: partners }, (_, index) => ({
      key: `partner-${index}`,
      filled: true,
    })),
    ...joined.map((player) => ({ key: player.id, filled: true })),
    ...Array.from({ length: Math.max(0, game.spots_needed - joined.length) }, (_, index) => ({
      key: `open-${index}`,
      filled: false,
    })),
  ].slice(0, 4);

  const filledCount = slots.filter((slot) => slot.filled).length;
  const near = slots.slice(0, 2);
  const far = slots.slice(2, 4);

  return (
    <div className="court" role="img" aria-label={`${filledCount} of 4 players`}>
      <Side slots={near} />
      <span className="court-net" />
      <Side slots={far} />
    </div>
  );
}

function Side({ slots }: { slots: { key: string; filled: boolean }[] }) {
  return (
    <span className="court-side">
      {slots.map((slot) => (
        <span key={slot.key} className={`court-player ${slot.filled ? "is-in" : "spot-open"}`} />
      ))}
    </span>
  );
}
