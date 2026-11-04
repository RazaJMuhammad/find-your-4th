"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { GameCard } from "@/components/GameCard";
import { ListSkeleton } from "@/components/GameSkeleton";
import { LinkPending } from "@/components/LinkPending";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { formatDistance, skillLabel } from "@/lib/format";
import { haversineKm } from "@/lib/geo";
import { GAME_SELECT, nearestClub, normalizeGame, spotsLeft } from "@/lib/games";
import type { Club, Game, Skill } from "@/lib/types";
import { CITY_KEY, readCitySnapshot, readCoordsSnapshot, saveCity, saveCoords, subscribeLocation } from "@/lib/location";
import { readFeedCache, writeFeedCache } from "@/lib/view-cache";

type WhenFilter = "any" | "today" | "tomorrow" | "week" | string;
type CourtFilter = "any" | "booked" | "needed";
type ModeFilter = "any" | "open" | "request";
type TimeFilter = "any" | "morning" | "afternoon" | "evening";

type DayChoice = { key: string; label: string };

const NO_DAYS: DayChoice[] = [];
const RADIUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 10, label: "10 km" },
  { value: 25, label: "25 km" },
  { value: 50, label: "50 km" },
  { value: null, label: "Any distance" },
];

let dayCacheKey = "";
let dayCache: DayChoice[] = NO_DAYS;

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function readDayChoices() {
  const now = new Date();
  const key = dayKey(now);
  if (dayCacheKey === key) return dayCache;
  dayCacheKey = key;
  dayCache = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index);
    if (index === 0) return { key: dayKey(date), label: "Today" };
    if (index === 1) return { key: dayKey(date), label: "Tomorrow" };
    const weekday = date.toLocaleDateString("en-ZA", { weekday: "short" }).replace(".", "");
    return { key: dayKey(date), label: `${weekday} ${date.getDate()}` };
  });
  return dayCache;
}

function subscribeDays() {
  return () => {};
}

function readDaysServer() {
  return NO_DAYS;
}

function matchesWhen(starts: Date, when: string, now: Date) {
  if (when === "any") return true;
  if (when === "week") {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return starts <= end;
  }
  if (when === "today" || when === "tomorrow") {
    const target = new Date(now);
    if (when === "tomorrow") target.setDate(now.getDate() + 1);
    return dayKey(starts) === dayKey(target);
  }
  return dayKey(starts) === when;
}

function matchesTime(starts: Date, ends: Date, time: TimeFilter) {
  if (time === "any") return true;
  if (ends.getTime() - starts.getTime() < 60_000) {
    const hour = starts.getHours();
    if (time === "morning") return hour < 12;
    if (time === "afternoon") return hour < 17;
    return hour >= 17;
  }
  const start = starts.getHours() + starts.getMinutes() / 60;
  let end = ends.getHours() + ends.getMinutes() / 60;
  if (ends.toDateString() !== starts.toDateString() || end <= start) end += 24;
  if (time === "morning") return start < 12 && end > 0;
  if (time === "afternoon") return start < 17 && end > 12;
  return start < 24 && end > 17;
}

function timeLabel(time: TimeFilter) {
  if (time === "morning") return "Morning";
  if (time === "afternoon") return "Afternoon";
  if (time === "evening") return "Evening";
  return "Any time";
}

function gameCount(count: number) {
  return count === 1 ? "1 game" : `${count} games`;
}

export function Feed() {
  const { userId, profile } = useAuth();
  const cached = readFeedCache();
  const [games, setGames] = useState<Game[]>(cached?.games ?? []);
  const [clubs, setClubs] = useState<Club[]>(cached?.clubs ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const storedCity = useSyncExternalStore(subscribeLocation, readCitySnapshot, () => null);
  const coords = useSyncExternalStore(subscribeLocation, readCoordsSnapshot, () => null);
  const days = useSyncExternalStore(subscribeDays, readDayChoices, readDaysServer);
  const [locStatus, setLocStatus] = useState<"loading" | "granted" | "denied">("loading");
  const [cityOverride, setCityOverride] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<"gps" | "city">("gps");
  const city = placeMode === "city" ? cityOverride ?? storedCity : null;
  const [radius, setRadius] = useState<number | null>(25);
  const [clubIds, setClubIds] = useState<string[]>([]);
  const [when, setWhen] = useState<WhenFilter>("any");
  const [court, setCourt] = useState<CourtFilter>("any");
  const [mode, setMode] = useState<ModeFilter>("any");
  const [skill, setSkill] = useState<Skill | "any">("any");
  const [time, setTime] = useState<TimeFilter>("any");
  const [showFull, setShowFull] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");

  useEffect(() => {
    const finishDenied = () => {
      setLocStatus("denied");
      setPlaceMode("city");
      setRadius(null);
      if (!localStorage.getItem(CITY_KEY)) setCityOpen(true);
    };
    if (!navigator.geolocation) {
      const timer = window.setTimeout(finishDenied, 0);
      return () => window.clearTimeout(timer);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocStatus("granted");
        setRadius(25);
      },
      () => finishDenied(),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    if (!filtersOpen && !cityOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        setCityOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [filtersOpen, cityOpen]);

  useEffect(() => {
    if (!userId || !coords) return;
    const supabase = createClient();
    void supabase.rpc("set_location", { p_lat: coords.lat, p_lng: coords.lng, p_city: city });
  }, [userId, coords, city]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    function load() {
      void Promise.all([
        supabase
          .from("games")
          .select(GAME_SELECT)
          .eq("status", "open")
          .gte("ends_at", new Date().toISOString())
          .order("starts_at", { ascending: true }),
        supabase.from("clubs").select("id, name, city, province, area, court_count, lat, lng").order("city"),
      ]).then(([gameResult, clubResult]) => {
        if (!active) return;
        if (gameResult.error) setError(gameResult.error.message);
        else setError(null);
        const nextGames = (gameResult.data ?? []).map((row) => normalizeGame(row as never));
        const nextClubs = (clubResult.data ?? []) as Club[];
        setGames(nextGames);
        setClubs(nextClubs);
        if (!gameResult.error) writeFeedCache({ games: nextGames, clubs: nextClubs });
        setLoading(false);
      });
    }

    load();
    const channel = supabase
      .channel("feed-games")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players" }, () => load())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const cities = useMemo(
    () => [...new Set(clubs.map((club) => club.city))].sort((a, b) => a.localeCompare(b)),
    [clubs],
  );

  const visible = useMemo(() => {
    const now = new Date();
    return games
      .map((game) => ({ game, near: nearestClub(game, coords) }))
      .filter(({ game, near }) => {
        if (!showFull && spotsLeft(game) === 0) return false;
        if (city && !game.clubs.some((club) => club.city === city)) return false;
        if (clubIds.length > 0 && !game.clubs.some((club) => clubIds.includes(club.id))) return false;
        if (court === "booked" && !game.court_booked) return false;
        if (court === "needed" && game.court_booked) return false;
        if (mode !== "any" && game.join_mode !== mode) return false;
        if (skill !== "any" && game.skill !== "any" && game.skill !== skill) return false;
        const starts = new Date(game.starts_at);
        const ends = new Date(game.ends_at);
        if (!matchesWhen(starts, when, now)) return false;
        if (!matchesTime(starts, ends, time)) return false;
        if (clubIds.length === 0 && placeMode === "gps" && coords && radius != null) {
          if (near.distance == null || near.distance > radius) return false;
        }
        if (placeMode === "gps" && !coords) return false;
        if (placeMode === "city" && !city) return false;
        return true;
      })
      .sort((a, b) => {
        if (coords && a.near.distance != null && b.near.distance != null && a.near.distance !== b.near.distance) {
          return a.near.distance - b.near.distance;
        }
        return new Date(a.game.starts_at).getTime() - new Date(b.game.starts_at).getTime();
      });
  }, [games, coords, city, radius, clubIds, court, mode, skill, time, when, showFull, placeMode]);

  const clubChoices = useMemo(() => {
    const needle = clubQuery.trim().toLowerCase();
    const limitToCity = placeMode === "city" && city;
    return clubs
      .filter((club) => {
        if (limitToCity && club.city !== city) return false;
        if (!needle) return true;
        return `${club.name} ${club.area ?? ""} ${club.city}`.toLowerCase().includes(needle);
      })
      .map((club) => ({
        club,
        distance:
          coords && club.lat != null && club.lng != null ? haversineKm(coords, { lat: club.lat, lng: club.lng }) : null,
      }))
      .sort((a, b) => {
        if (needle) return a.club.name.localeCompare(b.club.name);
        if (a.distance != null && b.distance != null && a.distance !== b.distance) return a.distance - b.distance;
        if (a.distance == null && b.distance != null) return 1;
        if (a.distance != null && b.distance == null) return -1;
        return a.club.name.localeCompare(b.club.name);
      });
  }, [clubs, clubQuery, city, placeMode, coords]);

  const clubRows = useMemo(() => {
    const selected = new Set(clubIds);
    const picked = clubChoices.filter((row) => selected.has(row.club.id));
    const rest = clubChoices.filter((row) => !selected.has(row.club.id));
    return [...picked, ...(clubQuery.trim() ? rest : rest.slice(0, 40))];
  }, [clubChoices, clubIds, clubQuery]);

  const dayChips: DayChoice[] =
    days.length > 0
      ? days
      : [
          { key: "today", label: "Today" },
          { key: "tomorrow", label: "Tomorrow" },
        ];

  const activeCount =
    (when !== "any" ? 1 : 0) +
    (time !== "any" ? 1 : 0) +
    (court !== "any" ? 1 : 0) +
    (mode !== "any" ? 1 : 0) +
    (skill !== "any" ? 1 : 0) +
    clubIds.length +
    (showFull ? 1 : 0);

  const applied = [
    when === "week" ? { key: "week", label: "Next 7 days", clear: () => setWhen("any") } : null,
    time !== "any" ? { key: "time", label: timeLabel(time), clear: () => setTime("any") } : null,
    court === "needed" ? { key: "needed", label: "Needs a court", clear: () => setCourt("any") } : null,
    mode === "request" ? { key: "request", label: "Host approves", clear: () => setMode("any") } : null,
    skill !== "any" ? { key: "skill", label: skillLabel(skill), clear: () => setSkill("any") } : null,
    ...clubIds.flatMap((id) => {
      const club = clubs.find((item) => item.id === id);
      if (!club) return [];
      return [
        {
          key: `club-${id}`,
          label: club.name,
          clear: () => setClubIds((current) => current.filter((item) => item !== id)),
        },
      ];
    }),
    showFull ? { key: "full", label: "Full games", clear: () => setShowFull(false) } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => Boolean(chip));

  const filteredCities = cities.filter((name) => name.toLowerCase().includes(cityQuery.trim().toLowerCase()));
  const place = city ? city : coords ? "Closest games first" : "Choose a city";
  const placeChip =
    placeMode === "city" && city ? city : placeMode === "gps" && coords ? (radius == null ? "Near me" : `Near me · ${radius} km`) : "City";
  const placeReady = Boolean((placeMode === "city" && city) || (placeMode === "gps" && coords));
  const showLabel = visible.length === 0 ? "No matching games" : `Show ${gameCount(visible.length)}`;

  function chooseCity(next: string) {
    setPlaceMode("city");
    setCityOverride(next);
    saveCity(next);
    setClubIds([]);
    setCityOpen(false);
    setCityQuery("");
  }

  function clearFilters() {
    setWhen("any");
    setTime("any");
    setCourt("any");
    setMode("any");
    setSkill("any");
    setClubIds([]);
    setShowFull(false);
    setClubQuery("");
  }

  function closeFilters() {
    setFiltersOpen(false);
    setClubQuery("");
  }

  function closeCity() {
    setCityOpen(false);
    setCityQuery("");
  }

  function whenIsOn(value: string) {
    if (when === value) return true;
    if (days[0] && value === days[0].key && when === "today") return true;
    if (days[1] && value === days[1].key && when === "tomorrow") return true;
    return false;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">{place}</p>
        <h1 className="font-semibold text-4xl leading-none tracking-tight">Open games</h1>
        <p className="mt-2 text-sm text-muted">
          {profile ? `Hey ${profile.first_name}. ` : ""}
          Four players, one court. Grab a spot or post the one you need.
        </p>
      </div>

      {locStatus === "denied" && !city ? (
        <button className="btn btn-primary w-full" type="button" onClick={() => setCityOpen(true)}>
          Choose your city
        </button>
      ) : null}

      <div className="-mx-4 flex items-center gap-2 pl-4">
        <button
          className="chip chip-pill"
          type="button"
          data-on={activeCount > 0}
          aria-label={activeCount > 0 ? `Filters, ${activeCount} applied` : "Filters"}
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersIcon />
          Filters
          {activeCount > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-xs font-bold text-accent">
              {activeCount}
            </span>
          ) : null}
        </button>
        <div className="scroll-row flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4">
          <button className="chip chip-pill" type="button" data-on={placeReady} onClick={() => setCityOpen(true)}>
            {placeChip}
          </button>
          {applied.map((chip) => (
            <button
              key={chip.key}
              className="chip chip-pill max-w-48"
              type="button"
              data-on="true"
              aria-label={`Remove ${chip.label} filter`}
              onClick={chip.clear}
            >
              <span className="min-w-0 truncate">{chip.label}</span>
              <DismissIcon />
            </button>
          ))}
          {dayChips.map((day) => {
            const on = whenIsOn(day.key);
            return (
              <button
                key={day.key}
                className="chip chip-pill"
                type="button"
                data-on={on}
                aria-pressed={on}
                onClick={() => setWhen(on ? "any" : day.key)}
              >
                {day.label}
              </button>
            );
          })}
          <button
            className="chip chip-pill"
            type="button"
            data-on={court === "booked"}
            aria-pressed={court === "booked"}
            onClick={() => setCourt(court === "booked" ? "any" : "booked")}
          >
            Court booked
          </button>
          <button
            className="chip chip-pill"
            type="button"
            data-on={mode === "open"}
            aria-pressed={mode === "open"}
            onClick={() => setMode(mode === "open" ? "any" : "open")}
          >
            Open join
          </button>
        </div>
      </div>

      {loading && games.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <span className="spinner" aria-hidden="true" />
          Updating games
        </p>
      ) : null}
      {!loading && visible.length > 0 ? <p className="text-sm text-muted">{gameCount(visible.length)}</p> : null}

      {loading && games.length === 0 ? <ListSkeleton label="Looking for games" /> : null}
      {error ? <p className="text-warn">{error}</p> : null}

      {!loading && visible.length === 0 ? (
        <div className="lift rounded-xl border border-line bg-card p-5">
          <p className="font-semibold text-2xl">No open games here yet.</p>
          <p className="mt-2 text-sm text-muted">Widen the area, or be the person who posts one.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/post" className="btn btn-primary">
              Post a game
            </Link>
            {activeCount > 0 ? (
              <button className="btn btn-secondary" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
            {placeMode === "gps" && radius != null ? (
              <button className="btn btn-secondary" type="button" onClick={() => setRadius(null)}>
                Anywhere
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {visible.map(({ game }) => (
          <li key={game.id}>
            <Link href={`/games/${game.id}`} className="lift relative block overflow-hidden rounded-xl border border-line bg-card p-4">
              <GameCard game={game} coords={coords} />
              <LinkPending label="Opening" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="pt-4 text-xs leading-5 text-muted">
        Club names from findapadelcourt.co.za. Coordinates from Padel Snipe (CC-BY 4.0) and OpenStreetMap.
      </p>

      {cityOpen ? (
        <Sheet title="Where" onClose={closeCity} footer={
          <button className="btn btn-primary w-full" type="button" onClick={closeCity}>
            Done
          </button>
        }>
          <div className="space-y-4">
            {coords ? (
              <div className="space-y-3">
                <button
                  type="button"
                  className={`flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left font-semibold ${placeMode === "gps" ? "bg-sunken text-accent" : ""}`}
                  onClick={() => {
                    if (placeMode === "gps") return;
                    setPlaceMode("gps");
                    setRadius((current) => current ?? 25);
                  }}
                >
                  Around me
                  {placeMode === "gps" ? <span className="text-sm font-semibold">Selected</span> : null}
                </button>
                {placeMode === "gps" ? (
                  <ChoiceGroup
                    label="Distance"
                    value={radius == null ? "any" : String(radius)}
                    options={RADIUS_OPTIONS.map((option) => ({
                      value: option.value == null ? "any" : String(option.value),
                      label: option.label,
                    }))}
                    onChange={(value) => setRadius(value === "any" ? null : Number(value))}
                  />
                ) : null}
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-semibold">{coords ? "Or a city" : "City"}</p>
              {cities.length > 6 ? (
                <input
                  className="field mb-2"
                  type="search"
                  enterKeyHint="search"
                  placeholder="Search cities"
                  value={cityQuery}
                  onChange={(event) => setCityQuery(event.target.value)}
                  aria-label="Search cities"
                />
              ) : null}
              <div className="max-h-[40dvh] space-y-1 overflow-y-auto">
                {clubs.length === 0 ? (
                  <div className="space-y-2" role="status" aria-label="Loading cities">
                    <div className="skeleton h-12 w-full" />
                    <div className="skeleton h-12 w-full" />
                    <div className="skeleton h-12 w-full" />
                  </div>
                ) : null}
                {clubs.length > 0 && filteredCities.length === 0 ? <p className="px-3 text-sm text-muted">No cities match.</p> : null}
                {filteredCities.map((name) => {
                  const selected = placeMode === "city" && city === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left ${selected ? "bg-sunken font-semibold text-accent" : "hover:bg-black/[0.04]"}`}
                      onClick={() => chooseCity(name)}
                    >
                      {name}
                      {selected ? <span className="text-sm font-semibold">Selected</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Sheet>
      ) : null}

      {filtersOpen ? (
        <Sheet
          title="Filters"
          onClose={closeFilters}
          footer={
            <div className="flex gap-2">
              <span className="sr-only" aria-live="polite">
                {visible.length === 1 ? "1 game matches" : `${visible.length} games match`}
              </span>
              <button className="btn btn-secondary" type="button" onClick={clearFilters} disabled={activeCount === 0}>
                Clear all
              </button>
              <button className="btn btn-primary min-w-0 flex-1" type="button" onClick={closeFilters}>
                {showLabel}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            <ChoiceGroup
              label="When"
              value={when}
              options={[
                { value: "any", label: "Any day" },
                ...dayChips.map((day) => ({ value: day.key, label: day.label })),
                { value: "week", label: "Next 7 days" },
              ]}
              isOn={(value) => (value === "any" ? when === "any" : value === "week" ? when === "week" : whenIsOn(value))}
              onChange={setWhen}
            />
            <div>
              <ChoiceGroup
                label="Time of day"
                value={time}
                options={[
                  { value: "any", label: "Any time" },
                  { value: "morning", label: "Morning" },
                  { value: "afternoon", label: "Afternoon" },
                  { value: "evening", label: "Evening" },
                ]}
                onChange={setTime}
              />
              <p className="mt-2 text-xs leading-5 text-muted">Morning is before 12:00. Afternoon is 12:00–17:00. Evening is after 17:00.</p>
            </div>
            <ChoiceGroup
              label="Court"
              value={court}
              options={[
                { value: "any", label: "Any" },
                { value: "booked", label: "Booked" },
                { value: "needed", label: "Needs a court" },
              ]}
              onChange={setCourt}
            />
            <ChoiceGroup
              label="Joining"
              value={mode}
              options={[
                { value: "any", label: "Anyone" },
                { value: "open", label: "Open join" },
                { value: "request", label: "Host approves" },
              ]}
              onChange={setMode}
            />
            <ChoiceGroup
              label="Level"
              value={skill}
              options={(["any", "beginner", "intermediate", "advanced"] as const).map((value) => ({
                value,
                label: skillLabel(value),
              }))}
              onChange={setSkill}
            />
            <div>
              <label className="block text-sm font-semibold" htmlFor="club-search">
                Clubs
              </label>
              <input
                id="club-search"
                className="field mt-2"
                type="search"
                enterKeyHint="search"
                placeholder={placeMode === "city" && city ? `Search clubs in ${city}` : "Search clubs"}
                value={clubQuery}
                onChange={(event) => setClubQuery(event.target.value)}
              />
              <p className="mt-2 text-xs text-muted">
                {clubQuery.trim()
                  ? clubChoices.length === 0
                    ? "No clubs match."
                    : `${clubChoices.length === 1 ? "1 club" : `${clubChoices.length} clubs`}`
                  : placeMode === "city" && city
                    ? `Clubs in ${city}.`
                    : "Nearest clubs. Search if you don't see yours."}{" "}
                You can pick more than one.
              </p>
              {clubChoices.length > 0 ? (
                <ul className="mt-1 max-h-56 overflow-y-auto">
                  {clubRows.map(({ club, distance }) => {
                    const selected = clubIds.includes(club.id);
                    const detail = [club.area, club.city, distance != null ? formatDistance(distance) : null].filter(Boolean).join(" · ");
                    return (
                      <li key={club.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${selected ? "bg-sunken" : "hover:bg-black/[0.04]"}`}
                          onClick={() =>
                            setClubIds((current) =>
                              selected ? current.filter((id) => id !== club.id) : [...current, club.id],
                            )
                          }
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{club.name}</span>
                            <span className="block truncate text-sm text-muted">{detail}</span>
                          </span>
                          {selected ? <span className="shrink-0 text-sm font-semibold text-accent">Selected</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
              <div>
                <p className="font-semibold">Include full games</p>
                <p className="text-sm text-muted">Games that are already full</p>
              </div>
              <button
                type="button"
                role="switch"
                className="switch"
                data-on={showFull}
                aria-checked={showFull}
                onClick={() => setShowFull((value) => !value)}
              >
                <span className="sr-only">Include full games</span>
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  isOn,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  isOn?: (value: T) => boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = isOn ? isOn(option.value) : option.value === value;
          return (
            <button key={option.value} className="chip chip-pill" type="button" data-on={on} aria-pressed={on} onClick={() => onChange(option.value)}>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="sheet-scrim fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-4">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
          <div className="mb-3 flex items-center justify-between">
            <h2 id={titleId} className="font-semibold text-2xl">
              {title}
            </h2>
            <button className="min-h-12 px-2 text-muted" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>
        ) : (
          <div className="shrink-0 pb-[max(12px,env(safe-area-inset-bottom))]" />
        )}
      </div>
    </div>
  );
}

function SlidersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 4h13M1.5 8h13M1.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="5.5" cy="4" r="1.7" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.7" fill="currentColor" />
      <circle cx="6.5" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg className="shrink-0" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
