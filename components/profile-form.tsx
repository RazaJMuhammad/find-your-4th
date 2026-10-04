"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { genderLabel, levelScoreLabel } from "@/config/copy";
import { GAME_PREFERENCES, LEVEL_SCORES, MAX_HOME_CLUBS, type GamePreference } from "@/lib/domain/rules";
import type { Club } from "@/lib/game-view";
import type { Profile } from "@/lib/session";
import { saveProfile } from "@/app/onboarding/actions";
import { createClient } from "@/lib/supabase/client";

const SCREENSHOT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const SCREENSHOT_LIMIT = 5 * 1024 * 1024;

export function ProfileForm({ profile, clubs, next }: { profile: Profile | null; clubs: Club[]; next?: string }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>(profile?.clubs ?? []);
  const [genders, setGenders] = useState<GamePreference[]>(profile?.preferred_genders ?? []);
  const [levels, setLevels] = useState<number[]>(profile?.preferred_levels ?? []);
  const [screenshot, setScreenshot] = useState(profile?.playtomic_screenshot_path ?? "");
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [formError, setFormError] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clubs
      .filter((club) => !needle || `${club.name} ${club.city}`.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [clubs, query]);

  useEffect(() => {
    if (!screenshot || !profile) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase.storage
      .from("playtomic-screenshots")
      .createSignedUrl(screenshot, 60 * 10)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setPreview(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [screenshot, profile]);

  function toggleClub(id: string) {
    setChosen((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_HOME_CLUBS) return current;
      return [...current, id];
    });
  }

  function toggleGender(value: GamePreference) {
    setGenders((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function toggleLevel(value: number) {
    setLevels((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort((a, b) => a - b)));
  }

  async function onScreenshot(file: File | undefined) {
    if (!file || !profile) return;
    setUploadError("");
    const extension = SCREENSHOT_TYPES[file.type];
    if (!extension) {
      setUploadError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > SCREENSHOT_LIMIT) {
      setUploadError("That image is larger than 5 MB.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setUploadError("Screenshot upload needs Supabase.");
      return;
    }
    setUploading(true);
    const path = `${profile.id.toLowerCase()}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("playtomic-screenshots").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      setUploadError(error.message);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setScreenshot(path);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (uploading) {
      event.preventDefault();
      return;
    }
    if (chosen.length < 1 || genders.length < 1 || levels.length < 1) {
      event.preventDefault();
      setFormError("Pick at least one club, one game type, and one level.");
      return;
    }
    setFormError("");
  }

  return (
    <form action={saveProfile} className="space-y-4" onSubmit={onSubmit}>
      <input type="hidden" name="next" value={next ?? "/"} />
      <input type="hidden" name="playtomic_screenshot_path" value={screenshot} />
      {chosen.map((id) => <input key={id} type="hidden" name="club_id" value={id} />)}
      {genders.map((value) => <input key={value} type="hidden" name="preferred_gender" value={value} />)}
      {levels.map((value) => <input key={value} type="hidden" name="preferred_level" value={value} />)}
      <label className="field">
        First name
        <input name="first_name" required maxLength={30} autoComplete="given-name" defaultValue={profile?.first_name ?? ""} />
      </label>
      <label className="field">
        Surname
        <input name="surname" required maxLength={30} autoComplete="family-name" defaultValue={profile?.surname ?? ""} />
      </label>
      <fieldset className="card space-y-3">
        <legend className="font-semibold">Clubs you prefer</legend>
        <input className="input w-full" placeholder="Search clubs" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="max-h-48 space-y-1 overflow-auto">
          {results.map((club) => (
            <label key={club.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={chosen.includes(club.id)} onChange={() => toggleClub(club.id)} />
              {club.name} · {club.city}
            </label>
          ))}
        </div>
        <p className="text-sm text-ink-soft">{chosen.length} of {MAX_HOME_CLUBS} clubs selected.</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Games you want to play</legend>
        <div className="flex flex-wrap gap-2">
          {GAME_PREFERENCES.map((value) => (
            <label key={value} className="choice">
              <input className="sr-only" type="checkbox" checked={genders.includes(value)} onChange={() => toggleGender(value)} />
              {genderLabel[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Difficulty you want to play</legend>
        <div className="flex flex-wrap gap-2">
          {LEVEL_SCORES.map((score) => (
            <label key={score} className="choice">
              <input className="sr-only" type="checkbox" checked={levels.includes(score)} onChange={() => toggleLevel(score)} />
              {levelScoreLabel[score]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        Phone number
        <input name="phone" type="tel" required autoComplete="tel" defaultValue={profile?.phone ?? ""} placeholder="27..." />
      </label>
      <label className="field">
        Playtomic profile screenshot, optional
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onScreenshot(event.target.files?.[0])} />
      </label>
      {preview ? <img src={preview} alt="Playtomic profile screenshot" className="max-h-48 rounded-card object-contain" /> : null}
      {uploading ? <p className="text-sm text-ink-soft">Uploading screenshot...</p> : null}
      {uploadError ? <p className="text-sm text-danger">{uploadError}</p> : null}
      {formError ? <p className="text-sm text-danger">{formError}</p> : null}
      <label className="flex items-center gap-2 text-sm">
        <input name="age_confirmed" type="checkbox" required defaultChecked={profile?.age_confirmed} />
        I am 18 or older
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="accept_terms" type="checkbox" required defaultChecked={Boolean(profile?.terms_accepted_at)} />
        I accept the <Link href="/legal/terms">terms</Link>
      </label>
      <button className="btn" type="submit" disabled={uploading}>Save details</button>
    </form>
  );
}
