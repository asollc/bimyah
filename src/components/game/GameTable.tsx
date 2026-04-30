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
import { Copy, Check, Volume2, VolumeX, ArrowDownUp, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyIntent, type Intent } from "@/game/peer";

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
  const [showSettings, setShowSettings] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const wonAnnouncedRef = useRef(false);
  const [showPlayAgain, setShowPlayAgain] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showNewTournyPicker, setShowNewTournyPicker] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState("");
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [sortEnabled, setSortEnabled] = useState(false);
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

  return (
    <div className="relative h-[calc(100dvh-50px)] w-screen overflow-hidden">
      {/* Top-left: Settings cog (with Add Bot below in lobby; Score to its right in tournament) */}
      <div className="absolute left-2 top-2 z-30 flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur active:scale-90"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          {isTournament && state.pointLimit !== null && (
            <ScoreDisplay limit={state.pointLimit} />
          )}
        </div>
        {state.status === "lobby" &&
          isHost &&
          state.players.length < (state.maxSeats ?? 4) && (
            <button
              onClick={() => dispatch({ kind: "addBot" })}
              className="btn-3d btn-3d-dark flex items-center gap-1 px-[10px] py-[3px] text-[9.5px]"
              aria-label="Add a bot to the lobby"
            >
              🤖 Add Bot
            </button>
          )}
      </div>

      {/* Top-right: HowToPlay + Scoreboard (in tournament) */}
      <div className="absolute right-2 top-2 z-30 flex flex-col items-end gap-2">
        <HowToPlayButton />
        {isTournament && (
          <ScoreboardButton onClick={() => setShowScoreboard(true)} />
        )}
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



      {/* Match # banner above the table (tournament only) */}
      {isTournament && (
        <div
          className="absolute left-1/2 z-20 -translate-x-1/2"
          style={{ top: "calc(50% - min(19vw, 16vh, 140px) - 32px)" }}
        >
          <MatchBadge n={state.matchNumber} />
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
            {/* Inner content: center cards + BIMYAH */}
            <div className="flex flex-col items-center justify-center gap-1.5">
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
        return (
          <>
            <Confetti />
            <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 p-4">
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
              {showPlayAgain && !isTournament && (
                <button
                  onClick={onPlayAgain}
                  className="btn-3d btn-3d-mint pointer-events-auto animate-float-up"
                >
                  Play Again?
                </button>
              )}
              {showPlayAgain && isTournament && !isChampion && (
                <button
                  onClick={onNextMatch}
                  className="btn-3d btn-3d-mint pointer-events-auto animate-float-up"
                >
                  Next Match?
                </button>
              )}
              {showPlayAgain && isTournament && isChampion && (
                <button
                  onClick={() => setShowNewTournyPicker(true)}
                  className="btn-3d btn-3d-gold pointer-events-auto animate-float-up"
                >
                  New Tournament?
                </button>
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
          </div>
        </div>
      )}

      {/* New tournament point-limit picker */}
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
  const SOUTH: SeatPos = { x: 50, y: 92, anchor: "bottom-center", pileLayout: "row" };
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
    transform: `${anchorTransform(position.anchor)} translate(${liveDx}px, ${liveDy}px)`,
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
      {/* Hand row (only for me, when pile open). SET/SORT buttons render below
          the piles further down so they sit under the card stacks. */}
      {isMe && player.openPileIndex !== null && status === "playing" && (
        <div className="mb-1 flex items-end justify-center gap-1.5">
          {orderedHand.map((c) => (
            <PlayingCard
              key={c.id}
              card={c}
              width={36}
              selected={selectedHandCardId === c.id}
              onClick={() => onHandCardTap?.(c.id)}
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
      )}

      {/* SET/SORT buttons — under the piles, side by side */}
      {isMe && player.openPileIndex !== null && status === "playing" && (
        <div className="mt-1 flex items-center justify-center gap-1.5">
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
