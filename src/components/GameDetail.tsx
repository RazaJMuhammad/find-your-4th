"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import { PlayerDots } from "@/components/PlayerDots";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatWhen, skillLabel } from "@/lib/format";
import { GAME_SELECT, clubsWithDistance, joinedPlayers, normalizeGame, spotsLeft } from "@/lib/games";
import { readCoordsSnapshot, subscribeLocation } from "@/lib/location";
import type { Contact, Game } from "@/lib/types";
import { whatsappHref } from "@/lib/whatsapp";

export function GameDetail({ id }: { id: string }) {
  const { ready, userId, profile } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const coords = useSyncExternalStore(subscribeLocation, readCoordsSnapshot, () => null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);
  const [gameClock, setGameClock] = useState<number | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    void supabase
      .from("games")
      .select(GAME_SELECT)
      .eq("id", id)
      .maybeSingle()
      .then(async ({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message);
          return;
        }
        if (!data) {
          setMissing(true);
          setGame(null);
          return;
        }
        setGame(normalizeGame(data as never));
        setGameClock((current) => current ?? Date.now());
        setMissing(false);
        if (!userId) {
          setContacts([]);
          return;
        }
        const { data: contactData } = await supabase.rpc("game_contacts", { p_game_id: id });
        setContacts((contactData as Contact[] | null) ?? []);
      });
  }, [id, userId]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`game-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  async function act(fn: "join_game" | "request_spot") {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc(fn, { p_game_id: id });
    setPending(false);
    if (actionError) setError(errorMessage(actionError));
    await load();
  }

  if (missing) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl">Game unavailable</h1>
        <Link href="/" className="font-semibold text-accent">
          Back to the feed
        </Link>
      </div>
    );
  }
  if (!game) return <p className="text-muted">Loading game…</p>;

  const left = spotsLeft(game);
  const mine = game.players.find((player) => player.user_id === userId);
  const isHost = userId === game.host_id;
  const started = gameClock != null && new Date(game.starts_at).getTime() <= gameClock;
  const places = clubsWithDistance(game, coords);
  const others = contacts.filter((contact) => contact.user_id !== userId);
  const next = `/games/${id}`;

  let action: React.ReactNode = null;
  if (isHost) {
    action = (
      <Link href="/me" className="btn btn-ghost w-full">
        You are hosting this
      </Link>
    );
  } else if (mine?.status === "joined") {
    action = <p className="text-center text-accent">You are in.</p>;
  } else if (mine?.status === "pending") {
    action = <p className="text-center text-warn">Request sent. Waiting for the host.</p>;
  } else if (started || game.status !== "open") {
    action = <p className="text-center text-muted">This game is closed.</p>;
  } else if (left === 0) {
    action = <p className="text-center text-muted">All spots are taken.</p>;
  } else if (!ready) action = <p className="text-muted">Checking your account…</p>;
  else if (!userId) {
    action = (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-primary w-full">
        {game.join_mode === "open" ? "Sign up to join" : "Sign up to request"}
      </Link>
    );
  } else if (!profile) {
    action = (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-primary w-full">
        Finish your profile
      </Link>
    );
  } else if (game.join_mode === "open") {
    action = (
      <button className="btn btn-primary w-full" type="button" disabled={pending} onClick={() => void act("join_game")}>
        {pending ? "Joining…" : "Join game"}
      </button>
    );
  } else {
    action = (
      <button className="btn btn-primary w-full" type="button" disabled={pending} onClick={() => void act("request_spot")}>
        {pending ? "Sending…" : "Request a spot"}
      </button>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-muted">
        Feed
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-3xl leading-tight">{formatWhen(game.starts_at)}</h1>
          <p className="mt-2 text-lg font-semibold">{left === 0 ? "Full" : left === 1 ? "1 spot open" : `${left} spots open`}</p>
          <p className={`mt-3 text-sm ${game.court_booked ? "text-ink" : "font-medium text-warn"}`}>
            {game.court_booked ? "Court booked" : "Court still needed"}
          </p>
          <p className="text-sm text-muted">
            {game.join_mode === "open" ? "Anyone can join" : "Host approves"}
            {" · "}
            {skillLabel(game.skill)}
          </p>
        </div>
        <PlayerDots game={game} />
      </div>

      <ul className="flex flex-wrap gap-2">
        {places.map(({ club }) => (
          <li key={club.id} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold leading-snug">
            {club.name}
          </li>
        ))}
      </ul>

      {game.note ? <p className="text-ink">{game.note}</p> : null}

      <section>
        <h2 className="text-sm text-muted">Players</h2>
        <ul className="mt-2 space-y-2">
          <li className="rounded-lg bg-card border border-line px-3 py-3">
            {game.host?.first_name} {game.host?.surname}
            <span className="block text-xs text-muted">Host</span>
          </li>
          {joinedPlayers(game).map((player) => (
            <li key={player.id} className="rounded-lg bg-card border border-line px-3 py-3">
              {player.player?.first_name} {player.player?.surname}
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm text-muted">WhatsApp</h2>
          {others.map((contact) => (
            <a
              key={contact.user_id}
              className="btn btn-ghost w-full"
              href={whatsappHref(
                contact.phone,
                `Hi ${contact.first_name}, I'm in for the FindYour4th game on ${formatWhen(game.starts_at)} at ${game.clubs.map((club) => club.name).join(" / ")}.`,
              )}
            >
              Message {contact.first_name}
            </a>
          ))}
        </section>
      ) : null}

      {mine?.status === "pending" ? (
        <p className="text-sm text-muted">You will get their WhatsApp once the host accepts.</p>
      ) : null}
      {userId && (isHost || mine?.status === "joined" || mine?.status === "pending") ? <AlertSettings compact /> : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <div className="sticky bottom-3 -mx-4 bg-canvas/80 px-4 py-3 backdrop-blur-md">{action}</div>
    </div>
  );
}
