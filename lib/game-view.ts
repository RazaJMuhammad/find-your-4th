import type { CourtStatus, GameType, GenderLabel, SkillLevel } from "@/lib/domain/rules";
import { isUrgent, withinLevel } from "@/lib/domain/rules";
import { formatDay, johannesburgHour } from "@/lib/format";

export type Club = {
  id: string;
  name: string;
  suburb: string | null;
  city: string;
  province: string;
  court_count: number | null;
  booking_platform: string | null;
};

export type Slot = {
  id: string;
  slot_index: number;
  kind: "member" | "guest";
  status: "open" | "held_guest" | "joined" | "confirmed" | "released";
  player_id: string | null;
  guest_label: string | null;
  player: { id: string; display_name: string; level: SkillLevel | null } | null;
};

export type MatchClub = { is_confirmed: boolean; club: Club };

export type Match = {
  id: string;
  host_id: string;
  starts_at: string;
  level: SkillLevel;
  game_type: GameType;
  court_status: CourtStatus;
  note: string | null;
  gender_label: GenderLabel;
  attendance_deadline: string;
  status: "open" | "full" | "completed" | "cancelled";
  host: { display_name: string; level: SkillLevel | null } | null;
  match_clubs: MatchClub[];
  match_slots: Slot[];
  mode?: "court" | "proposal";
  ends_at?: string | null;
  duration_minutes?: number;
  court_number?: string | null;
  open_spots?: number;
  level_min?: number;
  level_max?: number;
  join_mode?: "instant" | "request";
  cost_cents?: number | null;
  booking_url?: string | null;
  fill_deadline?: string | null;
  first_timer?: boolean;
  racket_available?: boolean;
  booker_id?: string | null;
  booking_status?: "unbooked" | "booked" | "booked_elsewhere";
  booking_deadline?: string | null;
  share_token?: string | null;
  locked_at?: string | null;
  withdrawal_free_until?: string | null;
};

export function clubLabel(club: Pick<Club, "name" | "suburb" | "city">) {
  const place = club.suburb && club.suburb !== club.city ? `${club.suburb}, ${club.city}` : club.city;
  return `${club.name} · ${place}`;
}

export function visibleClubs(match: Pick<Match, "court_status" | "match_clubs">) {
  if (match.court_status === "booked") {
    const confirmed = match.match_clubs.filter((item) => item.is_confirmed);
    return confirmed.length > 0 ? confirmed : match.match_clubs;
  }
  return match.match_clubs;
}

export function openSpots(match: Pick<Match, "match_slots">) {
  return match.match_slots.filter((slot) => slot.status === "open").length;
}

export function filledSpots(match: Pick<Match, "match_slots">) {
  return match.match_slots.filter((slot) => slot.status !== "open" && slot.status !== "released").length;
}

export type FeedFilters = {
  club?: string;
  city?: string;
  level?: string;
  court?: string;
  on?: string;
  full?: boolean;
  gender?: string;
  mode?: string;
  time?: string;
  best?: boolean;
  viewerLevel?: SkillLevel | null;
  viewerScore?: number | null;
  viewerClubs?: string[];
};

function timeBucket(hour: number) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function bestScore(match: Match, filters: FeedFilters) {
  let score = 0;
  const clubs = visibleClubs(match).map((item) => item.club.id);
  if (filters.viewerClubs?.some((id) => clubs.includes(id))) score += 3;
  if (filters.viewerScore != null && match.level_min != null && match.level_max != null && filters.viewerScore >= match.level_min && filters.viewerScore <= match.level_max) {
    score += 2;
  }
  if (isUrgent(new Date(match.starts_at))) score += 1;
  return score;
}

export function matchesFeed(matches: Match[], filters: FeedFilters) {
  const filtered = matches.filter((match) => {
    if (!filters.full && match.status !== "open") return false;
    if (filters.full && match.status !== "open" && match.status !== "full") return false;
    if (filters.court && match.court_status !== filters.court) return false;
    if (filters.mode && match.mode && match.mode !== filters.mode) return false;
    if (filters.gender && match.gender_label !== filters.gender) return false;
    if (filters.time && timeBucket(johannesburgHour(match.starts_at)) !== filters.time) return false;
    if (filters.on && formatDay(match.starts_at) !== formatDay(`${filters.on}T12:00:00+02:00`)) return false;
    if (filters.level && filters.level !== "all" && match.level !== filters.level) return false;
    if (!filters.level && filters.viewerLevel && !withinLevel(filters.viewerLevel, match.level)) return false;
    const clubs = visibleClubs(match).map((item) => item.club);
    if (filters.club && !clubs.some((club) => club.id === filters.club)) return false;
    if (filters.city && !clubs.some((club) => club.city === filters.city)) return false;
    return true;
  });
  if (!filters.best) return filtered;
  return [...filtered].sort((a, b) => bestScore(b, filters) - bestScore(a, filters) || a.starts_at.localeCompare(b.starts_at));
}
