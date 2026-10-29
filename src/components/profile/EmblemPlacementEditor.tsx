import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlayingCard } from "@/components/game/Card";
import { PlayerSeat, getSeatPositions } from "@/components/game/GameTable";
import { getMyCosmetics } from "@/lib/rpc/cosmetics.functions";
import {
  applyDecorOverrides,
  getActiveCardSlotImages,
} from "@/game/cosmetics";
import type { Card, Player } from "@/game/types";

/**
 * Set Default Placement editor (Ronya 2026-10-25): place the two emblems
 * once; the result is saved as the DEFAULT emblem layout
 * (localStorage `bimyah_emblem_layout_default-<userId>-<slot>`) and the
 * game table falls back to it in any room with no per-table-size save.
 *
 * The scene is an EXACT replica of a real game room (Ronya 2026-10-25):
 * same full-screen geometry as GameTable (h-100dvh), the real PlayerSeat
 * component at the real SOUTH seat position, the player's real name plate
 * with title/badges/avatar, their real card backs, the straight in-game
 * hand row, the table art and center cards at game size, and the emblem
 * anchor at the same point the game uses (50% / 86%). Editor pixels are
 * game pixels, so a placement made here lands identically in a match.
 */

export type EmblemLayout = { dx: number; dy: number; s: number };

export function defaultEmblemKey(userId: string, slot: 1 | 2): string {
  return `bimyah_emblem_layout_default-${userId}-${slot}`;
}

const BASE = 56; // matches the in-game EmblemImg base size

function readDefault(userId: string, slot: 1 | 2): EmblemLayout {
  const fallback: EmblemLayout =
    slot === 1 ? { dx: -70, dy: 0, s: 1 } : { dx: 70, dy: 0, s: 1 };
  try {
    const raw = window.localStorage.getItem(defaultEmblemKey(userId, slot));
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const dx = Number(o.dx);
    const dy = Number(o.dy);
    const s = Number(o.s);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(s)) {
      return fallback;
    }
    return { dx, dy, s };
  } catch {
    return fallback;
  }
}

function EditorEmblem({
  url,
  slot,
  layout,
  selected,
  onSelect,
  onChange,
}: {
  url: string | null;
  slot: 1 | 2;
  layout: EmblemLayout;
  selected: boolean;
  onSelect: () => void;
  onChange: (l: EmblemLayout) => void;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startDx: number;
    startDy: number;
    startS: number;
    startDist: number;
    cx: number;
    cy: number;
  } | null>(null);

  const clamp = (l: EmblemLayout): EmblemLayout => ({
    dx: Math.max(-280, Math.min(280, l.dx)),
    dy: Math.max(-320, Math.min(220, l.dy)),
    s: Math.max(0.4, Math.min(3, l.s)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    onSelect();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = {
        startDx: layout.dx,
        startDy: layout.dy,
        startS: layout.s,
        startDist: 0,
        cx: e.clientX,
        cy: e.clientY,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        startDx: layout.dx,
        startDy: layout.dy,
        startS: layout.s,
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      onChange(
        clamp({
          dx: g.startDx + (e.clientX - g.cx),
          dy: g.startDy + (e.clientY - g.cy),
          s: g.startS,
        }),
      );
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      onChange(
        clamp({
          dx: g.startDx + (midX - g.cx),
          dy: g.startDy + (midY - g.cy),
          s: g.startDist > 0 ? g.startS * (dist / g.startDist) : g.startS,
        }),
      );
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    onSelect();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    onChange(clamp({ ...layout, s: layout.s * factor }));
  };

  const size = BASE * layout.s;
  return (
    <div
      className="absolute"
      style={{
        // The game's emblem anchor for the local seat: the seat base
        // position (SOUTH = 50% / 86% of the game area).
        left: "50%",
        top: "86%",
        width: 0,
        height: 0,
        zIndex: selected ? 1 : 0,
      }}
    >
      <div
        style={{ transform: `translate(${layout.dx}px, ${layout.dy}px)` }}
        className="absolute"
      >
        <div
          role="img"
          aria-label={`Emblem slot ${slot}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          className={`-translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full active:cursor-grabbing ${
            selected ? "ring-2 ring-[var(--mint)] ring-offset-2 ring-offset-transparent" : ""
          }`}
          style={{ width: size, height: size }}
          title="Drag to move · pinch or scroll to resize"
        >
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-full border-2 border-dashed border-white/50 bg-black/30 text-[9px] font-bold uppercase tracking-widest text-white/70">
              Slot {slot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Cosmetics = Awaited<ReturnType<typeof getMyCosmetics>>;

const C = (id: string, rank: string, suit: string): Card =>
  ({ id, rank, suit }) as Card;

const CENTER_TOP: Card[] = [
  C("c1", "K", "♠"),
  C("c2", "9", "♥"),
  C("c3", "4", "♦"),
  C("c4", "A", "♣"),
];
const CENTER_BOTTOM: Card[] = [
  C("c5", "7", "♠"),
  C("c6", "2", "♥"),
  C("c7", "J", "♦"),
  C("c8", "5", "♣"),
];
const FILLER: Card[] = [C("f1", "3", "♠"), C("f2", "6", "♥"), C("f3", "10", "♦"), C("f4", "Q", "♣")];
const LOCKED_SET: Card[] = [C("l1", "8", "♠"), C("l2", "8", "♥"), C("l3", "8", "♦"), C("l4", "8", "♣")];
const MOCK_HAND: Card[] = [C("h1", "A", "♠"), C("h2", "K", "♥"), C("h3", "Q", "♦"), C("h4", "J", "♣")];

export function EmblemPlacementEditor({
  userId,
  displayName,
  slot1Url,
  slot2Url,
  onClose,
}: {
  userId: string;
  displayName: string;
  slot1Url: string | null;
  slot2Url: string | null;
  onClose: () => void;
}) {
  const [l1, setL1] = useState<EmblemLayout>(() => readDefault(userId, 1));
  const [l2, setL2] = useState<EmblemLayout>(() => readDefault(userId, 2));
  const [selected, setSelected] = useState<1 | 2>(1);
  const selLayout = selected === 1 ? l1 : l2;
  const setSel = selected === 1 ? setL1 : setL2;

  // The same cosmetics pipeline game creation uses (map.tsx / solo.tsx),
  // so the replica seat carries the player's real avatar, title, badges,
  // and card backs.
  const [cosmetics, setCosmetics] = useState<Cosmetics | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await getMyCosmetics();
        if (!cancelled) setCosmetics(applyDecorOverrides(userId, raw));
      } catch {
        if (!cancelled) setCosmetics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const cardBackUrls = getActiveCardSlotImages(
    userId,
    cosmetics?.cardBackUrl ?? null,
  );

  const positions = getSeatPositions(8);
  const mockMe: Player = {
    id: "me-editor",
    name: (displayName || "You").slice(0, 14),
    color: "green",
    isBot: false,
    ready: false,
    avatarUrl: cosmetics?.avatarUrl ?? null,
    cardBackUrl: cosmetics?.cardBackUrl ?? null,
    cardBackUrls,
    titleUrl: cosmetics?.titleUrl ?? null,
    badgeUrl: cosmetics?.badgeUrl ?? null,
    badgeUrl2: cosmetics?.badgeUrl2 ?? null,
    piles: [[], FILLER, LOCKED_SET],
    pileLocked: [false, false, true],
    hand: MOCK_HAND,
    openPileIndex: 0,
  };
  const mockBot: Player = {
    id: "bot-editor",
    name: "Bot 1",
    color: "blue",
    isBot: true,
    ready: true,
    piles: [FILLER, FILLER, FILLER],
    pileLocked: [false, false, false],
    hand: [],
    openPileIndex: null,
  };

  const save = () => {
    try {
      window.localStorage.setItem(defaultEmblemKey(userId, 1), JSON.stringify(l1));
      window.localStorage.setItem(defaultEmblemKey(userId, 2), JSON.stringify(l2));
    } catch {
      /* ignore */
    }
    toast.success("Default emblem placement saved");
    onClose();
  };

  const bumpScale = (factor: number) => {
    setSel({
      ...selLayout,
      s: Math.max(0.4, Math.min(3, selLayout.s * factor)),
    });
  };

  const noop = () => {};

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden">
      {/* Game-room scene: identical geometry to GameTable's root. */}
      <div
        className="relative h-[100dvh] w-screen overflow-hidden"
        style={
          cosmetics?.backgroundUrl
            ? {
                backgroundColor: "#000",
                backgroundImage: `url(${cosmetics.backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : { background: "var(--gradient-bg)" }
        }
      >
        {/* The round table, exactly as in game (Ronya 2026-10-26): the
            logo/table art sits ON the table, center cards inside it. */}
        <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
          <div
            className={`${cosmetics?.tabletopUrl ? "" : "wood-table"} relative grid place-items-center rounded-full`}
            style={{
              width: "min(38vw, 32vh, 280px)",
              height: "min(38vw, 32vh, 280px)",
              ...(cosmetics?.tabletopUrl
                ? {
                    backgroundImage: `url(${cosmetics.tabletopUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
                  }
                : null),
            }}
          >
            {cosmetics?.tableArtUrl === "__none__" ? null : cosmetics?.tableArtUrl ? (
              <img
                src={cosmetics.tableArtUrl}
                alt=""
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
              />
            ) : (
              <img
                src="/bimyah-logo.webp"
                alt=""
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 object-contain"
              />
            )}
            {/* Center cards + BIMYAH, 8-player split layout, game sizes. */}
            <div className="relative flex flex-col items-center justify-center gap-1.5">
              <div className="flex items-center gap-1.5">
                {CENTER_TOP.map((c) => (
                  <PlayingCard key={c.id} card={c} width={31} />
                ))}
              </div>
              <button
                type="button"
                disabled
                className="btn-3d btn-3d-red px-3 py-1.5 text-[11px] opacity-90"
              >
                BIMYAH!
              </button>
              <div className="flex items-center gap-1.5">
                {CENTER_BOTTOM.map((c) => (
                  <PlayingCard key={c.id} card={c} width={31} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* The real seats: a bot north, and the player's own seat south
            rendered by the actual PlayerSeat component. */}
        <PlayerSeat
          player={mockBot}
          position={positions[1]}
          isMe={false}
          status="playing"
          inactivityDisabled
        />
        <PlayerSeat
          player={mockMe}
          position={positions[0]}
          isMe
          canControl
          status="playing"
          onPileTap={noop}
          onHandCardTap={noop}
          onSet={noop}
          onSort={noop}
          selectedHandCardId={null}
          sortEnabled={false}
          zoom={1}
          inactivityDisabled
        />

        {/* Emblems, anchored exactly where the game anchors them. */}
        <EditorEmblem
          url={slot1Url}
          slot={1}
          layout={l1}
          selected={selected === 1}
          onSelect={() => setSelected(1)}
          onChange={setL1}
        />
        <EditorEmblem
          url={slot2Url}
          slot={2}
          layout={l2}
          selected={selected === 2}
          onSelect={() => setSelected(2)}
          onChange={setL2}
        />
      </div>

      {/* Editor chrome: ALL controls live at the TOP (Ronya 2026-10-26)
          so nothing sits over the seat or the emblems at the bottom.
          The panel itself lets drags pass through; only the controls
          capture touches. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-8 pt-5">
        <div className="text-center font-display text-sm font-black uppercase tracking-widest text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
          Set Default Placement
        </div>
        <div className="pt-1 text-center text-[11px] uppercase tracking-widest text-white/70 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
          This is your real seat in a real room. Drag your emblems into place.
        </div>
        <div className="pointer-events-auto mx-auto flex w-fit items-center justify-center gap-3 pt-3 text-white">
          <span className="text-[10px] uppercase tracking-widest text-white/60">
            Slot {selected} size
          </span>
          <button
            type="button"
            onClick={() => bumpScale(0.9)}
            className="btn-3d btn-3d-dark grid h-9 w-9 place-items-center text-lg"
            aria-label="Shrink emblem"
          >
            −
          </button>
          <span className="min-w-12 text-center font-display text-sm tabular-nums">
            {Math.round(selLayout.s * 100)}%
          </span>
          <button
            type="button"
            onClick={() => bumpScale(1.1)}
            className="btn-3d btn-3d-dark grid h-9 w-9 place-items-center text-lg"
            aria-label="Grow emblem"
          >
            +
          </button>
        </div>
        <div className="pointer-events-auto mx-auto flex w-fit items-center justify-center gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-3d btn-3d-dark px-5 py-2.5 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-3d btn-3d-lime px-5 py-2.5 text-xs uppercase tracking-widest"
          >
            Set Default Placement
          </button>
        </div>
      </div>
    </div>
  );
}
