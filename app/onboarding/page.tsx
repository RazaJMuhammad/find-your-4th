import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { Notice, SetupNotice } from "@/components/shell";
import { snapshotClubs } from "@/lib/clubs-snapshot";
import { loadClubs } from "@/lib/games";
import { getProfile } from "@/lib/session";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(params.next ?? "/onboarding")}`);
  const clubs = (await loadClubs()) ?? snapshotClubs();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
      <p className="text-ink-soft">Level is what you say it is for now. Show-up rate comes from games, once you have played a few.</p>
      {params.error ? <Notice>{params.error}</Notice> : null}
      {(await loadClubs()) === null ? <SetupNotice /> : null}
      <ProfileForm profile={profile} clubs={clubs} next={params.next} />
    </div>
  );
}
