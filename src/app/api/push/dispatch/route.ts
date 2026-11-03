import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverOutbox } from "@/lib/push-server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(request: Request) {
  const expected = process.env.PUSH_DISPATCH_SECRET ?? "";
  const given = request.headers.get("x-push-secret") ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 4000) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let body: { id?: unknown; ids?: unknown };
  try {
    body = raw ? (JSON.parse(raw) as { id?: unknown; ids?: unknown }) : {};
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ids = [body.id, ...(Array.isArray(body.ids) ? body.ids : [])]
    .filter((id): id is string => typeof id === "string" && UUID.test(id))
    .slice(0, 40);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const result = await deliverOutbox(ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
