"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { genderChoiceLabel, levelScoreLabel } from "@/config/copy";
import { LEVEL_SCORES } from "@/lib/domain/rules";
import type { Club } from "@/lib/game-view";
import type { Profile } from "@/lib/session";
import { saveProfile } from "@/app/onboarding/actions";
import { createClient } from "@/lib/supabase/client";

const categories = [
  ["matches", "Games and changes"],
  ["requests", "Join requests"],
  ["booking", "Booking"],
  ["reminders", "Reminders"],
  ["ratings", "Ratings"],
] as const;

export function ProfileForm({ profile, clubs, next }: { profile: Profile | null; clubs: Club[]; next?: string }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>(profile?.clubs ?? []);
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? "");
  const [uploadError, setUploadError] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clubs
      .filter((club) => !needle || `${club.name} ${club.city}`.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [clubs, query]);

  function toggle(id: string) {
    setChosen((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !profile) return;
    setUploadError("");
    const supabase = createClient();
    if (!supabase) {
      setUploadError("Photo upload needs Supabase.");
      return;
    }
    const path = `${profile.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, "")}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file);
    if (error) {
      setUploadError(error.message);
      return;
    }
    setAvatar(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
  }

  return (
    <form action={saveProfile} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <input type="hidden" name="avatar_url" value={avatar} />
      {chosen.map((id) => <input key={id} type="hidden" name="club_id" value={id} />)}
      <label className="field">
        Name
        <input name="display_name" required maxLength={40} defaultValue={profile?.display_name ?? ""} />
      </label>
      <label className="field">
        Photo
        <input type="file" accept="image/*" onChange={(event) => void onPhoto(event.target.files?.[0])} />
      </label>
      {avatar ? <img src={avatar} alt="" className="h-16 w-16 rounded-avatar object-cover" /> : null}
      {uploadError ? <p className="text-sm text-danger">{uploadError}</p> : null}
      <label className="field">
        Level, self-declared
        <select name="level_score" defaultValue={String(profile?.level_score ?? 4)} required>
          {LEVEL_SCORES.map((score) => <option key={score} value={score}>{levelScoreLabel[score]}</option>)}
        </select>
      </label>
      <label className="field">
        Gender, used only to check who can join
        <select name="gender" defaultValue={profile?.gender ?? "unspecified"}>
          {Object.entries(genderChoiceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">
        Playtomic profile, optional
        <input name="playtomic_url" type="url" defaultValue={profile?.playtomic_url ?? ""} placeholder="https://" />
      </label>
      <fieldset className="card space-y-3">
        <legend className="font-semibold">Home clubs, up to 3</legend>
        <input className="input w-full" placeholder="Search clubs" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-48 space-y-1 overflow-auto">
          {results.map((club) => (
            <label key={club.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={chosen.includes(club.id)} onChange={() => toggle(club.id)} />
              {club.name} · {club.city}
            </label>
          ))}
        </div>
        <p className="text-sm text-ink-soft">{chosen.length} selected</p>
      </fieldset>
      <label className="field">
        Search radius, km
        <input name="search_radius_km" type="number" min={1} max={80} defaultValue={profile?.search_radius_km ?? 15} />
      </label>
      <label className="field">
        WhatsApp, optional
        <input name="whatsapp" defaultValue={profile?.whatsapp ?? ""} placeholder="27..." />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="whatsapp_share" type="checkbox" defaultChecked={profile?.whatsapp_share} />
        Share my WhatsApp with confirmed players
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">Quiet from
          <input name="quiet_start" type="time" defaultValue={profile?.quiet_start?.slice(0, 5) ?? ""} />
        </label>
        <label className="field">Quiet until
          <input name="quiet_end" type="time" defaultValue={profile?.quiet_end?.slice(0, 5) ?? ""} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Notifications</legend>
        {categories.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input name={`pref_${key}`} type="checkbox" defaultChecked={profile?.notif_prefs?.[key] !== "false"} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input name="fantasy_opt_in" type="checkbox" defaultChecked={profile?.fantasy_opt_in} />
        Show a Fantasy Padel link. Off unless you turn it on.
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="age_confirmed" type="checkbox" required defaultChecked={profile?.age_confirmed} />
        I am 18 or older
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="accept_terms" type="checkbox" required defaultChecked={Boolean(profile?.terms_accepted_at)} />
        I accept the <Link href="/legal/terms">terms</Link>
      </label>
      <button className="btn" type="submit">Save profile</button>
    </form>
  );
}
