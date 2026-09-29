# What you do by hand

The app and the database migrations are in the repo. These steps need your accounts, keys, and dashboard, so they cannot be done from the code alone.

You need:

- A [Supabase](https://supabase.com) project
- Node.js 22 or newer on the machine that installs dependencies. Current `@supabase/supabase-js` declares that engine. This machine was on Node 20 while the app was written; upgrade before you rely on it.
- A place to host the Next.js app. Vercel is the straightforward option. Any host that runs `npm run build` and `npm start` also works.
- Optional, for phone alerts: a VAPID key pair

## 1. Create the Supabase project

1. Create a project in the Supabase dashboard.
2. In **Project Settings → API**, copy the project URL and the **publishable** key.
3. Copy the **secret** key as well. It stays on the server. Do not put it in any `NEXT_PUBLIC_` variable and do not commit it.

## 2. Auth

Players sign up and sign in with an email and a password. Supabase Auth stores the password as a bcrypt hash in `auth.users`. The app never writes that hash, and it never puts a password in a URL.

If you already created an account with the old email code, that account has no password you know. Open **Forgot your password** once and set one. The old code link will not sign you in. Those links often failed when the inbox opened in a different browser from the one that asked for the code. The new links carry a token the server checks itself, so they work from a phone or a laptop.

1. **Authentication → Sign In / Providers → Email**:
   - **Allow new users to sign up** stays on.
   - **Email** is enabled.
   - **Confirm email** stays on. A new account cannot sign in until the person opens the link.
   - Set **Minimum password length** to `8`.
   - Leave required character types empty. The app accepts a passphrase of 8 or more characters, up to 72 bytes, and rejects common passwords and passwords that match the email.
   - Leave **Require current password** off. The signed-in change form checks the current password itself. The email reset link has to work without the old password. If you turn that switch on, reset can fail.
   - On Pro and above, turn on **Prevent use of leaked passwords** (HaveIBeenPwned). It rejects passwords that have already appeared in public breaches.
2. **Authentication → URL configuration**
   - Site URL: `http://localhost:3000` while you develop, then your real site URL when you deploy. The email templates use this as `{{ .SiteURL }}`, so it must be the app, not the Supabase API host.
   - Add these redirect URLs. The wildcard lets the confirm link return to the page the player was trying to open.
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**`
     - `https://YOUR_DOMAIN/auth/callback`
     - `https://YOUR_DOMAIN/**`
3. **Authentication → Emails → Templates**. Replace the default confirm and reset bodies. The default link only works in the same browser that started the request. These templates send the player to `/auth/confirm`, which checks the token on the server.

   **Confirm signup:**

   ```html
   <h2>Confirm your email</h2>
   <p>Follow this link to confirm your email and finish creating your account.</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirm your email</a></p>
   <p>If you did not create an account, you can ignore this email.</p>
   ```

   **Reset password:**

   ```html
   <h2>Reset your password</h2>
   <p>We received a request to reset your password. Follow this link to choose a new one. The link expires soon and works once.</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}">Reset your password</a></p>
   <p>If you did not ask for this, you can ignore this email. Your password will stay the same.</p>
   ```

4. Optional: turn on **Google** under Providers and add the same callback URLs. Sign in and sign up both have the button. A Google account can set a password later from **Forgot your password**.
5. Optional bot protection: **Authentication → Bot and Abuse Protection**, enable CAPTCHA. The forms also have a hidden field that discards bot submissions, and disposable inboxes are rejected at sign up.
6. Leave the built-in auth rate limits alone. They slow credential guessing. Supabase sends the email. On the free plan the built-in mailer is rate limited. For real club use, add your own SMTP provider under **Authentication → Emails**.
7. After a password change, the app signs out every other device. The device that just set the password stays signed in.

## 3. Local env

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your public URL in production |
| `SUPABASE_SECRET_KEY` | Secret key. Server only. |
| `CRON_SECRET` | A long random string you invent. The release job checks it. |

Leave the VAPID variables empty until step 7. The inbox still works without them.

## 4. Push the database

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

That applies, in order:

- `supabase/migrations/20260927150000_foundations.sql` — tables, RLS, and the game functions
- `supabase/migrations/20260927150100_clubs.sql` — 201 clubs snapshotted from [findapadelcourt.co.za](https://findapadelcourt.co.za/)
- `supabase/migrations/20260927220000_mvp.sql` — profiles, posting, requests, booking, chat, admin, and alerts

If the first two were already pushed, `db push` applies only the new file.

To make yourself an admin, run this in the SQL editor after you have signed in once. Use your user id from **Authentication → Users**:

```sql
update public.profile_private set is_admin = true where id = 'YOUR_USER_ID';
```

Do **not** add the `app` schema to **Data API → Exposed schemas**. The privileged functions live there on purpose. The app calls the `public` wrappers only.

In **Database → Publications**, `match_slots` should be in `supabase_realtime`. The migration adds it when that publication exists. If the game page does not update live, add `public.match_slots` in the dashboard.

## 5. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign in with your email, finish the profile, and post a game. `npm test` runs the slot-rule tests and does not need Supabase.

`npm run dev` does not register the service worker. Offline “Mine” is part of the production build (`npm run build && npm start`).

## 6. Scheduled slot release

Unconfirmed players are released by `public.run_scheduled_jobs()`. Something has to call it every minute. Pick one.

**Preferred: pg_cron inside Supabase**

1. Dashboard → **Database → Extensions**. Enable `pg_cron`.
2. In the SQL editor, as the postgres role:

```sql
select cron.schedule(
  'find-your-4th-jobs',
  '* * * * *',
  $$select public.run_scheduled_jobs();$$
);
```

**Alternative: hit the app**

`POST /api/jobs/release` with header `x-cron-secret: YOUR_CRON_SECRET`. Point a minute cron (Vercel Cron, or any scheduler) at that URL. This needs `SUPABASE_SECRET_KEY` and `CRON_SECRET` on the host.

The job also writes an attendance reminder in the two hours before a deadline.

## 7. Push alerts

1. Generate a VAPID key pair:

```bash
npx web-push generate-vapid-keys
```

2. Put the public key in both `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY`. Put the private key in `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT` to a `mailto:` address you control.
3. Deploy the edge function and its secrets:

```bash
npx supabase secrets set CRON_SECRET=YOUR_CRON_SECRET VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
npx supabase functions deploy push
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available inside edge functions.

4. Enable `pg_net`, then schedule a call to the function every minute. Replace the URL and the secret:

```sql
select cron.schedule(
  'find-your-4th-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Inbox rows are written even when push is not set up. iPhone only delivers Web Push to an installed home-screen app, on iOS 16.4 or later. See `/install`.

## 8. Put the site on the internet

On the host, set every variable from `.env.example` using the production URL for `NEXT_PUBLIC_SITE_URL`.

Build command: `npm run build`  
Start command: `npm start`

Then set the Supabase site URL and redirect URLs to that domain (step 2). Create an account on the live URL, open the confirmation link, and sign in with the password. Then use **Forgot your password** once and confirm the reset link opens `/reset-password`.

## 9. Refresh the club list later

Club rows are a snapshot, not a live call to findapadelcourt.co.za.

```bash
node scripts/import-clubs.mjs
node scripts/clubs-sql.mjs
```

Replace the contents of `supabase/migrations/20260927150100_clubs.sql` only if that migration has **not** been pushed yet. If it has, add a new migration with the generated SQL instead of editing the old file, then `npx supabase db push` again.

## What this repo cannot do for you

- Create the Supabase project or turn on billing
- Prove you own a domain, or set DNS
- Send real sign-in email until the project and SMTP exist
- Generate or store your secret keys
- Enable `pg_cron` / `pg_net` on the hosted project (dashboard toggles)
- Confirm iPhone install or push on a physical device
