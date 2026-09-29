import Link from "next/link";
import { cookies } from "next/headers";
import { resetPassword } from "@/app/login/actions";
import { PasswordField, SubmitButton } from "@/components/auth-fields";
import { AuthScreen, authMetadata } from "@/components/auth-screen";
import { RECOVERY_COOKIE } from "@/lib/auth";
import { getUserId } from "@/lib/session";

export const metadata = authMetadata("Choose a new password", "Choose a new password for your Find Your 4th account.");

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const jar = await cookies();
  const recovery = jar.get(RECOVERY_COOKIE)?.value === "1";
  const signedIn = Boolean(await getUserId());

  if (!recovery || !signedIn) {
    return (
      <AuthScreen
        title="Choose a new password"
        lede="This page opens from the reset link in your email."
        error={params.error ?? "That reset link is invalid or has expired. Request a new one."}
      >
        <Link className="btn w-full" href="/forgot-password">
          Request a new link
        </Link>
        {signedIn ? (
          <Link className="btn btn-quiet w-full" href="/you/password">
            Change your password
          </Link>
        ) : (
          <Link className="text-sm font-semibold text-court-teal" href="/login">
            Back to sign in
          </Link>
        )}
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Choose a new password"
      lede="Other devices are signed out after you save."
      error={params.error}
    >
      <form action={resetPassword} className="space-y-3">
        <p id="reset-rules" className="text-sm text-ink-faint">
          At least 8 characters. Pick something you have not used here before.
        </p>
        <PasswordField name="password" label="New password" autoComplete="new-password" describedBy="reset-rules" />
        <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton pendingLabel="Saving">Save password</SubmitButton>
      </form>
    </AuthScreen>
  );
}
