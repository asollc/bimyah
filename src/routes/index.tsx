import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PowLogo, RotationIcon } from "@/components/game/Visuals";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { sfx, getWinCounts } from "@/game/sfx";
import { Bot, Users, Plus } from "lucide-react";
import { createInitialGame } from "@/game/engine";
import { hostGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BIMYAH! — Fast-paced card game" },
      {
        name: "description",
        content:
          "BIMYAH! A fast simultaneous card game inspired by James Bond. Race to four-of-a-kind in all your piles.",
      },
      { property: "og:title", content: "BIMYAH! Card Game" },
      { property: "og:description", content: "Race to four-of-a-kind. Simultaneous, multiplayer." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  useEffect(() => {
    sfx.init();
  }, []);
  const [showSolo, setShowSolo] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [hostErr, setHostErr] = useState<string | null>(null);
  const navigate = useNavigate();

  const wins = getWinCounts().slice(0, 5);

  async function hostMultiplayer() {
    setHosting(true);
    setHostErr(null);
    try {
      const hostId = `host_${Math.random().toString(36).slice(2, 8)}`;
      const myName = "Host";
      const initial = createInitialGame("temp", [{ id: hostId, name: myName, isBot: false }]);
      const session = await hostGame(initial, hostId);
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${session.code}`, hostId);
      sessionStorage.setItem(`bimyah_name_${session.code}`, myName);
      void navigate({ to: "/game/$gameId", params: { gameId: session.code } });
    } catch (e) {
      console.error(e);
      setHostErr("Could not start host session. Try again.");
      setHosting(false);
    }
  }

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col items-center justify-between overflow-hidden px-4 py-3">
      {/* top bar */}
      <div className="flex w-full items-center justify-between">
        <RotationIcon />
        <HowToPlayButton />
      </div>

      {/* hero */}
      <div className="flex flex-col items-center gap-2">
        <PowLogo size={330} />
      </div>

      {/* buttons */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {!showSolo && !showJoin && (
          <>
            <button onClick={() => setShowSolo(true)} className="btn-3d btn-3d-mint w-full text-base">
              <Bot className="mr-2 h-5 w-5" /> Solo vs Bots
            </button>
            <button
              onClick={hostMultiplayer}
              disabled={hosting}
              className="btn-3d btn-3d-gold w-full text-base disabled:opacity-60"
            >
              <Plus className="mr-2 h-5 w-5" />
              {hosting ? "Starting…" : "Host Multiplayer"}
            </button>
            <button onClick={() => setShowJoin(true)} className="btn-3d btn-3d-dark w-full text-base">
              <Users className="mr-2 h-5 w-5" /> Join with Code
            </button>
            {hostErr && (
              <div className="text-center text-xs text-[var(--player-red)]">{hostErr}</div>
            )}
          </>
        )}

        {showSolo && <SoloPicker onCancel={() => setShowSolo(false)} />}
        {showJoin && <JoinPicker onCancel={() => setShowJoin(false)} />}
      </div>

      {/* footer history */}
      <div className="w-full max-w-xs text-center">
        <div className="mb-1 font-display text-[10px] uppercase tracking-widest text-white/40">
          Win History
        </div>
        {wins.length === 0 ? (
          <div className="text-xs text-white/40">Nothing yet — play a round!</div>
        ) : (
          <div className="flex flex-wrap justify-center gap-1.5">
            {wins.map((w) => (
              <span
                key={w.name}
                className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/80"
              >
                <b>{w.name}</b> · {w.wins}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SoloPicker({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  function start(botCount: 1 | 2 | 3) {
    const myId = "me";
    const players = [
      { id: myId, name: "You", isBot: false },
      ...Array.from({ length: botCount }, (_, i) => ({
        id: `bot_${i}`,
        name: `Bot ${i + 1}`,
        isBot: true,
      })),
    ];
    sessionStorage.setItem("bimyah_solo_setup", JSON.stringify(players));
    void navigate({ to: "/solo" });
  }
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Choose opponents
      </div>
      <button onClick={() => start(1)} className="btn-3d btn-3d-mint w-full text-sm">1 Bot (2P)</button>
      <button onClick={() => start(2)} className="btn-3d btn-3d-mint w-full text-sm">2 Bots (3P)</button>
      <button onClick={() => start(3)} className="btn-3d btn-3d-mint w-full text-sm">3 Bots (4P)</button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

function JoinPicker({ onCancel }: { onCancel: () => void }) {
  const [code, setCode] = useState("");
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Enter 4-digit code
      </div>
      <input
        autoFocus
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="0000"
        className="rounded-lg border border-[var(--mint)]/40 bg-black/40 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white placeholder:text-white/30"
      />
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
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}
