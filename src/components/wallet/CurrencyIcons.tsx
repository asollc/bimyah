type Props = {
  size?: number;
  className?: string;
};

/** Bimbucks icon — uppercase "B" in player-green, matching the Bimyah! logo style. */
export function BimbucksIcon({ size = 18, className }: Props) {
  return (
    <span
      aria-label="Bimbucks"
      className={`inline-flex items-center justify-center font-display font-black leading-none text-[var(--player-green)] ${className ?? ""}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        textShadow: "0 1px 0 rgba(0,0,0,0.5)",
      }}
    >
      B
    </span>
  );
}

/** Bimbits icon — lowercase "b" in player-green, matching the Bimyah! logo style. */
export function BimbitsIcon({ size = 18, className }: Props) {
  return (
    <span
      aria-label="Bimbits"
      className={`inline-flex items-center justify-center font-display font-black leading-none text-[var(--player-green)] ${className ?? ""}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        textShadow: "0 1px 0 rgba(0,0,0,0.5)",
      }}
    >
      b
    </span>
  );
}
