import Link from "next/link";
import { requestPasswordReset } from "@/app/login/actions";
import { Honeypot, SubmitButton } from "@/components/auth-fields";
import { AuthScreen, authMetadata } from "@/components/auth-screen";
import { safeNext } from "@/lib/auth";

export const metadata = authMetadata("Forgot password", "Request a link to reset your Find Your 4th password.");

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const sent = params.sent === "1";
  return (
    <AuthScreen
      title="Reset your password"
      lede="Enter your email. If an account exists, we send a link to choose a new password."
      error={params.error}
      success={sent ? "If an account exists for that email, we sent a reset link. It expires soon." : undefined}
    >
      {sent ? null : (
        <form action={requestPasswordReset} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={320}
              defaultValue={params.email ?? ""}
            />
          </label>
          <Honeypot />
          <SubmitButton pendingLabel="Sending">Send reset link</SubmitButton>
        </form>
      )}
      <p className="text-sm text-ink-soft">
        <Link className="font-semibold text-court-teal" href={`/login?next=${encodeURIComponent(next)}`}>
          Back to sign in
        </Link>
      </p>
    </AuthScreen>
  );
}
