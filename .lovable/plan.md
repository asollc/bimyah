
# Bimyah! — Fast-paced card game

A mobile-first, dark-themed card game with vibrant emerald gradients, real-time online multiplayer, and bots. Everything fits on screen — no scrolling.

## Visual direction
- **Palette:** Midnight emerald gradient (`#0a1f1a → #0d3b2e`), mint accent `#2dd4a8`, gold accent `#fbbf24`. Player colors: red / blue / yellow / green.
- **Typography:** Sora (display, BIMYAH! logo) + Manrope (body/UI).
- **Card backs:** White-edged cards with a comic "POW!" burst and "BIMYAH!" inside, mint/gold burst on emerald.
- **Card faces:** Vibrant glossy cards with bold suit pips, slight 3D tilt on hover/tap.
- **Table:** Round wooden tabletop (radial wood-grain gradient) centered on screen, players arranged radially around it.
- **Animations:** Fluid card flips, slide-to-hand, swap-with-center morphs, colored outline pulses on held center cards, falling confetti on win.

## Screens

### 1. Main screen (`/`)
- Big BIMYAH! logo with pow burst.
- Three large 3D buttons: **Solo (vs Bots)**, **Host Multiplayer**, **Join Game** (also reachable via invite link).
- Top-right: **How to Play** button → modal.
- Top-left: **Screen rotation** icon (toggles landscape/portrait orientation hint).
- Footer: local **Win history** (name + wins from localStorage).

### 2. Join prompt (`/join/$gameId`)
- Players who follow an invite land here: just a name input + Join button. After submitting, they enter the game lobby.

### 3. Game screen (`/game/$gameId`)
- Top-left: rotation icon. Top-right: How to Play.
- Top-center: invite link/copy button (host lobby only) showing `bimyah.app/join/XYZ`.
- Round wooden table centered. Player areas radially arranged:
  - **2P:** opposite (top/bottom)
  - **3P:** triangle (bottom + top-left + top-right)
  - **4P:** cross (N/E/S/W)
- Each player area shows their face-down piles (count depends on player count).
- Self area also shows the **hand row** (up to 5 cards) above their piles, with a small **SET** button at the top-right of the hand view.
- Center of table: 4 face-up cards. A red 3D **BIMYAH!** button sits just under the center cards (only enabled when local player has 4 completed sets).
- Pre-game: 3D **Ready?** button in front of each seated player. Countdown 3-2-1 once all ready.
- Post-win: confetti, then **Play Again?** button appears above the table after 2s.

## Gameplay rules (enforced)
- Deal entire deck into equal face-down piles (2P: 6×4, 3P: 4×4, 4P: 3×4); 4 leftover cards face-up in center.
- No turns — simultaneous play after 3-2-1 countdown.
- Tap own pile → cards shown in hand row (max 5). Tap another pile → previous cards return face-down to that pile, new pile opens.
- Tap a center card → starts invisible 5s timer; player's color outlines the empty center slot. Tap a hand card to swap immediately. If 5s expires, card returns to center, outline clears.
- Only one held pile at a time. Only one card swap at a time. Center always has 4 cards.
- When all 4 cards in hand are same rank → SET button locks them as a vertical cascade where the pile was.
- All 4 piles set → BIMYAH! button enabled → tap to win → confetti → Play Again resets with same players, reshuffles.

## How to Play modal
- Triggered from main + game screens. Contains the full rules text (Objective, Setup with player counts, Gameplay, Limitations, Center, Winning) in a scrollable, dark, gradient-styled overlay.

## Multiplayer (Lovable Cloud)
- **Tables:** `games` (id, host_id, status, player_count, deck_state, center_cards, current_seat_holds, started_at), `players` (game_id, seat, name, color, piles, hand, completed_sets, ready, is_bot), `swap_holds` (game_id, center_index, player_id, expires_at).
- **Realtime:** Supabase Realtime channel per `games.id` broadcasts pile/hand/center/hold changes to all clients with optimistic local updates.
- **Server functions:** `createGame`, `joinGame`, `setReady`, `holdCenterCard`, `swapCard`, `releaseHold`, `openPile`, `closePile`, `declareSet`, `declareBimyah`, `playAgain`. Server validates rules (1 hold at a time, 4-card center, 5s expiry) to prevent cheating.
- **Invite:** Host sees a shareable link with copy button. Joiners enter name → seated → ready up.

## Bots
- One difficulty: steady pace. Run on the host client (or a server tick). Each bot opens a random pile, decides whether to swap (prefers grouping toward most-common rank in pile), holds center for ~1.5–2.5s before swap, releases pile, picks next.

## Extras
- **Sound:** card flip, swap, set lock, BIMYAH win, countdown ticks. Mute toggle in main screen.
- **Win history (local):** track game wins by player name in localStorage; shown on main screen.

## Routes
- `/` — main / lobby launcher
- `/join/$gameId` — name entry for invited players
- `/game/$gameId` — lobby + active game (same screen, state-driven)

## Out of scope (v1)
- Accounts/auth (anonymous play with display name only)
- Spectator mode, chat, emotes
- Cross-device sound/haptic settings sync
