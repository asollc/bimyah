import type { Card } from "@/game/types";
import { cn } from "@/lib/utils";

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
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width, height }}
      className={cn(
        "card-face no-select relative inline-flex flex-col justify-between p-1 transition-transform animate-pop-in",
        selected && "ring-2 ring-[var(--mint)] -translate-y-2 shadow-[var(--shadow-glow-mint)]",
        onClick && "active:scale-95",
        className,
      )}
      aria-label={`${card.rank}${card.suit}`}
    >
      <div
        className="flex items-start justify-start font-display font-bold leading-none"
        style={{ color: isRed ? "#dc2626" : "#0a0a0a", fontSize: width * 0.32 }}
      >
        <div className="flex flex-col items-center">
          <span>{card.rank}</span>
          <span style={{ fontSize: width * 0.28 }}>{card.suit}</span>
        </div>
      </div>
      <div
        className="self-center font-display font-black leading-none"
        style={{ color: isRed ? "#dc2626" : "#0a0a0a", fontSize: width * 0.55 }}
      >
        {card.suit}
      </div>
      <div
        className="flex items-end justify-end font-display font-bold leading-none rotate-180"
        style={{ color: isRed ? "#dc2626" : "#0a0a0a", fontSize: width * 0.32 }}
      >
        <div className="flex flex-col items-center">
          <span>{card.rank}</span>
          <span style={{ fontSize: width * 0.28 }}>{card.suit}</span>
        </div>
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
    <button
      type="button"
      onClick={onClick}
      style={{ width, height }}
      className={cn(
        "card-back no-select pile-stack relative inline-flex items-center justify-center transition-transform",
        onClick && "active:scale-95 hover:-translate-y-0.5",
        highlight && "ring-2 ring-[var(--mint)] shadow-[var(--shadow-glow-mint)]",
        className,
      )}
    >
      {/* mini pow */}
      <div className="pow-burst" style={{ width: width * 0.78, height: width * 0.78 }}>
        <span
          className="font-display font-black text-[oklch(0.18_0.04_165)]"
          style={{ fontSize: width * 0.18, lineHeight: 1 }}
        >
          BIMYAH!
        </span>
      </div>
      {count > 1 && (
        <span
          className="absolute -top-1 -right-1 rounded-full bg-[var(--gold)] px-1.5 text-[10px] font-bold text-[oklch(0.18_0.04_165)] shadow"
        >
          {count}
        </span>
      )}
    </button>
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
