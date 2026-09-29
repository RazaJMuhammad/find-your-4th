import Link from "next/link";
import { redirect } from "next/navigation";
import { notificationCopy } from "@/config/copy";
import { markAllRead } from "@/app/inbox/actions";
import { PushToggle } from "@/components/push-toggle";
import { formatWhen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/session";

export default async function InboxPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/inbox");
  const supabase = await createClient();
  const first = supabase
    ? await supabase.from("notifications").select("id, type, event, payload, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
    : { data: [], error: null };
  const result = first.error && supabase
    ? await supabase.from("notifications").select("id, type, payload, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
    : first;
  const notes = (result.data ?? []) as { id: string; type: string; event?: string | null; payload: { match_id?: string; event?: string; message?: string }; read_at: string | null; created_at: string }[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
        <form action={markAllRead}><button className="text-sm text-ink-soft" type="submit">Mark all read</button></form>
      </div>
      <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      {notes.length === 0 ? <p className="text-sm text-ink-soft">Nothing yet. A full game, an open spot, and a rating reminder land here.</p> : null}
      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="card">
            <Link href={note.payload?.match_id ? `/games/${note.payload.match_id}` : "/inbox"}>
              <p className={note.read_at ? "text-ink-soft" : "font-semibold"}>{note.payload?.message ?? notificationCopy[note.event ?? note.payload?.event ?? note.type] ?? note.type}</p>
              <p className="mono text-ink-soft">{formatWhen(note.created_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
