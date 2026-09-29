import Link from "next/link";
import { Suspense } from "react";
import { courtStatusLabel, gameTypeLabel, genderLabel, levelLabel, levelScoreLabel } from "@/config/copy";
import { saveCurrentSearch } from "@/app/games/actions";
import { FeedMemory } from "@/components/feed-memory";
import { Notice, SetupNotice } from "@/components/shell";
import { OpenChip, Spots } from "@/components/spots";
import { COURT_STATUSES, GENDER_LABELS, isUrgent, LEVELS } from "@/lib/domain/rules";
import { formatWhen, formatZar } from "@/lib/format";
import { snapshotClubs } from "@/lib/clubs-snapshot";
import { clubLabel, filledSpots, loadClubs, loadFeed, matchesFeed, openSpots, visibleClubs } from "@/lib/games";
import { getProfile } from "@/lib/session";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const profile = await getProfile();
  const connected = await loadFeed();
  const clubs = (await loadClubs()) ?? snapshotClubs();
  const cities = [...new Set(clubs.map((club) => club.city))].sort();
  const matches = connected
    ? matchesFeed(connected, {
        club: "club" in params ? params.club || undefined : profile?.home_club_id || undefined,
        city: params.city,
        level: params.level,
        court: params.court,
        on: params.on,
        full: params.full === "on",
        gender: params.gender,
        mode: params.mode,
        time: params.time,
        best: params.best === "on",
        viewerLevel: profile?.level,
        viewerScore: profile?.level_score,
        viewerClubs: profile?.clubs,
      })
    : null;

  return (
    <div className="space-y-6">
      <Suspense>
        <FeedMemory />
      </Suspense>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Open games</h1>
        <p className="mt-1 text-ink-soft">Soonest first. Find the players, then book the court somewhere else.</p>
      </div>
      {params.error ? <Notice>{params.error}</Notice> : null}
      {params.saved ? <Notice>Saved. We will alert you when a game matches, up to 5 searches.</Notice> : null}
      {connected === null ? <SetupNotice /> : null}
      <form className="grid gap-3 sm:grid-cols-2" action="/">
        <label className="field">City
          <select name="city" defaultValue={params.city ?? ""}>
            <option value="">Any city</option>
            {cities.map((city) => <option key={city}>{city}</option>)}
          </select>
        </label>
        <label className="field">Club
          <select name="club" defaultValue={params.club ?? profile?.home_club_id ?? ""}>
            <option value="">Any club</option>
            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
          </select>
        </label>
        <label className="field">Level
          <select name="level" defaultValue={params.level ?? ""}>
            <option value="">Around my level</option>
            <option value="all">All levels</option>
            {LEVELS.map((level) => <option key={level} value={level}>{levelLabel[level]}</option>)}
          </select>
        </label>
        <label className="field">Date
          <input name="on" type="date" defaultValue={params.on ?? ""} />
        </label>
        <label className="field">Time of day
          <select name="time" defaultValue={params.time ?? ""}>
            <option value="">Any time</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </label>
        <label className="field">Who
          <select name="gender" defaultValue={params.gender ?? ""}>
            <option value="">Any</option>
            {GENDER_LABELS.map((label) => <option key={label} value={label}>{genderLabel[label]}</option>)}
          </select>
        </label>
        <label className="field">Mode
          <select name="mode" defaultValue={params.mode ?? ""}>
            <option value="">Any</option>
            <option value="court">Court already held</option>
            <option value="proposal">Proposal</option>
          </select>
        </label>
        <label className="field">Court
          <select name="court" defaultValue={params.court ?? ""}>
            <option value="">Any</option>
            {COURT_STATUSES.map((status) => <option key={status} value={status}>{courtStatusLabel[status]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="full" type="checkbox" defaultChecked={params.full === "on"} />
          Include full games
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="best" type="checkbox" defaultChecked={params.best === "on"} />
          Best for you
        </label>
        <button className="btn" type="submit">Filter</button>
        <button className="btn btn-quiet" type="submit" formAction={saveCurrentSearch}>Alert me</button>
        <Link className="text-sm text-ink-soft" href="/?fresh=1">Reset</Link>
      </form>
      {matches ? <FeedList matches={matches} signedIn={Boolean(profile)} /> : null}
    </div>
  );
}

function FeedList({ matches, signedIn }: { matches: NonNullable<Awaited<ReturnType<typeof loadFeed>>>; signedIn: boolean }) {
  if (matches.length === 0) {
    return (
      <div className="card space-y-3">
        <p>No games match.</p>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href={signedIn ? "/games/new" : "/login?next=/games/new"}>Post your own</Link>
          <span className="self-center text-sm text-ink-soft">or use Alert me to save this search</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const spots = openSpots(match);
        const urgent = isUrgent(new Date(match.starts_at));
        return (
          <Link key={match.id} href={`/games/${match.id}`} className="card block space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2>{formatWhen(match.starts_at)}</h2>
              <OpenChip open={spots} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {urgent ? <span className="chip chip-last">Urgent</span> : null}
              {match.mode === "proposal" ? <span className="chip chip-quiet">Proposal</span> : null}
              {match.first_timer ? <span className="chip chip-quiet">First-timer friendly</span> : null}
              {match.racket_available ? <span className="chip chip-quiet">Racket available</span> : null}
            </div>
            <p className="text-sm text-ink-soft">
              {match.level_min != null && match.level_max != null
                ? `${levelScoreLabel[match.level_min]} – ${levelScoreLabel[match.level_max]}`
                : levelLabel[match.level]}
              {" · "}{gameTypeLabel[match.game_type]} · {courtStatusLabel[match.court_status]} · {genderLabel[match.gender_label]}
            </p>
            <p className="text-sm"><span className="mono">{filledSpots(match)}/4</span> confirmed{match.cost_cents != null ? <> · <span className="mono">{formatZar(match.cost_cents)}</span></> : null}</p>
            <p className="text-sm">{visibleClubs(match).map((item) => clubLabel(item.club)).join(" · ")}</p>
            <Spots slots={match.match_slots} />
          </Link>
        );
      })}
    </div>
  );
}
