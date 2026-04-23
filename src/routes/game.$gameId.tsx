import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import type { GameState } from "@/game/types";
import { fetchOnlineGame, pushOnlineGame, subscribeOnlineGame } from "@/game/online";

export const Route = createFileRoute("/game/$gameId")({
  component: OnlineGame,
});

function OnlineGame() {
  const { gameId } = Route.useParams();
  const [state, setLocalState] = useState<GameState | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve me + initial fetch + subscription
  useEffect(() => {
    const me = sessionStorage.getItem(`bimyah_me_${gameId}`);
    if (!me) {
      window.location.href = `/join/${gameId}`;
      return;
    }
    setMeId(me);
    void fetchOnlineGame(gameId).then((s) => {
      if (s) {
        setLocalState(s);
        stateRef.current = s;
      }
    });
    const unsub = subscribeOnlineGame(gameId, (s) => {
      setLocalState(s);
      stateRef.current = s;
    });
    return () => unsub();
  }, [gameId]);

  const setState = useCallback(
    (mutator: (s: GameState) => GameState) => {
      setLocalState((prev) => {
        if (!prev) return prev;
        const next = mutator(prev);
        stateRef.current = next;
        // Debounced push (host pushes most updates; clients also push their own actions)
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => {
          if (stateRef.current) void pushOnlineGame(stateRef.current);
        }, 80);
        return next;
      });
    },
    [],
  );

  if (!state || !meId) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-white/60">Loading…</div>
    );
  }

  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/join/${gameId}` : undefined;

  return <GameTable state={state} setState={setState} meId={meId} inviteUrl={inviteUrl} />;
}
