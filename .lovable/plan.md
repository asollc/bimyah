## Four Tweaks: Sort, Host Name, Pile Indicator, Home Button

### 1. Sort button (under SET) — groups same-rank cards left→right

**`src/components/game/GameTable.tsx`**
- Add a new local intent handler `handleSort()` that reorders `me.hand` so cards of the same rank cluster together (stable sort by rank-frequency desc, then by rank). Since hand reordering is purely cosmetic for the local player, store a local `handOrder: string[]` (array of card IDs) in component state and apply it when rendering the hand row.
- Render a small "SORT" button directly underneath the existing "SET" button in the hand row (same column, smaller, neutral style — e.g. mint outline). Only show during `status === "playing"` while the hand is open.
- Tapping SORT recomputes the order so identical ranks become adjacent (e.g. `7♥ K♠ 7♣ 2♦` → `7♥ 7♣ K♠ 2♦`), animating via existing `animate-pop-in`.

*Note:* This is purely a client-side display order — no engine/peer changes needed, so it stays in sync-safe territory.

### 2. Host name prompt before hosting

**`src/routes/index.tsx`**
- Replace the immediate `hostMultiplayer()` execution with a new `HostNamePicker` panel (parallel to `SoloPicker` / `JoinPicker`), shown when the user taps "Host Multiplayer".
- The panel contains a text input (`maxLength={14}`, autofocus, default value pulled from `localStorage.getItem("bimyah_last_name")` if present) and a "Start Hosting" button. Cancel returns to the main button stack.
- On submit, run the existing host flow but pass the entered name instead of `"Host"`, persist it to `localStorage` as `bimyah_last_name` for future sessions, and continue with `saveIdentity` + navigation.
- Add validation: trim whitespace, require ≥1 character, fall back to "Host" if empty.

### 3. Selected pile indicator

**`src/components/game/Card.tsx`**
- Extend `CardBack`'s `highlight` styling: when `highlight={true}`, in addition to the mint ring, add a small floating "OPEN" pill or pulsing dot above the card. Keep the mint ring + glow but make it more obvious (thicker ring + a `animate-pulse-ring` overlay).

**`src/components/game/GameTable.tsx`**
- The pile rendering already passes `highlight={isOpen}` for the local player's open pile. No prop changes needed — the visual upgrade in `Card.tsx` covers it.
- For empty open piles (the placeholder div when `pile.length === 0 && isOpen` would currently render nothing distinctive), render a dashed mint-bordered slot with the same indicator so the player can tell which pile they have open even after exhausting it.

### 4. Replace rotation icon with Home button + confirmation

**`src/components/game/Visuals.tsx`**
- Add a new exported `HomeButton` component that renders a `Home` icon (from `lucide-react`) inside the same circular button styling as `RotationIcon`. On tap, it opens a confirmation dialog ("Return to home screen? Your current game will be left behind.") with Cancel / Confirm buttons.
- Use the existing `AlertDialog` primitives from `@/components/ui/alert-dialog` for the confirmation. On confirm, navigate to `/` via TanStack Router's `useNavigate`.
- Keep the `RotationIcon` export in place but stop using it.

**`src/components/game/GameTable.tsx`**
- Replace `<RotationIcon />` in the top-left bar with `<HomeButton />`.

**`src/routes/index.tsx`**
- Remove the `<RotationIcon />` from the home page top bar (it's redundant on the home screen itself). Leave just the `HowToPlayButton` on the right; the left side becomes empty (or holds a small spacer for layout balance).

### Files touched
- `src/components/game/GameTable.tsx` — sort button + state, swap RotationIcon for HomeButton
- `src/components/game/Visuals.tsx` — add `HomeButton`
- `src/components/game/Card.tsx` — beefed-up `highlight` indicator on `CardBack`
- `src/routes/index.tsx` — `HostNamePicker` flow, remove rotation icon

No engine, peer, or persistence changes required — keeps the recent multiplayer-sync work untouched.