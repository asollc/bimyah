import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import { createInitialGame } from "@/game/engine";
import type { GameMode, GameState } from "@/game/types";

export const Route = createFileRoute("/solo")({
  component: SoloGame,
});

type SoloSetup = {
  players: Array<{ id: string; name: string; isBot: boolean }>;
  mode: GameMode;
  pointLimit: number | null;
};

function SoloGame() {
  const navigate = useNavigate();
  const setup = useMemo<SoloSetup | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("bimyah_solo_setup");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // Backward compat: old format was just an array of players.
      if (Array.isArray(parsed)) {
        return { players: parsed, mode: "standard", pointLimit: null };
      }
      return parsed as SoloSetup;
    } catch {
      return null;
    }
  }, []);

  const [state, setLocalState] = useState<GameState | null>(() => {
    if (!setup) return null;
    const initial = createInitialGame(
      "solo",
      setup.players,
      { mode: setup.mode, pointLimit: setup.pointLimit },
    );
    return {
      ...initial,
      players: initial.players.map((p) => (p.isBot ? { ...p, ready: true } : p)),
    };
  });

  useEffect(() => {
    if (!setup) {
      void navigate({ to: "/" });
    }
  }, [setup, navigate]);

  if (!state) return null;

  const setState = (mutator: (s: GameState) => GameState) => {
    setLocalState((prev) => (prev ? mutator(prev) : prev));
  };

  return <GameTable state={state} setState={setState} meId={setup!.players[0].id} />;
}
