import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import { createInitialGame } from "@/game/engine";
import { getMyCosmetics } from "@/lib/rpc/cosmetics.functions";
import { getActiveCardSlotImages, applyDecorOverrides } from "@/game/cosmetics";
import { useAuth } from "@/auth/AuthProvider";
import type { GameMode, GameState } from "@/game/types";

export const Route = createFileRoute("/solo")({
  head: () => {
    const title = "Solo Game — Bimyah!";
    const description = "Practice Bimyah! against bots — the fast-paced, no-turns card race, anytime, offline-friendly.";
    const url = "https://playbimyah.com/solo";
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
      let cosmetics: Awaited<ReturnType<typeof getMyCosmetics>> = {
        avatarUrl: null,
        cardBackUrl: null,
        titleUrl: null,
        badgeUrl: null,
        badgeUrl2: null,
        emblemUrl: null,
        emblemUrl2: null,
        victoryUrl: null,
        victoryEffectType: null,
        backgroundUrl: null,
        tabletopUrl: null,
        tableArtUrl: null,
      };
      if (user) {
        try {
          cosmetics = await getMyCosmetics();
        } catch {
          /* ignore */
        }
      }
      cosmetics = applyDecorOverrides(user?.id ?? null, cosmetics);
      const cardBackUrls = getActiveCardSlotImages(user?.id ?? null, cosmetics.cardBackUrl);
      const specs = setup.players.map((p) =>
        p.isBot ? p : { ...p, ...cosmetics, cardBackUrls },
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
