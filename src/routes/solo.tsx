import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import { createInitialGame } from "@/game/engine";
import { getMyCosmetics } from "@/server/cosmetics.functions";
import { getActiveCardSlotImages } from "@/game/cosmetics";
import { useAuth } from "@/auth/AuthProvider";
import type { GameMode, GameState } from "@/game/types";

export const Route = createFileRoute("/solo")({
  head: () => ({
    meta: [
      { title: "Solo Game — Bimyah!" },
      { name: "description", content: "Play Bimyah! solo against bots. Practice the fast-paced card race anytime." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SoloGame,
});

type SoloSetup = {
  players: Array<{ id: string; name: string; isBot: boolean }>;
  mode: GameMode;
  pointLimit: number | null;
};

function SoloGame() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const [state, setLocalState] = useState<GameState | null>(null);

  useEffect(() => {
    if (!setup) {
      void navigate({ to: "/" });
      return;
    }
    let cancelled = false;
    void (async () => {
      let cosmetics: { avatarUrl: string | null; cardBackUrl: string | null } = {
        avatarUrl: null,
        cardBackUrl: null,
      };
      if (user) {
        try {
          cosmetics = await getMyCosmetics();
        } catch {
          /* ignore */
        }
      }
      const specs = setup.players.map((p) =>
        p.isBot ? p : { ...p, ...cosmetics },
      );
      const initial = createInitialGame("solo", specs, {
        mode: setup.mode,
        pointLimit: setup.pointLimit,
      });
      if (cancelled) return;
      setLocalState({
        ...initial,
        players: initial.players.map((p) => (p.isBot ? { ...p, ready: true } : p)),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [setup, user, navigate]);

  if (!state || !setup) return null;

  const setState = (mutator: (s: GameState) => GameState) => {
    setLocalState((prev) => (prev ? mutator(prev) : prev));
  };

  return <GameTable state={state} setState={setState} meId={setup.players[0].id} />;
}
