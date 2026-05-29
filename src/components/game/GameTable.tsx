import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, Player, PlayerColor } from "@/game/types";
import { CardBack, CascadeSet, EmptySlot, PlayingCard } from "./Card";
import {
  tickCountdown,
  tickHolds,
  tickIdle,
  tickInactive,
  tickFreeCardHolds,
  canDeclareBimyah,
  COUNTDOWN_MS,
} from "@/game/engine";
import { isFourOfAKind } from "@/game/deck";
import {
  Confetti,
  Countdown,
  HomeButton,
  MatchBadge,
  ScoreDisplay,
  Scoreboard,
  ScoreboardButton,
} from "./Visuals";
import { HowToPlayButton } from "./HowToPlay";
import { createBotMemory, stepBots } from "@/game/bot";
import { sfx, recordWin } from "@/game/sfx";
import { Copy, Check, Volume2, VolumeX, ArrowDownUp, Settings, X, Eye, MessageCircle, UserPlus } from "lucide-react";
import { InviteFriendsOverlay } from "@/components/InviteFriendsOverlay";
import { cn } from "@/lib/utils";
import { applyIntent, type Intent } from "@/game/peer";
import { DEFAULT_KEYBINDS, loadLocal as loadKeybindsLocal, type Keybinds, type ActionId } from "@/game/keybinds";
import { KeybindEditor } from "./KeybindEditor";
import { Movable, useMovableLayouts } from "./Movable";
import { ChatPanel } from "./ChatPanel";
import type { ChatChannel } from "@/game/types";

export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#a855f7",
  orange: "#fb923c",
  cyan: "#22d3ee",
  pink: "#ec4899",
};

export function GameTable({
  state,
  setState,
  sendIntent,
  isHost = true,
  meId,
  inviteUrl,
  spectator = false,
}: {
  state: GameState;
  setState: (mutator: (s: GameState) => GameState) => void;
  sendIntent?: (intent: Intent) => void;
  isHost?: boolean;
  meId: string;
  inviteUrl?: string;
  spectator?: boolean;
}) {
  const me = state.players.find((p) => p.id === meId);
  const others = state.players.filter((p) => p.id !== meId);
  const botMemory = useRef(createBotMemory());
  const [muted, setMuted] = useState(sfx.isMuted());
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const spectators = state.spectators ?? [];
  const [codeCopied, setCodeCopied] = useState(false);
  const wonAnnouncedRef = useRef(false);
  const [showPlayAgain, setShowPlayAgain] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showNewTournyPicker, setShowNewTournyPicker] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState("");
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [sortEnabled, setSortEnabled] = useState(false);
  const [showViewAll, setShowViewAll] = useState(false);
  const [showKeybinds, setShowKeybinds] = useState(false);
  /** Which inactive player's pile is currently expanded for me to view (one at a time). */
  const [freeView, setFreeView] = useState<{ ownerId: string; pileIndex: number } | null>(null);
  const [keybinds, setKeybinds] = useState<Keybinds>(() =>
    typeof window !== "undefined" ? loadKeybindsLocal() : { ...DEFAULT_KEYBINDS }
  );
  useEffect(() => {
    const refresh = () => setKeybinds(loadKeybindsLocal());
    window.addEventListener("bimyah:keybinds-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("bimyah:keybinds-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const isTournament = state.mode === "tournament";

  // Clear selection if the selected card is no longer in our hand.
  useEffect(() => {
    if (!selectedHandCardId) return;
    if (!me || !me.hand.some((c) => c.id === selectedHandCardId)) {
      setSelectedHandCardId(null);
    }
  }, [me, selectedHandCardId]);

  // Reset sort mode when the player closes their pile (no open pile).
  useEffect(() => {
    if (!me) return;
    if (me.openPileIndex === null && sortEnabled) {
      setSortEnabled(false);
    }
  }, [me, sortEnabled]);

  // Keep the public match listing in sync: update seat count while in lobby,
  // and remove the listing as soon as the match starts. Host-only.
  useEffect(() => {
    if (!isHost) return;
    if (typeof window === "undefined") return;
    if (!inviteUrl) return;
    const code = inviteUrl;
    const flag = sessionStorage.getItem(`bimyah_public_${code}`);
    if (flag !== "1") return;
    let cancelled = false;
    void (async () => {
      try {
        if (state.status === "lobby") {
          const { updatePublicMatch } = await import("@/server/publicMatches.functions");
          if (cancelled) return;
          await updatePublicMatch({
            data: { game_id: code, seats_taken: Math.max(1, state.players.length) },
          });
        } else {
          const { removePublicMatch } = await import("@/server/publicMatches.functions");
          if (cancelled) return;
          await removePublicMatch({ data: { game_id: code } });
          sessionStorage.removeItem(`bimyah_public_${code}`);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [isHost, inviteUrl, state.status, state.players.length]);

  // Helper: route an action either through the structured intent (preferred,
  // joiner→host) or fall back to local setState (host / solo).
  const dispatch = (intent: Intent) => {
    if (sendIntent && !isHost) {
      sendIntent(intent);
    } else {
      setState((s) => applyIntent(s, intent));
    }
  };

  // ===== Game tick (HOST ONLY in multiplayer; always on in solo) =====
  useEffect(() => {
    if (!isHost) return;
    const t = setInterval(() => {
      setState((s) => tickCountdown(s));
      setState((s) => tickHolds(s));
      setState((s) => tickIdle(s));
      setState((s) => tickInactive(s));
      setState((s) => tickFreeCardHolds(s));
      stepBots(state, botMemory.current, (m) => setState(m));
    }, 250);
    return () => clearInterval(t);
  }, [state, setState, isHost]);

  // Win announce
  useEffect(() => {
    if (state.status === "won" && !wonAnnouncedRef.current) {
      wonAnnouncedRef.current = true;
      sfx.win();
      const winner = state.players.find((p) => p.id === state.winnerId);
      // Only record to history when the game is fully decided:
      // standard mode = every win; tournament = only the champion.
      const decided =
        state.mode !== "tournament" || state.championId === state.winnerId;
      if (winner && decided) recordWin(winner.name);
      setTimeout(() => setShowPlayAgain(true), 2000);
    }
    if (state.status !== "won") {
      wonAnnouncedRef.current = false;
      setShowPlayAgain(false);
    }
  }, [state.status, state.winnerId, state.players]);

  // Tick "now" while the win overlay is up so the host's restart-cooldown
  // countdown updates each second.
  useEffect(() => {
    if (state.status !== "won") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state.status]);

  // Countdown SFX
  const lastCountRef = useRef<number>(0);
  useEffect(() => {
    if (state.status !== "countdown" || !state.countdownEndsAt) return;
    const t = setInterval(() => {
      const left = Math.ceil((state.countdownEndsAt! - Date.now()) / 1000);
      if (left !== lastCountRef.current && left > 0 && left <= 3) {
        lastCountRef.current = left;
        sfx.tick();
      }
      if (left <= 0) {
        sfx.go();
        clearInterval(t);
      }
    }, 100);
    return () => clearInterval(t);
  }, [state.status, state.countdownEndsAt]);

  // ===== Layout positions around table =====
  // Rotate the players array so the local player ("me") is always at index 0,
  // which maps to the bottom seat. Other players keep their relative order.
  const seatOrder = useMemo(() => {
    const idx = state.players.findIndex((p) => p.id === meId);
    if (idx <= 0) return state.players;
    return [...state.players.slice(idx), ...state.players.slice(0, idx)];
  }, [state.players, meId]);
  const basePositions = useMemo(() => getSeatPositions(seatOrder.length), [seatOrder.length]);

  // ===== Per-seat drag offsets, persisted locally per (mode, playerCount) =====
  const layoutKey = `bimyah_seat_offsets_${state.mode}_${seatOrder.length}`;
  const [seatOffsets, setSeatOffsets] = useState<Record<number, { dx: number; dy: number }>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      setSeatOffsets(raw ? JSON.parse(raw) : {});
    } catch {
      setSeatOffsets({});
    }
  }, [layoutKey]);
  const updateSeatOffset = (seatIdx: number, dx: number, dy: number) => {
    setSeatOffsets((cur) => {
      const next = { ...cur, [seatIdx]: { dx, dy } };
      try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ===== Center zoom (pinch to enlarge/shrink table + center cards + Bimyah) =====
  const zoomKey = `bimyah_center_zoom_${state.mode}_${seatOrder.length}`;
  const [centerZoom, setCenterZoom] = useState<number>(1);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(zoomKey);
      const n = raw ? parseFloat(raw) : 1;
      setCenterZoom(Number.isFinite(n) && n > 0 ? n : 1);
    } catch {
      setCenterZoom(1);
    }
  }, [zoomKey]);
  const persistZoom = (z: number) => {
    try { localStorage.setItem(zoomKey, String(z)); } catch {}
  };

  // ===== Player zoom (hand + piles + SET/SORT, local player only) =====
  const playerZoomKey = `bimyah_player_zoom_${state.mode}_${seatOrder.length}`;
  const [playerZoom, setPlayerZoom] = useState<number>(1);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(playerZoomKey);
      const n = raw ? parseFloat(raw) : 1;
      setPlayerZoom(Number.isFinite(n) && n > 0 ? n : 1);
    } catch {
      setPlayerZoom(1);
    }
  }, [playerZoomKey]);
  const persistPlayerZoom = (z: number) => {
    try { localStorage.setItem(playerZoomKey, String(z)); } catch {}
  };
  const bumpPlayerZoom = (delta: number) => {
    setPlayerZoom((cur) => {
      const next = Math.min(2, Math.max(0.6, cur + delta));
      persistPlayerZoom(next);
      return next;
    });
  };
  const bumpCenterZoom = (delta: number) => {
    setCenterZoom((cur) => {
      const next = Math.min(2, Math.max(0.6, cur + delta));
      persistZoom(next);
      return next;
    });
  };

  // ===== Movable HUD elements (drag + pinch-resize), persisted per (mode, seatCount) =====
  const movables = useMovableLayouts(state.mode, seatOrder.length);
  // Pinch handling: track 2 active pointers on the center container.
  const pinchRef = useRef<{
    a?: { id: number; x: number; y: number };
    b?: { id: number; x: number; y: number };
    startDist: number;
    startZoom: number;
  }>({ startDist: 0, startZoom: 1 });
  const centerPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const p = pinchRef.current;
    if (!p.a) {
      p.a = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (!p.b && e.pointerId !== p.a.id) {
      p.b = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const dx = p.b.x - p.a.x;
      const dy = p.b.y - p.a.y;
      p.startDist = Math.hypot(dx, dy) || 1;
      p.startZoom = centerZoom;
    }
  };
  const centerPointerMove = (e: React.PointerEvent) => {
    const p = pinchRef.current;
    if (!p.a || !p.b) return;
    if (e.pointerId === p.a.id) { p.a.x = e.clientX; p.a.y = e.clientY; }
    else if (e.pointerId === p.b.id) { p.b.x = e.clientX; p.b.y = e.clientY; }
    else return;
    const dx = p.b.x - p.a.x;
    const dy = p.b.y - p.a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const next = Math.min(2, Math.max(0.6, p.startZoom * (dist / p.startDist)));
    setCenterZoom(next);
  };
  const centerPointerUp = (e: React.PointerEvent) => {
    const p = pinchRef.current;
    if (p.a?.id === e.pointerId) p.a = undefined;
    if (p.b?.id === e.pointerId) p.b = undefined;
    if (!p.a || !p.b) {
      persistZoom(centerZoom);
    }
  };

  // helpers
  const handlePileTap = (pileIndex: number) => {
    if (!me || state.status !== "playing") return;
    if (me.pileLocked[pileIndex]) return;
    sfx.flip();
    dispatch({ kind: "openPile", playerId: meId, stackIndex: pileIndex });
  };

  const handleCenterTap = (i: number) => {
    if (!me || state.status !== "playing") return;
    const slot = state.center[i];
    if (!slot.card) return;
    // If this slot is the one we are already holding and we have a selected
    // hand card, complete the swap.
    if (slot.heldBy === meId && selectedHandCardId) {
      sfx.swap();
      dispatch({ kind: "swap", playerId: meId, cardId: selectedHandCardId });
      setSelectedHandCardId(null);
      return;
    }
    if (slot.heldBy) return;
    if (me.openPileIndex === null) return;
    if (me.hand.length >= 5) return;
    // If the player has already pre-selected a hand card, perform the swap
    // immediately: hold + swap in one tap. We dispatch hold then swap so the
    // engine sees a consistent transition.
    if (selectedHandCardId && me.hand.some((c) => c.id === selectedHandCardId)) {
      const cardId = selectedHandCardId;
      sfx.swap();
      dispatch({ kind: "holdCenter", playerId: meId, centerIndex: i });
      dispatch({ kind: "swap", playerId: meId, cardId });
      setSelectedHandCardId(null);
      return;
    }
    sfx.flip();
    dispatch({ kind: "holdCenter", playerId: meId, centerIndex: i });
  };

  // True when "I" am currently holding a card from an inactive player's pile.
  const myFreeHold = useMemo(() => {
    for (const p of state.players) {
      if (!p.freePileHolds) continue;
      const idx = p.freePileHolds.findIndex((h) => h?.heldBy === meId);
      if (idx !== -1) {
        const h = p.freePileHolds[idx]!;
        return { ownerId: p.id, pileIndex: idx, cardId: h.cardId, heldUntil: h.heldUntil };
      }
    }
    return null;
  }, [state.players, meId]);

  const handleHandCardTap = (cardId: string) => {
    if (!me) return;
    // If we're holding a free card, that swap takes priority.
    if (myFreeHold) {
      sfx.swap();
      dispatch({ kind: "swapFreeCard", viewerId: meId, cardId });
      setSelectedHandCardId(null);
      return;
    }
    const holding = state.center.some((sl) => sl.heldBy === meId);
    // If we're holding a center card, tapping a hand card completes the swap
    // immediately (keeps the original one-tap flow working).
    if (holding) {
      sfx.swap();
      dispatch({ kind: "swap", playerId: meId, cardId });
      setSelectedHandCardId(null);
      return;
    }
    // Otherwise, toggle selection so the player can pre-pick a card.
    setSelectedHandCardId((cur) => (cur === cardId ? null : cardId));
  };

  // Tap a free-card pile to expand/collapse it (one open at a time).
  const handleFreePileTap = (ownerId: string, pileIndex: number) => {
    if (state.status !== "playing") return;
    const owner = state.players.find((p) => p.id === ownerId);
    if (!owner || !owner.freeCards) return;
    if (owner.pileLocked[pileIndex]) return;
    sfx.flip();
    setFreeView((cur) =>
      cur && cur.ownerId === ownerId && cur.pileIndex === pileIndex
        ? null
        : { ownerId, pileIndex },
    );
  };

  // Tap a card inside an expanded free-card pile to hold it.
  const handleFreeCardTap = (ownerId: string, pileIndex: number, cardId: string) => {
    if (state.status !== "playing") return;
    if (!me || me.openPileIndex === null || me.hand.length === 0) return;
    if (myFreeHold) return;
    if (state.center.some((s) => s.heldBy === meId)) return;
    const owner = state.players.find((p) => p.id === ownerId);
    if (!owner) return;
    const existing = owner.freePileHolds?.[pileIndex];
    if (existing) return;
    // If the player has pre-selected a hand card, perform hold + swap in one tap.
    if (selectedHandCardId && me.hand.some((c) => c.id === selectedHandCardId)) {
      const handCardId = selectedHandCardId;
      sfx.swap();
      dispatch({ kind: "holdFreeCard", viewerId: meId, ownerId, pileIndex, cardId });
      dispatch({ kind: "swapFreeCard", viewerId: meId, cardId: handCardId });
      setSelectedHandCardId(null);
      return;
    }
    sfx.flip();
    dispatch({ kind: "holdFreeCard", viewerId: meId, ownerId, pileIndex, cardId });
  };

  const handleSet = () => {
    if (!me) return;
    if (me.hand.length === 4 && isFourOfAKind(me.hand)) {
      sfx.set();
      dispatch({ kind: "declareSet", playerId: meId });
    }
  };

  // Sort the local hand display so identical ranks cluster together,
  // ordered by frequency desc then by rank. Purely cosmetic — engine state
  // is unchanged, so this stays multiplayer-safe.
  const handleSort = () => {
    if (!me || me.hand.length === 0) return;
    setSortEnabled(true);
    sfx.flip();
  };

  const handleBimyah = () => {
    if (!me) return;
    if (canDeclareBimyah(state, meId)) {
      dispatch({ kind: "declareBimyah", playerId: meId });
    }
  };

  const onReady = () => dispatch({ kind: "ready", playerId: meId, ready: true });

  // Match-end "ready up" toggle for non-host players. Host uses this same
  // intent so its avatar lights up too (keepReadyPlayers always preserves
  // the host, but this keeps the visual consistent).
  // Readying up for the next match is permanent — once set, players cannot
  // un-ready. This prevents accidental cancels and keeps the host's view of
  // who's in for the next match stable.
  const onReadyForNext = () => {
    if (!me) return;
    if (me.readyForNext) return;
    dispatch({ kind: "readyForNext", playerId: meId, ready: true });
  };

  const onPlayAgain = () => {
    dispatch({ kind: "playAgain" });
    setShowPlayAgain(false);
  };

  const onNextMatch = () => {
    dispatch({ kind: "nextMatch" });
    setShowPlayAgain(false);
  };

  const onNewTournament = (limit: number | null) => {
    dispatch({ kind: "newTournament", pointLimit: limit });
    setShowPlayAgain(false);
    setShowNewTournyPicker(false);
    setNewLimitInput("");
  };


  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ===== Keyboard controls =====
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea or modal forms
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Normalize this keypress the same way the editor stores keys.
      const k =
        e.key === " " || e.key === "Enter" || e.key === "Shift" ||
        e.key.startsWith("Arrow") || e.key === "Tab" || e.key === "Escape" || e.key === "Backspace"
          ? e.key
          : e.key.length === 1
            ? e.key.toLowerCase()
            : e.key;

      // Build a reverse map: key -> first matching action.
      const keyToAction = new Map<string, ActionId>();
      (Object.entries(keybinds) as [ActionId, string][]).forEach(([id, val]) => {
        if (val && !keyToAction.has(val)) keyToAction.set(val, id);
      });
      const action = keyToAction.get(k);

      // Sizing keys (work in any status)
      // Sizing keys (work in any status). Up/Down resize the last-moved
      // Movable HUD element if there is one; otherwise fall back to player
      // hand zoom so the existing default behavior is preserved. Left/Right
      // always resize the table.
      if (action === "playerZoomIn") {
        e.preventDefault();
        if (!movables.bumpLastMovedScale(0.1)) bumpPlayerZoom(0.1);
        return;
      }
      if (action === "playerZoomOut") {
        e.preventDefault();
        if (!movables.bumpLastMovedScale(-0.1)) bumpPlayerZoom(-0.1);
        return;
      }
      if (action === "centerZoomIn") { e.preventDefault(); bumpCenterZoom(0.1); return; }
      if (action === "centerZoomOut") { e.preventDefault(); bumpCenterZoom(-0.1); return; }

      if (!me) return;

      // Lobby ready
      if (state.status === "lobby") {
        if (action === "bimyah" || action === "set") {
          if (!me.ready) { e.preventDefault(); onReady(); }
        }
        return;
      }
      if (state.status !== "playing" && state.status !== "countdown") {
        return;
      }

      if (!action) return;

      // BIMYAH
      if (action === "bimyah") {
        if (canDeclareBimyah(state, meId)) {
          e.preventDefault();
          handleBimyah();
        }
        return;
      }

      // SET
      if (action === "set") {
        if (me.openPileIndex !== null && me.hand.length === 4 && isFourOfAKind(me.hand)) {
          e.preventDefault();
          handleSet();
        }
        return;
      }

      // SORT
      if (action === "sort") {
        if (me.openPileIndex !== null && me.hand.length >= 2) {
          e.preventDefault();
          handleSort();
        }
        return;
      }

      // Center cards
      const centerLen = state.center.length;
      const split = centerLen >= 8;
      const centerIdxFromAction = (a: ActionId): number | null => {
        const m: Partial<Record<ActionId, number>> = {
          center1: 0, center2: 1, center3: 2, center4: 3,
          center5: 4, center6: 5, center7: 6, center8: 7,
          centerAlt1: 0, centerAlt2: 1, centerAlt3: 2, centerAlt4: 3,
          centerAlt5: 4, centerAlt6: 5, centerAlt7: 6, centerAlt8: 7,
        };
        const idx = m[a];
        if (idx === undefined) return null;
        // alt bottom row only valid in 8-slot mode
        if (!split && (a === "centerAlt5" || a === "centerAlt6" || a === "centerAlt7" || a === "centerAlt8")) return null;
        return idx;
      };
      const centerIdx = centerIdxFromAction(action);
      if (centerIdx !== null && centerIdx < centerLen) {
        e.preventDefault();
        handleCenterTap(centerIdx);
        return;
      }

      // Piles
      const pileMap: Partial<Record<ActionId, number>> = {
        pile1: 0, pile2: 1, pile3: 2, pile4: 3,
      };
      if (action in pileMap) {
        const idx = pileMap[action]!;
        if (idx < me.piles.length) {
          e.preventDefault();
          handlePileTap(idx);
        }
        return;
      }

      // Hand cards
      const handMap: Partial<Record<ActionId, number>> = {
        hand1: 0, hand2: 1, hand3: 2, hand4: 3,
      };
      if (action in handMap) {
        const idx = handMap[action]!;
        const visibleHand = (() => {
          if (!sortEnabled || me.hand.length < 2) return me.hand;
          const counts = new Map<string, number>();
          for (const c of me.hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
          const RANK_ORDER: Record<string, number> = {
            A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
            "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
          };
          return [...me.hand].sort((a, b) => {
            const fa = counts.get(a.rank) ?? 0;
            const fb = counts.get(b.rank) ?? 0;
            if (fa !== fb) return fb - fa;
            const ra = RANK_ORDER[a.rank] ?? 99;
            const rb = RANK_ORDER[b.rank] ?? 99;
            if (ra !== rb) return ra - rb;
            return a.suit.localeCompare(b.suit);
          });
        })();
        const card = visibleHand[idx];
        if (card) {
          e.preventDefault();
          handleHandCardTap(card.id);
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, meId, selectedHandCardId, sortEnabled, me, keybinds]);


  return (
    <div className="relative h-[calc(100dvh-50px)] w-screen overflow-hidden" data-spectator={spectator ? "1" : undefined}>
      {/* Top-left: Settings cog (with Add Bot below in lobby; Score to its right in tournament) */}
      <div className="absolute left-2 top-2 z-30 flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <Movable id="settings-cog" {...movables}>
            <button
              onClick={() => setShowSettings(true)}
              className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur active:scale-90"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </Movable>
          {isTournament && state.pointLimit !== null && (
            <Movable id="score-display" {...movables}>
              <ScoreDisplay limit={state.pointLimit} />
            </Movable>
          )}
        </div>
        {/* 3D eyeball — viewer count + click to list */}
        <Movable id="viewers-eye" {...movables}>
          <button
            onClick={() => setShowViewers(true)}
            className="relative grid h-9 min-w-9 place-items-center gap-1 rounded-full bg-gradient-to-b from-white/15 to-black/40 px-2 text-white/90 ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_6px_rgba(0,0,0,0.45)] backdrop-blur active:scale-90"
            aria-label={`Viewers (${spectators.length})`}
            title={`${spectators.length} viewer${spectators.length === 1 ? "" : "s"}`}
          >
            <Eye className="h-4 w-4 drop-shadow" />
            <span className="font-display text-[10px] font-bold tabular-nums leading-none text-white">
              {spectators.length}
            </span>
          </button>
        </Movable>
        {state.mode === "training" && (
          <Movable id="view-all" {...movables}>
            <button
              onClick={() => setShowViewAll(true)}
              className="btn-3d btn-3d-dark flex items-center gap-1 px-[10px] py-[3px] text-[9.5px]"
              aria-label="View all cards"
            >
              👁 View All Cards
            </button>
          </Movable>
        )}
        {state.status === "lobby" && isHost && (
          <Movable id="add-bot" {...movables}>
            <div className="btn-3d btn-3d-dark flex flex-col items-center gap-0.5 px-[10px] py-[3px] text-[9.5px] select-none">
              <span className="underline">Bots</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (state.players.length < (state.maxSeats ?? 4)) {
                      dispatch({ kind: "addBot" });
                    }
                  }}
                  disabled={state.players.length >= (state.maxSeats ?? 4)}
                  className="px-1 disabled:opacity-40"
                  aria-label="Add a bot"
                >
                  +
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (state.players.some((p) => p.isBot)) {
                      dispatch({ kind: "removeBot" });
                    }
                  }}
                  disabled={!state.players.some((p) => p.isBot)}
                  className="px-1 disabled:opacity-40"
                  aria-label="Remove a bot"
                >
                  −
                </button>
              </div>
            </div>
          </Movable>
        )}
      </div>

      {/* Top-right: HowToPlay + Scoreboard (in tournament) */}
      <div className="absolute right-2 top-2 z-30 flex flex-col items-end gap-2">
        <Movable id="how-to-play" {...movables}>
          <HowToPlayButton />
        </Movable>
        {isTournament && (
          <Movable id="scoreboard-btn" {...movables}>
            <ScoreboardButton onClick={() => setShowScoreboard(true)} />
          </Movable>
        )}
      </div>

      {/* Bottom-right: 3D chat button */}
      <div className="absolute bottom-3 right-3 z-30">
        <Movable id="chat-button" {...movables} origin="bottom right">
          <button
            onClick={() => setShowChat(true)}
            className="relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[var(--gold)] to-[oklch(0.65_0.16_85)] text-[var(--player-red)] ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_6px_14px_rgba(0,0,0,0.55)] active:scale-90"
            aria-label="Open chat"
          >
            <MessageCircle className="h-5 w-5 drop-shadow" />
            {(() => {
              const total = (state.chat ?? []).length;
              return total > 0 ? (
                <span className="absolute -top-1 -right-1 grid min-w-5 h-5 place-items-center rounded-full bg-[var(--player-red)] px-1 text-[10px] font-bold text-white ring-2 ring-[oklch(0.18_0.04_165)]">
                  {total > 99 ? "99+" : total}
                </span>
              ) : null;
            })()}
          </button>
        </Movable>
      </div>

      {/* Invite (lobby only) — show 4-digit code */}
      {state.status === "lobby" && inviteUrl && (
        <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2">
          <Movable id="invite-code" {...movables} origin="top center">
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--mint)]/40 bg-black/40 px-3 py-1.5 text-white backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="font-display text-[10px] uppercase tracking-widest text-white/60">
                  Code
                </span>
                <span className="font-mono text-base font-bold tracking-[0.3em] text-[var(--mint)]">
                  {inviteUrl}
                </span>
                <button
                  onClick={copyInvite}
                  className="flex items-center gap-1 rounded-full bg-[var(--mint)] px-2 py-0.5 text-[10px] font-bold text-[oklch(0.18_0.04_165)]"
                  aria-label="Copy code"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <button
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--mint)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--mint)] hover:bg-[var(--mint)]/25"
              >
                <UserPlus className="h-3 w-3" />
                Invite Friends
              </button>
            </div>
          </Movable>
        </div>
      )}
      {inviteUrl && (
        <InviteFriendsOverlay
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          gameCode={inviteUrl}
          joinUrl={
            typeof window !== "undefined"
              ? `${window.location.origin}/join/${inviteUrl}`
              : `/join/${inviteUrl}`
          }
        />
      )}



      {/* Match # banner above the table (tournament only) */}
      {isTournament && (
        <div
          className="absolute left-1/2 z-20 -translate-x-1/2"
          style={{ top: "calc(50% - min(19vw, 16vh, 140px) - 32px)" }}
        >
          <Movable id="match-badge" {...movables} origin="top center">
            <MatchBadge n={state.matchNumber} />
          </Movable>
        </div>
      )}

      {/* Round table — pinch to zoom (scales table + center cards + Bimyah button together) */}
      <div
        className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
        onPointerDown={centerPointerDown}
        onPointerMove={centerPointerMove}
        onPointerUp={centerPointerUp}
        onPointerCancel={centerPointerUp}
        style={{ touchAction: "none" }}
      >
        <div style={{ transform: `scale(${centerZoom})`, transformOrigin: "center center", transition: pinchRef.current.a && pinchRef.current.b ? "none" : "transform 140ms ease-out" }}>
          <div
            className="wood-table grid place-items-center rounded-full"
            style={{ width: "min(38vw, 32vh, 280px)", height: "min(38vw, 32vh, 280px)" }}
          >
             {/* Inner content: center cards + BIMYAH (free-card piles float above without shifting) */}
             <div className="relative flex flex-col items-center justify-center gap-1.5">
               {state.status !== "lobby" && (() => {
                 const freePlayers = state.players.filter((p) => p.freeCards && p.id !== meId);
                 if (freePlayers.length === 0) return null;
                 const fcWidth = 31;
                 return (
                   <Movable
                     id="free-cards-box"
                     {...movables}
                     origin="bottom center"
                     className="pointer-events-auto absolute left-1/2 bottom-full mb-1 -translate-x-1/2"
                   >
                    <div className="flex flex-col items-center gap-1.5">
                    {freePlayers.map((owner) => {
                      const ownerColor = PLAYER_COLOR_HEX[owner.color];
                      return (
                        <div
                          key={owner.id}
                          className="flex flex-col items-center gap-0.5 rounded-md bg-black/30 px-1.5 py-1 ring-1 ring-[var(--gold)]/40"
                        >
                          <div
                            className="text-[8px] font-bold uppercase tracking-widest text-white/80"
                            style={{ borderBottom: `1px solid ${ownerColor}55` }}
                          >
                            {owner.name}
                          </div>
                          {owner.piles.map((pile, pi) => {
                            const hold = owner.freePileHolds?.[pi] ?? null;
                            const holderColor = hold
                              ? PLAYER_COLOR_HEX[
                                  state.players.find((pp) => pp.id === hold.heldBy)?.color ?? "green"
                                ]
                              : undefined;
                            return (
                              <div key={pi} className="flex flex-row gap-0.5">
                                {pile.map((c) => {
                                  const heldHere = hold?.cardId === c.id;
                                  const ringColor = heldHere ? holderColor : undefined;
                                  return (
                                    <div
                                      key={c.id}
                                      onClick={() => {
                                        if (hold) return;
                                        handleFreeCardTap(owner.id, pi, c.id);
                                      }}
                                      className={cn(
                                        "cursor-pointer",
                                        heldHere && "animate-pulse-ring rounded-md",
                                      )}
                                      style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
                                    >
                                      <PlayingCard card={c} width={fcWidth} />
                                    </div>
                                  );
                                })}
                                {/* Pad with empty slots so locked/short piles still align as groups of 4 */}
                                {pile.length < 4 &&
                                  Array.from({ length: 4 - pile.length }).map((_, k) => (
                                    <EmptySlot key={`pad-${k}`} width={fcWidth} />
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    </div>
                  </Movable>
                );
              })()}
              {state.status === "lobby" && (
                <div className="px-2 text-center font-display text-[11px] uppercase tracking-widest text-white/70">
                  {state.players.length < 2 ? (
                    "Waiting for players…"
                  ) : (
                    <span className="animate-flash text-[var(--mint)]">Tap Ready!</span>
                  )}
                </div>
              )}
              {state.status !== "lobby" && (() => {
                const centerSlots = state.center;
                const splitCenter = centerSlots.length >= 8;
                const renderSlot = (slot: typeof centerSlots[number], i: number) => {
                  const heldByPlayer = state.players.find((p) => p.id === slot.heldBy);
                  const outline = heldByPlayer ? PLAYER_COLOR_HEX[heldByPlayer.color] : undefined;
                  if (slot.card) {
                    const isMine = slot.heldBy === meId;
                    const readyToComplete = isMine && !!selectedHandCardId;
                    return (
                      <div
                        key={i}
                        onClick={() => handleCenterTap(i)}
                        className={cn(
                          "cursor-pointer",
                          outline && "rounded-lg p-0.5",
                          readyToComplete && "animate-pulse-ring",
                        )}
                        style={outline ? { boxShadow: `0 0 0 2px ${outline}` } : undefined}
                        aria-label={isMine ? "Holding — pick a hand card to swap" : undefined}
                      >
                        <PlayingCard card={slot.card} width={31} />
                      </div>
                    );
                  }
                  return <EmptySlot key={i} width={31} outlineColor={outline} />;
                };
                const bimyahBtn = state.status === "playing" && (
                  <button
                    onClick={handleBimyah}
                    disabled={!canDeclareBimyah(state, meId)}
                    className={cn(
                      "btn-3d btn-3d-red px-3 py-1.5 text-[11px]",
                      canDeclareBimyah(state, meId) && "animate-pulse-ring",
                    )}
                  >
                    BIMYAH!
                  </button>
                );
                if (splitCenter) {
                  const top = centerSlots.slice(0, 4);
                  const bottom = centerSlots.slice(4, 8);
                  return (
                    <>
                      <div className="flex items-center gap-1.5">{top.map((s, i) => renderSlot(s, i))}</div>
                      {bimyahBtn}
                      <div className="flex items-center gap-1.5">{bottom.map((s, i) => renderSlot(s, i + 4))}</div>
                    </>
                  );
                }
                return (
                  <>
                    <div className="flex items-center gap-1.5">{centerSlots.map((s, i) => renderSlot(s, i))}</div>
                    {bimyahBtn}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      {state.status === "countdown" && state.countdownEndsAt && (
        <Countdown endsAt={state.countdownEndsAt} />
      )}

      {/* Player seats */}
      {seatOrder.map((player, seatIdx) => {
        const isMe = player.id === meId;
        const pos = basePositions[seatIdx];
        const offset = seatOffsets[seatIdx];
        return (
          <PlayerSeat
            key={player.id}
            player={player}
            position={pos}
            offset={offset}
            draggable
            onDragEnd={(dx, dy) => updateSeatOffset(seatIdx, dx, dy)}
            isMe={isMe}
            status={state.status}
            onReady={isMe ? onReady : undefined}
            onPileTap={isMe ? handlePileTap : undefined}
            onHandCardTap={isMe ? handleHandCardTap : undefined}
            onSet={isMe ? handleSet : undefined}
            onSort={isMe ? handleSort : undefined}
            selectedHandCardId={isMe ? selectedHandCardId : null}
            sortEnabled={isMe ? sortEnabled : false}
            zoom={isMe ? playerZoom : 1}
            revealAll={state.mode === "training"}
            freeView={!isMe && freeView?.ownerId === player.id ? freeView.pileIndex : null}
            onFreePileTap={!isMe && player.freeCards ? (i) => handleFreePileTap(player.id, i) : undefined}
            onFreeCardTap={!isMe && player.freeCards ? (i, cardId) => handleFreeCardTap(player.id, i, cardId) : undefined}
            colorMap={PLAYER_COLOR_HEX}
            players={state.players}
          />
        );
      })}

      {/* Win overlay */}
      {state.status === "won" && (() => {
        const winner = state.players.find((p) => p.id === state.winnerId);
        const winnerName = winner?.name ?? "?";
        const isChampion = isTournament && state.championId === state.winnerId;
        const borderColor = winner ? PLAYER_COLOR_HEX[winner.color] : "#fbbf24";
        const isMeWinner = state.winnerId === meId;
        const subline = !isTournament
          ? (isMeWinner ? "You Win!" : `${winnerName} Wins!`)
          : isChampion
          ? (isMeWinner
              ? `You Win! ${state.scores[state.winnerId ?? ""] ?? 0} pts`
              : `${winnerName} Wins! ${state.scores[state.winnerId ?? ""] ?? 0} pts`)
          : (isMeWinner
              ? `You Win! +${state.lastMatchPoints ?? 0} pts`
              : `${winnerName} Wins! +${state.lastMatchPoints ?? 0} pts`);
        // Determine host status + restart cooldown.
        const hostId = state.hostId;
        const amHost = !!hostId && meId === hostId;
        const RESTART_COOLDOWN_MS = 7000;
        const wonAt = state.wonAt ?? 0;
        const cooldownLeft = Math.max(
          0,
          Math.ceil((wonAt + RESTART_COOLDOWN_MS - now) / 1000),
        );
        const cooldownActive = cooldownLeft > 0;

        // Real (non-bot) players, in seat order.
        const humans = state.players.filter((p) => !p.isBot);
        const meReady = !!me?.readyForNext || amHost;

        const hostStartLabel = !isTournament
          ? "Start Next Match"
          : isChampion
          ? "Start New Tournament"
          : "Start Next Match";
        const nonHostHumans = humans.filter((p) => p.id !== hostId);
        const allHumansReady = nonHostHumans.every((p) => !!p.readyForNext);
        const startNow = () => {
          if (!isTournament) {
            onPlayAgain();
          } else if (isChampion) {
            setShowNewTournyPicker(true);
          } else {
            onNextMatch();
          }
        };
        const onHostStart = () => {
          if (cooldownActive) return;
          if (nonHostHumans.length > 0 && !allHumansReady) {
            setShowStartConfirm(true);
            return;
          }
          startNow();
        };

        return (
          <>
            <Confetti />
            <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 p-4">
              {/* Ready status row — shown above the winner announcement
                  whenever there's more than one human in the lobby. */}
              {showPlayAgain && humans.length > 1 && (
                <div className="pointer-events-none flex flex-wrap items-center justify-center gap-2 animate-float-up">
                  {humans.map((p) => {
                    const ready = !!p.readyForNext || p.id === hostId;
                    const color = PLAYER_COLOR_HEX[p.color];
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition",
                          ready
                            ? "bg-black/60 text-white"
                            : "bg-black/40 text-white/50",
                        )}
                        style={{
                          borderColor: ready ? color : `${color}55`,
                          boxShadow: ready ? `0 0 12px ${color}66` : "none",
                        }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: ready ? color : `${color}55` }}
                        />
                        <span>{p.name}</span>
                        <span className="opacity-70">
                          {p.id === hostId ? "host" : ready ? "ready" : "waiting"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="win-popup animate-float-up"
                style={{
                  borderColor,
                  boxShadow: `0 0 0 2px ${borderColor}55, 0 18px 50px -10px ${borderColor}aa, 0 8px 24px rgba(0,0,0,0.6)`,
                }}
              >
                <div className="win-popup-inner">
                  <div className="win-popup-title">BIMYAH!</div>
                  <div className="win-popup-sub">{subline}</div>
                  {isTournament && (
                    <div className="win-popup-tag" style={{ color: borderColor }}>
                      {isChampion ? "Game Champion" : "Match Winner"}
                    </div>
                  )}
                </div>
              </div>

              {showPlayAgain && amHost && (
                <button
                  onClick={onHostStart}
                  disabled={cooldownActive}
                  className={cn(
                    "btn-3d pointer-events-auto animate-float-up",
                    isTournament && isChampion ? "btn-3d-gold" : "btn-3d-mint",
                    cooldownActive && "opacity-60",
                  )}
                >
                  {cooldownActive ? `${hostStartLabel} (${cooldownLeft}s)` : hostStartLabel}
                </button>
              )}

              {showPlayAgain && !amHost && (
                <button
                  onClick={onReadyForNext}
                  disabled={meReady}
                  className={cn(
                    "btn-3d pointer-events-auto animate-float-up",
                    meReady ? "btn-3d-gold opacity-90" : "btn-3d-mint",
                  )}
                >
                  {meReady ? "Ready ✓" : "Ready Up"}
                </button>
              )}

              {showPlayAgain && !amHost && (
                <div className="text-center text-[11px] uppercase tracking-widest text-white/60 animate-float-up">
                  Waiting for host to start the next match…
                </div>
              )}

              {showPlayAgain && amHost && showStartConfirm && (
                <div
                  className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                  onClick={() => setShowStartConfirm(false)}
                >
                  <div
                    className="w-full max-w-sm rounded-xl border border-white/15 bg-zinc-900 p-5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 text-base font-bold text-white">
                      Not everyone is ready
                    </div>
                    <div className="mb-4 text-sm text-white/70">
                      {nonHostHumans
                        .filter((p) => !p.readyForNext)
                        .map((p) => p.name)
                        .join(", ")}{" "}
                      hasn't readied up yet. Players who aren't ready will be
                      removed from the next match.
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        onClick={() => setShowStartConfirm(false)}
                        className="btn-3d btn-3d-mint"
                      >
                        Wait
                      </button>
                      <button
                        onClick={() => {
                          setShowStartConfirm(false);
                          startNow();
                        }}
                        className="btn-3d btn-3d-gold"
                      >
                        Continue anyway
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* Scoreboard overlay */}
      <Scoreboard
        state={state}
        open={showScoreboard}
        onClose={() => setShowScoreboard(false)}
      />

      {/* Settings popup */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-[var(--mint)]/40 bg-[oklch(0.18_0.04_165)] p-5 text-white shadow-[var(--shadow-glow-mint)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-display text-sm font-bold uppercase tracking-widest text-[var(--mint)]">
                Settings
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
                aria-label="Close settings"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {inviteUrl && (
              <div className="mb-4">
                <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-white/50">
                  Room code
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteUrl);
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 1500);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--mint)]/40 bg-black/40 px-3 py-2 font-mono text-xl font-bold tracking-[0.3em] text-[var(--mint)] active:scale-95"
                  aria-label="Copy room code"
                >
                  <span>{inviteUrl}</span>
                  {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <HomeButton />
              <button
                onClick={() => {
                  const next = !muted;
                  sfx.setMuted(next);
                  setMuted(next);
                }}
                className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white/80 ring-1 ring-white/15 active:scale-90"
                aria-label="Mute"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            <button
              onClick={() => { setShowSettings(false); setShowKeybinds(true); }}
              className="mt-4 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-widest text-white/80 hover:border-[var(--mint)]/60 hover:text-white"
            >
              Keyboard controls
            </button>
          </div>
        </div>
      )}

      {/* Keybinds modal */}
      {showKeybinds && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowKeybinds(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-[var(--mint)]/40 bg-[oklch(0.18_0.04_165)] text-white shadow-[var(--shadow-glow-mint)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="font-display text-sm font-bold uppercase tracking-widest text-[var(--mint)]">
                Keyboard controls
              </div>
              <button
                onClick={() => setShowKeybinds(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
                aria-label="Close keybinds"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <KeybindEditor />
            </div>
          </div>
        </div>
      )}

      {showNewTournyPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xs rounded-2xl border border-[var(--gold)]/40 bg-[oklch(0.18_0.04_165)] p-5 text-white shadow-[var(--shadow-glow-gold)]">
            <div className="mb-3 text-center font-display text-sm font-bold uppercase tracking-widest text-[var(--gold)]">
              New Tournament
            </div>
            <div className="mb-2 text-center text-[11px] uppercase tracking-widest text-white/60">
              Point limit
            </div>
            <input
              autoFocus
              inputMode="numeric"
              value={newLimitInput}
              onChange={(e) =>
                setNewLimitInput(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder={state.pointLimit?.toString() ?? "100"}
              className="mb-2 w-full rounded-lg border border-[var(--gold)]/50 bg-black/40 px-4 py-3 text-center font-display text-2xl text-white placeholder:text-white/30"
            />
            <div className="mb-3 text-center text-[10px] text-white/50">
              1 – 1000. Leave blank to keep {state.pointLimit ?? "—"}.
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const n = parseInt(newLimitInput, 10);
                  const limit =
                    Number.isFinite(n) && n >= 1 && n <= 1000
                      ? n
                      : state.pointLimit;
                  onNewTournament(limit);
                }}
                className="btn-3d btn-3d-gold w-full text-sm"
              >
                Start
              </button>
              <button
                onClick={() => {
                  setShowNewTournyPicker(false);
                  setNewLimitInput("");
                }}
                className="text-xs text-white/50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewAll && (
        <ViewAllCardsModal state={state} onClose={() => setShowViewAll(false)} />
      )}

      {showViewers && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowViewers(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/20 bg-[oklch(0.18_0.04_165)] p-5 text-white shadow-[var(--shadow-glow-mint)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-[var(--mint)]">
                <Eye className="h-4 w-4" />
                Viewers ({spectators.length})
              </div>
              <button
                onClick={() => setShowViewers(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
                aria-label="Close viewers"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {spectators.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/50">
                No one is watching this room.
              </div>
            ) : (
              <ul className="max-h-[50vh] divide-y divide-white/10 overflow-y-auto">
                {spectators.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 py-2 text-sm text-white/90"
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[10px] font-bold uppercase">
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-center text-[10px] uppercase tracking-widest text-white/40">
              Up to 20 viewers per room
            </div>
          </div>
        </div>
      )}

      {showChat && (
        <ChatPanel
          state={state}
          meId={meId}
          isSpectator={spectator}
          onClose={() => setShowChat(false)}
          onSend={(channel: ChatChannel, text: string) => {
            const author = me ?? null;
            const spec = (state.spectators ?? []).find((s) => s.id === meId);
            dispatch({
              kind: "chat",
              message: {
                id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                channel,
                authorId: meId,
                authorName: author?.name ?? spec?.name ?? "Player",
                avatarUrl: author?.avatarUrl ?? spec?.avatarUrl ?? null,
                color: author?.color ?? null,
                isSpectator: spectator,
                text,
                ts: Date.now(),
              },
            });
          }}
        />
      )}
    </div>
  );
}

/* ============ Seat ============ */

type SeatPos = {
  /** Anchor position as percent of viewport (0-100). Origin is the seat center. */
  x: number; // left %
  y: number; // top %
  /** Translate origin: which corner of the seat sits at (x,y). */
  anchor:
    | "bottom-center"
    | "top-center"
    | "left-center"
    | "right-center";
  pileLayout: "row" | "col";
  rotate?: string;
  compact?: boolean;
};

/**
 * Seat positions (percent of viewport). Order:
 *   index 0 = me (always South / bottom-center, NOT draggable)
 *   Seats 1+ are filled per the rules:
 *     1) North, East, West first
 *     2) Then SE & SW (raised higher than the side seats so they don't overlap
 *        the local hand/expanded piles)
 *     3) Then NE & NW (also kept inset so they don't overlap each other)
 */
function getSeatPositions(n: number): SeatPos[] {
  // South — local player. y is high (near bottom) so the hand row + piles fit.
  // Leave ~12% below piles for the SET/SORT buttons that float under them.
  const SOUTH: SeatPos = { x: 50, y: 86, anchor: "bottom-center", pileLayout: "row" };
  const NORTH: SeatPos = { x: 50, y: 6, anchor: "top-center", pileLayout: "row", rotate: "rotate-180", compact: true };
  const EAST:  SeatPos = { x: 99, y: 50, anchor: "right-center", pileLayout: "row", compact: true };
  const WEST:  SeatPos = { x: 1,  y: 50, anchor: "left-center",  pileLayout: "row", compact: true };
  // SE / SW — raised above the bottom hand area (y ≈ 62 instead of ~75)
  const SE:    SeatPos = { x: 96, y: 62, anchor: "right-center", pileLayout: "row", compact: true };
  const SW:    SeatPos = { x: 4,  y: 62, anchor: "left-center",  pileLayout: "row", compact: true };
  // NE / NW — kept inset from N and E/W so nothing overlaps
  const NE:    SeatPos = { x: 78, y: 12, anchor: "top-center", pileLayout: "row", rotate: "rotate-180", compact: true };
  const NW:    SeatPos = { x: 22, y: 12, anchor: "top-center", pileLayout: "row", rotate: "rotate-180", compact: true };

  if (n === 2) return [SOUTH, NORTH];
  if (n === 3) return [SOUTH, EAST, WEST];
  if (n === 4) return [SOUTH, NORTH, EAST, WEST];
  if (n === 5) return [SOUTH, NORTH, EAST, WEST, SE];
  if (n === 6) return [SOUTH, NORTH, EAST, WEST, SE, SW];
  if (n === 7) return [SOUTH, NORTH, EAST, WEST, SE, SW, NE];
  return [SOUTH, NORTH, EAST, WEST, SE, SW, NE, NW];
}

function anchorTransform(anchor: SeatPos["anchor"]): string {
  switch (anchor) {
    case "bottom-center": return "translate(-50%, -100%)";
    case "top-center":    return "translate(-50%, 0%)";
    case "left-center":   return "translate(0%, -50%)";
    case "right-center":  return "translate(-100%, -50%)";
  }
}

function PlayerSeat({
  player,
  position,
  offset,
  draggable = false,
  onDragEnd,
  isMe,
  status,
  onReady,
  onPileTap,
  onHandCardTap,
  onSet,
  onSort,
  selectedHandCardId,
  sortEnabled,
  zoom = 1,
  revealAll = false,
  freeView = null,
  onFreePileTap,
  onFreeCardTap,
  colorMap,
  players,
}: {
  player: Player;
  position: SeatPos;
  offset?: { dx: number; dy: number };
  draggable?: boolean;
  onDragEnd?: (dx: number, dy: number) => void;
  isMe: boolean;
  status: GameState["status"];
  onReady?: () => void;
  onPileTap?: (i: number) => void;
  onHandCardTap?: (cardId: string) => void;
  onSet?: () => void;
  onSort?: () => void;
  selectedHandCardId?: string | null;
  sortEnabled?: boolean;
  zoom?: number;
  revealAll?: boolean;
  /** When this seat belongs to an inactive player and the local viewer has
   *  one of its piles expanded, this is that pile's index. */
  freeView?: number | null;
  onFreePileTap?: (pileIndex: number) => void;
  onFreeCardTap?: (pileIndex: number, cardId: string) => void;
  colorMap?: Record<PlayerColor, string>;
  players?: Player[];
}) {
  const colorHex = PLAYER_COLOR_HEX[player.color];
  const handReady =
    isMe && player.openPileIndex !== null && player.hand.length === 4 && isFourOfAKind(player.hand);

  const pileWidth = isMe ? 37 : position.compact ? 20 : 26;
  const pileGap = position.compact ? "gap-1" : "gap-1.5";

  // ===== Drag state (other players only) =====
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean } | null>(null);
  const baseDx = offset?.dx ?? 0;
  const baseDy = offset?.dy ?? 0;
  const liveDx = dragDelta ? dragDelta.dx : baseDx;
  const liveDy = dragDelta ? dragDelta.dy : baseDy;

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (!draggable) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseDx, baseDy, moved: false };
    setDragDelta({ dx: baseDx, dy: baseDy });
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, baseDx: bdx, baseDy: bdy } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setDragDelta({ dx: bdx + dx, dy: bdy + dy });
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const final = dragDelta;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    setDragDelta(null);
    if (moved && final && onDragEnd) onDragEnd(final.dx, final.dy);
  };

  const orderedHand = (() => {
    if (!sortEnabled || player.hand.length < 2) return player.hand;
    const counts = new Map<string, number>();
    for (const c of player.hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    const RANK_ORDER: Record<string, number> = {
      A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
      "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
    };
    return [...player.hand].sort((a, b) => {
      const fa = counts.get(a.rank) ?? 0;
      const fb = counts.get(b.rank) ?? 0;
      if (fa !== fb) return fb - fa;
      const ra = RANK_ORDER[a.rank] ?? 99;
      const rb = RANK_ORDER[b.rank] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.suit.localeCompare(b.suit);
    });
  })();

  const wrapperStyle: React.CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `${anchorTransform(position.anchor)} translate(${liveDx}px, ${liveDy}px)${zoom !== 1 ? ` scale(${zoom})` : ""}`,
    transformOrigin:
      position.anchor === "bottom-center"
        ? "center bottom"
        : position.anchor === "top-center"
        ? "center top"
        : position.anchor === "left-center"
        ? "left center"
        : "right center",
    transition: dragRef.current ? "none" : "transform 160ms ease-out",
    touchAction: draggable ? "none" : undefined,
  };

  return (
    <div
      className={cn(
        "absolute z-10 flex flex-col items-center gap-1",
        dragRef.current && "z-30 opacity-95",
      )}
      style={wrapperStyle}
    >
      {/* Hand row (for me when pile open; for others in training mode when they have a hand). */}
      {((isMe && player.openPileIndex !== null) ||
        (!isMe && revealAll && player.hand.length > 0)) &&
        status === "playing" && (
        <div className="pointer-events-auto absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-end justify-center gap-1.5">
          {(isMe ? orderedHand : player.hand).map((c) => (
            <PlayingCard
              key={c.id}
              card={c}
              width={isMe ? 36 : 22}
              selected={isMe && selectedHandCardId === c.id}
              onClick={isMe ? () => onHandCardTap?.(c.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Name tag — also acts as the drag handle for non-me seats */}
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur select-none",
          isMe ? "bg-black/50 text-white" : "bg-black/30 text-white/80",
          !isMe && "mb-2",
          draggable && "cursor-grab active:cursor-grabbing ring-1 ring-white/10",
        )}
        style={{ borderLeft: `3px solid ${colorHex}`, touchAction: draggable ? "none" : undefined }}
        title={draggable ? "Drag to reposition" : undefined}
      >
        {player.avatarUrl ? (
          <img
            src={player.avatarUrl}
            alt=""
            draggable={false}
            className="h-4 w-4 rounded-full object-cover"
          />
        ) : player.isBot ? (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-[10px] leading-none"
            aria-label="Bot"
          >
            🤖
          </span>
        ) : (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-black"
            style={{ backgroundColor: colorHex }}
          >
            {player.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span>{player.name}</span>
        {status === "lobby" && player.ready && <span className="text-[var(--mint)]">✓</span>}
      </div>

      {/* Inactive / Free-cards status badge */}
      {!isMe && (player.disconnectedAt || player.freeCards) && status !== "lobby" && (
        <div
          className={cn(
            "rounded-full px-2 py-[1px] text-[9px] font-bold uppercase tracking-widest",
            player.freeCards
              ? "bg-[var(--gold)]/20 text-[var(--gold)] ring-1 ring-[var(--gold)]/50"
              : "bg-white/10 text-white/70 ring-1 ring-white/20",
          )}
        >
          {player.freeCards ? "Free Cards" : "Inactive"}
        </div>
      )}

      {/* Piles (with SET/SORT absolutely anchored below for the local player
          so opening a pile does NOT shift the piles upward).
          When this player has gone to "free cards", their piles are rendered
          in the center area instead — hide them at the seat. */}
      {status !== "lobby" && !(player.freeCards && !isMe) && (
        <div className="relative">
          <div
            className={cn(
              "flex",
              pileGap,
              position.pileLayout === "col" ? "flex-col" : "flex-row",
              !isMe && position.rotate,
            )}
          >
            {player.piles.map((pile, i) => {
              const locked = player.pileLocked[i];
              if (locked) {
                return <CascadeSet key={i} cards={pile} width={pileWidth} />;
              }
              const isOpen = isMe && player.openPileIndex === i;
              const isFreeOpen = !isMe && player.freeCards && freeView === i;
              const pileHold = player.freePileHolds?.[i] ?? null;
              if (pile.length === 0 && !isOpen) {
                return (
                  <div
                    key={i}
                    style={{ width: pileWidth, height: pileWidth * 1.4 }}
                    className="rounded-lg border-2 border-dashed border-white/10"
                  />
                );
              }
              if (pile.length === 0 && isOpen) {
                return (
                  <div key={i} className="relative inline-block">
                    <div
                      style={{ width: pileWidth, height: pileWidth * 1.4 }}
                      className="rounded-lg border-2 border-dashed border-[var(--mint)] bg-[var(--mint)]/10 shadow-[0_0_20px_var(--mint)] animate-pulse-ring"
                    />
                    <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--mint)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[oklch(0.18_0.04_165)]">
                      OPEN
                    </span>
                  </div>
                );
              }
              // Inactive player's pile, expanded by viewer → render face-up cards.
              if (isFreeOpen) {
                const holderColor = pileHold && colorMap && players
                  ? colorMap[players.find((pp) => pp.id === pileHold.heldBy)?.color ?? "green"]
                  : undefined;
                return (
                  <div
                    key={i}
                    className="flex flex-row gap-0.5 rounded-md bg-black/30 p-0.5 ring-1 ring-[var(--gold)]/40"
                    onClick={(e) => {
                      // Tapping empty area of expanded pile collapses it.
                      if (e.target === e.currentTarget) onFreePileTap?.(i);
                    }}
                  >
                    {pile.map((c) => {
                      const heldHere = pileHold?.cardId === c.id;
                      const ringColor = heldHere ? holderColor : undefined;
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (pileHold) return;
                            onFreeCardTap?.(i, c.id);
                          }}
                          className={cn("cursor-pointer", heldHere && "animate-pulse-ring rounded-md")}
                          style={ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : undefined}
                        >
                          <PlayingCard card={c} width={Math.max(18, pileWidth - 4)} />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              // Inactive player's pile, collapsed → tap to expand.
              if (!isMe && player.freeCards && onFreePileTap) {
                return (
                  <CardBack
                    key={i}
                    width={pileWidth}
                    count={pile.length}
                    onClick={() => onFreePileTap(i)}
                    highlight={!!pileHold}
                    imageUrl={player.cardBackUrl}
                  />
                );
              }
              return (
                <CardBack
                  key={i}
                  width={pileWidth}
                  count={isOpen ? 0 : pile.length}
                  onClick={isMe && onPileTap ? () => onPileTap(i) : undefined}
                  highlight={isOpen}
                  imageUrl={player.cardBackUrl}
                />
              );
            })}
          </div>

          {/* SET/SORT buttons — absolutely positioned UNDER the piles so the
              piles never shift when a pile is opened. */}
          {isMe && player.openPileIndex !== null && status === "playing" && (
            <div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 items-center justify-center gap-1.5">
              <button
                onClick={onSet}
                disabled={!handReady}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider transition",
                  handReady
                    ? "bg-[var(--gold)] text-[oklch(0.18_0.04_165)] shadow-[var(--shadow-glow-gold)] animate-pulse-ring"
                    : "bg-white/10 text-white/40",
                )}
              >
                SET
              </button>
              <button
                onClick={onSort}
                disabled={player.hand.length < 2}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider transition",
                  sortEnabled
                    ? "bg-[var(--mint)] text-[oklch(0.18_0.04_165)] shadow-[var(--shadow-glow-mint)]"
                    : player.hand.length >= 2
                    ? "border border-[var(--mint)]/60 bg-black/40 text-[var(--mint)] active:scale-95"
                    : "bg-white/5 text-white/30",
                )}
                aria-label="Sort hand by rank"
              >
                <ArrowDownUp className="h-2 w-2" />
                SORT
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ready button (lobby) */}
      {status === "lobby" && isMe && !player.ready && onReady && (
        <button onClick={onReady} className="btn-3d btn-3d-mint mt-2 text-base">
          Ready?
        </button>
      )}
      {status === "lobby" && !isMe && (
        <div className="mt-1 text-[10px] text-white/50">
          {player.ready ? "Ready" : "Waiting…"}
        </div>
      )}
    </div>
  );
}

/* ============ View All Cards modal ============ */

function ViewAllCardsModal({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  const [openPiles, setOpenPiles] = useState<Record<string, number | null>>({});
  const togglePile = (playerId: string, idx: number) => {
    setOpenPiles((cur) => ({
      ...cur,
      [playerId]: cur[playerId] === idx ? null : idx,
    }));
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-[var(--mint)]/40 bg-[oklch(0.18_0.04_165)] text-white shadow-[var(--shadow-glow-mint)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="font-display text-sm font-bold uppercase tracking-widest text-[var(--mint)]">
            All Cards
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {state.players.map((player) => {
            const colorHex = PLAYER_COLOR_HEX[player.color];
            const openIdx = openPiles[player.id] ?? null;
            const openPile = openIdx !== null ? player.piles[openIdx] : null;
            return (
              <div
                key={player.id}
                className="rounded-xl border border-white/10 bg-black/30 p-3"
              >
                <div
                  className="flex items-center gap-2 rounded-full bg-black/40 px-2 py-1 text-xs font-semibold w-fit"
                  style={{ borderLeft: `3px solid ${colorHex}` }}
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-black"
                    style={{ backgroundColor: colorHex }}
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{player.name}</span>
                  {player.hand.length > 0 && (
                    <span className="text-[9px] uppercase tracking-wider text-white/50">
                      hand: {player.hand.length}
                    </span>
                  )}
                </div>

                {/* Hand row — reserved space so piles don't shift */}
                <div className="mt-2 flex min-h-[44px] items-center gap-1">
                  {player.hand.length > 0 ? (
                    player.hand.map((c) => (
                      <PlayingCard key={c.id} card={c} width={28} />
                    ))
                  ) : (
                    <span className="text-[10px] text-white/30">No cards in hand</span>
                  )}
                </div>

                {/* Piles row */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {player.piles.map((pile, i) => {
                    const locked = player.pileLocked[i];
                    if (locked) {
                      return (
                        <div
                          key={i}
                          className="rounded border border-[var(--gold)]/40 p-1"
                          title="Locked set"
                        >
                          <CascadeSet cards={pile} width={28} />
                        </div>
                      );
                    }
                    if (pile.length === 0) {
                      return (
                        <div
                          key={i}
                          style={{ width: 36, height: 50 }}
                          className="grid place-items-center rounded border border-dashed border-white/10 text-[9px] text-white/30"
                        >
                          empty
                        </div>
                      );
                    }
                    const top = pile[pile.length - 1];
                    const isOpen = openIdx === i;
                    return (
                      <button
                        key={i}
                        onClick={() => togglePile(player.id, i)}
                        className={cn(
                          "relative inline-block rounded transition",
                          isOpen && "ring-2 ring-[var(--mint)]",
                        )}
                        aria-label={`Pile ${i + 1}, ${pile.length} cards`}
                      >
                        <PlayingCard card={top} width={36} />
                        <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-black/80 px-1 text-[9px] font-bold text-white ring-1 ring-white/30">
                          {pile.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {openPile && openPile.length > 0 && (
                  <div className="mt-3 rounded-lg border border-[var(--mint)]/30 bg-black/40 p-2">
                    <div className="mb-1 text-[9px] uppercase tracking-widest text-white/50">
                      Pile {(openIdx ?? 0) + 1} — {openPile.length} cards
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {openPile.map((c) => (
                        <PlayingCard key={c.id} card={c} width={32} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
