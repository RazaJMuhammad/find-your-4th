import Link from "next/link";
import { resendConfirmation, signIn, signInWithGoogle } from "@/app/login/actions";
import { Honeypot, PasswordField, SubmitButton } from "@/components/auth-fields";
import { AuthScreen, authMetadata } from "@/components/auth-screen";
import { safeNext } from "@/lib/auth";

export const metadata = authMetadata("Sign in", "Sign in to Find Your 4th with your email and password.");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; email?: string; confirm?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const sent = params.sent === "1";
  return (
    <AuthScreen
      title="Sign in"
      lede="Use the email and password for your account."
      error={params.error}
      success={sent ? "If that account is waiting for confirmation, we sent another email." : undefined}
    >
      <form action={signIn} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={320}
            defaultValue={params.email ?? ""}
          />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <Honeypot />
        <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
      </form>
      <p className="text-sm">
        <Link className="font-semibold text-court-teal" href={`/forgot-password?next=${encodeURIComponent(next)}`}>
          Forgot your password?
        </Link>
      </p>
      {params.confirm === "1" && params.email ? (
        <form action={resendConfirmation} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={params.email} />
          <input type="hidden" name="return" value="/login" />
          <SubmitButton pendingLabel="Sending">Send the confirmation email again</SubmitButton>
        </form>
      ) : null}
      <p className="text-center text-sm text-ink-faint">or</p>
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-quiet w-full" type="submit">
          Continue with Google
        </button>
      </form>
      <p className="text-sm text-ink-soft">
        New here?{" "}
        <Link className="font-semibold text-court-teal" href={`/signup?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </p>
    </AuthScreen>
  );
}
