const BIMBUCKS_ICON = "/bimbucks-icon-3d.png";
const BIMITS_ICON = "/bimbits-icon-3d.png";

type Props = {
  size?: number;
  className?: string;
};

/** Bimbucks icon - 3D money stack in Bimyah red with the white Bimbucks
 *  symbol (3dicons "Money", recolored; Ronya 2026-10-25). Landscape art,
 *  so width follows the height. */
export function BimbucksIcon({ size = 18, className }: Props) {
  return (
    <img
      src={BIMBUCKS_ICON}
      alt="Bimbucks"
      className={`inline-block object-contain ${className ?? ""}`}
      style={{ height: size, width: "auto", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
    />
  );
}

/** Bimbits icon - 3D coin in Bimyah red with the white Bimbits symbol
 *  (3dicons "Dollar", recolored; Ronya 2026-10-25). */
export function BimbitsIcon({ size = 18, className }: Props) {
  return (
    <img
      src={BIMITS_ICON}
      alt="Bimbits"
      className={`inline-block object-contain ${className ?? ""}`}
      style={{ height: size, width: size, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.45))" }}
    />
  );
}
