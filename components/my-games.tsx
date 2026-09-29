"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { courtStatusLabel, levelLabel } from "@/config/copy";
import { formatWhen } from "@/lib/format";
import { OpenChip } from "@/components/spots";
import { clubLabel, openSpots, visibleClubs, type Match } from "@/lib/game-view";

export function MyGames() {
  const [games, setGames] = useState<Match[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOffline(!navigator.onLine);
    fetch("/api/me/games", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your games.");
        setGames((await response.json()) as Match[]);
      })
      .catch(() => setMessage("Your games did not load. If you are offline, open this page once while you are online."));
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      controller.abort();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  if (message && !games) return <p className="text-sm text-ink-soft">{message}</p>;
  if (!games) return <p className="text-sm text-ink-soft">Loading your games…</p>;

  return (
    <div className="space-y-3">
      {offline ? <p className="text-sm text-urgency">You are offline. This list may be out of date. Joining and posting need a connection.</p> : null}
      {games.length === 0 ? <p className="text-sm text-ink-soft">No upcoming games yet.</p> : null}
      {games.map((game) => {
        const clubs = visibleClubs(game);
        return (
          <Link key={game.id} href={`/games/${game.id}`} className="card block">
            <div className="flex items-baseline justify-between gap-3">
              <h2>{formatWhen(game.starts_at)}</h2>
              <OpenChip open={openSpots(game)} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{levelLabel[game.level]} · {courtStatusLabel[game.court_status]}</p>
            <p className="mt-2 text-sm">{clubs.map((item) => clubLabel(item.club)).join(" · ")}</p>
          </Link>
        );
      })}
    </div>
  );
}
