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
  head: ({ params }) => {
    const title = "Live Bimyah! match in progress";
    const description = "An active Bimyah! multiplayer match — join with an invite link to play the fast no-turns card race together.";
    const url = `https://playbimyah.com/game/${params.gameId}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
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
        } else if (identity.role === "spectator") {
          s = await joinGame(gameId, identity.meId, { asSpectator: true });
          // Re-announce ourselves so the host re-adds us to the spectator list.
          s.sendIntent({
            kind: "addSpectator",
            spectator: { id: identity.meId, name: identity.name },
          });
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
    const existing = loadIdentity(gameId);
    const role: "host" | "joiner" | "spectator" = session.isHost
      ? "host"
      : existing?.role === "spectator" ||
          sessionStorage.getItem(`bimyah_spec_${gameId}`) === "1"
        ? "spectator"
        : "joiner";
    saveIdentity(gameId, { meId, name, role });
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

  // Determine if we're a spectator (never owned a seat in this room).
  const identity = loadIdentity(gameId);
  const isSpectator = identity?.role === "spectator";

  // ===== Detect host closing the room (End Match) =====
  // On the host, the broadcast carrying `roomClosed: true` is queued on each
  // WebRTC data channel synchronously; destroying the peer immediately would
  // drop those queued messages before they actually flush, leaving joiners
  // stuck in the game. Give the host a short delay (and a couple of
  // rebroadcasts for resilience) so the close reaches everyone, then tear
  // down and navigate. Joiners react immediately on receipt.
  //
  // The teardown sequence is guarded by a ref so that the rebroadcast's own
  // setState (which re-fires this effect) does NOT reset the teardown timer
  // and trap the host on the game screen forever.
  const teardownStartedRef = useRef(false);
  useEffect(() => {
    if (!session || !state) return;
    if (!state.roomClosed) return;
    if (teardownStartedRef.current) return;
    teardownStartedRef.current = true;

    const teardown = () => {
      clearGame(gameId);
      clearReentryCode(gameId);
      try { session.destroy(); } catch { /* ignore */ }
      void navigate({ to: "/" });
    };
    if (session.isHost) {
      const rebroadcast = setInterval(() => {
        try {
          session.setState((s) => ({ ...s, roomClosed: true }));
        } catch {
          /* ignore */
        }
      }, 250);
      setTimeout(() => {
        clearInterval(rebroadcast);
        teardown();
      }, 1500);
      return;
    }
    teardown();
  }, [session, state, gameId, navigate]);

  // ===== Detect being removed from the game =====
  useEffect(() => {
    if (!session || !state || !meId) return;
    if (session.isHost) return;
    if (isSpectator) return;
    if (state.players.some((p) => p.id === meId)) return;
    if (state.mode === "tournament") return;
    clearGame(gameId);
    clearReentryCode(gameId);
    session.destroy();
    void navigate({ to: "/join/$gameId", params: { gameId } });
  }, [session, state, meId, gameId, navigate, isSpectator]);

  // ===== Spectator leave: notify host on unmount =====
  useEffect(() => {
    if (!session || !isSpectator || !meId) return;
    return () => {
      try {
        session.sendIntent({ kind: "removeSpectator", spectatorId: meId });
      } catch {
        /* ignore */
      }
    };
  }, [session, isSpectator, meId]);

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
      spectator={isSpectator}
    />
  );
}
