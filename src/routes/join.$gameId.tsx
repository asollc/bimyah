import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { joinGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { PLAYER_COLORS } from "@/game/engine";
import { PowLogo, RotationIcon } from "@/components/game/Visuals";
import { HowToPlayButton } from "@/components/game/HowToPlay";

export const Route = createFileRoute("/join/$gameId")({
  component: JoinGame,
});

function JoinGame() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const myId = `p_${Math.random().toString(36).slice(2, 8)}`;
      const session = await joinGame(gameId, myId);
      const state = session.getState();
      if (!state) {
        setErr("Could not load game");
        setBusy(false);
        session.destroy();
        return;
      }
      if (state.status !== "lobby") {
        setErr("Game already started");
        setBusy(false);
        session.destroy();
        return;
      }
      if (state.players.length >= 4) {
        setErr("Game is full");
        setBusy(false);
        session.destroy();
        return;
      }
      const newPlayer = {
        id: myId,
        name: name.trim().slice(0, 14),
        color: PLAYER_COLORS[state.players.length],
        isBot: false,
        ready: false,
        piles: [],
        pileLocked: [],
        hand: [],
        openPileIndex: null,
      };
      session.setState((s) => ({ ...s, players: [...s.players, newPlayer] }));
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${gameId}`, myId);
      sessionStorage.setItem(`bimyah_name_${gameId}`, newPlayer.name);
      saveIdentity(gameId, { meId: myId, name: newPlayer.name, role: "joiner" });
      void navigate({ to: "/game/$gameId", params: { gameId } });
    } catch (e) {
      console.error(e);
      setErr("Could not connect. Check the code.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col items-center justify-between overflow-hidden px-4 py-3">
      <div className="flex w-full items-center justify-between">
        <RotationIcon />
        <HowToPlayButton />
      </div>
      <PowLogo size={270} />
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
          Joining game <span className="text-[var(--mint)]">{gameId}</span>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={14}
          className="rounded-lg border border-[var(--mint)]/40 bg-black/40 px-4 py-3 text-center font-display text-xl text-white placeholder:text-white/30"
        />
        {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="btn-3d btn-3d-mint w-full text-base"
        >
          {busy ? "Connecting…" : "Join Game"}
        </button>
      </form>
      <div />
    </div>
  );
}
