"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import { Busy } from "@/components/Busy";
import { GameCard } from "@/components/GameCard";
import { ListSkeleton } from "@/components/GameSkeleton";
import { LinkPending } from "@/components/LinkPending";
import { PlayerLine } from "@/components/PlayerLine";
import { HomeScreenCard } from "@/components/PwaManager";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatRating, parsePlaytomicRating, personName } from "@/lib/format";
import { GAME_SELECT, joinedPlayers, normalizeGame } from "@/lib/games";
import { readCoordsSnapshot, subscribeLocation } from "@/lib/location";
import { readMineCache, writeMineCache } from "@/lib/view-cache";
import type { Game } from "@/lib/types";

export function MyGames() {
  const { ready, userId, profile, refreshProfile, signOut } = useAuth();
  const coords = useSyncExternalStore(subscribeLocation, readCoordsSnapshot, () => null);
  const [hosting, setHosting] = useState<Game[]>([]);
  const [playing, setPlaying] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"accept" | "decline" | "remove" | "cancel" | "leave" | null>(null);
  const [rating, setRating] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingPending, setRatingPending] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    const supabase = createClient();
    return Promise.all([
      supabase.from("games").select(GAME_SELECT).eq("host_id", userId).order("starts_at", { ascending: true }),
      supabase.from("game_players").select(`status, game:games!game_players_game_id_fkey (${GAME_SELECT})`).eq("user_id", userId),
    ]).then(([hostResult, playResult]) => {
      if (hostResult.error || playResult.error) {
        setError(hostResult.error?.message || playResult.error?.message || "Could not load games");
        setLoaded(true);
        return;
      }
      const nextHosting = (hostResult.data ?? []).map((row) => normalizeGame(row as never));
      setHosting(nextHosting);
      const mine = (playResult.data ?? [])
        .map((row) => {
          const gameRaw = (row as { game: unknown }).game;
          const game = Array.isArray(gameRaw) ? gameRaw[0] : gameRaw;
          return game ? normalizeGame(game as never) : null;
        })
        .filter((game): game is Game => Boolean(game));
      setPlaying(mine);
      if (!hostResult.error && !playResult.error) writeMineCache(userId, nextHosting, mine);
      setLoaded(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const cached = readMineCache(userId);
    if (cached) {
      setHosting(cached.hosting);
      setPlaying(cached.playing);
      setLoaded(true);
    }
    load();
  }, [load, userId]);

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
    setPendingKind(accept ? "accept" : "decline");
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("respond_request", {
      p_player_id: playerId,
      p_accept: accept,
    });
    if (actionError) setError(errorMessage(actionError));
    await load();
    setPendingId(null);
    setPendingKind(null);
  }

  async function remove(playerId: string, name: string) {
    if (!confirm(`Remove ${name} from this game?`)) return;
    setPendingId(playerId);
    setPendingKind("remove");
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("remove_player", { p_player_id: playerId });
    if (actionError) setError(errorMessage(actionError));
    await load();
    setPendingId(null);
    setPendingKind(null);
  }

  async function leave(gameId: string, waiting: boolean) {
    const message = waiting ? "Withdraw your request?" : "Your spot opens up for someone else.";
    if (!confirm(message)) return;
    setPendingId(gameId);
    setPendingKind("leave");
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("leave_game", { p_game_id: gameId });
    if (actionError) setError(errorMessage(actionError));
    await load();
    setPendingId(null);
    setPendingKind(null);
  }

  async function cancel(gameId: string) {
    if (!confirm("Players are told, and the game leaves the feed.")) return;
    setPendingId(gameId);
    setPendingKind("cancel");
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("cancel_game", { p_game_id: gameId });
    if (actionError) setError(errorMessage(actionError));
    await load();
    setPendingId(null);
    setPendingKind(null);
  }

  if (!ready) return <ListSkeleton label="Loading your games" />;
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
  const activePlaying = playing.filter((game) => {
    const row = game.players.find((player) => player.user_id === userId);
    return row?.status === "joined" || row?.status === "pending";
  });

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
          <button className="btn btn-secondary w-full" type="submit" disabled={ratingPending} aria-busy={ratingPending}>
            <Busy on={ratingPending} wait="Saving…">Save level</Busy>
          </button>
        </form>
      )}
      {error ? <p className="text-sm text-warn">{error}</p> : null}

      {!loaded ? <ListSkeleton label="Loading your games" /> : null}

      {loaded ? (
      <section className="space-y-3">
        <h2 className="text-sm text-muted">Hosting</h2>
        {upcomingHost.length === 0 ? <p className="text-sm text-muted">You are not hosting anything yet.</p> : null}
        {upcomingHost.map((game) => (
          <article key={game.id} className="lift space-y-3 rounded-xl border border-line bg-card p-4">
            <Link href={`/games/${game.id}`} className="relative block overflow-hidden">
              <GameCard game={game} coords={coords} />
              <LinkPending label="Opening" />
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
                    <button className="btn btn-primary h-10 min-h-10 flex-1 px-3" type="button" disabled={pendingId === player.id} aria-busy={pendingId === player.id && pendingKind === "accept"} onClick={() => void respond(player.id, true)}>
                      <Busy on={pendingId === player.id && pendingKind === "accept"} wait="Accepting…">Accept</Busy>
                    </button>
                    <button className="btn btn-secondary h-10 min-h-10 flex-1 px-3" type="button" disabled={pendingId === player.id} aria-busy={pendingId === player.id && pendingKind === "decline"} onClick={() => void respond(player.id, false)}>
                      <Busy on={pendingId === player.id && pendingKind === "decline"} wait="Declining…">Decline</Busy>
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
                    aria-busy={pendingId === player.id}
                    onClick={() => void remove(player.id, personName(player.player))}
                  >
                    <Busy on={pendingId === player.id && pendingKind === "remove"} wait="Removing…">Remove</Busy>
                  </button>
                }
              />
            ))}
            <button className="btn btn-danger w-full" type="button" disabled={pendingId === game.id} aria-busy={pendingId === game.id} onClick={() => void cancel(game.id)}>
              <Busy on={pendingId === game.id && pendingKind === "cancel"} wait="Cancelling…">Cancel game</Busy>
            </button>
          </article>
        ))}
      </section>
      ) : null}

      {loaded ? (
      <section className="space-y-3">
        <h2 className="text-sm text-muted">Playing</h2>
        {activePlaying.length === 0 ? <p className="text-sm text-muted">You have not joined a game yet.</p> : null}
        {activePlaying.map((game) => {
          const mine = game.players.find((player) => player.user_id === userId);
          if (mine?.status !== "joined" && mine?.status !== "pending") return null;
          const waiting = mine.status === "pending";
          return (
            <article key={game.id} className="lift space-y-3 rounded-xl border border-line bg-card p-4">
              <Link href={`/games/${game.id}`} className="relative block overflow-hidden">
                <GameCard game={game} coords={coords} />
                <LinkPending label="Opening" />
                <p className="mt-3 text-sm text-muted">{waiting ? "Request waiting" : "You're in"}</p>
              </Link>
              {game.status === "open" ? (
                <button
                  className={waiting ? "btn btn-secondary w-full" : "btn btn-danger w-full"}
                  type="button"
                  disabled={pendingId === game.id}
                  aria-busy={pendingId === game.id && pendingKind === "leave"}
                  onClick={() => void leave(game.id, waiting)}
                >
                  <Busy on={pendingId === game.id && pendingKind === "leave"} wait={waiting ? "Withdrawing…" : "Leaving…"}>
                    {waiting ? "Withdraw request" : "Leave game"}
                  </Busy>
                </button>
              ) : null}
            </article>
          );
        })}
      </section>
      ) : null}
    </div>
  );
}
