import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, Player, PlayerColor } from "@/game/types";
import { CardBack, CascadeSet, EmptySlot, PlayingCard } from "./Card";
import {
  tickCountdown,
  tickHolds,
  canDeclareBimyah,
  COUNTDOWN_MS,
} from "@/game/engine";
import { isFourOfAKind } from "@/game/deck";
import { Confetti, Countdown, HomeButton } from "./Visuals";
import { HowToPlayButton } from "./HowToPlay";
import { createBotMemory, stepBots } from "@/game/bot";
import { sfx, recordWin } from "@/game/sfx";
import { Copy, Check, Volume2, VolumeX, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyIntent, type Intent } from "@/game/peer";

export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
};

export function GameTable({
  state,
  setState,
  sendIntent,
  isHost = true,
  meId,
  inviteUrl,
}: {
  state: GameState;
  setState: (mutator: (s: GameState) => GameState) => void;
  sendIntent?: (intent: Intent) => void;
  isHost?: boolean;
  meId: string;
  inviteUrl?: string;
}) {
  const me = state.players.find((p) => p.id === meId);
  const others = state.players.filter((p) => p.id !== meId);
  const botMemory = useRef(createBotMemory());
  const [muted, setMuted] = useState(sfx.isMuted());
  const [copied, setCopied] = useState(false);
  const wonAnnouncedRef = useRef(false);
  const [showPlayAgain, setShowPlayAgain] = useState(false);
  // Card the local player has tapped in their hand, ready to be swapped
  // with a held center card. Cleared whenever the swap completes, the hold
  // expires, or the card is no longer in hand.
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  // Local-only display order for the hand (array of card ids). Empty = use the
  // engine's order. Reset whenever the underlying hand contents change.
  const [handOrder, setHandOrder] = useState<string[]>([]);

  // Clear selection if the selected card is no longer in our hand.
  useEffect(() => {
    if (!selectedHandCardId) return;
    if (!me || !me.hand.some((c) => c.id === selectedHandCardId)) {
      setSelectedHandCardId(null);
    }
  }, [me, selectedHandCardId]);

  // Reset the local hand order whenever the hand contents change (so we
  // never reference a card id that no longer exists).
  useEffect(() => {
    if (!me) return;
    const handIds = me.hand.map((c) => c.id).sort().join("|");
    const orderIds = handOrder.slice().sort().join("|");
    if (handIds !== orderIds) {
      setHandOrder([]);
    }
  }, [me, handOrder]);

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
      if (winner) recordWin(winner.name);
      setTimeout(() => setShowPlayAgain(true), 2000);
    }
    if (state.status !== "won") {
      wonAnnouncedRef.current = false;
      setShowPlayAgain(false);
    }
  }, [state.status, state.winnerId, state.players]);

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
  const positions = useMemo(() => getSeatPositions(seatOrder.length), [seatOrder.length]);

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
    sfx.flip();
    dispatch({ kind: "holdCenter", playerId: meId, centerIndex: i });
  };

  const handleHandCardTap = (cardId: string) => {
    if (!me) return;
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
    const counts = new Map<string, number>();
    for (const c of me.hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    const RANK_ORDER: Record<string, number> = {
      A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
      "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
    };
    const sorted = [...me.hand].sort((a, b) => {
      const fa = counts.get(a.rank) ?? 0;
      const fb = counts.get(b.rank) ?? 0;
      if (fa !== fb) return fb - fa;
      const ra = RANK_ORDER[a.rank] ?? 99;
      const rb = RANK_ORDER[b.rank] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.suit.localeCompare(b.suit);
    });
    setHandOrder(sorted.map((c) => c.id));
    sfx.flip();
  };

  const handleBimyah = () => {
    if (!me) return;
    if (canDeclareBimyah(state, meId)) {
      dispatch({ kind: "declareBimyah", playerId: meId });
    }
  };

  const onReady = () => dispatch({ kind: "ready", playerId: meId, ready: true });

  const onPlayAgain = () => {
    dispatch({ kind: "playAgain" });
    setShowPlayAgain(false);
  };


  const copyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden">
      {/* Top bar */}
      <div className="absolute left-2 top-2 z-30 flex items-center gap-2">
        <HomeButton />
        <button
          onClick={() => {
            const next = !muted;
            sfx.setMuted(next);
            setMuted(next);
          }}
          className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur active:scale-90"
          aria-label="Mute"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
      <div className="absolute right-2 top-2 z-30 flex items-center gap-2">
        <HowToPlayButton />
      </div>

      {/* Invite (lobby only) — show 4-digit code */}
      {state.status === "lobby" && inviteUrl && (
        <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--mint)]/40 bg-black/40 px-3 py-1.5 text-white backdrop-blur">
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
      )}

      {/* Round table */}
      <div className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
        <div
          className="wood-table grid place-items-center rounded-full"
          style={{ width: "min(38vw, 32vh, 280px)", height: "min(38vw, 32vh, 280px)" }}
        >
          {/* Inner content: center cards + BIMYAH */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-1.5">
              {state.status === "lobby" && (
                <div className="px-2 text-center font-display text-[11px] uppercase tracking-widest text-white/70">
                  {state.players.length < 2
                    ? "Waiting for players…"
                    : "Tap Ready!"}
                </div>
              )}
              {state.status !== "lobby" &&
                state.center.map((slot, i) => {
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
                        <PlayingCard card={slot.card} width={36} />
                      </div>
                    );
                  }
                  return <EmptySlot key={i} width={36} outlineColor={outline} />;
                })}
            </div>

            {/* BIMYAH button under center cards, inside table */}
            {state.status === "playing" && (
              <button
                onClick={handleBimyah}
                disabled={!canDeclareBimyah(state, meId)}
                className={cn(
                  "btn-3d btn-3d-red mt-1 px-3 py-1.5 text-[11px]",
                  canDeclareBimyah(state, meId) && "animate-pulse-ring",
                )}
              >
                BIMYAH!
              </button>
            )}
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
        const pos = positions[seatIdx];
        return (
          <PlayerSeat
            key={player.id}
            player={player}
            position={pos}
            isMe={isMe}
            status={state.status}
            onReady={isMe ? onReady : undefined}
            onPileTap={isMe ? handlePileTap : undefined}
            onHandCardTap={isMe ? handleHandCardTap : undefined}
            onSet={isMe ? handleSet : undefined}
            selectedHandCardId={isMe ? selectedHandCardId : null}
          />
        );
      })}

      {/* Win overlay */}
      {state.status === "won" && (
        <>
          <Confetti />
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4">
            <div className="pow-burst" style={{ width: 240, height: 200 }}>
              <div className="flex flex-col items-center text-[oklch(0.18_0.04_165)]">
                <div className="font-display text-sm font-bold">WINNER</div>
                <div className="font-display text-3xl font-black">
                  {state.players.find((p) => p.id === state.winnerId)?.name ?? "?"}
                </div>
                <div className="font-display text-2xl font-black">BIMYAH!</div>
              </div>
            </div>
            {showPlayAgain && (
              <button onClick={onPlayAgain} className="btn-3d btn-3d-mint pointer-events-auto animate-float-up">
                Play Again?
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ============ Seat ============ */

type SeatPos = {
  // CSS classes to anchor seat container
  className: string;
  pileLayout: "row" | "col";
  rotate?: string;
  compact?: boolean;
};

function getSeatPositions(n: number): SeatPos[] {
  if (n === 2) {
    return [
      { className: "bottom-3 left-1/2 -translate-x-1/2", pileLayout: "row" },
      { className: "top-3 left-1/2 -translate-x-1/2", pileLayout: "row", rotate: "rotate-180" },
    ];
  }
  if (n === 3) {
    return [
      { className: "bottom-3 left-1/2 -translate-x-1/2", pileLayout: "row" },
      { className: "top-3 left-3", pileLayout: "row", rotate: "rotate-180" },
      { className: "top-3 right-3", pileLayout: "row", rotate: "rotate-180" },
    ];
  }
  // 4
  return [
    { className: "bottom-3 left-1/2 -translate-x-1/2", pileLayout: "row" },
    { className: "right-1 top-1/2 -translate-y-1/2", pileLayout: "row", compact: true },
    { className: "top-3 left-1/2 -translate-x-1/2", pileLayout: "row", rotate: "rotate-180" },
    { className: "left-1 top-1/2 -translate-y-1/2", pileLayout: "row", compact: true },
  ];
}

function PlayerSeat({
  player,
  position,
  isMe,
  status,
  onReady,
  onPileTap,
  onHandCardTap,
  onSet,
  selectedHandCardId,
}: {
  player: Player;
  position: SeatPos;
  isMe: boolean;
  status: GameState["status"];
  onReady?: () => void;
  onPileTap?: (i: number) => void;
  onHandCardTap?: (cardId: string) => void;
  onSet?: () => void;
  selectedHandCardId?: string | null;
}) {
  const colorHex = PLAYER_COLOR_HEX[player.color];
  const handReady =
    isMe && player.openPileIndex !== null && player.hand.length === 4 && isFourOfAKind(player.hand);

  // Determine pile width based on player count and seat
  const pileWidth = isMe ? 44 : position.compact ? 24 : 30;
  const pileGap = position.compact ? "gap-1" : "gap-1.5";

  return (
    <div className={cn("absolute z-10 flex flex-col items-center gap-1", position.className)}>
      {/* Hand row (only for me, when pile open) */}
      {isMe && player.openPileIndex !== null && status === "playing" && (
        <div className="relative mb-1 flex items-end justify-center gap-1.5">
          {player.hand.map((c) => (
            <PlayingCard
              key={c.id}
              card={c}
              width={42}
              selected={selectedHandCardId === c.id}
              onClick={() => onHandCardTap?.(c.id)}
            />
          ))}
          <button
            onClick={onSet}
            disabled={!handReady}
            className={cn(
              "ml-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
              handReady
                ? "bg-[var(--gold)] text-[oklch(0.18_0.04_165)] shadow-[var(--shadow-glow-gold)] animate-pulse-ring"
                : "bg-white/10 text-white/40",
            )}
            style={{ alignSelf: "flex-start" }}
          >
            SET
          </button>
        </div>
      )}

      {/* Name tag */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur",
          isMe ? "bg-black/50 text-white" : "bg-black/30 text-white/80",
          !isMe && "mb-12",
        )}
        style={{ borderLeft: `3px solid ${colorHex}` }}
      >
        <span>{player.name}</span>
        {player.isBot && <span className="opacity-60">🤖</span>}
        {status === "lobby" && player.ready && <span className="text-[var(--mint)]">✓</span>}
      </div>

      {/* Piles */}
      {status !== "lobby" && (
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
            if (pile.length === 0 && !isOpen) {
              return (
                <div
                  key={i}
                  style={{ width: pileWidth, height: pileWidth * 1.4 }}
                  className="rounded-lg border-2 border-dashed border-white/10"
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
              />
            );
          })}
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
