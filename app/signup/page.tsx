import Link from "next/link";
import { resendConfirmation, signInWithGoogle, signUp } from "@/app/login/actions";
import { Honeypot, PasswordField, SubmitButton } from "@/components/auth-fields";
import { AuthScreen, authMetadata } from "@/components/auth-screen";
import { safeNext } from "@/lib/auth";

export const metadata = authMetadata("Create an account", "Create a Find Your 4th account with your email and a password.");

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const sent = params.sent === "1";
  return (
    <AuthScreen
      title="Create an account"
      lede="Use an email you can open. We send one link to confirm it."
      error={params.error}
      success={sent ? "Check your email and open the confirmation link. Then you can sign in." : undefined}
    >
      {sent ? (
        <form action={resendConfirmation} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={params.email ?? ""} />
          <input type="hidden" name="return" value="/signup" />
          <Honeypot />
          <SubmitButton pendingLabel="Sending">Send the email again</SubmitButton>
        </form>
      ) : (
        <form action={signUp} className="space-y-3">
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
          <p id="password-rules" className="text-sm text-ink-faint">
            At least 8 characters. A passphrase you do not use on other sites is a good choice.
          </p>
          <PasswordField name="password" label="Password" autoComplete="new-password" describedBy="password-rules" />
          <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" />
          <Honeypot />
          <SubmitButton pendingLabel="Creating account">Create account</SubmitButton>
        </form>
      )}
      <p className="text-sm text-ink-faint">
        Next you confirm that you are 18 or older and accept the{" "}
        <Link className="font-semibold text-court-teal" href="/legal/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="font-semibold text-court-teal" href="/legal/privacy">
          Privacy policy
        </Link>
        .
      </p>
      <p className="text-center text-sm text-ink-faint">or</p>
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-quiet w-full" type="submit">
          Continue with Google
        </button>
      </form>
      <p className="text-sm text-ink-soft">
        Already have an account?{" "}
        <Link className="font-semibold text-court-teal" href={`/login?next=${encodeURIComponent(next)}`}>
          Sign in
        </Link>
      </p>
    </AuthScreen>
  );
}
