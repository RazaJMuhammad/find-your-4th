import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "@/lib/env";

export function createClient() {
  const env = supabasePublicEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.key);
}
