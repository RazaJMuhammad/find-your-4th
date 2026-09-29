import type { CourtStatus, GameType, GenderLabel, SkillLevel } from "@/lib/domain/rules";

export const brand = {
  name: "Find Your 4th",
  shortName: "Your 4th",
  description: "Find the players you are missing so a padel four can actually happen.",
};

export const levelLabel: Record<SkillLevel, string> = {
  beginner: "Beginner",
  beginner_plus: "Beginner+",
  intermediate: "Intermediate",
  intermediate_plus: "Intermediate+",
  advanced: "Advanced",
};

export const gameTypeLabel: Record<GameType, string> = {
  casual: "Casual",
  competitive: "Competitive",
  social: "Social",
};

export const courtStatusLabel: Record<CourtStatus, string> = {
  booked: "Court booked",
  not_booked: "Court not booked",
  book_when_full: "Book once full",
};

export const genderLabel: Record<GenderLabel, string> = {
  open: "Open",
  men: "Men",
  women: "Women",
  mixed: "Mixed",
};

export const levelScoreLabel = [
  "0 · New to padel",
  "1 · Beginner",
  "2 · Beginner+",
  "3 · Improver",
  "4 · Intermediate",
  "5 · Intermediate+",
  "6 · Advanced",
  "7 · Competitive",
] as const;

export const genderChoiceLabel = {
  man: "Man",
  woman: "Woman",
  unspecified: "Prefer not to say",
} as const;

export const notificationCopy: Record<string, string> = {
  game_full: "Your game is full.",
  spot_opened: "A spot opened in your game.",
  waitlist_promoted: "A spot opened and you are in.",
  waitlist_offer: "A spot is yours for 30 minutes.",
  attendance_reminder: "Confirm you are still playing.",
  court_confirmed: "The court is confirmed.",
  rate_game: "Did you play? Rate the group.",
  game_cancelled: "A game you joined was cancelled.",
  new_match: "A game near you needs players.",
  join_request: "Someone wants to join your game.",
  request_approved: "You are in.",
  request_declined: "The host declined the request.",
  player_joined: "A player joined your game.",
  player_withdrew: "A player left the game.",
  game_locked: "Four players are in. Book the court.",
  booking_reminder: "Book the court soon.",
  game_booked: "The court is booked.",
  game_changed: "The host changed the game. You can leave without a penalty for 2 hours.",
  fill_deadline: "Keep the court or release it?",
  pre_game: "Your game starts soon.",
};

export function whatsAppGameText(input: { when: string; where: string; spots: number; url: string }) {
  const spots = input.spots === 1 ? "1 spot open" : `${input.spots} spots open`;
  return `Padel — ${input.when}\n${input.where}\n${spots}\n${input.url}`;
}
