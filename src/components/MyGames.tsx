"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import { GameCard } from "@/components/GameCard";
import { PlayerLine } from "@/components/PlayerLine";
import { HomeScreenCard } from "@/components/PwaManager";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatRating, parsePlaytomicRating, personName } from "@/lib/format";
import { GAME_SELECT, joinedPlayers, normalizeGame } from "@/lib/games";
import { readCoordsSnapshot, subscribeLocation } from "@/lib/location";
import type { Game } from "@/lib/types";

export function MyGames() {
  const { ready, userId, profile, refreshProfile, signOut } = useAuth();
  const coords = useSyncExternalStore(subscribeLocation, readCoordsSnapshot, () => null);
  const [hosting, setHosting] = useState<Game[]>([]);
  const [playing, setPlaying] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rating, setRating] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingPending, setRatingPending] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    const supabase = createClient();
    void Promise.all([
      supabase.from("games").select(GAME_SELECT).eq("host_id", userId).order("starts_at", { ascending: true }),
      supabase.from("game_players").select(`status, game:games!game_players_game_id_fkey (${GAME_SELECT})`).eq("user_id", userId),
    ]).then(([hostResult, playResult]) => {
      if (hostResult.error || playResult.error) {
        setError(hostResult.error?.message || playResult.error?.message || "Could not load games");
        return;
      }
      setHosting((hostResult.data ?? []).map((row) => normalizeGame(row as never)));
      const mine = (playResult.data ?? [])
        .map((row) => {
          const gameRaw = (row as { game: unknown }).game;
          const game = Array.isArray(gameRaw) ? gameRaw[0] : gameRaw;
          return game ? normalizeGame(game as never) : null;
        })
        .filter((game): game is Game => Boolean(game));
      setPlaying(mine);
    });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (profile?.playtomic_rating != null) setRating(profile.playtomic_rating.toFixed(2));
  }, [profile?.playtomic_rating]);

  async function saveRating(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setRatingPending(true);
    setRatingError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.rpc("save_profile", {
        p_first_name: profile.first_name,
        p_surname: profile.surname,
        p_phone: profile.phone,
        p_playtomic_rating: parsePlaytomicRating(rating),
      });
      if (saveError) throw saveError;
      await refreshProfile();
    } catch (caught) {
      setRatingError(errorMessage(caught));
    } finally {
      setRatingPending(false);
    }
  }

  async function respond(playerId: string, accept: boolean) {
    setPendingId(playerId);
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("respond_request", {
      p_player_id: playerId,
      p_accept: accept,
    });
    setPendingId(null);
    if (actionError) setError(errorMessage(actionError));
    await load();
  }

  async function remove(playerId: string, name: string) {
    if (!confirm(`Remove ${name} from this game?`)) return;
    setPendingId(playerId);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("remove_player", { p_player_id: playerId });
    setPendingId(null);
    if (actionError) setError(errorMessage(actionError));
    await load();
  }

  async function cancel(gameId: string) {
    if (!confirm("Cancel this game?")) return;
    setPendingId(gameId);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("cancel_game", { p_game_id: gameId });
    setPendingId(null);
    if (actionError) setError(errorMessage(actionError));
    await load();
  }

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!userId) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl tracking-tight">My games</h1>
        <p className="text-muted">Log in to see games you host or joined.</p>
        <HomeScreenCard />
        <Link href="/login?next=/me" className="btn btn-primary w-full">
          Log in
        </Link>
      </div>
    );
  }

  const upcomingHost = hosting.filter((game) => game.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-4xl tracking-tight">My games</h1>
          <p className="text-sm text-muted">
            {profile
              ? `${profile.first_name} ${profile.surname}${profile.playtomic_rating != null ? ` · Playtomic ${formatRating(profile.playtomic_rating)}` : ""}`
              : "Profile not finished"}
          </p>
        </div>
        <button className="text-sm text-muted" type="button" onClick={() => void signOut()}>
          Log out
        </button>
      </div>
      <HomeScreenCard />
      <AlertSettings />
      {!profile ? (
        <Link href="/signup?next=/me" className="btn btn-primary w-full">
          Finish your profile
        </Link>
      ) : (
        <form onSubmit={(event) => void saveRating(event)} className="space-y-2 rounded-xl border border-line bg-card p-4">
          <label className="block text-sm text-muted">
            Your Playtomic level
            <input
              className="field mt-2"
              type="number"
              inputMode="decimal"
              min={0}
              max={7}
              step={0.01}
              required
              placeholder="2.50"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
            />
          </label>
          <p className="text-sm text-muted">The number on your Playtomic profile.</p>
          {ratingError ? <p className="text-sm text-warn">{ratingError}</p> : null}
          <button className="btn btn-secondary w-full" type="submit" disabled={ratingPending}>
            {ratingPending ? "Saving…" : "Save level"}
          </button>
        </form>
      )}
      {error ? <p className="text-sm text-warn">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm text-muted">Hosting</h2>
        {upcomingHost.length === 0 ? <p className="text-sm text-muted">You are not hosting anything yet.</p> : null}
        {upcomingHost.map((game) => (
          <article key={game.id} className="lift space-y-3 rounded-xl border border-line bg-card p-4">
            <Link href={`/games/${game.id}`} className="block">
              <GameCard game={game} coords={coords} />
            </Link>
            {game.players
              .filter((player) => player.status === "pending")
              .map((player) => (
                <div key={player.id} className="space-y-3">
                  <PlayerLine
                    name={personName(player.player)}
                    role="Wants in"
                    roleClassName="text-warn"
                    rating={player.player?.playtomic_rating ?? null}
                  />
                  <span className="flex gap-2">
                    <button className="btn btn-primary h-10 min-h-10 flex-1 px-3" type="button" disabled={pendingId === player.id} onClick={() => void respond(player.id, true)}>
                      Accept
                    </button>
                    <button className="btn btn-secondary h-10 min-h-10 flex-1 px-3" type="button" disabled={pendingId === player.id} onClick={() => void respond(player.id, false)}>
                      Decline
                    </button>
                  </span>
                </div>
              ))}
            {joinedPlayers(game).map((player) => (
              <PlayerLine
                key={player.id}
                name={personName(player.player)}
                role="Player"
                rating={player.player?.playtomic_rating ?? null}
                action={
                  <button
                    className="btn btn-danger h-10 min-h-10 px-3 text-sm"
                    type="button"
                    disabled={pendingId === player.id}
                    onClick={() => void remove(player.id, personName(player.player))}
                  >
                    Remove
                  </button>
                }
              />
            ))}
            <button className="btn btn-danger w-full" type="button" disabled={pendingId === game.id} onClick={() => void cancel(game.id)}>
              Cancel game
            </button>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-muted">Playing</h2>
        {playing.length === 0 ? <p className="text-sm text-muted">You have not joined a game yet.</p> : null}
        {playing.map((game) => {
          const mine = game.players.find((player) => player.user_id === userId);
          return (
            <Link key={game.id} href={`/games/${game.id}`} className="lift block rounded-xl border border-line bg-card p-4">
              <GameCard game={game} coords={coords} />
              <p className="mt-3 text-sm text-muted">
                {mine?.status === "pending" ? "Request waiting" : mine?.status === "joined" ? "You're in" : mine?.status}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
