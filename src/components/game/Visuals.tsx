import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Home, Trophy, Crown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import bimyahLogo from "@/assets/bimyah-logo.png";
import type { GameState, PlayerColor } from "@/game/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PowLogo({ size = 220 }: { size?: number }) {
  return (
    <div
      className="animate-pop-in flex items-center justify-center"
      style={{ width: size, height: size * (1158 / 1215) }}
    >
      <img
        src={bimyahLogo}
        alt="BIMYAH! The Card Game"
        draggable={false}
        className="h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

export function Countdown({ endsAt, onDone }: { endsAt: number; onDone?: () => void }) {
  const [n, setN] = useState<number>(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setN(left);
      if (left <= 0) {
        clearInterval(t);
        onDone?.();
      }
    }, 100);
    return () => clearInterval(t);
  }, [endsAt, onDone]);
  if (n <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div
        key={n}
        className="animate-countdown font-display text-[120px] font-black text-[var(--gold)]"
        style={{ textShadow: "0 6px 20px rgba(0,0,0,0.6), 0 0 40px var(--gold)" }}
      >
        {n}
      </div>
    </div>
  );
}

export function Confetti() {
  const pieces = Array.from({ length: 80 });
  const colors = ["#2dd4a8", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa", "#34d399"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.2;
        const dur = 2 + Math.random() * 2;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 8;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -20,
              width: size,
              height: size * 0.5,
              background: color,
              borderRadius: 2,
              animation: `confetti-fall ${dur}s linear ${delay}s forwards`,
            }}
          />
        );
      })}
    </div>
  );
}

export function RotationIcon({ className }: { className?: string }) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        setHint(hint ? null : "Rotate device for best view");
        setTimeout(() => setHint(null), 1800);
      }}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur transition active:scale-90",
        className,
      )}
      aria-label="Rotate hint"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 3.5L20 7l-3.5 3.5" />
        <path d="M4 11V8a4 4 0 0 1 4-4h12" />
        <path d="M7.5 20.5L4 17l3.5-3.5" />
        <path d="M20 13v3a4 4 0 0 1-4 4H4" />
      </svg>
      {hint && (
        <span className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[11px] text-white">
          {hint}
        </span>
      )}
    </button>
  );
}

/**
 * Round home button. Tapping prompts the user to confirm before returning to
 * the home screen (so they don't accidentally drop out of an active game).
 */
export function HomeButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur transition active:scale-90",
          className,
        )}
        aria-label="Return to home screen"
      >
        <Home className="h-4 w-4" />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-[var(--mint)]/30 bg-[oklch(0.18_0.04_165)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl text-[var(--mint)]">
              Leave the game?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              Returning to the home screen will leave your current game behind.
              You can rejoin if it's still in the lobby, but in-progress games
              will keep going without you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-black/30 text-white hover:bg-black/50 hover:text-white">
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                void navigate({ to: "/" });
              }}
              className="bg-[var(--mint)] text-[oklch(0.18_0.04_165)] hover:bg-[var(--mint)]/90"
            >
              Go Home
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ============================ Tournament UI ============================ */

const PLAYER_COLOR_HEX_LOCAL: Record<PlayerColor, string> = {
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
};

/** Compact "SCORE: 100" 3D label shown under the home button in tournament mode. */
export function ScoreDisplay({ limit }: { limit: number }) {
  return (
    <div
      className="font-display text-3d-yellow whitespace-nowrap text-[11px] font-black uppercase tracking-widest"
      style={{ letterSpacing: "0.12em" }}
    >
      SCORE: {limit}
    </div>
  );
}

/** Small banner shown above the table reading "MATCH 3". */
export function MatchBadge({ n }: { n: number }) {
  return (
    <div
      className="font-display text-3d-mint whitespace-nowrap text-[13px] font-black uppercase tracking-widest"
      style={{ letterSpacing: "0.16em" }}
    >
      MATCH {n}
    </div>
  );
}

export function ScoreboardButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("btn-3d btn-3d-gold !px-1.5 !py-0.5 text-[9px]", className)}
      aria-label="Scoreboard"
      style={{ borderRadius: 6 }}
    >
      Scoreboard
    </button>
  );
}

/**
 * Scoreboard overlay. Header row (Match # | name1 | name2 | …) is sticky.
 * Champion's column is highlighted in their player color and gets a 3D crown.
 */
export function Scoreboard({
  state,
  open,
  onClose,
}: {
  state: GameState;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const players = state.players;
  const championId = state.championId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--gold)]/40 bg-[oklch(0.18_0.04_165)] shadow-[var(--shadow-glow-gold)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-3 py-2">
          <div className="font-display text-sm font-bold uppercase tracking-widest text-[var(--gold)]">
            <Trophy className="mr-1.5 inline h-4 w-4" /> Scoreboard
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20"
          >
            Close
          </button>
        </div>

        {state.pointLimit !== null && (
          <div className="border-b border-white/10 bg-black/20 px-3 py-1.5 text-center text-[10px] uppercase tracking-widest text-white/60">
            First to {state.pointLimit} wins
          </div>
        )}

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-center text-xs text-white">
            <thead className="sticky top-0 z-10 bg-[oklch(0.22_0.06_165)] shadow-[0_2px_0_rgba(0,0,0,0.4)]">
              <tr>
                <th className="px-2 py-2 font-display text-[10px] uppercase tracking-widest text-white/70">
                  Match #
                </th>
                {players.map((p) => {
                  const isChamp = p.id === championId;
                  const colorHex = PLAYER_COLOR_HEX_LOCAL[p.color];
                  return (
                    <th
                      key={p.id}
                      className="relative px-2 py-2 font-display text-[11px] uppercase tracking-wide"
                      style={{
                        background: isChamp ? `${colorHex}33` : undefined,
                        borderLeft: `3px solid ${colorHex}`,
                      }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {isChamp && (
                          <Crown
                            className="h-4 w-4 text-[var(--gold)]"
                            style={{ filter: "drop-shadow(0 1px 0 #854d0e) drop-shadow(0 2px 2px rgba(0,0,0,0.6))" }}
                          />
                        )}
                        <span className="truncate" style={{ color: colorHex }}>
                          {p.name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[9px] font-normal text-white/60">
                        {state.scores[p.id] ?? 0} pts
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {state.matchHistory.length === 0 ? (
                <tr>
                  <td
                    colSpan={1 + players.length}
                    className="px-2 py-6 text-white/50"
                  >
                    No matches yet.
                  </td>
                </tr>
              ) : (
                state.matchHistory.map((m) => (
                  <tr key={m.matchNumber} className="border-t border-white/5">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-white/80">
                      {m.matchNumber}
                    </td>
                    {players.map((p) => {
                      const pts = m.perPlayer[p.id] ?? 0;
                      const isChamp = p.id === championId;
                      const colorHex = PLAYER_COLOR_HEX_LOCAL[p.color];
                      return (
                        <td
                          key={p.id}
                          className="px-2 py-1.5"
                          style={{
                            background: isChamp ? `${colorHex}22` : undefined,
                          }}
                        >
                          {pts > 0 ? (
                            <span className="font-bold text-[var(--mint)]">+{pts}</span>
                          ) : (
                            <span className="text-white/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
