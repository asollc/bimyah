import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { GameTable } from "@/components/game/GameTable";
import { createInitialGame } from "@/game/engine";
import { getMyCosmetics } from "@/lib/rpc/cosmetics.functions";
import { getActiveCardSlotImages, applyDecorOverrides } from "@/game/cosmetics";
import { useAuth } from "@/auth/AuthProvider";
import type { GameState } from "@/game/types";
import { secureShortId } from "@/lib/secureId";

export const Route = createFileRoute("/map")({
  head: () => {
    const title = "Map Game Screen — Bimyah!";
    const description = "Arrange your Bimyah! HUD: drag, resize, and save default seat positions for every player count.";
    const url = "https://playbimyah.com/map";
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
  component: MapPage,
});

function MapPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [state, setLocalState] = useState<GameState | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let cosmetics: Awaited<ReturnType<typeof getMyCosmetics>> = {
        avatarUrl: null,
        cardBackUrl: null,
        titleUrl: null,
        badgeUrl: null,
        badgeUrl2: null,
        specialBadgeUrl: null,
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
      const myId = `me_${secureShortId(6)}`;
      const myName =
        profile?.display_name?.slice(0, 14) ?? user?.email?.split("@")[0]?.slice(0, 14) ?? "You";
      const specs = [
        { id: myId, name: myName, isBot: false, ...cosmetics, cardBackUrls },
        { id: `bot_${secureShortId(4)}`, name: "Bot 1", isBot: true },
      ];
      const initial = createInitialGame("map", specs, {
        mode: "standard",
        pointLimit: null,
        maxSeats: 8,
      });
      if (cancelled) return;
      setMeId(myId);
      setLocalState({
        ...initial,
        players: initial.players.map((p) => (p.isBot ? { ...p, ready: true } : p)),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  if (!state || !meId) {
    return (
      <div className="flex min-h-[calc(100dvh-50px)] items-center justify-center text-white/60">
        Loading map screen…
      </div>
    );
  }

  const setState = (mutator: (s: GameState) => GameState) => {
    setLocalState((prev) => (prev ? mutator(prev) : prev));
  };

  return (
    <div className="relative">
      <Link
        to="/profile"
        aria-label="Back to profile"
        className="absolute left-2 top-2 z-50 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur hover:text-white"
        onClick={(e) => {
          e.preventDefault();
          void navigate({ to: "/profile" });
        }}
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <GameTable state={state} setState={setState} meId={meId} mapMode inviteUrl="MAP" />
    </div>
  );
}
