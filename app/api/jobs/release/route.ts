import { cronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!cronSecret() || request.headers.get("x-cron-secret") !== cronSecret()) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Supabase secret key is missing" }, { status: 500 });
  const { error } = await admin.rpc("run_scheduled_jobs");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
