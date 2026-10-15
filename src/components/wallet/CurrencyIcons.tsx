import bimbucksAsset from "@/assets/bimbucks-icon.png.asset.json";
import bimbitsAsset from "@/assets/bimbits-icon.png.asset.json";

type Props = {
  size?: number;
  className?: string;
};

/** Bimbucks icon — red & gold "B" coin emblem. */
export function BimbucksIcon({ size = 18, className }: Props) {
  // Source art is taller than wide (~0.55 aspect ratio).
  const width = Math.round(size * 0.62);
  return (
    <img
      src={bimbucksAsset.url}
      alt="Bimbucks"
      className={`inline-block object-contain ${className ?? ""}`}
      style={{ height: size, width, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
    />
  );
}

/** Bimbits icon — green & gold "b" coin emblem. */
export function BimbitsIcon({ size = 18, className }: Props) {
  const width = Math.round(size * 0.62);
  return (
    <img
      src={bimbitsAsset.url}
      alt="Bimbits"
      className={`inline-block object-contain ${className ?? ""}`}
      style={{ height: size, width, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
    />
  );
}
