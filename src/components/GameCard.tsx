import { PlayerDots } from "@/components/PlayerDots";
import { formatWhen, skillLabel } from "@/lib/format";
import { clubsWithDistance, spotsLeft } from "@/lib/games";
import type { Coords } from "@/lib/geo";
import type { Game } from "@/lib/types";

export function GameCard({ game, coords }: { game: Game; coords: Coords | null }) {
  const left = spotsLeft(game);
  const places = clubsWithDistance(game, coords);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{formatWhen(game.starts_at)}</p>
          <p className="mt-1 text-base font-semibold">{left === 0 ? "Full" : left === 1 ? "1 spot open" : `${left} spots open`}</p>
          <p className={`mt-3 text-sm ${game.court_booked ? "text-ink" : "font-medium text-warn"}`}>
            {game.court_booked ? "Court booked" : "Needs a court"}
          </p>
          <p className="text-sm text-muted">
            {game.join_mode === "open" ? "Anyone can join" : "Host approves"}
            {" · "}
            {skillLabel(game.skill)}
          </p>
        </div>
        <PlayerDots game={game} />
      </div>
      <ul className="flex flex-wrap gap-2 border-t border-line pt-3">
        {places.map(({ club }) => (
          <li key={club.id} className="rounded-full border border-line bg-sunken px-3 py-1.5 text-sm font-semibold leading-snug">
            {club.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
