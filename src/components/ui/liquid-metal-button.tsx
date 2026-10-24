import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { setupLiquidMetalButton } from "@/lib/liquid-metal-btn";

export interface LiquidMetalButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

function useMetalCanvas() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return setupLiquidMetalButton(canvas);
  }, []);
  return canvasRef;
}

function MetalInner({
  canvasRef,
  children,
}: {
  canvasRef: React.Ref<HTMLCanvasElement>;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="lm-css-ring" aria-hidden="true" />
      <canvas ref={canvasRef} className="lm-metal" aria-hidden="true" />
      <span className="lm-fill" aria-hidden="true" />
      <span className="lm-content">{children}</span>
    </>
  );
}

/**
 * The default Bimyah button: keeps the original btn-3d classes (fill colors,
 * typography, shadows) and adds the liquid metal rim.
 *
 * Structure:
 *   <button class="btn-3d btn-3d-gold lm-btn">
 *     <span class="lm-css-ring" />  (CSS conic fallback, always rendered)
 *     <canvas class="lm-metal" />   (WebGL liquid metal; covers fallback when live)
 *     <span class="lm-fill" />      (variant fill color, inset 3px to reveal the rim)
 *     <span class="lm-content" />   (children, laid out like the button's own flexbox)
 *
 * The original className is preserved untouched; .lm-btn CSS overrides only
 * the background (moved to .lm-fill) so every link, label and style stays intact.
 */
export function LiquidMetalButton({
  className,
  children,
  ...rest
}: LiquidMetalButtonProps) {
  const canvasRef = useMetalCanvas();

  return (
    <button {...rest} className={cn(className, "lm-btn")}>
      <MetalInner canvasRef={canvasRef}>{children}</MetalInner>
    </button>
  );
}

export interface LiquidMetalLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "className" | "children"> {
  className?: string;
  children: React.ReactNode;
}

/**
 * Link version of the liquid metal button. Keeps the original Link props
 * (to, aria-label, etc.) and className untouched.
 */
export function LiquidMetalLink({
  className,
  children,
  ...rest
}: LiquidMetalLinkProps) {
  const canvasRef = useMetalCanvas();

  return (
    <Link {...rest} className={cn(className, "lm-btn")}>
      <MetalInner canvasRef={canvasRef}>{children}</MetalInner>
    </Link>
  );
}
