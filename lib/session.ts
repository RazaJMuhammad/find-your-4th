import { createClient } from "@/lib/supabase/server";
import { GAME_PREFERENCES, LEVEL_SCORES, type GamePreference, type PlayerGender, type SkillLevel } from "@/lib/domain/rules";

export type Profile = {
  id: string;
  display_name: string;
  level: SkillLevel | null;
  level_score: number | null;
  home_club_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  gender: PlayerGender | null;
  playtomic_url: string | null;
  search_radius_km: number;
  age_confirmed: boolean;
  terms_accepted_at: string | null;
  whatsapp: string | null;
  whatsapp_share: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  notif_prefs: Record<string, string>;
  fantasy_opt_in: boolean;
  is_admin: boolean;
  clubs: string[];
  first_name: string | null;
  surname: string | null;
  phone: string | null;
  playtomic_screenshot_path: string | null;
  preferred_genders: GamePreference[];
  preferred_levels: number[];
  onboarded_at: string | null;
};

export async function getUserId() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims || typeof data.claims.sub !== "string") return null;
  return data.claims.sub;
}

function asText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asGenders(value: unknown): GamePreference[] {
  const allowed = new Set<string>(GAME_PREFERENCES);
  return asStringList(value).filter((item): item is GamePreference => allowed.has(item));
}

function asLevels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const score = typeof item === "number" ? item : typeof item === "string" ? Number(item) : Number.NaN;
    return LEVEL_SCORES.includes(score as (typeof LEVEL_SCORES)[number]) ? [score] : [];
  });
}

function asProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Profile>;
  if (!row.id || !row.display_name) return null;
  return {
    id: row.id,
    display_name: row.display_name,
    level: row.level ?? null,
    level_score: row.level_score ?? null,
    home_club_id: row.home_club_id ?? null,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at ?? null,
    gender: row.gender ?? null,
    playtomic_url: row.playtomic_url ?? null,
    search_radius_km: row.search_radius_km ?? 15,
    age_confirmed: Boolean(row.age_confirmed),
    terms_accepted_at: row.terms_accepted_at ?? null,
    whatsapp: row.whatsapp ?? null,
    whatsapp_share: Boolean(row.whatsapp_share),
    quiet_start: row.quiet_start ?? null,
    quiet_end: row.quiet_end ?? null,
    notif_prefs: row.notif_prefs ?? {},
    fantasy_opt_in: Boolean(row.fantasy_opt_in),
    is_admin: Boolean(row.is_admin),
    clubs: asStringList(row.clubs),
    first_name: asText(row.first_name),
    surname: asText(row.surname),
    phone: asText(row.phone),
    playtomic_screenshot_path: asText(row.playtomic_screenshot_path),
    preferred_genders: asGenders(row.preferred_genders),
    preferred_levels: asLevels(row.preferred_levels),
    onboarded_at: asText(row.onboarded_at),
  };
}

export async function getProfile() {
  const supabase = await createClient();
  const userId = await getUserId();
  if (!supabase || !userId) return null;
  const account = await supabase.rpc("my_account");
  const parsed = asProfile(account.data);
  if (parsed) return parsed;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, level, home_club_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return asProfile({ ...data, clubs: data.home_club_id ? [data.home_club_id] : [] });
}

export async function requireProfile() {
  const profile = await getProfile();
  if (!profile) return null;
  return profile;
}
