import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { saveReentryCode, loadReentryCode, loadLastRoom } from "@/game/reentry";

export function JoinPicker({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"room" | "reentry">("room");
  const [code, setCode] = useState("");
  const [reentry, setReentry] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const last = loadLastRoom();
    if (last && /^\d{4}$/.test(last)) setCode(last);
  }, []);

  async function startReentry() {
    if (code.length !== 4) return;
    setErr(null);
    setVerifying(true);
    try {
      const tempId = `verify_${Math.random().toString(36).slice(2, 8)}`;
      const session = await (await import("@/game/peer")).joinGame(code, tempId);
      const state = session.getState();
      session.destroy();
      if (!state) {
        setErr("Could not load room");
        setVerifying(false);
        return;
      }
      const stored = loadReentryCode(code);
      if (stored) setReentry(stored);
      setStep("reentry");
      setVerifying(false);
    } catch {
      setErr("Room not found. Check the code.");
      setVerifying(false);
    }
  }

  async function rejoinGame() {
    if (reentry.length !== 4) return;
    setErr(null);
    setRejoining(true);
    try {
      const { joinGame } = await import("@/game/peer");
      const tempId = `rejoin_${Math.random().toString(36).slice(2, 8)}`;
      const session = await joinGame(code, tempId);
      const state = session.getState();
      if (!state) {
        setErr("Could not load room");
        session.destroy();
        setRejoining(false);
        return;
      }
      const seat = state.players.find((p) => p.reentryCode === reentry);
      if (!seat) {
        setErr("Reentry code not recognized");
        session.destroy();
        setRejoining(false);
        return;
      }
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${code}`, seat.id);
      sessionStorage.setItem(`bimyah_name_${code}`, seat.name);
      saveIdentity(code, { meId: seat.id, name: seat.name, role: "joiner" });
      saveReentryCode(code, reentry);
      const { saveLastRoom } = await import("@/game/reentry");
      saveLastRoom(code);
      void navigate({ to: "/game/$gameId", params: { gameId: code } });
    } catch {
      setErr("Could not connect. Try again.");
      setRejoining(false);
    }
  }

  if (step === "reentry") {
    return (
      <>
        <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
          Your Reentry Code
        </div>
        <input
          autoFocus
          inputMode="numeric"
          value={reentry}
          onChange={(e) => setReentry(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="0000"
          className="rounded-lg border border-[var(--mint)]/40 bg-black/40 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white placeholder:text-white/30"
        />
        {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
        <button
          onClick={rejoinGame}
          disabled={reentry.length !== 4 || rejoining}
          className="btn-3d btn-3d-mint w-full text-sm disabled:opacity-40"
        >
          {rejoining ? "Rejoining…" : "Rejoin Game"}
        </button>
        <button
          onClick={() => {
            setStep("room");
            setErr(null);
          }}
          className="text-xs text-white/50"
        >
          Back
        </button>
      </>
    );
  }

  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Enter 4-Digit Room Code
      </div>
      <input
        autoFocus
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="0000"
        className="rounded-lg border border-[var(--mint)]/40 bg-black/40 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white placeholder:text-white/30"
      />
      {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
      <Link
        to="/join/$gameId"
        params={{ gameId: code }}
        className={
          code.length === 4
            ? "btn-3d btn-3d-mint w-full text-sm"
            : "btn-3d btn-3d-mint w-full text-sm pointer-events-none opacity-40"
        }
      >
        Join Game
      </Link>
      <button
        onClick={startReentry}
        disabled={code.length !== 4 || verifying}
        className="btn-3d btn-3d-dark w-full text-sm disabled:opacity-40"
      >
        {verifying ? "Verifying…" : "Use Reentry Code"}
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}
