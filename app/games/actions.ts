"use server";

import { redirect } from "next/navigation";
import {
  assertClubSelection,
  assertPost,
  assertSchedule,
  COURT_STATUSES,
  defaultDeadline,
  GAME_TYPES,
  GENDER_LABELS,
  LEVELS,
  type CourtStatus,
  type GameType,
  type GenderLabel,
  type PostMode,
  type SkillLevel,
} from "@/lib/domain/rules";
import { fromJohannesburg } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function fail(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Something went wrong";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function rpc(path: string, fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  if (!supabase) fail(path, new Error("Supabase is not connected yet. See docs/MANUAL-SETUP.md."));
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(path, new Error(error.message));
  return data;
}

function one(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function postGame(formData: FormData) {
  const path = "/games/new";
  let payload: Record<string, unknown>;
  try {
    const mode = one(formData, "mode") as PostMode;
    const startsAt = fromJohannesburg(one(formData, "starts_at"));
    const endsRaw = one(formData, "ends_at");
    const openSpots = Number(one(formData, "open_spots"));
    const levelMin = Number(one(formData, "level_min"));
    const levelMax = Number(one(formData, "level_max"));
    const note = one(formData, "note");
    const clubIds = formData.getAll("club_id").filter((value): value is string => typeof value === "string" && value.length > 0);
    const guestNames = [one(formData, "guest_1"), one(formData, "guest_2")].slice(0, Math.max(0, 3 - openSpots));
    assertPost({
      mode: mode === "proposal" ? "proposal" : "court",
      clubIds,
      startsAt,
      endsAt: endsRaw ? fromJohannesburg(endsRaw) : null,
      openSpots,
      levelMin,
      levelMax,
      note,
    });
    if (guestNames.some((name) => !name)) throw new Error("Guest spots need a first name.");
    const cost = one(formData, "cost");
    const fill = one(formData, "fill_deadline");
    payload = {
      mode: mode === "proposal" ? "proposal" : "court",
      starts_at: startsAt.toISOString(),
      ends_at: endsRaw ? fromJohannesburg(endsRaw).toISOString() : null,
      duration_minutes: Number(one(formData, "duration_minutes") || 90),
      club_ids: clubIds,
      court_number: one(formData, "court_number"),
      open_spots: openSpots,
      level_min: levelMin,
      level_max: levelMax,
      gender: one(formData, "gender") || "open",
      join_mode: one(formData, "join_mode") || "instant",
      cost_cents: cost ? Math.round(Number(cost) * 100) : null,
      note,
      booking_url: one(formData, "booking_url"),
      fill_deadline: fill ? fromJohannesburg(fill).toISOString() : null,
      first_timer: formData.get("first_timer") === "on",
      racket_available: formData.get("racket_available") === "on",
      guest_names: guestNames.filter(Boolean),
      reinvite_from: one(formData, "reinvite_from"),
    };
  } catch (error) {
    fail(path, error);
  }
  const data = await rpc(path, "post_game", { p: payload });
  redirect(`/games/${data as string}`);
}

export async function createMatch(formData: FormData) {
  const path = "/games/new";
  let payload: Record<string, unknown>;
  try {
    const startsAt = fromJohannesburg(one(formData, "starts_at"));
    const deadlineRaw = one(formData, "deadline");
    const deadline = deadlineRaw ? fromJohannesburg(deadlineRaw) : defaultDeadline(startsAt);
    assertSchedule(startsAt, deadline);
    const level = one(formData, "level") as SkillLevel;
    const gameType = one(formData, "game_type") as GameType;
    const courtStatus = one(formData, "court_status") as CourtStatus;
    const gender = (one(formData, "gender") || "open") as GenderLabel;
    if (!LEVELS.includes(level) || !GAME_TYPES.includes(gameType) || !COURT_STATUSES.includes(courtStatus) || !GENDER_LABELS.includes(gender)) {
      throw new Error("Check the game details and try again.");
    }
    const already = Number(one(formData, "already"));
    if (![1, 2, 3].includes(already)) throw new Error("Say how many players you already have.");
    const guestNames = [one(formData, "guest_1"), one(formData, "guest_2")].slice(0, already - 1);
    if (guestNames.some((name) => !name)) throw new Error("Guest spots need a first name.");
    const clubIds = formData.getAll("club_id").filter((value): value is string => typeof value === "string" && value.length > 0);
    assertClubSelection(courtStatus, clubIds);
    payload = {
      p_starts_at: startsAt.toISOString(),
      p_level: level,
      p_game_type: gameType,
      p_court_status: courtStatus,
      p_note: one(formData, "note"),
      p_gender: gender,
      p_logistics_note: one(formData, "logistics"),
      p_attendance_deadline: deadline.toISOString(),
      p_guest_names: guestNames,
      p_club_ids: clubIds,
    };
  } catch (error) {
    fail(path, error);
  }
  const data = await rpc(path, "create_match", payload);
  redirect(`/games/${data as string}`);
}

async function matchAction(matchId: string, fn: string, args: Record<string, unknown>) {
  await rpc(`/games/${matchId}`, fn, args);
  redirect(`/games/${matchId}`);
}

export async function joinMatch(formData: FormData) {
  const matchId = one(formData, "match_id");
  const data = await rpc(`/games/${matchId}`, "join_or_request", {
    p_match: matchId,
    p_ack: formData.get("ack") === "on",
    p_note: one(formData, "note"),
  });
  redirect(`/games/${matchId}?joined=${encodeURIComponent(String(data ?? "joined"))}`);
}

export async function leaveMatch(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "leave_match", { p_match: matchId });
}

export async function waitlistMatch(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "join_waitlist", { p_match: matchId });
}

export async function confirmAttendance(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "confirm_attendance", { p_match: matchId });
}

export async function confirmClub(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "confirm_club", { p_match: matchId, p_club: one(formData, "club_id") });
}

export async function saveLogistics(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "set_logistics_note", { p_match: matchId, p_note: one(formData, "logistics") });
}

export async function removePlayer(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "remove_player", { p_match: matchId, p_slot: one(formData, "slot_id") });
}

export async function cancelMatch(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "cancel_match", { p_match: matchId });
}

export async function completeMatch(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "complete_match", { p_match: matchId });
}

export async function markNoShow(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "mark_no_show", { p_match: matchId, p_slot: one(formData, "slot_id") });
}

export async function submitRating(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "submit_rating", {
    p_match: matchId,
    p_ratee: one(formData, "ratee_id"),
    p_stars: Number(one(formData, "stars")),
    p_play_again: one(formData, "play_again") === "yes",
  });
}

async function stay(matchId: string, fn: string, args: Record<string, unknown>) {
  await rpc(`/games/${matchId}`, fn, args);
  redirect(`/games/${matchId}`);
}

export async function reviewRequest(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "review_request", { p_request: one(formData, "request_id"), p_approve: formData.get("approve") === "yes" });
}

export async function acceptOffer(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "accept_offer", { p_offer: one(formData, "offer_id") });
}

export async function editGame(formData: FormData) {
  const matchId = one(formData, "match_id");
  const cost = one(formData, "cost");
  const starts = one(formData, "starts_at");
  await stay(matchId, "edit_game", {
    p_match: matchId,
    p: {
      note: one(formData, "note"),
      cost_cents: cost ? Math.round(Number(cost) * 100) : null,
      starts_at: starts ? fromJohannesburg(starts).toISOString() : null,
    },
  });
}

export async function rebroadcast(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "rebroadcast", { p_match: matchId });
}

export async function claimBooker(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "claim_booker", { p_match: matchId });
}

export async function markBooked(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "mark_booked", {
    p_match: matchId,
    p_status: one(formData, "booking_status") || "booked",
    p_url: one(formData, "booking_url"),
    p_details: one(formData, "booking_details"),
  });
}

export async function sendMessage(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "send_message", { p_match: matchId, p_body: one(formData, "body") });
}

export async function confirmPlayed(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "confirm_played", { p_match: matchId, p_played: formData.get("played") === "yes" });
}

export async function submitFeedback(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "submit_feedback", {
    p_match: matchId,
    p_ratee: one(formData, "ratee_id"),
    p_level_fit: Number(one(formData, "level_fit")),
    p_play_again: one(formData, "play_again") === "yes",
  });
}

export async function blockPlayer(formData: FormData) {
  const matchId = one(formData, "match_id");
  await stay(matchId, "block_player", { p_player: one(formData, "player_id") });
}

export async function saveCurrentSearch(formData: FormData) {
  const filters = {
    city: one(formData, "city"),
    club: one(formData, "club"),
    level: one(formData, "level"),
    on: one(formData, "on"),
    court: one(formData, "court"),
    gender: one(formData, "gender"),
    mode: one(formData, "mode"),
    time: one(formData, "time"),
    full: formData.get("full") === "on",
  };
  await rpc("/", "save_search", { p_filters: filters });
  redirect("/?saved=1");
}

export async function reportPlayer(formData: FormData) {
  const matchId = one(formData, "match_id");
  await matchAction(matchId, "report_player", {
    p_reported: one(formData, "reported_id"),
    p_match: matchId,
    p_note: one(formData, "note"),
  });
}
