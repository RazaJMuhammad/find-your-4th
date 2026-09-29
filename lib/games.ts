import { createClient } from "@/lib/supabase/server";
import type { Club, Match } from "@/lib/game-view";

export { clubLabel, filledSpots, matchesFeed, openSpots, visibleClubs } from "@/lib/game-view";
export type { Club, FeedFilters, Match, MatchClub, Slot } from "@/lib/game-view";

const MATCH_CORE = `
  id, host_id, starts_at, level, game_type, court_status, note, gender_label, attendance_deadline, status,
  host:profiles!matches_host_id_fkey(display_name, level),
  match_clubs(is_confirmed, club:clubs(id, name, suburb, city, province, court_count, booking_platform)),
  match_slots(id, slot_index, kind, status, player_id, guest_label, player:profiles!match_slots_player_id_fkey(id, display_name, level))
`;

const MATCH_SELECT = `
  id, host_id, starts_at, level, game_type, court_status, note, gender_label, attendance_deadline, status,
  mode, ends_at, duration_minutes, court_number, open_spots, level_min, level_max, join_mode, cost_cents,
  booking_url, fill_deadline, first_timer, racket_available, booker_id, booking_status, booking_deadline,
  share_token, locked_at, withdrawal_free_until,
  host:profiles!matches_host_id_fkey(display_name, level),
  match_clubs(is_confirmed, club:clubs(id, name, suburb, city, province, court_count, booking_platform)),
  match_slots(id, slot_index, kind, status, player_id, guest_label, player:profiles!match_slots_player_id_fkey(id, display_name, level))
`;

function sortMatch(match: Match): Match {
  return {
    ...match,
    match_slots: [...match.match_slots].sort((a, b) => a.slot_index - b.slot_index),
    match_clubs: [...match.match_clubs].sort((a, b) => a.club.name.localeCompare(b.club.name)),
  };
}

export async function loadClubs() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("clubs").select("id, name, suburb, city, province, court_count, booking_platform").order("province").order("city").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Club[];
}

export async function loadFeed() {
  const supabase = await createClient();
  if (!supabase) return null;
  const now = new Date().toISOString();
  const first = await supabase.from("matches").select(MATCH_SELECT).in("status", ["open", "full"]).gt("starts_at", now).order("starts_at", { ascending: true }).limit(80);
  const result = first.error
    ? await supabase.from("matches").select(MATCH_CORE).in("status", ["open", "full"]).gt("starts_at", now).order("starts_at", { ascending: true }).limit(80)
    : first;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as unknown as Match[]).map(sortMatch);
}

export async function loadMatch(id: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const first = await supabase.from("matches").select(MATCH_SELECT).eq("id", id).maybeSingle();
  const result = first.error ? await supabase.from("matches").select(MATCH_CORE).eq("id", id).maybeSingle() : first;
  if (result.error) throw new Error(result.error.message);
  return result.data ? sortMatch(result.data as unknown as Match) : null;
}

export async function loadMyGames(userId: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const first = await supabase.from("matches").select(MATCH_SELECT).gte("starts_at", since).order("starts_at", { ascending: true }).limit(40);
  const result = first.error
    ? await supabase.from("matches").select(MATCH_CORE).gte("starts_at", since).order("starts_at", { ascending: true }).limit(40)
    : first;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as unknown as Match[])
    .map(sortMatch)
    .filter((match) => match.host_id === userId || match.match_slots.some((slot) => slot.player_id === userId && (slot.status === "joined" || slot.status === "confirmed")));
}

export async function loadWaitlist(matchId: string) {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("match_waitlist")
    .select("player_id, created_at, player:profiles!match_waitlist_player_id_fkey(display_name)")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as { player_id: string; created_at: string; player: { display_name: string } | null }[];
}

export async function loadLogistics(matchId: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("logistics_note", { p_match: matchId });
  if (error) return null;
  return (data as string | null) ?? null;
}

export type Reliability = {
  show_ups: number;
  misses: number;
  games_hosted: number;
  play_again_yes: number;
  play_again_count: number;
};

export async function loadReliability(playerId: string) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("player_reliability", { p_player: playerId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Reliability | null) ?? null;
}

export async function loadRows<T>(table: string, matchId: string, columns: string) {
  const supabase = await createClient();
  if (!supabase) return [] as T[];
  const { data, error } = await supabase.from(table).select(columns).eq("match_id", matchId);
  if (error) return [] as T[];
  return (data ?? []) as T[];
}
