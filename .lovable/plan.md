## Goal
Replace the profile "Titles" tab with a richer **Decor** tab, wire Bmart purchases into real ownership + an active-equipped state per category, render equipped Decor in-game (host-gated for shared elements), and add a purchase ledger to the wallet.

## Database (single migration)

New tables (all RLS-locked to the owner, plus admin-manage policies):

- `user_inventory` — `(user_id, kind, item_id, acquired_at, source)`  
  `kind` enum: `card_back | title | badge | victory | background | tabletop | table_art`. One row per owned item.
- `user_equipped` — `(user_id PK, title_id, badge_id, victory_id, background_id, tabletop_id, table_art_id)`. Nulls = defaults ("NONE" / standard). One row per user.
- `purchase_ledger` — `(id, user_id, item_id, item_name, currency, price, created_at)`. Append-only log of every Bmart purchase (real-money Bimbucks top-ups stay in the existing payments table).

Also: add `kind` column (text) to `bmart_products` so admin-added items advertise which inventory bucket they belong to.

DB function `purchase_bmart_item(_user, _item_id, _name, _currency, _price, _kind)` — atomically: debit wallet, insert inventory row (idempotent on `(user_id, kind, item_id)`), insert ledger row. Returns new wallet balances.

## Server functions (`src/lib/rpc/decor.functions.ts`)

- `getMyInventory()` → `{ inventory, equipped }`
- `setEquipped({ kind, itemId | null })` → updates `user_equipped`
- `purchaseItem({ itemId })` → resolves the product (catalog merge), calls `purchase_bmart_item` RPC, returns updated wallet + inventory
- `getMyLedger()` → recent purchase rows

Update `bmart.tsx` `buyNow` / checkout to call `purchaseItem` and update local wallet + toast.

## Profile UI (`src/routes/profile.tsx` + new `DecorTab.tsx`)

- Rename tab `titles` → `decor` ("Decor" label).
- `DecorTab` renders a secondary `Tabs` row: **Titles · Badges · Victory FX · Backgrounds · Tables**.
- Each panel lists owned items merged with the relevant defaults; selecting an item opens a confirm dialog ("Use this in-game?"), then calls `setEquipped`.
- Titles tab: leads with a rectangular **NONE** tile (clears active title). Horizontal scroll.
- Badges tab: leads with a square **NONE** tile. Horizontal scroll.
- Victory FX tab: leads with **Confetti** (default).
- Backgrounds tab: leads with **Original Red Gradient**.
- Tables tab: two sub-sections — *Table Tops* (default: original wooden) and *Table Art* (default: original Bimyah! graphic).

Each tile shows an "Active" badge when equipped.

## In-game rendering

- Equipped title/badge/victory belong to the local player → already-loaded `getMyInventory` flows into `GameTable` via player state (extend `Player` type with `equipped`).
- Background / tabletop / table_art only render from the **host's** equipped state. Read host equipped at game-create time and store on `GameState`.
- Card backs continue using the existing `cardBackUrls` path; the equipped card back becomes the new default slot.

## Wallet ledger UI

Extend `WalletOverlay`: add a "Purchase history" section listing `purchase_ledger` rows (item name · price w/ currency icon · relative date). Empty-state copy when none.

## Files

**Created**
- `supabase/migrations/<ts>_decor_inventory.sql`
- `src/lib/rpc/decor.functions.ts`
- `src/components/profile/DecorTab.tsx`

**Edited**
- `src/routes/profile.tsx` — swap Titles tab for Decor
- `src/routes/bmart.tsx` — wire real purchase + ledger
- `src/components/wallet/WalletOverlay.tsx` — add purchase ledger
- `src/game/types.ts` — extend `Player` and `GameState` with equipped fields
- `src/components/game/GameTable.tsx` — render equipped title/badge/victory; respect host's background/tabletop/table_art
- `src/game/cosmetics.ts` — load equipped state at game create

## Out of scope
- New artwork for default items (using existing graphics/components)
- Earning items outside of Bmart purchases (acquisition uses the same `user_inventory` insert path, so future earn flows just call it)