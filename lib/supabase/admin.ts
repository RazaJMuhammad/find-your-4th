import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseSecretKey } from "@/lib/env";

export function createAdminClient() {
  const env = supabasePublicEnv();
  const key = supabaseSecretKey();
  if (!env || !key) return null;
  return createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
