"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Busy } from "@/components/Busy";
import { ListSkeleton } from "@/components/GameSkeleton";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/format";
import { SKILLS, SKILL_LABEL, type Club, type JoinMode, type Skill } from "@/lib/types";

function defaultWhen() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function PostForm() {
  const router = useRouter();
  const { ready, userId, profile } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Club[]>([]);
  const [when, setWhen] = useState(defaultWhen);
  const [spots, setSpots] = useState(1);
  const [courtBooked, setCourtBooked] = useState(false);
  const [trimmed, setTrimmed] = useState(false);
  const [joinMode, setJoinMode] = useState<JoinMode>("open");
  const [skill, setSkill] = useState<Skill>("any");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("clubs")
      .select("id, name, city, province, area, court_count, lat, lng")
      .order("name")
      .then(({ data }) => setClubs((data ?? []) as Club[]));
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return clubs
      .filter((club) => !selected.some((item) => item.id === club.id))
      .filter((club) => `${club.name} ${club.area ?? ""} ${club.city}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [clubs, query, selected]);

  function chooseCourt(booked: boolean) {
    setCourtBooked(booked);
    if (booked && selected.length > 1) {
      setSelected((current) => current.slice(0, 1));
      setTrimmed(true);
      return;
    }
    setTrimmed(false);
  }

  function pickClub(club: Club) {
    setSelected((current) => (courtBooked ? [club] : [...current, club]));
    setTrimmed(false);
    setQuery("");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!selected.length) {
      setError(courtBooked ? "Pick the club where the court is booked." : "Pick at least one club.");
      return;
    }
    if (courtBooked && selected.length !== 1) {
      setError("A booked court is at one club.");
      return;
    }
    const starts = new Date(`${when.date}T${when.time}`);
    if (Number.isNaN(starts.getTime()) || starts.getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { data, error: createError } = await supabase.rpc("create_game", {
      p_starts_at: starts.toISOString(),
      p_spots_needed: spots,
      p_court_booked: courtBooked,
      p_join_mode: joinMode,
      p_skill: skill,
      p_note: note,
      p_club_ids: selected.map((club) => club.id),
    });
    if (createError) {
      setPending(false);
      setError(errorMessage(createError));
      return;
    }
    const id = (data as { id?: string } | null)?.id;
    router.push(id ? `/games/${id}` : "/me");
  }

  if (!ready) return <ListSkeleton label="Loading" />;
  if (!userId) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl tracking-tight">Post a game</h1>
        <p className="text-muted">Create a free account first. It takes about a minute.</p>
        <Link href="/signup?next=/post" className="btn btn-primary w-full">
          Create account
        </Link>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl tracking-tight">Finish your profile</h1>
        <p className="text-muted">We need a name and WhatsApp number before you can post.</p>
        <Link href="/signup?next=/post" className="btn btn-primary w-full">
          Add your details
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8 pb-8">
      <div>
        <h1 className="font-semibold text-4xl tracking-tight">Post a game</h1>
        <p className="mt-2 text-sm text-muted">Say when, where, and how many players you still need.</p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">When</h2>
          <p className="mt-1 text-sm text-muted">The day and time you want to play.</p>
        </div>
        <label className="block text-sm font-semibold">
          Date
          <input className="field mt-2" type="date" required value={when.date} onChange={(event) => setWhen({ ...when, date: event.target.value })} />
        </label>
        <label className="block text-sm font-semibold">
          Start time
          <input className="field mt-2" type="time" required value={when.time} onChange={(event) => setWhen({ ...when, time: event.target.value })} />
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Court</h2>
          <p className="mt-1 text-sm text-muted">A booked court is at one club. If you still need one, you can list several.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" className="chip min-h-12" data-on={courtBooked} aria-pressed={courtBooked} onClick={() => chooseCourt(true)}>
            Court already booked
          </button>
          <button type="button" className="chip min-h-12" data-on={!courtBooked} aria-pressed={!courtBooked} onClick={() => chooseCourt(false)}>
            Still need a court
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">{courtBooked ? "Club where the court is booked" : "Clubs you can play at"}</h2>
          <p className="mt-1 text-sm text-muted">
            {courtBooked ? "One club. This is where you booked." : "You can pick more than one. Players see all of them."}
          </p>
        </div>
        <input
          className="field"
          placeholder="Search club or suburb"
          value={query}
          aria-label="Search clubs"
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-line bg-card">
            {results.map((club) => (
              <li key={club.id}>
                <button type="button" className="flex min-h-12 w-full items-center px-3 text-left hover:bg-black/[0.04]" onClick={() => pickClub(club)}>
                  <span>
                    {club.name}
                    <span className="block text-xs text-muted">
                      {club.area ? `${club.area} · ` : ""}
                      {club.city}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {trimmed ? <p className="text-sm text-muted">A booked court is at one club. The others were cleared.</p> : null}
        <div className="flex flex-wrap gap-2">
          {selected.map((club) => (
            <button
              key={club.id}
              type="button"
              className="chip"
              data-on="true"
              onClick={() => setSelected((current) => current.filter((item) => item.id !== club.id))}
            >
              {club.name}
              <span className="font-normal">Remove</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Players needed</h2>
          <p className="mt-1 text-sm text-muted">You are already playing. This is how many more people you need.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {[1, 2, 3].map((value) => (
            <button key={value} type="button" className="chip min-h-12" data-on={spots === value} aria-pressed={spots === value} onClick={() => setSpots(value)}>
              Need {value}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Who can join</h2>
          <p className="mt-1 text-sm text-muted">Open games fill themselves. Approval waits for you.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" className="chip min-h-12" data-on={joinMode === "open"} aria-pressed={joinMode === "open"} onClick={() => setJoinMode("open")}>
            Anyone can join
          </button>
          <button type="button" className="chip min-h-12" data-on={joinMode === "request"} aria-pressed={joinMode === "request"} onClick={() => setJoinMode("request")}>
            I approve first
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Match level</h2>
          <p className="mt-1 text-sm text-muted">Who the game is for. Separate from your Playtomic level.</p>
        </div>
        <label className="block text-sm font-semibold">
          Level
          <select className="field mt-2" value={skill} onChange={(event) => setSkill(event.target.value as Skill)}>
            {SKILLS.map((value) => (
              <option key={value} value={value}>
                {SKILL_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Note</h2>
          <p className="mt-1 text-sm text-muted">Optional. Cost split, rackets, or anything else players should know.</p>
        </div>
        <textarea className="field" maxLength={280} placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
        <p className="text-sm text-muted">{280 - note.length} characters left</p>
      </section>

      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <button className="btn btn-primary w-full" type="submit" disabled={pending} aria-busy={pending}>
        <Busy on={pending} wait="Posting…">Post game</Busy>
      </button>
    </form>
  );
}
