import type { Card } from "@/game/types";
import { cn } from "@/lib/utils";
import cardBackImg from "@/assets/card-back.jpeg";

export function PlayingCard({
  card,
  width = 44,
  selected,
  onClick,
  className,
}: {
  card: Card;
  width?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const height = Math.round(width * 1.4);
  const color = isRed ? "#dc2626" : "#0a0a0a";
  const cornerSize = width * 0.26;
  const centerSize = width * 0.5;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width, height }}
      className={cn(
        "card-face no-select relative inline-flex transition-transform animate-pop-in",
        selected && "ring-2 ring-[var(--mint)] -translate-y-2 shadow-[var(--shadow-glow-mint)]",
        onClick && "active:scale-95",
        className,
      )}
      aria-label={`${card.rank}${card.suit}`}
    >
      {/* Top-left corner */}
      <div
        className="absolute font-display font-bold leading-none flex flex-col items-center"
        style={{ color, fontSize: cornerSize, top: width * 0.08, left: width * 0.08 }}
      >
        <span>{card.rank}</span>
        <span style={{ fontSize: cornerSize * 0.9, marginTop: width * 0.02 }}>{card.suit}</span>
      </div>
      {/* Center suit */}
      <div
        className="absolute inset-0 grid place-items-center font-display font-black leading-none"
        style={{ color, fontSize: centerSize }}
      >
        {card.suit}
      </div>
      {/* Bottom-right corner (rotated) */}
      <div
        className="absolute font-display font-bold leading-none flex flex-col items-center rotate-180"
        style={{ color, fontSize: cornerSize, bottom: width * 0.08, right: width * 0.08 }}
      >
        <span>{card.rank}</span>
        <span style={{ fontSize: cornerSize * 0.9, marginTop: width * 0.02 }}>{card.suit}</span>
      </div>
    </button>
  );
}

export function CardBack({
  width = 44,
  className,
  count = 1,
  onClick,
  highlight,
}: {
  width?: number;
  className?: string;
  count?: number;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const height = Math.round(width * 1.4);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        style={{ width, height }}
        className={cn(
          "card-back no-select pile-stack relative inline-flex items-center justify-center overflow-hidden transition-transform",
          onClick && "active:scale-95 hover:-translate-y-0.5",
          highlight &&
            "ring-4 ring-[var(--mint)] -translate-y-1 shadow-[0_0_24px_var(--mint),0_0_48px_var(--mint)]",
          className,
        )}
      >
        <img
          src={cardBackImg}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </button>
      {highlight && (
        <span
          className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--mint)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[oklch(0.18_0.04_165)] shadow animate-pulse-ring"
          style={{ color: "var(--mint)" }}
        >
          <span className="text-[oklch(0.18_0.04_165)]">OPEN</span>
        </span>
      )}
    </div>
  );
}

/** Empty face-down slot (e.g., for held center card) */
export function EmptySlot({
  width = 44,
  outlineColor,
  className,
}: {
  width?: number;
  outlineColor?: string;
  className?: string;
}) {
  const height = Math.round(width * 1.4);
  return (
    <div
      style={{
        width,
        height,
        borderColor: outlineColor ?? "rgba(255,255,255,0.18)",
        boxShadow: outlineColor ? `0 0 12px ${outlineColor}` : undefined,
        color: outlineColor,
      }}
      className={cn(
        "rounded-lg border-2 border-dashed bg-black/30",
        outlineColor && "animate-pulse-ring",
        className,
      )}
    />
  );
}

/** Locked 4-of-a-kind cascade displayed where the pile was */
export function CascadeSet({
  cards,
  width = 44,
}: {
  cards: Card[];
  width?: number;
}) {
  const height = Math.round(width * 1.4);
  return (
    <div
      className="relative"
      style={{ width, height: height + (cards.length - 1) * 14 }}
    >
      {cards.map((c, i) => (
        <div
          key={c.id}
          className="absolute left-0"
          style={{ top: i * 14, zIndex: i }}
        >
          <PlayingCard card={c} width={width} />
        </div>
      ))}
    </div>
  );
}
