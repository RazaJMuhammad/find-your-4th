import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isRecoveryNext, landingPath, RECOVERY_COOKIE, recoveryCookieOptions, safeNext } from "@/lib/auth";
import { supabasePublicEnv } from "@/lib/env";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(["email", "signup", "recovery", "invite", "email_change", "magiclink"]);

function otpType(value: string | null): EmailOtpType | null {
  if (!value || !EMAIL_OTP_TYPES.has(value as EmailOtpType)) return null;
  return value as EmailOtpType;
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function completeEmailAuth(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = otpType(url.searchParams.get("type"));
  const next = safeNext(url.searchParams.get("next"), url.origin);
  const failed = noStore(NextResponse.redirect(new URL("/login?error=That%20link%20is%20invalid%20or%20has%20expired", url.origin)));

  if (!code && !(tokenHash && type)) return failed;

  const env = supabasePublicEnv();
  if (!env) return failed;

  const cookies: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet, headers) {
      cookiesToSet.forEach(({ name, value, options }) => {
        failed.cookies.set(name, value, options);
      });
      Object.entries(headers ?? {}).forEach(([name, value]) => {
        failed.headers.set(name, value);
      });
    },
  };

  const supabase = createServerClient(env.url, env.key, { cookies });
  const verified = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string });
  if (verified.error) return failed;

  const recovery = type === "recovery" || isRecoveryNext(next);
  if (recovery) {
    failed.cookies.set(RECOVERY_COOKIE, "1", recoveryCookieOptions());
    failed.headers.set("Location", new URL("/reset-password", url.origin).toString());
    return failed;
  }

  const account = await supabase.rpc("my_account");
  failed.headers.set("Location", new URL(landingPath(next, account.data), url.origin).toString());
  return failed;
}
