"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import { Busy } from "@/components/Busy";
import { GameSkeleton } from "@/components/GameSkeleton";
import { LinkPending } from "@/components/LinkPending";
import { PlayerDots } from "@/components/PlayerDots";
import { PlayerLine } from "@/components/PlayerLine";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, formatWhen, personName, skillLabel } from "@/lib/format";
import { GAME_SELECT, clubsWithDistance, joinedPlayers, normalizeGame, spotsLeft } from "@/lib/games";
import { readCoordsSnapshot, subscribeLocation } from "@/lib/location";
import type { Contact, Game } from "@/lib/types";
import { rememberGame, rememberedGame } from "@/lib/view-cache";
import { whatsappHref } from "@/lib/whatsapp";

export function GameDetail({ id }: { id: string }) {
  const { ready, userId, profile } = useAuth();
  const [game, setGame] = useState<Game | null>(() => rememberedGame(id));
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
        const next = normalizeGame(data as never);
        rememberGame(next);
        setGame(next);
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
    if (actionError) setError(errorMessage(actionError));
    await load();
    setPending(false);
  }

  if (missing) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl">Game unavailable</h1>
        <Link href="/" className="btn btn-secondary">
          Back to the feed
        </Link>
      </div>
    );
  }
  if (!game) return <GameSkeleton />;

  const left = spotsLeft(game);
  const mine = game.players.find((player) => player.user_id === userId);
  const isHost = userId === game.host_id;
  const started = gameClock != null && new Date(game.starts_at).getTime() <= gameClock;
  const places = clubsWithDistance(game, coords);
  const others = contacts.filter((contact) => contact.user_id !== userId);
  const next = `/games/${id}`;

  let status: React.ReactNode = null;
  let action: React.ReactNode = null;
  if (isHost) {
    status = (
      <div className="status status-host" role="status">
        <p className="font-semibold">You&apos;re hosting</p>
        <p className="mt-1 text-sm text-muted">Manage requests in My games.</p>
      </div>
    );
  } else if (mine?.status === "joined") {
    status = (
      <div className="status status-in" role="status">
        <p className="font-semibold">You&apos;re in</p>
        <p className="mt-1 text-sm text-muted">You have a spot in this game.</p>
      </div>
    );
  } else if (mine?.status === "pending") {
    status = (
      <div className="status status-wait" role="status">
        <p className="font-semibold">Request sent</p>
        <p className="mt-1 text-sm text-muted">Waiting for the host to accept.</p>
      </div>
    );
  } else if (started || game.status !== "open") {
    status = (
      <div className="status status-closed" role="status">
        <p className="font-semibold">This game is closed</p>
      </div>
    );
  } else if (left === 0) {
    status = (
      <div className="status status-closed" role="status">
        <p className="font-semibold">All spots are taken</p>
      </div>
    );
  } else if (!ready) {
    action = (
      <button className="btn btn-primary w-full" type="button" disabled aria-busy="true">
        <Busy on wait="Checking your account…">Checking your account…</Busy>
      </button>
    );
  } else if (!userId) {
    action = (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-primary relative w-full overflow-hidden">
        {game.join_mode === "open" ? "Sign up to join" : "Sign up to request"}
        <LinkPending label="Opening" />
      </Link>
    );
  } else if (!profile) {
    action = (
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-primary relative w-full overflow-hidden">
        Finish your profile
        <LinkPending label="Opening" />
      </Link>
    );
  } else if (game.join_mode === "open") {
    action = (
      <button className="btn btn-primary w-full" type="button" disabled={pending} aria-busy={pending} onClick={() => void act("join_game")}>
        <Busy on={pending} wait="Joining…">Join game</Busy>
      </button>
    );
  } else {
    action = (
      <button className="btn btn-primary w-full" type="button" disabled={pending} aria-busy={pending} onClick={() => void act("request_spot")}>
        <Busy on={pending} wait="Sending…">Request a spot</Busy>
      </button>
    );
  }

  return (
    <div className="space-y-5">
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

      {status}

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
          <li>
            <PlayerLine name={personName(game.host)} role="Host" rating={game.host?.playtomic_rating ?? null} />
          </li>
          {joinedPlayers(game).map((player) => (
            <li key={player.id}>
              <PlayerLine name={personName(player.player)} role="Player" rating={player.player?.playtomic_rating ?? null} />
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Message players</h2>
          <p className="text-sm text-muted">Opens WhatsApp. Numbers stay hidden until you are in the game.</p>
          {others.map((contact) => (
            <a
              key={contact.user_id}
              className="btn btn-secondary w-full"
              href={whatsappHref(
                contact.phone,
                `Hi ${contact.first_name}, I'm in for the FindYour4th game on ${formatWhen(game.starts_at)} at ${game.clubs.map((club) => club.name).join(" / ")}.`,
              )}
            >
              <MessageIcon />
              WhatsApp {contact.first_name}
            </a>
          ))}
        </section>
      ) : null}

      {mine?.status === "pending" ? (
        <p className="text-sm text-muted">You will get their WhatsApp once the host accepts.</p>
      ) : null}
      {userId && (isHost || mine?.status === "joined" || mine?.status === "pending") ? <AlertSettings compact /> : null}
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {action ? <div className="dock">{action}</div> : null}
    </div>
  );
}

function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18.5 4 21V6.8A1.8 1.8 0 0 1 5.8 5h12.4A1.8 1.8 0 0 1 20 6.8v8.4a1.8 1.8 0 0 1-1.8 1.8H7Z" />
    </svg>
  );
}
