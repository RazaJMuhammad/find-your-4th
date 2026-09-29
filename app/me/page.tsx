import { redirect } from "next/navigation";
import { MyGames } from "@/components/my-games";
import { getProfile } from "@/lib/session";

export default async function MyGamesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/me");
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Your games</h1>
      <p className="text-ink-soft">This list is saved on the device after you open it online, so you can still see it without a connection.</p>
      <MyGames />
    </div>
  );
}
