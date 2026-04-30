import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PowLogo } from "@/components/game/Visuals";
import { CardBack } from "@/components/game/Card";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { sfx } from "@/game/sfx";
import { Bot, Users, Plus, Trophy, Swords, LogIn } from "lucide-react";
import { createInitialGame } from "@/game/engine";
import { hostGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { saveReentryCode, loadReentryCode } from "@/game/reentry";
import { useAuth } from "@/auth/AuthProvider";
import { getMyCosmetics } from "@/server/cosmetics.functions";
import { getMyEntitlement } from "@/server/bplus.functions";
import { getMyAdminStatus } from "@/server/admin.functions";
import type { GameMode } from "@/game/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { user, profile, loading: authLoading } = useAuth();
  const isAuthed = !!user;

  function requireAuth(action: () => void) {
    if (!isAuthed) {
      void navigate({ to: "/auth" });
      return;
    }
    action();
  }


  async function hostMultiplayer(rawName: string, mode: GameMode, pointLimit: number | null, maxSeats: number) {
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
      let cosmetics: { avatarUrl: string | null; cardBackUrl: string | null } = {
        avatarUrl: null,
        cardBackUrl: null,
      };
      try {
        cosmetics = await getMyCosmetics();
      } catch {
        /* not signed in or no cosmetics */
      }
      const initial = createInitialGame(
        "temp",
        [
          {
            id: hostId,
            name: myName,
            isBot: false,
            avatarUrl: cosmetics.avatarUrl,
            cardBackUrl: cosmetics.cardBackUrl,
          },
        ],
        { mode, pointLimit, maxSeats },
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

  const initial = (profile?.display_name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!isAuthed) {
      setIsAdmin(false);
      return;
    }
    void getMyAdminStatus()
      .then((r) => setIsAdmin(r.is_admin))
      .catch(() => setIsAdmin(false));
  }, [isAuthed]);

  return (
    <div className="relative flex h-[calc(100dvh-50px)] min-h-[560px] w-screen flex-col items-center overflow-x-hidden px-4 pt-2 pb-2 lg:h-auto lg:min-h-[calc(100dvh-50px)] lg:pt-3 lg:pb-3">
      <FloatingCards />

      <div className="relative z-10 flex w-full items-center justify-between">
        {authLoading ? (
          <div className="h-9 w-9" />
        ) : isAuthed ? (
          <Link
            to="/profile"
            aria-label="Open profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mint)]/20 font-display text-sm font-black text-[var(--mint)] ring-2 ring-[var(--mint)]/40 transition hover:scale-105"
          >
            {initial}
          </Link>
        ) : (
          <Link
            to="/auth"
            aria-label="Sign in"
            className="flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 font-display text-[10px] font-black uppercase tracking-widest text-[var(--mint)] ring-1 ring-[var(--mint)]/40 transition hover:scale-105"
          >
            <LogIn className="h-3 w-3" /> Sign In
          </Link>
        )}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              aria-label="Admin"
              className="flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 font-display text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/30 transition hover:scale-105"
            >
              Admin
            </Link>
          )}
          <Link
            to="/plus"
            aria-label="Bimyah Plus"
            className="flex h-9 items-center gap-1 rounded-full bg-gradient-to-r from-[var(--gold)]/30 to-[var(--gold)]/10 px-3 font-display text-[10px] font-black uppercase tracking-widest text-[var(--gold)] ring-1 ring-[var(--gold)]/50 transition hover:scale-105"
          >
            Bimyah!<span className="text-white">+</span>
          </Link>
          <HowToPlayButton />
        </div>
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
        {!isAuthed && !authLoading && (
          <div className="text-center text-[10px] uppercase tracking-widest text-[var(--player-mint,#22c55e)] border-stone-950 border-0 bg-transparent text-slate-50 font-sans">
            Free account required to play
          </div>
        )}
      </div>

      <div className="relative z-10 mt-6 flex w-full max-w-xs flex-col gap-2 sm:gap-3">
        {!showSolo && !showJoin && !showHost && (
          <>
            <button
              onClick={() => requireAuth(() => setShowSolo(true))}
              className="btn-3d btn-3d-mint w-full text-base"
            >
              <Bot className="mr-2 h-5 w-5" /> Solo vs Bots
            </button>
            <button
              onClick={() => requireAuth(() => setShowHost(true))}
              disabled={hosting}
              className="btn-3d btn-3d-gold w-full text-base disabled:opacity-60"
            >
              <Plus className="mr-2 h-5 w-5" />
              <span className="flex flex-col items-center leading-tight">
                <span>Create Game</span>
                <span className="text-[10px] font-normal opacity-80 normal-case">
                  Play with bots, humans, or both
                </span>
              </span>
            </button>
            <button
              onClick={() => requireAuth(() => setShowJoin(true))}
              className="btn-3d btn-3d-dark w-full text-base"
            >
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
            onStart={(name, mode, limit, seats) => {
              void hostMultiplayer(name, mode, limit, seats);
            }}
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
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ent = await getMyEntitlement();
        if (!cancelled) setIsPlus(!!ent?.is_plus);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function start(botCount: number) {
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
  const freeOptions: Array<{ count: number; label: string }> = [
    { count: 1, label: "1 Bot (2P)" },
    { count: 2, label: "2 Bots (3P)" },
    { count: 3, label: "3 Bots (4P)" },
  ];
  const plusOptions: Array<{ count: number; label: string }> = [
    { count: 4, label: "4 Bots (5P)" },
    { count: 5, label: "5 Bots (6P)" },
    { count: 6, label: "6 Bots (7P)" },
    { count: 7, label: "7 Bots (8P)" },
  ];
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Choose opponents
      </div>
      {freeOptions.map((o) => (
        <button
          key={o.count}
          onClick={() => start(o.count)}
          className="btn-3d btn-3d-mint w-full text-sm"
        >
          {o.label}
        </button>
      ))}
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
        <span className="h-px flex-1 bg-[var(--gold)]/30" />
        Bimyah!+
        <span className="h-px flex-1 bg-[var(--gold)]/30" />
      </div>
      {plusOptions.map((o) =>
        isPlus ? (
          <button
            key={o.count}
            onClick={() => start(o.count)}
            className="btn-3d btn-3d-gold w-full text-sm"
          >
            {o.label}
          </button>
        ) : (
          <Link
            key={o.count}
            to="/plus"
            className="btn-3d btn-3d-dark w-full text-sm opacity-80"
          >
            🔒 {o.label}
          </Link>
        ),
      )}
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

/* ============================ Join flow ============================ */

function JoinPicker({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"room" | "reentry">("room");
  const [code, setCode] = useState("");
  const [reentry, setReentry] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startReentry() {
    if (code.length !== 4) return;
    setErr(null);
    setVerifying(true);
    try {
      // Verify the room exists by attempting to connect.
      const tempId = `verify_${Math.random().toString(36).slice(2, 8)}`;
      const session = await (await import("@/game/peer")).joinGame(code, tempId);
      const state = session.getState();
      session.destroy();
      if (!state) {
        setErr("Could not load room");
        setVerifying(false);
        return;
      }
      // Autofill reentry code if we have one stored for this room.
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
      // Take over that seat: reuse the seat's playerId as our meId.
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${code}`, seat.id);
      sessionStorage.setItem(`bimyah_name_${code}`, seat.name);
      saveIdentity(code, { meId: seat.id, name: seat.name, role: "joiner" });
      saveReentryCode(code, reentry);
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
          Enter Reentry Code
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

/* ============================ Host flow ============================ */

type HostStep = "mode" | "name" | "points" | "seats";

function HostFlow({
  hosting,
  error,
  onCancel,
  onStart,
}: {
  hosting: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (
    name: string,
    mode: GameMode,
    pointLimit: number | null,
    maxSeats: number,
  ) => void;
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
  const [pointLimit, setPointLimit] = useState<number | null>(null);
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ent = await getMyEntitlement();
        if (!cancelled) setIsPlus(!!ent?.is_plus);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          ctaLabel="Next"
          ctaClass="btn-3d-gold"
          busy={false}
          onSubmit={(n) => {
            setName(n);
            setStep(isTourney ? "points" : "seats");
          }}
          onCancel={onCancel}
        />
        {error && (
          <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
        )}
      </>
    );
  }
  if (step === "points") {
    return (
      <>
        <PointLimitStep
          initial=""
          ctaLabel="Next"
          ctaClass="btn-3d-gold"
          busy={false}
          onSubmit={(limit) => {
            setPointLimit(limit);
            setStep("seats");
          }}
          onCancel={onCancel}
        />
        {error && (
          <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
        )}
      </>
    );
  }
  // seats — host picks additional seats (2-7), total players = additional + 1
  return (
    <SeatsStep
      isPlus={isPlus}
      hosting={hosting}
      error={error}
      onCancel={onCancel}
      onStart={(additional) => onStart(name, mode, pointLimit, additional + 1)}
    />
  );
}

function SeatsStep({
  isPlus,
  hosting,
  error,
  onCancel,
  onStart,
}: {
  isPlus: boolean;
  hosting: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (additionalSeats: number) => void;
}) {
  const navigate = useNavigate();
  const [additional, setAdditional] = useState<number>(2);
  const isPlusTier = additional >= 4; // 4 additional = 5 players total
  const locked = isPlusTier && !isPlus;
  const totalPlayers = additional + 1;
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Opponent count
      </div>
      <Select
        value={String(additional)}
        onValueChange={(v) => setAdditional(parseInt(v, 10))}
      >
        <SelectTrigger className="h-12 w-full rounded-lg border border-[var(--gold)]/50 bg-black/40 text-center font-display text-base text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-[var(--gold)]/40 bg-[oklch(0.18_0.04_165)] text-white">
          {[2, 3, 4, 5, 6, 7].map((n) => {
            const plus = n >= 4;
            return (
              <SelectItem
                key={n}
                value={String(n)}
                className={
                  plus
                    ? "text-[var(--gold)] focus:bg-[var(--gold)]/10 focus:text-[var(--gold)]"
                    : "text-white focus:bg-white/10"
                }
              >
                <span className="flex items-center gap-2">
                  {n} opponents ({n + 1}P)
                  {plus && (
                    <span className="rounded bg-[var(--gold)]/20 px-1.5 py-0.5 font-display text-[9px] font-black uppercase tracking-widest text-[var(--gold)] ring-1 ring-[var(--gold)]/40">
                      B!+
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <div
        className={
          isPlusTier
            ? "text-center font-display text-[10px] uppercase tracking-widest text-[var(--gold)]"
            : "text-center text-[10px] uppercase tracking-widest text-white/50"
        }
      >
        {totalPlayers} players total
        {isPlusTier && (
          <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-[var(--gold)]/20 px-1.5 py-0.5 text-[9px] font-black text-[var(--gold)] ring-1 ring-[var(--gold)]/40">
            Bimyah!+
          </span>
        )}
      </div>
      {locked ? (
        <button
          onClick={() => void navigate({ to: "/plus" })}
          className="btn-3d btn-3d-dark w-full text-sm"
        >
          🔒 Unlock with Bimyah!+
        </button>
      ) : (
        <button
          onClick={() => onStart(additional)}
          disabled={hosting}
          className={`btn-3d ${isPlusTier ? "btn-3d-gold" : "btn-3d-mint"} w-full text-sm disabled:opacity-50`}
        >
          {hosting ? "Starting…" : "Create Lobby"}
        </button>
      )}
      {hosting && (
        <div className="text-center text-xs text-white/60">Starting…</div>
      )}
      {error && (
        <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
      )}
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}
