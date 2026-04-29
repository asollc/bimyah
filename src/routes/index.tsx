import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PowLogo } from "@/components/game/Visuals";
import { CardBack } from "@/components/game/Card";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { sfx } from "@/game/sfx";
import { Bot, Users, Plus, Trophy, Swords } from "lucide-react";
import { createInitialGame } from "@/game/engine";
import { hostGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { saveReentryCode, loadReentryCode } from "@/game/reentry";
import type { GameMode } from "@/game/types";

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
  const [showHost, setShowHost] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [hostErr, setHostErr] = useState<string | null>(null);
  const navigate = useNavigate();


  async function hostMultiplayer(rawName: string, mode: GameMode, pointLimit: number | null) {
    setHosting(true);
    setHostErr(null);
    try {
      const myName = (rawName || "").trim().slice(0, 14) || "Host";
      try {
        localStorage.setItem("bimyah_last_name", myName);
      } catch {
        /* ignore */
      }
      const hostId = `host_${Math.random().toString(36).slice(2, 8)}`;
      const initial = createInitialGame(
        "temp",
        [{ id: hostId, name: myName, isBot: false }],
        { mode, pointLimit },
      );
      const session = await hostGame(initial, hostId);
      const hostPlayer = session.getState()?.players.find((p) => p.id === hostId);
      if (hostPlayer?.reentryCode) {
        saveReentryCode(session.code, hostPlayer.reentryCode);
      }
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${session.code}`, hostId);
      sessionStorage.setItem(`bimyah_name_${session.code}`, myName);
      saveIdentity(session.code, { meId: hostId, name: myName, role: "host" });
      void navigate({ to: "/game/$gameId", params: { gameId: session.code } });
    } catch (e) {
      console.error(e);
      setHostErr("Could not start host session. Try again.");
      setHosting(false);
    }
  }

  return (
    <div className="relative flex h-[calc(100dvh-50px)] min-h-[560px] w-screen flex-col items-center overflow-x-hidden px-4 pt-2 pb-2 lg:h-auto lg:min-h-[calc(100dvh-50px)] lg:pt-3 lg:pb-3">
      <FloatingCards />

      <div className="relative z-10 flex w-full items-center justify-between">
        <div className="h-9 w-9" />
        <HowToPlayButton />
      </div>

      <div className="relative z-10 mt-2 flex flex-col items-center gap-2 sm:gap-3">
        <PowLogo size={207} />
        <div
          className="text-3d-yellow font-display text-center text-xs font-black uppercase leading-tight sm:text-sm md:text-base"
          style={{ letterSpacing: "0.08em" }}
        >
          A Fast-Paced Card Race
          <br />
          With No Turns!
        </div>
      </div>

      <div className="relative z-10 mt-6 flex w-full max-w-xs flex-col gap-2 sm:gap-3">
        {!showSolo && !showJoin && !showHost && (
          <>
            <button onClick={() => setShowSolo(true)} className="btn-3d btn-3d-mint w-full text-base">
              <Bot className="mr-2 h-5 w-5" /> Solo vs Bots
            </button>
            <button
              onClick={() => setShowHost(true)}
              disabled={hosting}
              className="btn-3d btn-3d-gold w-full text-base disabled:opacity-60"
            >
              <Plus className="mr-2 h-5 w-5" />
              Host Multiplayer
            </button>
            <button onClick={() => setShowJoin(true)} className="btn-3d btn-3d-dark w-full text-base">
              <Users className="mr-2 h-5 w-5" /> Join with Code
            </button>
            {hostErr && (
              <div className="text-center text-xs text-[var(--player-red)]">{hostErr}</div>
            )}
          </>
        )}

        {showSolo && <SoloFlow onCancel={() => setShowSolo(false)} />}
        {showJoin && <JoinPicker onCancel={() => setShowJoin(false)} />}
        {showHost && (
          <HostFlow
            hosting={hosting}
            error={hostErr}
            onCancel={() => {
              setShowHost(false);
              setHostErr(null);
            }}
            onStart={(name, mode, limit) => hostMultiplayer(name, mode, limit)}
          />
        )}
      </div>

    </div>
  );
}

function FloatingCards() {
  const cards = [
    { top: "8%", left: "6%", size: 38, rot: -14, dx: 12, dy: -10, dur: 9 },
    { top: "18%", left: "82%", size: 44, rot: 18, dx: -14, dy: 12, dur: 11 },
    { top: "42%", left: "3%", size: 34, rot: 8, dx: 10, dy: 14, dur: 10 },
    { top: "55%", left: "90%", size: 40, rot: -22, dx: -10, dy: -12, dur: 12 },
    { top: "72%", left: "10%", size: 36, rot: 14, dx: 14, dy: -8, dur: 9.5 },
    { top: "80%", left: "78%", size: 42, rot: -10, dx: -12, dy: 10, dur: 10.5 },
    { top: "92%", left: "4%", size: 32, rot: 20, dx: 10, dy: -10, dur: 11 },
    { top: "92%", left: "88%", size: 34, rot: -18, dx: -10, dy: -8, dur: 10 },
    { top: "30%", left: "94%", size: 30, rot: 12, dx: -8, dy: 10, dur: 12.5 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-80">
      {cards.map((c, i) => (
        <div
          key={i}
          className="animate-float-card absolute"
          style={
            {
              top: c.top,
              left: c.left,
              "--rot": `${c.rot}deg`,
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              "--dur": `${c.dur}s`,
              animationDelay: `${i * 0.4}s`,
            } as React.CSSProperties
          }
        >
          <CardBack width={c.size} />
        </div>
      ))}
    </div>
  );
}

/* ============================ Shared step UIs ============================ */

function ModeStep({
  onPick,
  onCancel,
}: {
  onPick: (mode: GameMode) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Choose mode
      </div>
      <button onClick={() => onPick("standard")} className="btn-3d btn-3d-mint w-full text-sm">
        <Swords className="mr-2 h-4 w-4" /> Standard
      </button>
      <button onClick={() => onPick("tournament")} className="btn-3d btn-3d-gold w-full text-sm">
        <Trophy className="mr-2 h-4 w-4" /> Tournament
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

function NameStep({
  initial,
  accent,
  ctaLabel,
  ctaClass,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: string;
  accent: "mint" | "gold";
  ctaLabel: string;
  ctaClass: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const canGo = trimmed.length >= 1 && !busy;
  const borderClr = accent === "gold" ? "var(--gold)" : "var(--mint)";
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Your name
      </div>
      <input
        autoFocus
        value={name}
        maxLength={14}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canGo) onSubmit(trimmed);
        }}
        placeholder="Enter your name"
        className="rounded-lg border bg-black/40 px-4 py-3 text-center font-display text-xl tracking-wider text-white placeholder:text-white/30"
        style={{ borderColor: `${borderClr}80` }}
      />
      <button
        onClick={() => onSubmit(trimmed)}
        disabled={!canGo}
        className={`btn-3d ${ctaClass} w-full text-sm disabled:opacity-40`}
      >
        {busy ? "Starting…" : ctaLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

function PointLimitStep({
  initial,
  onSubmit,
  onCancel,
  ctaClass,
  ctaLabel,
  busy,
}: {
  initial: string;
  onSubmit: (limit: number) => void;
  onCancel: () => void;
  ctaClass: string;
  ctaLabel: string;
  busy?: boolean;
}) {
  const [val, setVal] = useState(initial);
  const num = parseInt(val, 10);
  const valid = Number.isFinite(num) && num >= 1 && num <= 1000 && !busy;
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Point limit
      </div>
      <input
        autoFocus
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onSubmit(num);
        }}
        placeholder="e.g. 100"
        className="rounded-lg border border-[var(--gold)]/50 bg-black/40 px-4 py-3 text-center font-display text-2xl tracking-wider text-white placeholder:text-white/30"
      />
      <div className="text-center text-[10px] text-white/50">1 – 1000 points</div>
      <button
        onClick={() => onSubmit(num)}
        disabled={!valid}
        className={`btn-3d ${ctaClass} w-full text-sm disabled:opacity-40`}
      >
        {busy ? "Starting…" : ctaLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

/* ============================ Solo flow ============================ */

type SoloStep = "mode" | "name" | "points" | "bots";

function SoloFlow({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<SoloStep>("mode");
  const [mode, setMode] = useState<GameMode>("standard");
  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem("bimyah_last_name") ?? "";
    } catch {
      return "";
    }
  });
  const [pointLimit, setPointLimit] = useState<number | null>(null);

  function start(botCount: 1 | 2 | 3) {
    const myId = "me";
    const finalName = name.trim().slice(0, 14) || "You";
    try {
      localStorage.setItem("bimyah_last_name", finalName);
    } catch {
      /* ignore */
    }
    const players = [
      { id: myId, name: finalName, isBot: false },
      ...Array.from({ length: botCount }, (_, i) => ({
        id: `bot_${i}`,
        name: `Bot ${i + 1}`,
        isBot: true,
      })),
    ];
    sessionStorage.setItem(
      "bimyah_solo_setup",
      JSON.stringify({ players, mode, pointLimit }),
    );
    void navigate({ to: "/solo" });
  }

  if (step === "mode") {
    return (
      <ModeStep
        onPick={(m) => {
          setMode(m);
          setStep("name");
        }}
        onCancel={onCancel}
      />
    );
  }
  if (step === "name") {
    return (
      <NameStep
        initial={name}
        accent="mint"
        ctaLabel="Next"
        ctaClass="btn-3d-mint"
        onSubmit={(n) => {
          setName(n);
          setStep(mode === "tournament" ? "points" : "bots");
        }}
        onCancel={onCancel}
      />
    );
  }
  if (step === "points") {
    return (
      <PointLimitStep
        initial=""
        ctaLabel="Next"
        ctaClass="btn-3d-gold"
        onSubmit={(n) => {
          setPointLimit(n);
          setStep("bots");
        }}
        onCancel={onCancel}
      />
    );
  }
  // bots
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

/* ============================ Join flow ============================ */

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

/* ============================ Host flow ============================ */

type HostStep = "mode" | "name" | "points";

function HostFlow({
  hosting,
  error,
  onCancel,
  onStart,
}: {
  hosting: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (name: string, mode: GameMode, pointLimit: number | null) => void;
}) {
  const [step, setStep] = useState<HostStep>("mode");
  const [mode, setMode] = useState<GameMode>("standard");
  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem("bimyah_last_name") ?? "";
    } catch {
      return "";
    }
  });

  if (step === "mode") {
    return (
      <ModeStep
        onPick={(m) => {
          setMode(m);
          setStep("name");
        }}
        onCancel={onCancel}
      />
    );
  }
  if (step === "name") {
    const isTourney = mode === "tournament";
    return (
      <>
        <NameStep
          initial={name}
          accent="gold"
          ctaLabel={isTourney ? "Next" : hosting ? "Starting…" : "Start Hosting"}
          ctaClass="btn-3d-gold"
          busy={hosting}
          onSubmit={(n) => {
            setName(n);
            if (isTourney) {
              setStep("points");
            } else {
              onStart(n, "standard", null);
            }
          }}
          onCancel={onCancel}
        />
        {error && (
          <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
        )}
      </>
    );
  }
  // points
  return (
    <>
      <PointLimitStep
        initial=""
        ctaLabel={hosting ? "Starting…" : "Start Hosting"}
        ctaClass="btn-3d-gold"
        busy={hosting}
        onSubmit={(limit) => onStart(name, "tournament", limit)}
        onCancel={onCancel}
      />
      {error && (
        <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
      )}
    </>
  );
}
