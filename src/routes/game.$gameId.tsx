import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import type { GameState } from "@/game/types";
import { getSession } from "@/game/sessionStore";
import type { PeerSession } from "@/game/peer";

export const Route = createFileRoute("/game/$gameId")({
  component: OnlineGame,
});

function OnlineGame() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const [state, setLocalState] = useState<GameState | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [session, setSession] = useState<PeerSession | null>(null);

  useEffect(() => {
    const me = sessionStorage.getItem(`bimyah_me_${gameId}`);
    const sess = getSession(gameId);
    if (!me || !sess) {
      // No live session in memory (e.g. page refresh). Send to join screen.
      void navigate({ to: "/join/$gameId", params: { gameId } });
      return;
    }
    setMeId(me);
    setSession(sess);
    const unsub = sess.subscribe((s) => setLocalState(s));
    return () => unsub();
  }, [gameId, navigate]);

  const setState = useCallback(
    (mutator: (s: GameState) => GameState) => {
      session?.setState(mutator);
    },
    [session],
  );

  if (!state || !meId || !session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-white/60">Connecting…</div>
    );
  }

  return (
    <GameTable
      state={state}
      setState={setState}
      meId={meId}
      inviteUrl={session.code}
    />
  );
}
