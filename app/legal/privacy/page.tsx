export default function PrivacyPage() {
  return (
    <article className="max-w-xl space-y-3 text-sm leading-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p>We store your email, the name and level you set, the games you join, attendance, ratings, and optional push subscription keys. Signed-in players can see your name, level, and show-up rate. The logistics note on a game is only visible to players in that game.</p>
      <p>Club names come from a snapshot of public listings. We do not send your activity to that directory.</p>
      <p>Email sign-in is handled by Supabase. To close an account, ask the operator to delete the user in the Supabase dashboard, which removes the profile.</p>
    </article>
  );
}
