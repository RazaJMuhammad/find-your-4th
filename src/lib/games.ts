import { asRating } from "@/lib/format";
import type { Club, Game, GamePlayer } from "@/lib/types";
import { haversineKm, type Coords } from "@/lib/geo";

export const GAME_SELECT = `
  id, host_id, starts_at, ends_at, spots_needed, court_booked, join_mode, skill, note, playtomic_url, status,
  host:profiles!games_host_id_fkey ( id, first_name, surname, city, skill, playtomic_rating ),
  game_clubs ( club:clubs ( id, name, city, province, area, court_count, lat, lng ) ),
  game_players ( id, user_id, status, player:profiles!game_players_user_id_fkey ( id, first_name, surname, playtomic_rating ) )
`;

type Raw = {
  id: string;
  host_id: string;
  starts_at: string;
  ends_at?: string | null;
  spots_needed: number;
  court_booked: boolean;
  join_mode: Game["join_mode"];
  skill: Game["skill"];
  note: string | null;
  playtomic_url?: string | null;
  status: Game["status"];
  host: Game["host"] | Game["host"][];
  game_clubs: { club: Club | Club[] | null }[] | null;
  game_players: GamePlayer[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function withRating<T extends { playtomic_rating?: unknown }>(person: T | null): (T & { playtomic_rating: number | null }) | null {
  if (!person) return null;
  return { ...person, playtomic_rating: asRating(person.playtomic_rating) };
}

export function normalizeGame(raw: Raw): Game {
  const clubs = (raw.game_clubs ?? [])
    .map((row) => one(row.club))
    .filter((club): club is Club => Boolean(club));
  return {
    id: raw.id,
    host_id: raw.host_id,
    starts_at: raw.starts_at,
    ends_at: raw.ends_at ?? raw.starts_at,
    spots_needed: raw.spots_needed,
    court_booked: raw.court_booked,
    join_mode: raw.join_mode,
    skill: raw.skill,
    note: raw.note,
    playtomic_url: raw.playtomic_url ?? null,
    status: raw.status,
    host: withRating(one(raw.host)),
    clubs,
    players: (raw.game_players ?? []).map((player) => ({
      ...player,
      player: withRating(player.player),
    })),
  };
}

export function joinedPlayers(game: Game) {
  return game.players.filter((player) => player.status === "joined");
}

export function spotsLeft(game: Game) {
  return Math.max(0, game.spots_needed - joinedPlayers(game).length);
}

export function clubsWithDistance(game: Game, coords: Coords | null) {
  return game.clubs
    .map((club) => ({
      club,
      distance:
        coords && club.lat != null && club.lng != null
          ? haversineKm(coords, { lat: club.lat, lng: club.lng })
          : null,
    }))
    .sort((a, b) => {
      if (a.distance == null && b.distance == null) return a.club.name.localeCompare(b.club.name);
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
}

export function nearestClub(game: Game, coords: Coords | null) {
  if (!coords) return { club: game.clubs[0] ?? null, distance: null as number | null };
  let best: { club: Club; distance: number } | null = null;
  for (const club of game.clubs) {
    if (club.lat == null || club.lng == null) continue;
    const distance = haversineKm(coords, { lat: club.lat, lng: club.lng });
    if (!best || distance < best.distance) best = { club, distance };
  }
  if (best) return best;
  return { club: game.clubs[0] ?? null, distance: null };
}
