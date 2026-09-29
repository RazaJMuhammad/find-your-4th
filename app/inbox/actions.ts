"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/session";

export async function markAllRead() {
  const userId = await getUserId();
  const supabase = await createClient();
  if (!userId || !supabase) redirect("/login?next=/inbox");
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  revalidatePath("/inbox");
}

export async function savePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }) {
  const supabase = await createClient();
  const userId = await getUserId();
  if (!supabase || !userId) return { error: "Sign in to turn on notifications." };
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
