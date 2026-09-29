import { loadMyGames } from "@/lib/games";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Sign in required" }, { status: 401 });
  const games = await loadMyGames(userId);
  return Response.json(games ?? [], {
    headers: { "Cache-Control": "private, no-store" },
  });
}
