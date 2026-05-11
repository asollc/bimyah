# Inactive players + free-cards system

## Behavior

1. **Disconnect → instant `(inactive)` badge.** The host watches per-player WebRTC connection state. The moment a joiner's connection closes, the host stamps that player with `disconnectedAt = now()` and broadcasts. UI shows `(inactive)` near the player's hand/seat label.
2. **Reconnect within 45s.** When the player's connection re-opens, the host clears `disconnectedAt` and the badge disappears. No state loss.
3. **45s elapsed → `(free cards)`.** Host tick promotes the player to `freeCards: true`. Their `(inactive)` badge becomes `(free cards)`. Their open pile (if any) is auto-closed back into its slot so all cards live in piles.
4. **Free-card piles are public.** Any other live player can tap one of an inactive player's pile stacks to flip it face-up for viewing (mirrors the existing pile-tap mechanic — tap to open, tap again to close). Only one inactive pile per viewer can be open at a time.
5. **Swapping from a free-card pile.** When a viewer taps a card inside an opened free-card pile, that card is "held" with the same 5-second timer used for the center. Globally, a player can hold either one center card OR one free card — not both. Tapping a card in their own hand completes the swap (free-card pile receives the hand card; viewer's hand receives the free card). Hold expires after 5s, just like the center.
6. **New match removes them.** `keepReadyPlayers` already filters by host/bot/`readyForNext`. We additionally drop any player whose `freeCards` flag is set so starting a new match permanently removes them from the lobby.
7. **Tournament scoreboard.** Inactive/free-card players stay listed on the scoreboard with their accumulated points; their name row gets an `(inactive)` label above it.

## Technical changes

### `src/game/types.ts`
Extend `Player`:
- `disconnectedAt?: number | null` — ms timestamp of last disconnect (cleared on reconnect)
- `freeCards?: boolean` — true once 45s has elapsed without reconnect
- Extend pile state with a per-player `pileHolds?: Array<{ cardId: string; heldBy: string; heldUntil: number } | null>` indexed by pile, used only when `freeCards` is true.
- Extend `Player` with `pileOpenForViewer?: Record<string, number>` — viewerId → which inactive-pile index they currently have open. (Stored on the inactive player's record so it lives with the piles.)

### `src/game/engine.ts`
New helpers:
- `INACTIVE_GRACE_MS = 45_000`, `FREE_CARD_HOLD_MS = 5_000`
- `markDisconnected(state, playerId)` / `markReconnected(state, playerId)`
- `tickInactive(state)` — promote `disconnectedAt` players past the grace window to `freeCards: true`; auto-close their open pile.
- `viewFreeCardPile(state, viewerId, ownerId, pileIndex)` — toggle which pile is open for that viewer (one at a time).
- `holdFreeCard(state, viewerId, ownerId, pileIndex, cardId)` — sets a hold with `heldUntil = now + 5s`. Rejects if viewer already holds any center or free card.
- `swapFreeCard(state, viewerId, handCardId)` — completes the swap with whichever free-card hold the viewer owns.
- `tickFreeCardHolds(state)` — releases expired holds.
- `keepReadyPlayers` updated to drop `freeCards` players; `setReady` and `nextMatch` already cascade.

### `src/game/peer.ts`
Host tracks `connId → playerId` mapping (joiner sends their `meId` in the existing `hello` message; we already have `playerId` in intents). On `conn.open` it dispatches `markReconnected(playerId)`; on `conn.close` it dispatches `markDisconnected(playerId)`. New intents: `viewFreePile`, `holdFreeCard`, `swapFreeCard`, plus internal host-only ticks.

To learn each connection's playerId, joiners send a new `{ type: "hello"; playerId }` message immediately after the data channel opens (the message type already exists, we just add `playerId`).

### `src/components/game/GameTable.tsx`
- Pass `inactivePlayers` info to `PlayerSeat`. Render `(inactive)` / `(free cards)` chip beneath the seat label.
- For **other** seats whose player has `freeCards`, make their pile stacks tappable: route through new `viewFreePile` / `holdFreeCard` intents. Reuse the same flip animation. When a card from a free pile is held, draw the same outline ring used by the center hold; the timer animation reuses the existing held-card behavior.
- Hand-card tap handler: if the viewer is currently holding a free card (not a center card), the swap routes to `swapFreeCard` instead of the regular `swap`.
- Block taps when `state.status !== "playing"`.

### `src/components/game/Visuals.tsx` (Scoreboard)
- For each row, if `player.freeCards` (or `disconnectedAt`), render a small `(inactive)` label above the name. Keep the score visible.

### Host loop
Add `setState((s) => tickInactive(s))` and `tickFreeCardHolds(s)` to the existing 250ms interval in `GameTable`.

## Out of scope
- Solo mode (no real disconnects possible).
- Host disconnect (host owns state; existing rehost flow is unchanged).
- Persisting disconnected timestamps across host refresh — host already keeps the authoritative state in memory and re-broadcasts it.
