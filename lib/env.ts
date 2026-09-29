export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function supabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ?? null;
}

export function cronSecret() {
  return process.env.CRON_SECRET ?? null;
}
