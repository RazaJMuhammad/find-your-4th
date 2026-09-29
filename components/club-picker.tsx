"use client";

import { useMemo, useState } from "react";
import { courtStatusLabel } from "@/config/copy";
import type { CourtStatus } from "@/lib/domain/rules";
import { clubLabel, type Club } from "@/lib/game-view";

export function ClubPicker({ clubs, multiple: forcedMultiple }: { clubs: Club[]; multiple?: boolean }) {
  const [status, setStatus] = useState<CourtStatus>("not_booked");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const multiple = forcedMultiple ?? status !== "booked";

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clubs.filter((club) => {
      if (!needle) return true;
      return `${club.name} ${club.suburb ?? ""} ${club.city} ${club.province}`.toLowerCase().includes(needle);
    }).slice(0, 40);
  }, [clubs, query]);

  function toggle(id: string) {
    setSelected((current) => {
      if (!multiple) return current[0] === id ? [] : [id];
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  function changeStatus(next: CourtStatus) {
    setStatus(next);
    if (next === "booked") setSelected((current) => current.slice(0, 1));
  }

  const chosen = clubs.filter((club) => selected.includes(club.id));

  return (
    <fieldset className="card space-y-4">
      <legend className="font-semibold">{forcedMultiple == null ? "Court" : "Clubs"}</legend>
      {forcedMultiple == null ? (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(courtStatusLabel) as CourtStatus[]).map((item) => (
            <label key={item} className="choice">
              <input className="sr-only" type="radio" name="court_status" value={item} checked={status === item} onChange={() => changeStatus(item)} />
              {courtStatusLabel[item]}
            </label>
          ))}
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        {forcedMultiple == null
          ? multiple
            ? "The court is not booked yet, so you can name every club you would play at."
            : "The court is booked, so pick the one club."
          : multiple
            ? "Pick 1 to 3 clubs you would play at."
            : "Pick the one club where the court is held."}
      </p>
      <input className="input w-full" placeholder="Search clubs" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="max-h-64 space-y-1 overflow-auto">
        {results.map((club) => {
          const checked = selected.includes(club.id);
          return (
            <label key={club.id} className="flex cursor-pointer items-start gap-2 rounded-button px-2 py-1 hover:bg-surface">
              <input type={multiple ? "checkbox" : "radio"} name="club_choice" checked={checked} onChange={() => toggle(club.id)} />
              <span>
                <span className="block text-sm font-medium">{club.name}</span>
                <span className="block text-xs text-ink-soft">{club.suburb ? `${club.suburb}, ` : ""}{club.city} · {club.province}</span>
              </span>
            </label>
          );
        })}
      </div>
      {chosen.map((club) => (
        <input key={club.id} type="hidden" name="club_id" value={club.id} />
      ))}
      {chosen.length > 0 ? (
        <p className="text-sm">{chosen.map((club) => clubLabel(club)).join("  ·  ")}</p>
      ) : (
        <p className="text-sm text-ink-soft">No club selected yet.</p>
      )}
    </fieldset>
  );
}
