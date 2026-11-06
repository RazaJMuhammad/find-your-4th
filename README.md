# FindYour4th

Mobile-first web app for padel players in South Africa. Browse open games near you, post one when you need 1, 2, or 3 players, and join on the spot or ask the host first.

## Run it

1. Start Docker, then:

```bash
npx supabase start
```

2. Copy the API URL and anon key from the status output into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=the-anon-key
```

3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on a phone, or in a narrow browser window.

## Home screen and alerts

FindYour4th is a progressive web app. Chromium browsers get an Add to Home Screen button. In Safari on iPhone there is no install button: tap Share, then Add to Home Screen, then Add, and open the new icon. iPhone alerts only work from that icon.

Alerts go to people involved in a game, and to players near a new one:

- the host, when someone joins or asks to join
- the player, when a host accepts, declines, or removes them
- joined and waiting players, when a host cancels
- the host and players, when the game fills or about two hours before it starts
- anyone with alerts on, when a game is posted within their chosen distance (10, 25, 50, or 100 km, default 25) of their last shared location, at most 5 a day

Generate the server keys and store the dispatch secret in local Vault:

```bash
node scripts/setup-push.mjs
```

Restart `npm run dev` after that so the public key is picked up. Add the same variables from `.env.example` on any deployed server, and point Vault `push_dispatch_url` at that server's `/api/push/dispatch`.

Club names, cities, and court counts come from [findapadelcourt.co.za](https://findapadelcourt.co.za/). Coordinates come from the [Padel Snipe open club file](https://padelsnipe.com/en/world/api) (CC-BY 4.0) where the names match, and OpenStreetMap Nominatim otherwise. Refresh the seed with `node scripts/seed-clubs.mjs`, then `npx supabase db reset`.

Signup uses email and a password. Email confirmation is off in the local Supabase config so people are in immediately. WhatsApp numbers stay hidden until you are in the same game.
