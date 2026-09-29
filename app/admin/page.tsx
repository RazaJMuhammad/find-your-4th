import { redirect } from "next/navigation";
import { Notice } from "@/components/shell";
import { percent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";

type Queue = {
  reports: { id: string; note: string; status: string }[];
  suggestions: { id: string; name: string; city: string; note: string | null }[];
  audit: { action: string; subject: string | null; created_at: string }[];
};

type Metrics = {
  posted: number;
  fill_rate: number | null;
  lock_to_booked: number | null;
  show_up_rate: number | null;
  repeat_players: number;
};

async function act(formData: FormData) {
  "use server";
  const supabase = await createClient();
  if (!supabase) redirect("/admin?error=Supabase%20is%20not%20connected");
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const call = kind === "suspend"
    ? supabase.rpc("admin_suspend", { p_user: id, p_on: true })
    : kind === "restore"
      ? supabase.rpc("admin_suspend", { p_user: id, p_on: false })
      : kind === "takedown"
        ? supabase.rpc("admin_takedown", { p_match: id })
        : kind === "resolve"
          ? supabase.rpc("admin_resolve_report", { p_report: id })
          : supabase.rpc("admin_broadcast", { p_message: String(formData.get("message") ?? "") });
  const { error } = await call;
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/admin");
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin");
  if (!profile.is_admin) return <p>This page is for admins.</p>;
  const supabase = await createClient();
  const queue = supabase ? (await supabase.rpc("admin_queue")).data as Queue | null : null;
  const metrics = supabase ? (await supabase.rpc("admin_metrics")).data as Metrics | null : null;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      {params.error ? <Notice>{params.error}</Notice> : null}
      {metrics ? (
        <section className="card space-y-1 text-sm">
          <p>Posted {metrics.posted}</p>
          <p>Fill rate {metrics.fill_rate == null ? "—" : <span className="mono">{percent(metrics.fill_rate)}</span>}</p>
          <p>Lock to booked {metrics.lock_to_booked == null ? "—" : <span className="mono">{percent(metrics.lock_to_booked)}</span>}</p>
          <p>Show-up rate {metrics.show_up_rate == null ? "—" : <span className="mono">{percent(metrics.show_up_rate)}</span>}</p>
          <p>Repeat players {metrics.repeat_players}</p>
        </section>
      ) : null}
      <section className="space-y-2">
        <h2 className="font-semibold">Reports</h2>
        {(queue?.reports ?? []).map((report) => (
          <form key={report.id} action={act} className="card space-y-2 text-sm">
            <input type="hidden" name="kind" value="resolve" />
            <input type="hidden" name="id" value={report.id} />
            <p>{report.note}</p>
            <button className="btn btn-quiet" type="submit">Resolve</button>
          </form>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Suggested clubs</h2>
        {(queue?.suggestions ?? []).map((item) => (
          <p key={item.id} className="text-sm">{item.name} · {item.city}{item.note ? ` · ${item.note}` : ""}</p>
        ))}
      </section>
      <form action={act} className="card space-y-2">
        <h2 className="font-semibold">Suspend a user</h2>
        <input name="id" placeholder="User id" className="input" />
        <button className="btn" name="kind" value="suspend" type="submit">Suspend</button>
        <button className="btn btn-quiet" name="kind" value="restore" type="submit">Restore</button>
      </form>
      <form action={act} className="card space-y-2">
        <h2 className="font-semibold">Take down a game</h2>
        <input name="id" placeholder="Game id" className="input" />
        <button className="btn" name="kind" value="takedown" type="submit">Remove</button>
      </form>
      <form action={act} className="card space-y-2">
        <h2 className="font-semibold">Message everyone</h2>
        <textarea name="message" required maxLength={280} className="input" />
        <button className="btn" name="kind" value="broadcast" type="submit">Send</button>
      </form>
      <section className="space-y-1">
        <h2 className="font-semibold">Audit</h2>
        {(queue?.audit ?? []).map((row, index) => (
          <p key={`${row.created_at}-${index}`} className="text-sm text-ink-soft">{row.action} · {row.subject}</p>
        ))}
      </section>
    </div>
  );
}
