# Bimyah Discord Activity — packaging guide

The web app and the Discord Activity are **one codebase, one backend**.
When loaded inside Discord (iframe with `frame_id` + `instance_id` params),
the app boots into Discord mode: SDK auth, Discord identity linking, and
Discord-native checkout. Outside Discord, everything behaves exactly as before.

## How it works

- `src/discord/detection.ts` — detects the Discord iframe, reads the public client id.
- `src/discord/DiscordProvider.tsx` — initializes `@discord/embedded-app-sdk`,
  exposes instance/channel/guild ids + the voice-channel participant roster,
  and handles `startPurchase()` / entitlement syncing.
- `POST /api/discord/exchange` — exchanges the SDK authorize `code` for a
  Supabase session. Links the Discord user to their Bimyah player record via
  `user_metadata.discord_id` (or creates the record on first Discord sign-in;
  the `handle_new_user` trigger builds the profile from the Discord name/avatar).
  No DB migration needed; web and Discord share the same `profiles`,
  `subscriptions`, and wallet records.
- `POST /api/discord/entitlements` — verifies Discord entitlements server-side
  (bot token) and writes B+ rows into the same `subscriptions` table the
  website checkout uses (`source: 'discord'`).
- `GET /api/discord/sku-catalog` — public plan → SKU id map for the client.
- `src/routes/auth.tsx` — in Discord mode shows "Continue with Discord"
  instead of email/password.
- `src/routes/plus.tsx` — in Discord mode the B+ button uses Discord checkout
  (Premium Apps SKU) instead of Stripe/PayPal. **Discord policy requires paid
  features offered in the Activity to be purchasable through Discord's Premium
  Apps products**, so the website-checkout link is not used in-Activity.

## Discord Developer Portal setup (one-time)

1. Create an application at https://discord.com/developers/applications (name: Bimyah).
2. Copy the **Application ID** → this is the client id.
3. Enable the Activity: App settings → **Activities** (or "Embedded App"),
   set the Activity URL to `https://playbimyah.com` (root; the app auto-detects).
4. OAuth2 → add redirect `https://playbimyah.com` (not strictly needed for the
   embedded code flow, but harmless).
5. For monetization: complete **Premium Apps onboarding** (verified app,
   developer team, ToS + Privacy Policy links), then create SKUs:
   - User subscription SKU for B+ monthly / annual, or a durable one-time
     SKU for the $5 lifetime founding member. Price on Discord must be **no
     higher** than the website price (Discord policy).
   - Note each SKU id.

## Environment / secrets

Build-time (public, safe in the repo `.env`):
- `VITE_DISCORD_CLIENT_ID` — the Application ID.

Worker secrets (never in the repo; set via `wrangler secret put` or dashboard):
- `DISCORD_CLIENT_ID` — same Application ID (server routes).
- `DISCORD_CLIENT_SECRET` — from the portal (OAuth tab).
- `DISCORD_BOT_TOKEN` — bot token for server-side entitlement verification.
- `DISCORD_SKU_MAP` — JSON, e.g.
  `{"<sku_id>": {"kind": "bplus", "plan": "lifetime"}}`
  Plans: `lifetime`, `monthly`, `annual`. Consumable bimbucks SKUs can be added
  later as `{"kind": "bimbucks", "amount": 1000}`.

Until `VITE_DISCORD_CLIENT_ID` is set, Discord mode stays inert and the site
behaves exactly as the standalone web game.

## Testing

1. In the portal, add a test server under Activities → Testers (or launch the
   Activity from a voice channel in a dev server).
2. Open the Activity: you should land on "Continue with Discord", tap it,
   approve, and arrive signed in with your Discord name/avatar.
3. Play a game: the participant roster (`useDiscord().participants`) is
   available for voice-channel room matchmaking.
4. B+ purchase: `/plus` shows "Upgrade to B+ with Discord"; completing the
   Discord checkout writes a `subscriptions` row with `source: 'discord'` and
   the account shows B+ on the web too.

## Notes / deferred

- Voice-channel rooms: the roster is exposed; wiring "create room from voice
  channel" into the existing P2P/Durable Objects game flow is the next step.
- Consumable bimbucks SKUs: endpoint acknowledges them; the grant table +
  credit RPC land with that launch.
- `profiles.discord_id` column: intentionally deferred (zero-migration
  approach via `user_metadata`). Add it when the DB copy to the new Supabase
  project lands.
