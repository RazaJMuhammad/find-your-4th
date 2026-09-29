import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const titles: Record<string, string> = {
  game_full: "Your game is full",
  spot_opened: "A spot opened",
  waitlist_promoted: "You are in",
  attendance_reminder: "Confirm you are playing",
  court_confirmed: "Court confirmed",
  rate_game: "Rate your game",
  game_cancelled: "Game cancelled",
  new_match: "A game needs players",
  join_request: "Someone wants to join",
  request_decided: "Your request was updated",
  player_update: "A player changed",
  game_locked: "Book the court",
  booking_reminder: "Book the court soon",
  game_booked: "The court is booked",
  game_changed: "A game changed",
  fill_deadline: "Keep or release the court",
  pre_game: "Your game starts soon",
};

Deno.serve(async (request) => {
  if (request.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return new Response("vapid missing", { status: 500 });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@example.com", publicKey, privateKey);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: notes, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, payload")
    .is("push_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return new Response(error.message, { status: 500 });

  for (const note of notes ?? []) {
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", note.user_id);
    for (const subscription of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ title: titles[note.payload?.event] ?? titles[note.type] ?? "Find Your 4th", body: note.payload?.message ?? titles[note.type] ?? note.type, matchId: note.payload?.match_id }),
        );
      } catch {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      }
    }
    await supabase.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", note.id);
  }

  return Response.json({ sent: notes?.length ?? 0 });
});
