"use server";

import { redirect } from "next/navigation";
import { GAME_PREFERENCES, LEVEL_SCORES, MAX_HOME_CLUBS, type GamePreference } from "@/lib/domain/rules";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/session";

const PREFERRED_GENDERS = new Set<string>(GAME_PREFERENCES);

function unique(values: string[]) {
  return [...new Set(values)];
}

function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  return /^\+?[0-9]{8,15}$/.test(compact) ? compact : null;
}

export async function saveProfile(formData: FormData) {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/onboarding");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const next = String(formData.get("next") ?? "/");
  const back = `/onboarding?next=${encodeURIComponent(next)}`;
  if (firstName.length < 1 || firstName.length > 30) redirect(`${back}&error=Use%20a%20first%20name%20up%20to%2030%20characters`);
  if (surname.length < 1 || surname.length > 30) redirect(`${back}&error=Use%20a%20surname%20up%20to%2030%20characters`);
  if (`${firstName} ${surname}`.length > 40) redirect(`${back}&error=Name%20and%20surname%20together%20can%20be%20at%20most%2040%20characters`);
  if (!phone) redirect(`${back}&error=Enter%20a%20phone%20number`);
  const clubIds = unique(formData.getAll("club_id").filter((value): value is string => typeof value === "string" && value.length > 0));
  if (clubIds.length < 1) redirect(`${back}&error=Pick%20at%20least%20one%20club`);
  if (clubIds.length > MAX_HOME_CLUBS) redirect(`${back}&error=Pick%20at%20most%2015%20clubs`);
  const genders = unique(
    formData.getAll("preferred_gender").filter((value): value is GamePreference => typeof value === "string" && PREFERRED_GENDERS.has(value)),
  );
  if (genders.length < 1) redirect(`${back}&error=Pick%20at%20least%20one%20game%20type`);
  const levels = unique(
    formData
      .getAll("preferred_level")
      .map((value) => Number(value))
      .filter((value) => LEVEL_SCORES.includes(value as (typeof LEVEL_SCORES)[number]))
      .map(String),
  ).map(Number);
  if (levels.length < 1) redirect(`${back}&error=Pick%20at%20least%20one%20level`);
  const screenshot = String(formData.get("playtomic_screenshot_path") ?? "").trim();
  const screenshotOk = new RegExp(
    `^${userId.toLowerCase()}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`,
  ).test(screenshot);
  if (screenshot && !screenshotOk) redirect(`${back}&error=Screenshot%20path%20is%20not%20valid`);
  const payload = {
    first_name: firstName,
    surname,
    phone,
    age_confirmed: formData.get("age_confirmed") === "on",
    accept_terms: formData.get("accept_terms") === "on",
    playtomic_screenshot_path: screenshot,
    preferred_genders: genders,
    preferred_levels: levels,
    club_ids: clubIds,
  };
  const supabase = await createClient();
  if (!supabase) redirect(`${back}&error=Supabase%20is%20not%20connected%20yet`);
  const { error } = await supabase.rpc("save_account", { p: payload });
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  redirect(next.startsWith("/") ? next : "/");
}

export async function deleteAccount(formData: FormData) {
  if (String(formData.get("confirm") ?? "") !== "DELETE") redirect("/you?error=Type%20DELETE%20to%20confirm");
  const supabase = await createClient();
  if (!supabase) redirect("/you?error=Supabase%20is%20not%20connected%20yet");
  const { error } = await supabase.rpc("delete_account");
  if (error) redirect(`/you?error=${encodeURIComponent(error.message)}`);
  await supabase.auth.signOut();
  redirect("/");
}

export async function unblock(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) redirect("/you?error=Supabase%20is%20not%20connected%20yet");
  const { error } = await supabase.rpc("unblock_player", { p_player: String(formData.get("player_id") ?? "") });
  if (error) redirect(`/you?error=${encodeURIComponent(error.message)}`);
  redirect("/you");
}

export async function suggestClub(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) redirect("/you?error=Supabase%20is%20not%20connected%20yet");
  const { error } = await supabase.rpc("suggest_club", {
    p_name: String(formData.get("name") ?? ""),
    p_city: String(formData.get("city") ?? ""),
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) redirect(`/you?error=${encodeURIComponent(error.message)}`);
  redirect("/you?suggested=1");
}
