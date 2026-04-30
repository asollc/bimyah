import bplusIcon from "@/assets/bplus-icon.png";

type Props = {
  size?: number;
  className?: string;
  alt?: string;
};

/**
 * The official Bimyah!+ (B!+) badge icon. Use anywhere B!+ is mentioned.
 */
export function BplusIcon({ size = 20, className, alt = "Bimyah!+" }: Props) {
  return (
    <img
      src={bplusIcon}
      alt={alt}
      width={size}
      height={size}
      className={`inline-block select-none object-contain align-middle ${className ?? ""}`}
      draggable={false}
    />
  );
}

export default BplusIcon;
