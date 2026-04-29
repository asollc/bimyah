# Bimyah!+ Premium Tier — Plan

## Recommended approach (high level)

Build this in **5 incremental phases** instead of one giant feature drop. Each phase ships value and is independently testable. I'd strongly recommend approving them one at a time.

**Phase order:**

1. Accounts & profiles (foundation — everything else depends on it)
2. PayPal payments + Bimyah!+ entitlement
3. Premium cosmetics (avatars + custom card backs)
4. 8-player game support (requires deck/engine changes — biggest lift)
5. Admin dashboard + alerts system

---

## Phase 1 — Accounts & Profiles

**Backend (Lovable Cloud):**

- Require email/password or Google sign-in to play
- `profiles` table: `id` (FK → auth.users), `display_name`, `avatar_url`, `created_at`. Auto-created via trigger on signup.
- `user_roles` table + `app_role` enum (`user`, `admin`) + `has_role()` security-definer function (per security best practice — never store roles on profiles).
- RLS: users read/update own profile; anyone can read display_name + avatar (so opponents see them).

**Frontend:**

- `/auth` route (sign in / sign up / Google).
- `/profile` route (edit name, avatar).
- Header: replace empty placeholder (top-left of home) with avatar/initial when signed in, "Sign In" link when not.
- Accounts are **required**. Clicking any buttons on the home screen should prompt users to create an account

---

## Phase 2 — Stripe + Bimyah!+ Entitlement

&nbsp;

---

## Phase 3 — Premium Cosmetics

**Custom avatars:**

- New Cloud storage bucket `avatars` (public read, owner write, 2MB cap, image/* only).
- Profile page upload widget → stores at `avatars/{user_id}.{ext}`, writes URL to `profiles.avatar_url`.
- `Player` type in game state already has `name`/`color` — add optional `avatarUrl`. Host snapshots the URL into the player record at game-create time so it propagates to all peers via PeerJS state sync.
- Render avatar in `GameTable` player nameplates.
- Gating: only B+ users can set a non-default avatar. Non-B+ keeps initial-on-color-circle.

**Custom card backs:**

- New Cloud storage bucket `card-backs` (public read, owner write).
- Profile page: upload custom image, preview at card aspect ratio (5:7), crop helper.
- Add `card_backs` table: `user_id`, `image_url`, `is_active`. (One active per user; allow library of multiple later.)
- `CardBack` component already uses one image (`@/assets/card-back.jpeg`). Make it accept an optional URL prop. Pull from a per-player map in game state, defaulting to the asset.
- Per-player card backs: each player sees opponents' chosen backs on opponents' face-down cards. Host snapshots active card-back URLs at game start.
- Gating: only B+ users can set custom; UI shows lock icon otherwise.

---

## Phase 4 — 8-Player Games

**This is the largest engine change.** Current deck is one 52-card deck dealt as:

- 2P → 6 piles × 4 cards = 48 + 4 center
- 3P → 4 piles × 4 cards × 3 = 48 + 4 center
- 4P → 3 piles × 4 cards × 4 = 48 + 4 center

For 5–8 players we need **two decks** (104 cards). Proposed dealing:

- 5P → 5 piles each (100 cards) + 4 center
- 6P → 4 piles each (96) + 8 center
- 7P → 4 piles each (112 cards) + 8 center, use 4 extra Aces, Jacks, Queens and Kings
- 8P → 3 piles each (96) + 8 center

Two decks means duplicate card IDs → must change `Card.id` to include a deck index (`A♠#0`, `A♠#1`). This touches: `deck.ts`, `engine.ts` four-of-a-kind detection (still works since it checks rank), `Card` rendering (no change), and any `Map<cardId, ...>` usage.

**Scope-of-work checklist:**

- `deck.ts`: `buildDeck(deckCount)`, updated `pilesPerPlayer`, updated `deal`.
- `engine.ts`: `PLAYER_COLORS` extend to 8 colors; verify all per-player loops handle larger arrays; tournament scoring already keyed by id (fine).
- `GameTable.tsx`: layout currently arranges 2/3/4 player seats — need 5/6/7/8 seat layouts. Place each of the additional seats between two of the North, South, East and West seats
- Host gating: when host creates a lobby with `>4` total seats, server function checks `has_bimyah_plus(host_user_id)` before allowing.
- Bots count toward seat total per your spec ("up to 7 other players/bots").

---

## Phase 5 — Admin Dashboard + Alerts

**Admin route `/admin**` — gated by `has_role(uid, 'admin')`, redirect otherwise.

**Widgets:**

- **Online players (live):** create `presence` table (`user_id`, `last_seen`); client heartbeats every 30s while app is open. Count rows where `last_seen > now() - interval '90 seconds'`. Or use Supabase Realtime presence channel (lighter, no DB writes).
- **Total B+ accounts:** `count(*) from subscriptions where status in ('active')` grouped by plan.
- **Revenue:** sum of `payments.amount_cents` total + last 30 days + this month. Chart: monthly revenue over time.
- **Manage accounts:** searchable user table with columns name, email, plan, status, joined. Actions: upgrade (insert active subscription with `plan='lifetime'`, source `admin_grant`), downgrade (set status `cancelled`).
- **Overdue balances:** list `subscriptions where status='past_due'` with days overdue + last failed payment.
- **Post updates / alerts:** new `announcements` table (`id`, `title`, `body`, `published_at`, `expires_at`, `audience` enum `all`|`plus_only`). Admin posts via form. Public read via RLS for active rows.

**Alerts UI on home screen:**

- Replace the current top-left empty `<div className="h-9 w-9" />` placeholder with the **3D gold bell icon**.
- Bell shows red dot when there's an unread/active announcement (track read state in `localStorage` for guests, `announcement_reads` table for accounts).
- Click → drawer/sheet listing announcements newest-first with title, body, posted date.

---

## Other features I'd suggest adding

Pick whichever resonate; happy to scope any of them:

1. **Friend system & invites** — add friends by username, see who's online, invite to a private room from the alerts/friends panel. Strong retention driver.
2. **Stats & leaderboards** — per-account: games played, win rate, fastest match, tournament titles. Global weekly leaderboard. Free tier shows last 10 games; B+ shows full history + export.
3. **Match replay** — record intent log per game; B+ can replay any past match. Cheap to store, very sticky.
4. **Custom room rules (B+ host perk)** — adjust hold-duration, starting hand size, point-limit presets, "no bots" toggle, spectator mode.
5. **Spectator mode** — read-only PeerJS connection so people can watch friends play.
6. **Themed card-back marketplace** — you curate free + B+-exclusive card backs (holiday, sports, etc.). Cheaper than user uploads to moderate, and creates a reason to keep B+ active monthly.
7. **Profile badges** — "Founding Member" badge auto-granted to lifetime preorder buyers (great FOMO lever for the $5 promo). Tournament champion badges.
8. **Discord/Twitch integration** — "Now playing Bimyah!" rich presence, stream-overlay friendly spectator URL.
9. **Push notifications / email** — "Your friend started a game", "You have an overdue payment", weekly tournament digest.
10. **Referral credits** — refer a friend who buys B+, both get a free month / cosmetic.
11. **Daily challenge** — single solo puzzle every day, shared seed, leaderboard. Free for all; B+ unlocks past challenges.
12. **Analytics opt-in** — even basic funnel tracking (visits → signup → purchase) will be invaluable once you're charging money. PostHog or simple Cloud-side event log.

---

## Technical details (for reference)

- All schema changes via the migration tool. Roles in dedicated `user_roles` table with `has_role()` security-definer.
- Game-state propagation: avatars + card-back URLs added to `Player` type → automatically flow through PeerJS broadcasts (no peer protocol changes).
- Deck change to deck-tagged card IDs is the single highest-risk refactor — ship Phase 4 alone, with regression testing of 2/3/4-player games before adding 5–8.
- Admin online-players widget: prefer Supabase Realtime presence over polling `last_seen` to avoid write load.
- Storage buckets need RLS: read public, write owner-only, with file-size + mime-type checks on upload.

---

## Open questions before I build

1. **Lifetime preorder window** — do you want a hard end date, a quantity cap (e.g. first 500), or a manual admin toggle?
2. **Refund policy** — do failed monthly payments retry automatically (PayPal default) or immediately downgrade?
3. **Avatar/card-back moderation** — auto-approve uploads, or admin queue? User uploads of arbitrary images is a content-moderation risk.
4. **Card-back image rights** — should the upload form show a "you confirm you have rights to this image" checkbox?
5. **Should existing guest game progress / reentry codes survive after signing in,** or do accounts and guest sessions stay separate?

Once you confirm direction (especially on PayPal vs Stripe and which phase to start), I'll begin with **Phase 1: Accounts & Profiles**.