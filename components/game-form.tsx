"use client";

import { useState } from "react";
import { genderLabel, levelScoreLabel } from "@/config/copy";
import { GENDER_LABELS, LEVEL_SCORES, type PostMode } from "@/lib/domain/rules";
import type { Club } from "@/lib/game-view";
import { postGame } from "@/app/games/actions";
import { ClubPicker } from "@/components/club-picker";

export function GameForm({
  clubs,
  reinviteFrom,
}: {
  clubs: Club[];
  reinviteFrom?: string;
}) {
  const [mode, setMode] = useState<PostMode>("court");
  const [openSpots, setOpenSpots] = useState(2);
  const guests = 3 - openSpots;
  return (
    <form action={postGame} className="space-y-4">
      {reinviteFrom ? <input type="hidden" name="reinvite_from" value={reinviteFrom} /> : null}
      <div className="flex gap-2">
        {(["court", "proposal"] as const).map((item) => (
          <label key={item} className="choice">
            <input className="sr-only" type="radio" name="mode" value={item} checked={mode === item} onChange={() => setMode(item)} />
            {item === "court" ? "I have a court" : "Propose a game"}
          </label>
        ))}
      </div>
      <label className="field">
        {mode === "court" ? "Start" : "Window starts"}
        <input name="starts_at" type="datetime-local" required />
      </label>
      {mode === "proposal" ? (
        <label className="field">
          Window ends
          <input name="ends_at" type="datetime-local" required />
          <span className="text-xs text-ink-soft">At least 2 hours after the start.</span>
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">Duration
          <select name="duration_minutes" defaultValue="90">
            <option value="60">60 min</option>
            <option value="90">90 min</option>
            <option value="120">120 min</option>
          </select>
        </label>
        <label className="field">Open spots
          <select name="open_spots" value={openSpots} onChange={(event) => setOpenSpots(Number(event.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="field">Level from
          <select name="level_min" defaultValue="3">
            {LEVEL_SCORES.map((score) => <option key={score} value={score}>{levelScoreLabel[score]}</option>)}
          </select>
        </label>
        <label className="field">Level to
          <select name="level_max" defaultValue="5">
            {LEVEL_SCORES.map((score) => <option key={score} value={score}>{levelScoreLabel[score]}</option>)}
          </select>
        </label>
        <label className="field">Who it is for
          <select name="gender" defaultValue="open">
            {GENDER_LABELS.map((label) => <option key={label} value={label}>{genderLabel[label]}</option>)}
          </select>
        </label>
        <label className="field">Join mode
          <select name="join_mode" defaultValue="instant">
            <option value="instant">Instant when one spot is in range</option>
            <option value="request">Always ask me first</option>
          </select>
        </label>
      </div>
      {guests > 0 ? (
        <label className="field">Guest 1 first name
          <input name="guest_1" required maxLength={40} />
        </label>
      ) : null}
      {guests > 1 ? (
        <label className="field">Guest 2 first name
          <input name="guest_2" required maxLength={40} />
        </label>
      ) : null}
      {mode === "court" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">Court number
            <input name="court_number" maxLength={20} />
          </label>
          <label className="field">Estimated cost, R
            <input name="cost" inputMode="decimal" placeholder="0.00" />
          </label>
          <label className="field sm:col-span-2">Booking link, optional
            <input name="booking_url" type="url" placeholder="https://" />
          </label>
        </div>
      ) : (
        <label className="field">Estimated cost per person, R
          <input name="cost" inputMode="decimal" placeholder="0.00" />
        </label>
      )}
      <label className="field">Fill deadline
        <input name="fill_deadline" type="datetime-local" />
        <span className="text-xs text-ink-soft">Leave blank for 4 hours before the start. This is the “keep or release the court?” prompt.</span>
      </label>
      <ClubPicker clubs={clubs} multiple={mode === "proposal"} />
      <label className="flex items-center gap-2 text-sm">
        <input name="first_timer" type="checkbox" /> First-timer friendly
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="racket_available" type="checkbox" /> Spare racket available
      </label>
      <label className="field">
        Note
        <textarea name="note" rows={3} maxLength={500} placeholder="Social game, bring water..." />
      </label>
      {reinviteFrom ? <p className="text-sm text-ink-soft">The previous group will be invited.</p> : null}
      <button className="btn" type="submit">Post game</button>
    </form>
  );
}
