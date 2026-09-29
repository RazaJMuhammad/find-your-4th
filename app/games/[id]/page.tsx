import Link from "next/link";
import { notFound } from "next/navigation";
import { courtStatusLabel, gameTypeLabel, genderLabel, levelLabel, levelScoreLabel, notificationCopy, whatsAppGameText } from "@/config/copy";
import {
  acceptOffer,
  blockPlayer,
  cancelMatch,
  claimBooker,
  completeMatch,
  confirmAttendance,
  confirmClub,
  confirmPlayed,
  editGame,
  joinMatch,
  leaveMatch,
  markBooked,
  markNoShow,
  rebroadcast,
  removePlayer,
  reportPlayer,
  reviewRequest,
  saveLogistics,
  sendMessage,
  submitFeedback,
  submitRating,
  waitlistMatch,
} from "@/app/games/actions";
import { CopyLink, CopyText, LiveMatch } from "@/components/live-match";
import { PushToggle } from "@/components/push-toggle";
import { Notice } from "@/components/shell";
import { OpenChip, Spots } from "@/components/spots";
import { isUrgent, withinLevel } from "@/lib/domain/rules";
import { formatWhen, formatZar, percent } from "@/lib/format";
import { snapshotClubs } from "@/lib/clubs-snapshot";
import { clubLabel, filledSpots, loadClubs, loadLogistics, loadMatch, loadReliability, loadRows, loadWaitlist, openSpots, visibleClubs } from "@/lib/games";
import { getProfile } from "@/lib/session";
import { reliabilitySummary } from "@/lib/domain/rules";
import { createClient } from "@/lib/supabase/server";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; joined?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const match = await loadMatch(id);
  if (!match) {
    const supabase = await createClient();
    if (!supabase) {
      return <p>This game opens once Supabase is connected. The link is /games/{id}.</p>;
    }
    notFound();
  }

  const profile = await getProfile();
  const logistics = await loadLogistics(id);
  const waitlist = await loadWaitlist(id);
  const mine = match.match_slots.find((slot) => slot.player_id === profile?.id && (slot.status === "joined" || slot.status === "confirmed"));
  const isHost = profile?.id === match.host_id;
  const outside = Boolean(profile?.level && !withinLevel(profile.level, match.level));
  const clubs = visibleClubs(match);
  const directory = (await loadClubs()) ?? snapshotClubs();
  const played = match.status === "completed";
  const requests = isHost
    ? await loadRows<{ id: string; note: string | null; status: string; player_id: string }>("join_requests", id, "id, note, status, player_id")
    : [];
  const messages = mine || isHost
    ? await loadRows<{ id: string; body: string; created_at: string; author_id: string }>("match_messages", id, "id, body, created_at, author_id")
    : [];
  const events = await loadRows<{ id: string; kind: string; body: string; created_at: string }>("game_events", id, "id, kind, body, created_at");
  const offers = profile
    ? (await loadRows<{ id: string; player_id: string; status: string; expires_at: string }>("waitlist_offers", id, "id, player_id, status, expires_at")).filter((offer) => offer.player_id === profile.id && offer.status === "open")
    : [];
  const sharePath = match.share_token ? `/g/${match.share_token}${profile ? `?from=${profile.id}` : ""}` : `/games/${id}`;
  const started = new Date(match.starts_at).getTime() < Date.now();
  const contactClient = mine || isHost ? await createClient() : null;
  const contactResult = contactClient ? await contactClient.rpc("confirmed_contacts", { p_match: id }) : { data: [] };
  const contacts = (contactResult.data ?? []) as { player_id: string; display_name: string; whatsapp: string }[];

  return (
    <div className="space-y-6">
      <LiveMatch matchId={id} />
      {query.error ? <Notice>{query.error}</Notice> : null}
      {query.joined === "requested" ? <Notice>Request sent. The host will see your card.</Notice> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{formatWhen(match.starts_at)}</h1>
          <p className="mt-1 text-ink-soft">
            {match.level_min != null && match.level_max != null ? `${levelScoreLabel[match.level_min]} – ${levelScoreLabel[match.level_max]}` : levelLabel[match.level]}
            {" · "}{match.mode === "proposal" ? "Proposal" : "Court held"} · {courtStatusLabel[match.court_status]} · {genderLabel[match.gender_label]}
          </p>
          <p className="mt-1 text-sm text-ink-soft">Hosted by {match.host?.display_name ?? "a player"} · <span className="mono">{filledSpots(match)}/4</span> confirmed{match.cost_cents != null ? <> · <span className="mono">{formatZar(match.cost_cents)}</span></> : null}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {isUrgent(new Date(match.starts_at)) ? <span className="chip chip-last">Urgent</span> : null}
            {match.first_timer ? <span className="chip chip-quiet">First-timer friendly</span> : null}
            {match.racket_available ? <span className="chip chip-quiet">Racket available</span> : null}
            {match.court_number ? <span className="chip chip-quiet">Court <span className="mono">{match.court_number}</span></span> : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <CopyLink path={sharePath} />
          <CopyText label="Copy WhatsApp message" text={whatsAppGameText({
            when: formatWhen(match.starts_at),
            where: clubs.map((item) => item.club.name).join(", ") || "Club to be chosen",
            spots: openSpots(match),
            url: sharePath,
          })} />
        </div>
      </div>
      <Spots slots={match.match_slots} />
      <div className="flex flex-wrap items-center gap-2">
        <OpenChip open={openSpots(match)} celebrate />
        {match.status === "full" ? <span className="text-sm text-ink-soft">Waitlist is open</span> : null}
      </div>
      <ul className="space-y-1 text-sm">
        {clubs.map((item) => (
          <li key={item.club.id}>
            {clubLabel(item.club)}
            {item.is_confirmed ? " · booked" : ""}
            {item.club.booking_platform ? ` · ${item.club.booking_platform}` : ""}
          </li>
        ))}
      </ul>
      {match.note ? <p className="card text-sm">{match.note}</p> : null}
      {logistics ? <p className="card text-sm"><span className="font-semibold">Logistics. </span>{logistics}</p> : null}

      {!profile ? <Link className="btn" href={`/login?next=/games/${id}`}>Sign in to join</Link> : null}
      {profile && !profile.level ? <Link className="btn" href={`/onboarding?next=/games/${id}`}>Finish your profile to join</Link> : null}

      {profile && profile.level && !mine && match.status === "open" ? (
        <form action={joinMatch} className="space-y-2">
          <input type="hidden" name="match_id" value={id} />
          {outside ? (
            <label className="flex items-center gap-2 text-sm">
              <input name="ack" type="checkbox" required />
              This is outside your level. Request anyway.
            </label>
          ) : null}
          <label className="field">Note for the host, if they need to approve
            <input name="note" maxLength={280} />
          </label>
          <button className="btn" type="submit">{match.join_mode === "request" || openSpots(match) >= 2 || outside ? "Request to join" : "Join"}</button>
        </form>
      ) : null}

      {profile && !mine && match.status === "full" ? (
        <form action={waitlistMatch}>
          <input type="hidden" name="match_id" value={id} />
          <button className="btn" type="submit">Join the waitlist</button>
        </form>
      ) : null}

      {mine && mine.status === "joined" ? (
        <form action={confirmAttendance}>
          <input type="hidden" name="match_id" value={id} />
          <button className="btn" type="submit">I will be there</button>
        </form>
      ) : null}

      {offers.map((offer) => (
        <form key={offer.id} action={acceptOffer}>
          <input type="hidden" name="match_id" value={id} />
          <input type="hidden" name="offer_id" value={offer.id} />
          <button className="btn" type="submit">Take the spot before {formatWhen(offer.expires_at)}</button>
        </form>
      ))}

      {mine && !isHost ? (
        <form action={leaveMatch}>
          <input type="hidden" name="match_id" value={id} />
          <button className="btn btn-quiet" type="submit">Leave game</button>
          <p className="mt-1 text-xs text-ink-soft">More than 24 hours out is free. 24 to 3 hours counts as late. Under 3 hours counts as a no-show, unless the host just changed the game.</p>
        </form>
      ) : null}

      {(mine || isHost) ? <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} /> : null}

      {isHost && match.status !== "cancelled" && match.status !== "completed" ? (
        <section className="card space-y-3">
          <h2 className="font-semibold">Host</h2>
          <form action={confirmClub} className="flex flex-wrap gap-2">
            <input type="hidden" name="match_id" value={id} />
            <select name="club_id" className="input" defaultValue={clubs.find((item) => item.is_confirmed)?.club.id ?? clubs[0]?.club.id}>
              {directory.map((club) => <option key={club.id} value={club.id}>{club.name} · {club.city}</option>)}
            </select>
            <button className="btn" type="submit">Confirm this club</button>
          </form>
          <form action={saveLogistics} className="flex flex-wrap gap-2">
            <input type="hidden" name="match_id" value={id} />
            <input name="logistics" defaultValue={logistics ?? ""} placeholder="WhatsApp link" className="input min-w-64" />
            <button className="btn btn-quiet" type="submit">Save logistics</button>
          </form>
          <form action={cancelMatch}>
            <input type="hidden" name="match_id" value={id} />
            <button className="text-sm text-danger" type="submit">Cancel game</button>
          </form>
          <form action={completeMatch}>
            <input type="hidden" name="match_id" value={id} />
            <button className="btn btn-quiet" type="submit">Mark played</button>
          </form>
          <form action={editGame} className="space-y-2">
            <input type="hidden" name="match_id" value={id} />
            <label className="field">Change the start
              <input name="starts_at" type="datetime-local" />
            </label>
            <label className="field">Note
              <input name="note" defaultValue={match.note ?? ""} />
            </label>
            <button className="btn btn-quiet" type="submit">Save changes</button>
            <p className="text-xs text-ink-soft">Players can leave without a penalty for 2 hours after a change.</p>
          </form>
          <form action={rebroadcast}>
            <input type="hidden" name="match_id" value={id} />
            <button className="btn btn-quiet" type="submit">Send once more</button>
          </form>
        </section>
      ) : null}

      {requests.filter((request) => request.status === "pending").length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Requests</h2>
          {requests.filter((request) => request.status === "pending").map((request) => (
            <form key={request.id} action={reviewRequest} className="card flex flex-wrap items-center justify-between gap-2">
              <input type="hidden" name="match_id" value={id} />
              <input type="hidden" name="request_id" value={request.id} />
              <p className="text-sm"><Link href={`/players/${request.player_id}`}>Player card</Link>{request.note ? ` · ${request.note}` : ""}</p>
              <div className="flex gap-2">
                <button className="btn" name="approve" value="yes" type="submit">Approve</button>
                <button className="btn btn-quiet" name="approve" value="no" type="submit">Decline</button>
              </div>
            </form>
          ))}
        </section>
      ) : null}

      {match.booking_status && match.booking_status !== "unbooked" ? (
        <p className="text-sm">Court marked {match.booking_status === "booked_elsewhere" ? "booked elsewhere" : "booked"}. <Link href={`/api/games/${id}/calendar`}>Add to calendar</Link></p>
      ) : null}
      {match.booking_url ? <p className="text-sm"><a href={match.booking_url}>Club booking page</a></p> : null}
      {(mine || isHost) && match.status === "full" && match.booking_status === "unbooked" ? (
        <section className="card space-y-3">
          <h2 className="font-semibold">Book the court</h2>
          <p className="text-sm text-ink-soft">{match.booking_deadline ? `Book by ${formatWhen(match.booking_deadline)}.` : "The game is full."} The host books unless someone else claims it.</p>
          <form action={claimBooker}>
            <input type="hidden" name="match_id" value={id} />
            <button className="btn btn-quiet" type="submit">I will book it</button>
          </form>
          {profile?.id === match.booker_id ? (
            <form action={markBooked} className="space-y-2">
              <input type="hidden" name="match_id" value={id} />
              <label className="field">Confirmation link
                <input name="booking_url" type="url" placeholder="https://" />
              </label>
              <label className="field">Or the details
                <input name="booking_details" placeholder="Booked on the club desk, court 2" />
              </label>
              <button className="btn" name="booking_status" value="booked" type="submit">Paste confirmation</button>
              <button className="btn btn-quiet" name="booking_status" value="booked_elsewhere" type="submit">Booked elsewhere</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {contacts.length > 0 ? (
        <section className="space-y-1">
          <h2 className="font-semibold">WhatsApp</h2>
          {contacts.map((person) => (
            <p key={person.player_id} className="text-sm"><Link href={`/players/${person.player_id}`}>{person.display_name}</Link> · {person.whatsapp}</p>
          ))}
        </section>
      ) : null}

      {(mine || isHost) && match.status !== "cancelled" ? (
        <section className="space-y-2">
          <h2 className="font-semibold">Chat</h2>
          <ul className="space-y-2">
            {messages.map((message) => (
              <li key={message.id} className="card text-sm">
                <p>{message.body}</p>
                <p className="mono text-ink-soft">{formatWhen(message.created_at)}</p>
              </li>
            ))}
          </ul>
          <form action={sendMessage} className="flex gap-2">
            <input type="hidden" name="match_id" value={id} />
            <input name="body" maxLength={1000} className="input min-w-0 flex-1" placeholder="Message the group" />
            <button className="btn" type="submit">Send</button>
          </form>
        </section>
      ) : null}

      {events.length > 0 ? (
        <section className="space-y-1">
          <h2 className="font-semibold">Timeline</h2>
          {events.map((event) => (
            <p key={event.id} className="text-sm text-ink-soft"><span className="mono">{formatWhen(event.created_at)}</span> · {event.body}</p>
          ))}
        </section>
      ) : null}

      {started && mine ? (
        <form action={confirmPlayed} className="flex gap-2">
          <input type="hidden" name="match_id" value={id} />
          <button className="btn" name="played" value="yes" type="submit">I played</button>
          <button className="btn btn-quiet" name="played" value="no" type="submit">I did not play</button>
        </form>
      ) : null}

      {played && isHost ? <Link className="btn btn-quiet" href={`/games/new?from=${id}`}>Rematch</Link> : null}
      {played ? <Link className="text-sm" href={`/games/${id}/recap`}>Recap card</Link> : null}

      <section className="space-y-3">
        <h2 className="font-semibold">Players</h2>
        {match.match_slots.filter((slot) => slot.status !== "open").map((slot) => (
          <PlayerRow key={slot.id} matchId={id} isHost={isHost} played={played} slot={slot} viewerId={profile?.id ?? null} />
        ))}
        {waitlist.length > 0 ? <p className="text-sm text-ink-soft">Waiting: {waitlist.map((item) => item.player?.display_name ?? "Player").join(", ")}</p> : null}
      </section>

      {played && mine ? <Ratings matchId={id} slots={match.match_slots} viewerId={profile?.id ?? ""} /> : null}
    </div>
  );
}

async function PlayerRow({
  matchId,
  slot,
  isHost,
  played,
  viewerId,
}: {
  matchId: string;
  slot: { id: string; player_id: string | null; guest_label: string | null; status: string; player: { display_name: string; level: string | null } | null };
  isHost: boolean;
  played: boolean;
  viewerId: string | null;
}) {
  const reliability = slot.player_id ? await loadReliability(slot.player_id) : null;
  const summary = reliability
    ? reliabilitySummary({
        showUps: reliability.show_ups,
        misses: reliability.misses,
        playAgainYes: reliability.play_again_yes,
        playAgainCount: reliability.play_again_count,
      })
    : null;
  const name = slot.player?.display_name ?? slot.guest_label ?? "Guest";
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        {slot.player_id ? <Link className="font-semibold" href={`/players/${slot.player_id}`}>{name}</Link> : <p className="font-semibold">{name}</p>}
        <p className="text-sm text-ink-soft">
          {slot.player?.level ? levelLabel[slot.player.level as keyof typeof levelLabel] : "Guest"} · {slot.status}
          {summary?.showUpRate != null ? <> · shows up <span className="mono">{percent(summary.showUpRate)}</span></> : " · reliability New"}
        </p>
      </div>
      <div className="flex gap-3 text-sm">
        {isHost && slot.player_id !== viewerId && !played ? (
          <form action={removePlayer}>
            <input type="hidden" name="match_id" value={matchId} />
            <input type="hidden" name="slot_id" value={slot.id} />
            <button type="submit">Remove</button>
          </form>
        ) : null}
        {isHost && played ? (
          <form action={markNoShow}>
            <input type="hidden" name="match_id" value={matchId} />
            <input type="hidden" name="slot_id" value={slot.id} />
            <button type="submit">No-show</button>
          </form>
        ) : null}
        {slot.player_id && slot.player_id !== viewerId ? (
          <>
            <form action={reportPlayer} className="flex gap-2">
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="reported_id" value={slot.player_id} />
              <input name="note" placeholder="What happened" className="input" />
              <button type="submit">Report</button>
            </form>
            <form action={blockPlayer}>
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="player_id" value={slot.player_id} />
              <button type="submit">Block</button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Ratings({
  matchId,
  slots,
  viewerId,
}: {
  matchId: string;
  slots: { player_id: string | null; player: { display_name: string } | null; status: string }[];
  viewerId: string;
}) {
  const others = slots.filter((slot) => slot.player_id && slot.player_id !== viewerId && (slot.status === "joined" || slot.status === "confirmed"));
  if (others.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Rate the game</h2>
      {others.map((slot) => (
        <form key={slot.player_id} action={submitFeedback} className="card flex flex-wrap items-end gap-3">
          <input type="hidden" name="match_id" value={matchId} />
          <input type="hidden" name="ratee_id" value={slot.player_id ?? ""} />
          <p className="font-medium">{slot.player?.display_name}</p>
          <label className="field">Level fit
            <input name="level_fit" type="number" min={1} max={5} required defaultValue={3} />
          </label>
          <label className="field">Play again?
            <select name="play_again" defaultValue="yes">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button className="btn" type="submit">Save</button>
        </form>
      ))}
    </section>
  );
}
