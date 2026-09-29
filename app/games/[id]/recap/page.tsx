import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyText } from "@/components/live-match";
import { formatWhen } from "@/lib/format";
import { clubLabel, loadMatch, visibleClubs } from "@/lib/games";

export default async function RecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await loadMatch(id);
  if (!match || match.status !== "completed") notFound();
  const names = match.match_slots
    .filter((slot) => slot.status === "joined" || slot.status === "confirmed")
    .map((slot) => slot.player?.display_name ?? slot.guest_label ?? "Guest");
  const where = visibleClubs(match).map((item) => clubLabel(item.club)).join(" · ");
  const summary = `Padel recap\n${formatWhen(match.starts_at)}\n${where}\n${names.join(", ")}`;

  return (
    <div className="card card-brand space-y-3">
      <p className="text-sm uppercase tracking-wide">Find Your 4th</p>
      <h1 className="text-3xl font-semibold">We played</h1>
      <p className="mono-lg">{formatWhen(match.starts_at)}</p>
      <p>{where}</p>
      <p>{names.join(" · ")}</p>
      <CopyText label="Copy recap" text={summary} />
      <Link className="text-sm underline" href={`/games/${id}`}>Back to the game</Link>
    </div>
  );
}
