import * as React from "react";
import { Link } from "@tanstack/react-router";

export interface LiquidMetalButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * Plain btn-3d button. This component used to wrap every button in the
 * liquid metal treatment (WebGL shader rim + CSS conic ring + fill span);
 * Ronya ordered the liquid metal removed from all Bimyah buttons on
 * 2026-11-03, so it now renders the button exactly as styled by its
 * btn-3d classes, with no metal layers. The export names are kept so the
 * ~24 call sites did not have to change; do not re-add the metal effect
 * here or anywhere else in Bimyah.
 */
export function LiquidMetalButton({
  className,
  children,
  ...rest
}: LiquidMetalButtonProps) {
  return (
    <button {...rest} className={className}>
      {children}
    </button>
  );
}

export interface LiquidMetalLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "className" | "children"> {
  className?: string;
  children: React.ReactNode;
}

/** Link version: same plain treatment as LiquidMetalButton. */
export function LiquidMetalLink({
  className,
  children,
  ...rest
}: LiquidMetalLinkProps) {
  return (
    <Link {...rest} className={className}>
      {children}
    </Link>
  );
}
