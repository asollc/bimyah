import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import type { GameState } from "@/game/types";
import { getSession, registerSession } from "@/game/sessionStore";
import { joinGame, rehostGame, type PeerSession } from "@/game/peer";
import {
  clearGame,
  loadIdentity,
  loadState,
  saveIdentity,
  saveState,
} from "@/game/persistence";
import { clearReentryCode } from "@/game/reentry";

export const Route = createFileRoute("/game/$gameId")({
  head: () => ({
    meta: [
      { title: "Game in progress — Bimyah!" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnlineGame,
});

function OnlineGame() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const [state, setLocalState] = useState<GameState | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [session, setSession] = useState<PeerSession | null>(null);
  const restoringRef = useRef(false);

  // ===== Bootstrap session: use in-memory if present, else try to restore =====
  useEffect(() => {
    let cancelled = false;
    const live = getSession(gameId);
    const identity = loadIdentity(gameId);
    const cached = loadState(gameId);

    // Seed UI immediately with cached state (if any) so the player sees
    // something instantly while the connection re-establishes.
    if (cached) setLocalState(cached);
    if (identity) setMeId(identity.meId);

    if (live) {
      setSession(live);
      const unsub = live.subscribe((s) => {
        if (!cancelled) setLocalState(s);
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }

    // No live session in memory — likely the page was refreshed, the tab
    // was backgrounded and killed, or the user navigated back in. Try to
    // re-establish using the stored identity + cached state.
    if (!identity) {
      void navigate({ to: "/join/$gameId", params: { gameId } });
      return;
    }

    if (restoringRef.current) return;
    restoringRef.current = true;

    (async () => {
      try {
        let s: PeerSession;
        if (identity.role === "host") {
          if (!cached) {
            void navigate({ to: "/" });
            return;
          }
          s = await rehostGame(gameId, cached, identity.meId);
        } else {
          s = await joinGame(gameId, identity.meId);
        }
        if (cancelled) {
          s.destroy();
          return;
        }
        registerSession(s);
        setSession(s);
        s.subscribe((next) => {
          if (!cancelled) setLocalState(next);
        });
      } catch (err) {
        console.error("Reconnect failed:", err);
        if (!cancelled) {
          void navigate({ to: "/join/$gameId", params: { gameId } });
        }
      } finally {
        restoringRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, navigate]);

  // ===== Persist authoritative state on every update =====
  useEffect(() => {
    if (!state) return;
    saveState(gameId, state);
  }, [gameId, state]);

  // ===== Persist identity once we know it =====
  useEffect(() => {
    if (!session || !meId) return;
    const name =
      sessionStorage.getItem(`bimyah_name_${gameId}`) ?? "Player";
    saveIdentity(gameId, {
      meId,
      name,
      role: session.isHost ? "host" : "joiner",
    });
  }, [gameId, session, meId]);

  // ===== Visibility / online recovery =====
  useEffect(() => {
    if (!session) return;
    const tryRecover = () => {
      if (!session.isConnected()) {
        session.reconnect();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryRecover();
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", tryRecover);
    window.addEventListener("online", tryRecover);
    window.addEventListener("focus", tryRecover);
    // Periodic safety net while page is foregrounded.
    const t = setInterval(tryRecover, 4000);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", tryRecover);
      window.removeEventListener("online", tryRecover);
      window.removeEventListener("focus", tryRecover);
      clearInterval(t);
    };
  }, [session]);

  const setState = useCallback(
    (mutator: (s: GameState) => GameState) => {
      session?.setState(mutator);
    },
    [session],
  );

  if (!state || !meId || !session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-white/60">
        Connecting…
      </div>
    );
  }

  return (
    <GameTable
      state={state}
      setState={setState}
      sendIntent={session.sendIntent}
      isHost={session.isHost}
      meId={meId}
      inviteUrl={session.code}
    />
  );
}
