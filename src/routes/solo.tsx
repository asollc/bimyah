import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import { createInitialGame } from "@/game/engine";
import type { GameState } from "@/game/types";

export const Route = createFileRoute("/solo")({
  component: SoloGame,
});

function SoloGame() {
  const navigate = useNavigate();
  const setup = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("bimyah_solo_setup");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Array<{ id: string; name: string; isBot: boolean }>;
    } catch {
      return null;
    }
  }, []);

  const [state, setLocalState] = useState<GameState | null>(() =>
    setup ? createInitialGame("solo", setup) : null,
  );

  useEffect(() => {
    if (!setup) {
      void navigate({ to: "/" });
    }
  }, [setup, navigate]);

  if (!state) return null;

  const setState = (mutator: (s: GameState) => GameState) => {
    setLocalState((prev) => (prev ? mutator(prev) : prev));
  };

  return <GameTable state={state} setState={setState} meId={setup![0].id} />;
}
