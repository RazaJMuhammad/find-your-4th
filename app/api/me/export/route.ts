import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/session";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.redirect(new URL("/login?next=/you", request.url));
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not connected" }, { status: 503 });
  const { data, error } = await supabase.rpc("export_account");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": "attachment; filename=\"find-your-4th.json\"",
    },
  });
}
