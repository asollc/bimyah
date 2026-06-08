## Goal
Make every equipped decor item fully replace the previous one in-game, give table art the same chrome as the default, introduce purchasable badge slots with tap-to-equip, normalize sizing across all decor, and let admins edit/replace the built-in defaults for every user.

## 1. Exclusive equip rendering (backgrounds, tabletops, victory FX, titles)
Audit `GameTable.tsx` and `Visuals.tsx` for the 4 decor kinds. Today the equipped layer renders **on top of** the default (red gradient still visible under an emerald background, confetti still bursts under a custom victory FX, etc.).

Fix: render the default ONLY when `equipped[kind]` is null. When an item is equipped, mount that layer alone — no default underneath. For backgrounds and tabletops this means swapping the base layer, not stacking. Victory FX swaps the animation component entirely. Titles already swap text but currently keep the default styling box around them; remove the default wrapper when a custom title is active.

## 2. Table art chrome
Default table art (Bimyah! graphic) sits inside the tabletop frame with object-fit/inset that matches the wood grain. Custom table-art uploads currently render raw and break the look.

Fix: wrap every active table-art image in the same container the default uses (rounded inset, drop-shadow, mask matched to the tabletop). Container reads the active **tabletop** to pick the matching frame style (wooden, metallic, etc.) so the table-art "belongs" to the table beneath it. Add `tabletop_style` metadata (`wood | metal | neutral`) on each tabletop product; default falls back to `wood`.

## 3. Active Badges slots (Bmart + B+ + tap-to-equip)
Mirrors Active Cards on the Cards tab.

- Add `badge_slots_purchased INT NOT NULL DEFAULT 0` to `wallets`.
- Effective slot count = `1 + badge_slots_purchased + (has_bimyah_plus ? 1 : 0)`, capped at 2.
- New DB function `purchase_badge_slot(_user)` — 150 Bimbucks per slot, max 1 purchasable. RPC returns updated wallet.
- `user_equipped` already has `badge_id`; add `badge_id_2 TEXT NULL` for the second slot.
- Profile → Decor → Badges tab gets an **Active Badges** strip above the grid: 1–2 slot tiles + a `+` tile (150 Bimbucks) when a slot can be purchased. B+ members see slot 2 unlocked automatically with no purchase tile.
- Tap-to-equip rules:
  - 1 slot unlocked: tap an owned badge → instantly equips into slot 1 (tap equipped badge to clear).
  - 2 slots unlocked: tap an owned badge → highlights it; tap a slot to place it (or tap the slot's existing badge to clear).
- In-game: render both equipped badges next to the local player's nameplate.

## 4. Badge sizing rule
All badges (default + purchased + admin-test) render at a fixed `height = nameplate oval height`, `width: auto`, `object-fit: contain`. Applies in:
- Active Badges slot tiles
- Owned badge grid tiles
- In-game nameplate
This guarantees a tall badge can't push the nameplate row taller than the oval.

## 5. Consistent decor sizing
Each kind has the default item's bounding box. Apply that box to every tile and in-game render of that kind:
- Titles → default title's text box width/height
- Backgrounds → full-viewport (already)
- Tabletops → table frame box
- Table art → tabletop inner inset
- Victory FX → centered overlay box of default confetti
Tiles in the Decor tab use the same aspect ratios so previews are visually comparable.

## 6. Admin-edit defaults (image + name, applies to all users)
New table `decor_defaults` keyed by `(kind, default_key)` with columns `name_override TEXT NULL`, `image_url_override TEXT NULL`, `updated_by`, `updated_at`. Built-in defaults stay in code as the fallback; the loader merges DB overrides over them.

- New admin-only server fns: `adminUpsertDefaultOverride({ kind, defaultKey, name?, imageUrl? })`, `adminClearDefaultOverride(...)`, `getDecorDefaults()` (public read).
- Admin Test section in each Decor category gains an **Edit Default** button next to the default item: opens a dialog with name input + image uploader (uses `public-assets` bucket).
- Client-side default lookup in `cosmetics.ts` / `DecorTab.tsx` / `GameTable.tsx` reads from a single cached `getDecorDefaults()` query so changes appear for every user on next load.

## Technical details

### DB migration
```sql
ALTER TABLE wallets ADD COLUMN badge_slots_purchased INT NOT NULL DEFAULT 0
  CHECK (badge_slots_purchased BETWEEN 0 AND 1);
ALTER TABLE user_equipped ADD COLUMN badge_id_2 TEXT NULL;
ALTER TABLE bmart_products ADD COLUMN tabletop_style TEXT NULL; -- 'wood' | 'metal' | 'neutral'

CREATE TABLE public.decor_defaults (
  kind inventory_kind NOT NULL,
  default_key TEXT NOT NULL,
  name_override TEXT,
  image_url_override TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, default_key)
);
GRANT SELECT ON public.decor_defaults TO anon, authenticated;
GRANT ALL ON public.decor_defaults TO service_role;
ALTER TABLE public.decor_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read defaults" ON public.decor_defaults FOR SELECT USING (true);
CREATE POLICY "Admins manage defaults" ON public.decor_defaults FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE FUNCTION public.purchase_badge_slot(_user_id UUID) RETURNS JSONB ... ;
```

### Files
**Created**
- `supabase/migrations/<ts>_decor_v2.sql`
- `src/lib/rpc/decorDefaults.functions.ts`

**Edited**
- `src/lib/rpc/decor.functions.ts` — `purchaseBadgeSlot`, second-slot equip, badge slot-aware setEquipped
- `src/components/profile/DecorTab.tsx` — Active Badges strip, tap-to-equip flow, Edit Default admin action, consistent tile sizes
- `src/components/game/GameTable.tsx` — exclusive layer rendering, table-art chrome, dual badge render
- `src/components/game/Visuals.tsx` — victory FX exclusivity
- `src/game/cosmetics.ts` — merge defaults overrides, persist 2nd badge URL
- `src/game/types.ts` — `equippedBadge2Url`, extended `Player`
- `src/components/wallet/WalletOverlay.tsx` — show badge slot purchase in ledger

## Out of scope
- Earning badges outside Bmart (existing inventory insert path stays)
- New artwork for defaults (admin replaces via UI)
- Mobile-specific badge layout beyond the nameplate-height rule
