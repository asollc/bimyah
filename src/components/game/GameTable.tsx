import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, Player, PlayerColor } from "@/game/types";
import { CardBack, CascadeSet, EmptySlot, PlayingCard } from "./Card";
import {
  closePile,
  declareBimyah,
  declareSet,
  holdCenterCard,
  openPile,
  setReady,
  swapCard,
  tickCountdown,
  tickHolds,
  canDeclareBimyah,
  COUNTDOWN_MS,
} from "@/game/engine";
import { isFourOfAKind } from "@/game/deck";
import { Confetti, Countdown, RotationIcon } from "./Visuals";
import { HowToPlayButton } from "./HowToPlay";
import { createBotMemory, stepBots } from "@/game/bot";
import { sfx, recordWin } from "@/game/sfx";
import { Copy, Check, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
};

export function GameTable({
  state,
  setState,
  meId,
  inviteUrl,
}: {
  state: GameState;
  setState: (mutator: (s: GameState) => GameState) => void;
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

  // ===== Game tick =====
  useEffect(() => {
    const t = setInterval(() => {
      setState((s) => tickCountdown(s));
      setState((s) => tickHolds(s));
      // Bots
      stepBots(state, botMemory.current, (m) => setState(m));
    }, 250);
    return () => clearInterval(t);
  }, [state, setState]);

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
  const positions = useMemo(() => getSeatPositions(state.players.length), [state.players.length]);

  // helpers
  const handlePileTap = (pileIndex: number) => {
    if (!me || state.status !== "playing") return;
    if (me.pileLocked[pileIndex]) return;
    sfx.flip();
    setState((s) => openPile(s, meId, pileIndex));
  };

  const handleCenterTap = (i: number) => {
    if (!me || state.status !== "playing") return;
    const slot = state.center[i];
    if (!slot.card || slot.heldBy) return;
    if (me.openPileIndex === null) return;
    if (me.hand.length >= 5) return;
    sfx.flip();
    setState((s) => holdCenterCard(s, meId, i));
  };

  const handleHandCardTap = (cardId: string) => {
    if (!me) return;
    const holding = state.center.some((sl) => sl.heldBy === meId);
    if (!holding) return;
    sfx.swap();
    setState((s) => swapCard(s, meId, cardId));
  };

  const handleSet = () => {
    if (!me) return;
    if (me.hand.length === 4 && isFourOfAKind(me.hand)) {
      sfx.set();
      setState((s) => declareSet(s, meId));
    }
  };

  const handleBimyah = () => {
    if (!me) return;
    if (canDeclareBimyah(state, meId)) {
      setState((s) => declareBimyah(s, meId));
    }
  };

  const onReady = () => setState((s) => setReady(s, meId, true));

  const onPlayAgain = () => {
    // Reset: clear ready states, status -> lobby, clear piles/hand/center
    setState((s) => ({
      ...s,
      status: "lobby",
      winnerId: null,
      countdownEndsAt: null,
      center: [],
      players: s.players.map((p) => ({
        ...p,
        ready: p.isBot, // bots auto-ready
        piles: [],
        pileLocked: [],
        hand: [],
        openPileIndex: null,
      })),
    }));
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
        <RotationIcon />
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

      {/* Invite (lobby only) */}
      {state.status === "lobby" && inviteUrl && (
        <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--mint)]/40 bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur">
          <span className="max-w-[150px] truncate font-mono text-[10px] opacity-80">
            {inviteUrl.replace(/^https?:\/\//, "")}
          </span>
          <button
            onClick={copyInvite}
            className="flex items-center gap-1 rounded-full bg-[var(--mint)] px-2 py-0.5 text-[10px] font-bold text-[oklch(0.18_0.04_165)]"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Invite"}
          </button>
        </div>
      )}

      {/* Round table */}
      <div className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2">
        <div
          className="wood-table grid place-items-center rounded-full"
          style={{ width: "min(52.5vw, 45vh)", height: "min(52.5vw, 45vh)" }}
        >
          {/* Center cards */}
          <div className="flex items-center gap-2">
            {state.status === "lobby" && (
              <div className="text-center font-display text-sm uppercase tracking-widest text-white/70">
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
                  return (
                    <div key={i} onClick={() => handleCenterTap(i)} className="cursor-pointer">
                      <PlayingCard card={slot.card} width={42} />
                    </div>
                  );
                }
                return <EmptySlot key={i} width={42} outlineColor={outline} />;
              })}
          </div>
        </div>

        {/* BIMYAH button just under center */}
        {state.status === "playing" && (
          <div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 -translate-y-2">
            <button
              onClick={handleBimyah}
              disabled={!canDeclareBimyah(state, meId)}
              className={cn(
                "btn-3d btn-3d-red pointer-events-auto text-sm",
                canDeclareBimyah(state, meId) && "animate-pulse-ring",
              )}
            >
              BIMYAH!
            </button>
          </div>
        )}
      </div>

      {/* Countdown overlay */}
      {state.status === "countdown" && state.countdownEndsAt && (
        <Countdown endsAt={state.countdownEndsAt} />
      )}

      {/* Player seats */}
      {state.players.map((player) => {
        const isMe = player.id === meId;
        const seatIdx = state.players.indexOf(player);
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
};

function getSeatPositions(n: number): SeatPos[] {
  if (n === 2) {
    return [
      { className: "bottom-2 left-1/2 -translate-x-1/2", pileLayout: "row" },
      { className: "top-12 left-1/2 -translate-x-1/2", pileLayout: "row", rotate: "rotate-180" },
    ];
  }
  if (n === 3) {
    return [
      { className: "bottom-2 left-1/2 -translate-x-1/2", pileLayout: "row" },
      { className: "top-12 left-2", pileLayout: "row", rotate: "rotate-180" },
      { className: "top-12 right-2", pileLayout: "row", rotate: "rotate-180" },
    ];
  }
  // 4
  return [
    { className: "bottom-2 left-1/2 -translate-x-1/2", pileLayout: "row" },
    { className: "right-2 top-1/2 -translate-y-1/2", pileLayout: "col", rotate: "-rotate-90" },
    { className: "top-12 left-1/2 -translate-x-1/2", pileLayout: "row", rotate: "rotate-180" },
    { className: "left-2 top-1/2 -translate-y-1/2", pileLayout: "col", rotate: "rotate-90" },
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
}: {
  player: Player;
  position: SeatPos;
  isMe: boolean;
  status: GameState["status"];
  onReady?: () => void;
  onPileTap?: (i: number) => void;
  onHandCardTap?: (cardId: string) => void;
  onSet?: () => void;
}) {
  const colorHex = PLAYER_COLOR_HEX[player.color];
  const handReady =
    isMe && player.openPileIndex !== null && player.hand.length === 4 && isFourOfAKind(player.hand);

  // Determine pile width based on player count and seat
  const pileWidth = isMe ? 44 : 30;

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
            "flex gap-1.5",
            position.pileLayout === "col" ? "flex-col" : "flex-row",
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
