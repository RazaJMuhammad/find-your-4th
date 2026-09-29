import Link from "next/link";
import { redirect } from "next/navigation";
import { changePassword } from "@/app/login/actions";
import { PasswordField, SubmitButton } from "@/components/auth-fields";
import { AuthScreen, authMetadata } from "@/components/auth-screen";
import { getUserId } from "@/lib/session";

export const metadata = authMetadata("Change password", "Change the password for your Find Your 4th account.");

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/you/password");

  return (
    <AuthScreen
      title="Change password"
      lede="Enter your current password, then choose a new one. Other devices are signed out."
      error={params.error}
      success={params.saved === "1" ? "Password saved. Other devices have been signed out." : undefined}
    >
      <form action={changePassword} className="space-y-3">
        <PasswordField name="current" label="Current password" autoComplete="current-password" />
        <p id="change-rules" className="text-sm text-ink-faint">
          At least 8 characters. A passphrase you do not use on other sites is a good choice.
        </p>
        <PasswordField name="password" label="New password" autoComplete="new-password" describedBy="change-rules" />
        <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton pendingLabel="Saving">Save password</SubmitButton>
      </form>
      <p className="text-sm text-ink-soft">
        <Link className="font-semibold text-court-teal" href="/forgot-password?next=/you">
          Forgot the current password?
        </Link>
      </p>
    </AuthScreen>
  );
}
