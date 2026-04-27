import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Home } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import bimyahLogo from "@/assets/bimyah-logo.png";
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
      style={{ width: size, height: size * 0.95 }}
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
