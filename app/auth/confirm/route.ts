import { type NextRequest } from "next/server";
import { completeEmailAuth } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return completeEmailAuth(request);
}
