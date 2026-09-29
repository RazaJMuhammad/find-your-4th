import { clubLabel, loadMatch, visibleClubs } from "@/lib/games";

function stamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const match = await loadMatch(id);
  if (!match || match.booking_status === "unbooked") {
    return new Response("The calendar file is available once the court is booked.", { status: 404 });
  }
  const end = new Date(new Date(match.starts_at).getTime() + (match.duration_minutes ?? 90) * 60 * 1000).toISOString();
  const where = visibleClubs(match).map((item) => clubLabel(item.club)).join("; ");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Find Your 4th//EN",
    "BEGIN:VEVENT",
    `UID:${match.id}@find-your-4th`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(match.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Padel`,
    `LOCATION:${where}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="game-${match.id}.ics"`,
    },
  });
}
