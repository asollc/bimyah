import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { joinGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { PLAYER_COLORS, generateReentryCode } from "@/game/engine";
import { saveReentryCode, loadReentryCode, saveLastRoom } from "@/game/reentry";
import { PowLogo, RotationIcon } from "@/components/game/Visuals";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { getMyCosmetics } from "@/server/cosmetics.functions";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/join/$gameId")({
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
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({
        to: "/auth",
        search: { redirect: `/join/${gameId}` } as never,
      });
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, gameId]);

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      const playerName = deriveJoinName(profile?.display_name, user?.email);
      try {
        localStorage.setItem("bimyah_last_name", playerName);
      } catch {
        /* ignore */
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

      // If we already have a seat in this room (saved reentry code matches a
      // current player), take it over instead of creating a duplicate seat.
      // This works whether the match is in the lobby, mid-play, or finished —
      // the player is reclaiming a seat they already own.
      const savedReentry = loadReentryCode(gameId);
      const existingSeat = savedReentry
        ? state.players.find((p) => p.reentryCode === savedReentry)
        : null;
      if (existingSeat) {
        registerSession(session);
        sessionStorage.setItem(`bimyah_me_${gameId}`, existingSeat.id);
        sessionStorage.setItem(`bimyah_name_${gameId}`, existingSeat.name);
        saveIdentity(gameId, {
          meId: existingSeat.id,
          name: existingSeat.name,
          role: "joiner",
        });
        saveReentryCode(gameId, savedReentry);
        saveLastRoom(gameId);
        void navigate({ to: "/game/$gameId", params: { gameId } });
        return;
      }

      if (state.status !== "lobby") {
        setErr("Game already started");
        setBusy(false);
        session.destroy();
        return;
      }
      const cap = state.maxSeats ?? 4;
      if (state.players.length >= cap) {
        setErr("Game is full");
        setBusy(false);
        session.destroy();
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

  function retry() {
    if (busy) return;
    startedRef.current = false;
    void join();
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-between overflow-x-hidden px-4 py-3">
      <div className="flex w-full items-center justify-between">
        <RotationIcon />
        <HowToPlayButton />
      </div>
      <PowLogo size={270} />
      <div className="flex w-full max-w-xs flex-col gap-3">
        <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
          Joining game <span className="text-[var(--mint)]">{gameId}</span>
        </div>
        <div className="text-center font-display text-base text-white">
          {busy || authLoading ? "Connecting…" : err ? "Couldn't join" : "Connecting…"}
        </div>
        {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
        {err && (
          <button
            onClick={retry}
            className="btn-3d btn-3d-mint w-full text-base"
          >
            Try again
          </button>
        )}
      </div>
      <div />
    </div>
  );
}
