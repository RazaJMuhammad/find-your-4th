import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type OutboxItem = {
  id: string;
  title: string;
  body: string;
  url: string;
  tag: string | null;
  subscriptions: Subscription[] | null;
};

let vapidReady = false;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase service credentials");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function configureVapid() {
  if (vapidReady) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) throw new Error("Missing VAPID configuration");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

function statusCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    return typeof code === "number" ? code : 0;
  }
  return 0;
}

function message(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Push delivery failed";
}

export async function deliverOutbox(ids: string[]) {
  configureVapid();
  const supabase = admin();
  const { data, error } = await supabase.rpc("claim_push_outbox", { p_ids: ids });
  if (error) throw new Error(error.message);
  const items = (Array.isArray(data) ? data : []) as OutboxItem[];

  let sent = 0;
  for (const item of items) {
    const failure = await deliverItem(supabase, item);
    const { error: finishError } = await supabase.rpc("finish_push", {
      p_id: item.id,
      p_error: failure,
    });
    if (finishError) throw new Error(finishError.message);
    if (!failure) sent += 1;
  }
  return { claimed: items.length, sent };
}

async function deliverItem(
  supabase: ReturnType<typeof admin>,
  item: OutboxItem,
): Promise<string | null> {
  const subscriptions = item.subscriptions ?? [];
  if (subscriptions.length === 0) return null;

  let transient: string | null = null;
  const payload = JSON.stringify({
    title: item.title,
    body: item.body,
    url: item.url,
    tag: item.tag,
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
    } catch (error) {
      const code = statusCode(error);
      if (code === 404 || code === 410) {
        await supabase.rpc("delete_push_endpoint", { p_endpoint: subscription.endpoint });
      } else {
        transient = message(error);
      }
    }
  }

  return transient;
}
