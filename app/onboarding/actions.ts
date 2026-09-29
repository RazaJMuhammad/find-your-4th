"use server";

import { redirect } from "next/navigation";
import { LEVEL_SCORES } from "@/lib/domain/rules";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/session";

export async function saveProfile(formData: FormData) {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/onboarding");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const levelScore = Number(formData.get("level_score"));
  const next = String(formData.get("next") ?? "/");
  const back = `/onboarding?next=${encodeURIComponent(next)}`;
  if (displayName.length < 1 || displayName.length > 40) redirect(`${back}&error=Use%20a%20name%20up%20to%2040%20characters`);
  if (!LEVEL_SCORES.includes(levelScore as (typeof LEVEL_SCORES)[number])) redirect(`${back}&error=Pick%20a%20level`);
  const clubIds = formData.getAll("club_id").filter((value): value is string => typeof value === "string" && value.length > 0);
  if (clubIds.length > 3) redirect(`${back}&error=Pick%20at%20most%203%20home%20clubs`);
  const prefs = Object.fromEntries(
    ["matches", "requests", "booking", "reminders", "ratings"].map((key) => [key, formData.get(`pref_${key}`) === "on" ? "true" : "false"]),
  );
  const payload = {
    display_name: displayName,
    level_score: levelScore,
    avatar_url: String(formData.get("avatar_url") ?? ""),
    gender: String(formData.get("gender") ?? "unspecified"),
    playtomic_url: String(formData.get("playtomic_url") ?? ""),
    search_radius_km: Number(formData.get("search_radius_km") || 15),
    age_confirmed: formData.get("age_confirmed") === "on",
    accept_terms: formData.get("accept_terms") === "on",
    whatsapp: String(formData.get("whatsapp") ?? ""),
    whatsapp_share: formData.get("whatsapp_share") === "on",
    quiet_start: String(formData.get("quiet_start") ?? ""),
    quiet_end: String(formData.get("quiet_end") ?? ""),
    notif_prefs: prefs,
    fantasy_opt_in: formData.get("fantasy_opt_in") === "on",
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
