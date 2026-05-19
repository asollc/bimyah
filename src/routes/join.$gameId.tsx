import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { joinGame, MAX_SPECTATORS } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { PLAYER_COLORS, generateReentryCode } from "@/game/engine";
import { saveReentryCode, loadReentryCode, saveLastRoom } from "@/game/reentry";
import { PowLogo, RotationIcon } from "@/components/game/Visuals";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { getMyCosmetics } from "@/server/cosmetics.functions";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/join/$gameId")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode === "spectate" ? "spectate" : "play") as "play" | "spectate",
  }),
  head: () => {
    const title = "Join a Bimyah! game";
    const description = "You've been invited to a Bimyah! game. Jump in — it's fast, free, and no turns!";
    const image = "https://qorqfqwjmkyosplldovh.supabase.co/storage/v1/object/public/public-assets/og-bimyah.jpg";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: JoinGame,
});

function deriveJoinName(
  profileName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromProfile = (profileName ?? "").trim();
  if (fromProfile) return fromProfile.slice(0, 14);
  const fromEmail = (email ?? "").split("@")[0]?.trim() ?? "";
  if (fromEmail) return fromEmail.slice(0, 14);
  try {
    const stored = localStorage.getItem("bimyah_last_name")?.trim();
    if (stored) return stored.slice(0, 14);
  } catch {
    /* ignore */
  }
  return "Player";
}

function JoinGame() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"play" | "spectate">("play");
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({
        to: "/auth",
        search: { redirect: `/join/${gameId}` } as never,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, gameId]);

  async function join() {
    if (startedRef.current) return;
    startedRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const playerName = deriveJoinName(profile?.display_name, user?.email);
      try {
        localStorage.setItem("bimyah_last_name", playerName);
      } catch {
        /* ignore */
      }

      if (mode === "spectate") {
        const specId = `s_${Math.random().toString(36).slice(2, 8)}`;
        const session = await joinGame(gameId, specId, { asSpectator: true });
        const state = session.getState();
        if (!state) {
          setErr("Could not load game");
          setBusy(false);
          session.destroy();
          startedRef.current = false;
          return;
        }
        const viewerCount = (state.spectators ?? []).length;
        if (viewerCount >= MAX_SPECTATORS) {
          setErr("This room already has the maximum number of viewers");
          setBusy(false);
          session.destroy();
          startedRef.current = false;
          return;
        }
        session.sendIntent({
          kind: "addSpectator",
          spectator: { id: specId, name: playerName },
        });
        registerSession(session);
        sessionStorage.setItem(`bimyah_me_${gameId}`, specId);
        sessionStorage.setItem(`bimyah_name_${gameId}`, playerName);
        sessionStorage.setItem(`bimyah_spec_${gameId}`, "1");
        saveIdentity(gameId, { meId: specId, name: playerName, role: "spectator" });
        saveLastRoom(gameId);
        void navigate({ to: "/game/$gameId", params: { gameId } });
        return;
      }

      const myId = `p_${Math.random().toString(36).slice(2, 8)}`;
      const session = await joinGame(gameId, myId);
      const state = session.getState();
      if (!state) {
        setErr("Could not load game");
        setBusy(false);
        session.destroy();
        startedRef.current = false;
        return;
      }

      // Reclaim existing seat if we already own one.
      const savedReentry = loadReentryCode(gameId);
      const existingSeat = savedReentry
        ? state.players.find((p) => p.reentryCode === savedReentry)
        : null;
      if (existingSeat) {
        registerSession(session);
        sessionStorage.setItem(`bimyah_me_${gameId}`, existingSeat.id);
        sessionStorage.setItem(`bimyah_name_${gameId}`, existingSeat.name);
        sessionStorage.removeItem(`bimyah_spec_${gameId}`);
        saveIdentity(gameId, {
          meId: existingSeat.id,
          name: existingSeat.name,
          role: "joiner",
        });
        saveReentryCode(gameId, savedReentry!);
        saveLastRoom(gameId);
        void navigate({ to: "/game/$gameId", params: { gameId } });
        return;
      }

      if (state.status !== "lobby") {
        setErr("Game already started — try Spectate instead");
        setBusy(false);
        session.destroy();
        startedRef.current = false;
        return;
      }
      const cap = state.maxSeats ?? 4;
      if (state.players.length >= cap) {
        setErr("Game is full — try Spectate instead");
        setBusy(false);
        session.destroy();
        startedRef.current = false;
        return;
      }
      const existingCodes = state.players
        .map((p) => p.reentryCode)
        .filter((c): c is string => !!c);
      const reentryCode = generateReentryCode(existingCodes);
      let cosmetics: { avatarUrl: string | null; cardBackUrl: string | null } = {
        avatarUrl: null,
        cardBackUrl: null,
      };
      try {
        cosmetics = await getMyCosmetics();
      } catch {
        /* ignore */
      }
      const newPlayer = {
        id: myId,
        name: playerName,
        color: PLAYER_COLORS[state.players.length],
        isBot: false,
        ready: false,
        avatarUrl: cosmetics.avatarUrl,
        cardBackUrl: cosmetics.cardBackUrl,
        reentryCode,
        piles: [],
        pileLocked: [],
        hand: [],
        openPileIndex: null,
      };
      session.sendIntent({ kind: "addPlayer", player: newPlayer });
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${gameId}`, myId);
      sessionStorage.setItem(`bimyah_name_${gameId}`, newPlayer.name);
      sessionStorage.removeItem(`bimyah_spec_${gameId}`);
      saveIdentity(gameId, { meId: myId, name: newPlayer.name, role: "joiner" });
      saveReentryCode(gameId, reentryCode);
      saveLastRoom(gameId);
      void navigate({ to: "/game/$gameId", params: { gameId } });
    } catch (e) {
      console.error(e);
      setErr("Could not connect. Check the code.");
      setBusy(false);
      startedRef.current = false;
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-between overflow-x-hidden px-4 py-3">
      <div className="flex w-full items-center justify-between">
        <RotationIcon />
        <HowToPlayButton />
      </div>

      {/* Play / Spectate radios under the logo */}
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <PowLogo size={220} />
        <div
          role="radiogroup"
          aria-label="Join mode"
          className="flex w-full items-stretch gap-2 rounded-xl border border-white/15 bg-black/30 p-1 backdrop-blur"
        >
          {(["play", "spectate"] as const).map((opt) => {
            const selected = mode === opt;
            return (
              <button
                key={opt}
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => setMode(opt)}
                className={
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-display text-xs uppercase tracking-widest transition " +
                  (selected
                    ? "bg-[var(--mint)] text-[oklch(0.18_0.04_165)] shadow"
                    : "text-white/70 hover:text-white")
                }
              >
                <span
                  className={
                    "grid h-3.5 w-3.5 place-items-center rounded-full border " +
                    (selected ? "border-[oklch(0.18_0.04_165)]" : "border-white/40")
                  }
                >
                  {selected && (
                    <span className="h-2 w-2 rounded-full bg-[oklch(0.18_0.04_165)]" />
                  )}
                </span>
                {opt === "play" ? "Play" : "Spectate"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
          Room <span className="text-[var(--mint)]">{gameId}</span>
        </div>
        {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
        <button
          onClick={join}
          disabled={busy || authLoading || !user}
          className="btn-3d btn-3d-mint w-full text-base disabled:opacity-50"
        >
          {busy
            ? "Connecting…"
            : mode === "play"
            ? "Join Game"
            : "Spectate Game"}
        </button>
        <p className="text-center text-[10px] leading-snug text-white/40">
          {mode === "play"
            ? "Take an open seat and play this match."
            : `Watch the room without taking a seat (up to ${MAX_SPECTATORS} viewers).`}
        </p>
      </div>
      <div />
    </div>
  );
}
