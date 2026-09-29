"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  emailIssue,
  formReturn,
  landingPath,
  normalizeEmail,
  passwordIssue,
  publicAuthMessage,
  RECOVERY_COOKIE,
  recoveryCookieOptions,
  safeNext,
  withQuery,
} from "@/lib/auth";
import { isDisposableEmail } from "@/lib/domain/rules";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

async function emailRedirectTo(next: string) {
  const origin = await siteUrl();
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}

function trapped(formData: FormData) {
  return String(formData.get("company") ?? "").trim().length > 0;
}

async function clientOrRedirect(back: string) {
  const supabase = await createClient();
  if (!supabase) redirect(withQuery(back, { error: "Supabase is not connected yet" }));
  return supabase;
}

export async function signIn(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const back = formReturn(formData.get("return"), "/login");
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (trapped(formData)) redirect(withQuery(back, { error: "Email or password is incorrect.", next, email }));
  const invalid = emailIssue(email);
  if (invalid || !password) redirect(withQuery(back, { error: invalid ?? "Enter your password.", next, email }));

  const supabase = await clientOrRedirect(back);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const raw = error?.message ?? "";
    redirect(
      withQuery(back, {
        error: publicAuthMessage(raw || "Invalid login credentials"),
        next,
        email,
        confirm: raw.toLowerCase().includes("email not confirmed") ? "1" : undefined,
      }),
    );
  }
  const account = await supabase.rpc("my_account");
  redirect(landingPath(next, account.data));
}

export async function signUp(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (trapped(formData)) redirect(withQuery("/signup", { sent: "1", next }));
  const invalid = emailIssue(email) ?? (isDisposableEmail(email) ? "Use a regular email address." : null);
  if (invalid) redirect(withQuery("/signup", { error: invalid, next, email }));
  const weak = passwordIssue(password, email);
  if (weak) redirect(withQuery("/signup", { error: weak, next, email }));
  if (password !== confirm) redirect(withQuery("/signup", { error: "Those passwords do not match.", next, email }));

  const supabase = await clientOrRedirect("/signup");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await emailRedirectTo(next) },
  });
  if (error) redirect(withQuery("/signup", { error: publicAuthMessage(error.message), next, email }));
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    redirect(withQuery("/login", { error: "An account with this email already exists. Sign in, or reset your password.", next, email }));
  }
  if (data.session) {
    const account = await supabase.rpc("my_account");
    redirect(landingPath(next, account.data));
  }
  redirect(withQuery("/signup", { sent: "1", next, email }));
}

export async function requestPasswordReset(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const email = normalizeEmail(formData.get("email"));
  if (trapped(formData)) redirect(withQuery("/forgot-password", { sent: "1", next }));
  const invalid = emailIssue(email);
  if (invalid) redirect(withQuery("/forgot-password", { error: invalid, next, email }));
  if (!isDisposableEmail(email)) {
    const supabase = await clientOrRedirect("/forgot-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: await emailRedirectTo("/reset-password"),
    });
    const lower = error?.message.toLowerCase() ?? "";
    const missingAccount = lower.includes("not found") || lower.includes("no user");
    if (error && !missingAccount) {
      redirect(withQuery("/forgot-password", { error: publicAuthMessage(error.message), next, email }));
    }
  }
  redirect(withQuery("/forgot-password", { sent: "1", next }));
}

export async function resendConfirmation(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const back = formReturn(formData.get("return"), "/signup");
  const email = normalizeEmail(formData.get("email"));
  if (trapped(formData) || emailIssue(email) || isDisposableEmail(email)) {
    redirect(withQuery(back, { sent: "1", next }));
  }
  const supabase = await clientOrRedirect(back);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: await emailRedirectTo(next) },
  });
  if (error && publicAuthMessage(error.message).startsWith("Too many")) {
    redirect(withQuery(back, { error: publicAuthMessage(error.message), next, email, confirm: "1" }));
  }
  redirect(withQuery(back, { sent: "1", next, email }));
}

async function requireSession(back: string) {
  const supabase = await clientOrRedirect(back);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) redirect(withQuery("/login", { next: back, error: "Sign in again to continue." }));
  return { supabase, email: data.user.email };
}

function saveNewPassword(back: string, password: string, confirm: string, email: string) {
  const weak = passwordIssue(password, email);
  if (weak) redirect(withQuery(back, { error: weak }));
  if (password !== confirm) redirect(withQuery(back, { error: "Those passwords do not match." }));
}

export async function resetPassword(formData: FormData) {
  const jar = await cookies();
  if (jar.get(RECOVERY_COOKIE)?.value !== "1") {
    redirect("/forgot-password?error=That%20reset%20link%20is%20invalid%20or%20has%20expired");
  }
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const { supabase, email } = await requireSession("/reset-password");
  saveNewPassword("/reset-password", password, confirm, email);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(withQuery("/reset-password", { error: publicAuthMessage(error.message) }));
  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  jar.set(RECOVERY_COOKIE, "", { ...recoveryCookieOptions(), maxAge: 0 });
  const account = await supabase.rpc("my_account");
  redirect(landingPath("/", account.data));
}

export async function changePassword(formData: FormData) {
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current) redirect("/you/password?error=Enter%20your%20current%20password");
  const { supabase, email } = await requireSession("/you/password");
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) redirect("/you/password?error=Current%20password%20is%20incorrect");
  if (current === password) redirect("/you/password?error=Choose%20a%20different%20password%20from%20your%20current%20one");
  saveNewPassword("/you/password", password, confirm, email);
  const { error } = await supabase.auth.updateUser({ password, current_password: current });
  if (error) redirect(withQuery("/you/password", { error: publicAuthMessage(error.message) }));
  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  redirect("/you/password?saved=1");
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const supabase = await clientOrRedirect("/login");
  const origin = await siteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) redirect(withQuery("/login", { error: "Google sign-in is not enabled yet", next }));
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
