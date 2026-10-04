export const LEVELS = [
  "beginner",
  "beginner_plus",
  "intermediate",
  "intermediate_plus",
  "advanced",
] as const;

export type SkillLevel = (typeof LEVELS)[number];

export const GAME_TYPES = ["casual", "competitive", "social"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const COURT_STATUSES = ["booked", "not_booked", "book_when_full"] as const;
export type CourtStatus = (typeof COURT_STATUSES)[number];

export const GENDER_LABELS = ["open", "men", "women", "mixed"] as const;
export type GenderLabel = (typeof GENDER_LABELS)[number];

export const GAME_PREFERENCES = ["men", "women", "mixed"] as const;
export type GamePreference = (typeof GAME_PREFERENCES)[number];

export const MAX_HOME_CLUBS = 15;

export const HOUR = 60 * 60 * 1000;
export const LEVEL_FLEX = 1;
export const RELIABILITY_MIN_GAMES = 3;
export const PLAY_AGAIN_MIN_RATINGS = 5;

export function levelRank(level: SkillLevel) {
  return LEVELS.indexOf(level);
}

export function withinLevel(player: SkillLevel, game: SkillLevel, flex = LEVEL_FLEX) {
  return Math.abs(levelRank(player) - levelRank(game)) <= flex;
}

export const LEVEL_SCORES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type PostMode = "court" | "proposal";
export type JoinMode = "instant" | "request";
export type PlayerGender = "man" | "woman" | "unspecified";
export type CancelTier = "free" | "late" | "no_show";

const PROFANITY = ["fuck", "shit", "bitch", "asshole"];

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
]);

export function isDisposableEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE_DOMAINS.has(domain);
}

export function levelInRange(score: number, min: number, max: number) {
  return score >= min && score <= max;
}

export function isUrgent(startsAt: Date, now = new Date()) {
  return startsAt.getTime() > now.getTime() && startsAt.getTime() - now.getTime() < 6 * HOUR;
}

export function cancelTier(startsAt: Date, now: Date, freeUntil: Date | null = null): CancelTier {
  if (freeUntil && now.getTime() < freeUntil.getTime()) return "free";
  const hours = (startsAt.getTime() - now.getTime()) / HOUR;
  if (hours > 24) return "free";
  if (hours > 3) return "late";
  return "no_show";
}

export function joinNeedsApproval(input: { openSpots: number; inRange: boolean; hostMode: JoinMode }) {
  return input.hostMode === "request" || input.openSpots >= 2 || !input.inRange;
}

export function hostCap(accountAgeMs: number) {
  return accountAgeMs < 3 * 24 * HOUR ? 1 : 3;
}

export function containsProfanity(value: string) {
  const text = value.toLowerCase();
  return PROFANITY.some((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

export function eligibleForGender(player: PlayerGender | null, game: GenderLabel) {
  if (game === "women") return player === "woman";
  if (game === "men") return player === "man";
  return true;
}

export function assertPost(input: {
  mode: PostMode;
  clubIds: string[];
  startsAt: Date;
  endsAt: Date | null;
  openSpots: number;
  levelMin: number;
  levelMax: number;
  note: string;
}) {
  const unique = new Set(input.clubIds.filter(Boolean));
  if (unique.size !== input.clubIds.length) throw new Error("Each club can only be selected once.");
  if (input.mode === "court" && input.clubIds.length !== 1) throw new Error("A booked court is one club.");
  if (input.mode === "proposal" && (input.clubIds.length < 1 || input.clubIds.length > 3)) {
    throw new Error("Propose 1 to 3 clubs.");
  }
  if (input.mode === "proposal") {
    if (!input.endsAt || input.endsAt.getTime() - input.startsAt.getTime() < 2 * HOUR) {
      throw new Error("A proposal needs a time window of at least 2 hours.");
    }
  }
  if (input.openSpots < 1 || input.openSpots > 3) throw new Error("Open spots must be 1, 2, or 3.");
  if (input.levelMin < 0 || input.levelMax > 7 || input.levelMin > input.levelMax) {
    throw new Error("Level range must sit between 0 and 7.");
  }
  if (containsProfanity(input.note)) throw new Error("Remove the language in the note.");
}

export function assertClubSelection(status: CourtStatus, clubIds: string[]) {
  const unique = new Set(clubIds.filter(Boolean));
  if (unique.size !== clubIds.length) {
    throw new Error("Each club can only be selected once.");
  }
  if (clubIds.length < 1) {
    throw new Error("Pick at least one club.");
  }
  if (status === "booked" && clubIds.length !== 1) {
    throw new Error("A booked court is one club.");
  }
}

export function defaultDeadline(startsAt: Date) {
  return new Date(startsAt.getTime() - 4 * HOUR);
}

export function assertSchedule(startsAt: Date, deadline: Date, now = new Date()) {
  if (startsAt.getTime() <= now.getTime() + HOUR) {
    throw new Error("Games need to start more than an hour from now.");
  }
  if (deadline.getTime() > startsAt.getTime() - HOUR) {
    throw new Error("Attendance deadline must be at least 1 hour before the game.");
  }
  if (deadline.getTime() <= now.getTime()) {
    throw new Error("Attendance deadline must be in the future.");
  }
}

export function isLateCancel(input: { confirmed: boolean; now: Date; deadline: Date }) {
  return input.confirmed || input.now.getTime() > input.deadline.getTime();
}

export function shouldPromoteWaitlist(startsAt: Date, now: Date) {
  return startsAt.getTime() - now.getTime() > HOUR;
}

export type Outcome = "show_up" | "late_cancel" | "no_response" | "no_show";

export function reliabilitySummary(input: { showUps: number; misses: number; playAgainYes: number; playAgainCount: number }) {
  const resolved = input.showUps + input.misses;
  return {
    resolved,
    showUpRate: resolved >= RELIABILITY_MIN_GAMES ? input.showUps / resolved : null,
    playAgainRate: input.playAgainCount >= PLAY_AGAIN_MIN_RATINGS ? input.playAgainYes / input.playAgainCount : null,
  };
}

export type SimSlot = {
  index: number;
  playerId: string | null;
  status: "open" | "joined" | "confirmed" | "held_guest";
};

export type SimMatch = {
  status: "open" | "full";
  slots: SimSlot[];
  waitlist: string[];
  outcomes: { playerId: string; outcome: Outcome }[];
};

export function emptyMatch(): SimMatch {
  return {
    status: "open",
    slots: [1, 2, 3, 4].map((index) => ({ index, playerId: null, status: "open" as const })),
    waitlist: [],
    outcomes: [],
  };
}

function refresh(match: SimMatch) {
  match.status = match.slots.some((slot) => slot.status === "open") ? "open" : "full";
}

export function placePlayer(match: SimMatch, playerId: string, status: "joined" | "confirmed" | "held_guest" = "joined") {
  const slot = match.slots.find((item) => item.status === "open");
  if (!slot) throw new Error("Game is full.");
  slot.playerId = status === "held_guest" ? null : playerId;
  slot.status = status;
  refresh(match);
  return slot;
}

export function releasePlayer(match: SimMatch, playerId: string, outcome: Outcome | null) {
  const slot = match.slots.find((item) => item.playerId === playerId && (item.status === "joined" || item.status === "confirmed"));
  if (!slot) throw new Error("You are not in this game.");
  if (outcome) match.outcomes.push({ playerId, outcome });
  slot.playerId = null;
  slot.status = "open";
  refresh(match);
}

export function promoteIfDue(match: SimMatch, startsAt: Date, now: Date) {
  if (!shouldPromoteWaitlist(startsAt, now)) return null;
  const open = match.slots.find((slot) => slot.status === "open");
  const next = match.waitlist[0];
  if (!open || !next) return null;
  match.waitlist.shift();
  open.playerId = next;
  open.status = "joined";
  refresh(match);
  return next;
}
