/**
 * Movable: generic drag-and-resize wrapper for any HUD element.
 *
 * - Drag with one pointer (mouse or touch). A small threshold prevents
 *   accidental drags from interfering with taps/clicks on inner buttons.
 * - Pinch with two touch pointers to resize. Only the FIRST finger has to
 *   touch the element; the second finger can be placed anywhere on screen.
 *   This makes resizing small elements (where two fingers don't fit) possible.
 * - Per-element offsets (dx, dy) and scale (s) are persisted to localStorage
 *   keyed by `${mode}_${seatCount}`.
 * - The most recently interacted element is tracked via a ref so the
 *   keyboard up/down keys can resize it (see GameTable keybind handler).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type MovableLayout = { dx: number; dy: number; s: number };
export type MovableLayoutMap = Record<string, MovableLayout>;
export type LastMovedRef = { current: string | null };

const DEFAULT_LAYOUT: MovableLayout = { dx: 0, dy: 0, s: 1 };

// Module-level singleton so only ONE Movable can be the active gesture target
// at a time. Without this, touching two elements in succession would leave
// both with a primary pointer registered, and a third finger anywhere would
// trigger pinch-resize on both simultaneously.
let activeReset: (() => void) | null = null;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const DRAG_THRESHOLD_PX = 6;

function clampScale(s: number) {
  if (!Number.isFinite(s) || s <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export function useMovableLayouts(mode: string, seatCount: number) {
  const key = `bimyah_movables_${mode}_${seatCount}`;
  const [layouts, setLayouts] = useState<MovableLayoutMap>({});
  const lastMovedRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setLayouts(raw ? (JSON.parse(raw) as MovableLayoutMap) : {});
    } catch {
      setLayouts({});
    }
    lastMovedRef.current = null;
  }, [key]);

  const update = useCallback(
    (id: string, patch: Partial<MovableLayout>) => {
      setLayouts((cur) => {
        const prev = cur[id] ?? DEFAULT_LAYOUT;
        const merged: MovableLayout = {
          dx: patch.dx ?? prev.dx,
          dy: patch.dy ?? prev.dy,
          s: clampScale(patch.s ?? prev.s),
        };
        const next = { ...cur, [id]: merged };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });
    },
    [key],
  );

  const bumpLastMovedScale = useCallback(
    (delta: number): boolean => {
      const id = lastMovedRef.current;
      if (!id) return false;
      setLayouts((cur) => {
        const prev = cur[id] ?? DEFAULT_LAYOUT;
        const merged: MovableLayout = { ...prev, s: clampScale(prev.s + delta) };
        const next = { ...cur, [id]: merged };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      return true;
    },
    [key],
  );

  return { layouts, update, lastMovedRef, bumpLastMovedScale };
}

export function Movable({
  id,
  layouts,
  update,
  lastMovedRef,
  children,
  className,
  origin = "top left",
  zIndex,
}: {
  id: string;
  layouts: MovableLayoutMap;
  update: (id: string, patch: Partial<MovableLayout>) => void;
  lastMovedRef: LastMovedRef;
  children: React.ReactNode;
  className?: string;
  origin?: string;
  zIndex?: number;
}) {
  const layout = layouts[id] ?? DEFAULT_LAYOUT;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const stateRef = useRef<{
    a?: { id: number; x: number; y: number };
    b?: { id: number; x: number; y: number };
    origin?: { x: number; y: number };
    startDx: number;
    startDy: number;
    startScale: number;
    startDist: number;
    dragging: boolean;
    pinching: boolean;
  }>({
    startDx: 0,
    startDy: 0,
    startScale: 1,
    startDist: 0,
    dragging: false,
    pinching: false,
  });

  // Window-level handlers. These let us detect a second finger placed
  // anywhere on screen (not just on the element) so users can pinch-resize
  // small targets without their fingers colliding.
  useEffect(() => {
    const onWinDown = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st.a || st.b) return;
      if (e.pointerId === st.a.id) return;
      if (e.pointerType !== "touch") return;
      st.b = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const dx = st.b.x - st.a.x;
      const dy = st.b.y - st.a.y;
      st.startDist = Math.hypot(dx, dy) || 1;
      st.startScale = layoutRef.current.s;
      st.pinching = true;
      st.dragging = false;
    };

    const onWinMove = (e: PointerEvent) => {
      const st = stateRef.current;
      if (!st.a) return;

      if (st.pinching && st.b) {
        if (e.pointerId === st.a.id) {
          st.a = { id: st.a.id, x: e.clientX, y: e.clientY };
        } else if (e.pointerId === st.b.id) {
          st.b = { id: st.b.id, x: e.clientX, y: e.clientY };
        } else {
          return;
        }
        const dx = st.b.x - st.a.x;
        const dy = st.b.y - st.a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const next = clampScale(st.startScale * (dist / st.startDist));
        e.preventDefault();
        update(id, { s: next });
        lastMovedRef.current = id;
        return;
      }

      if (e.pointerId !== st.a.id) return;
      const orig = st.origin;
      if (!orig) return;
      const ddx = e.clientX - orig.x;
      const ddy = e.clientY - orig.y;
      if (!st.dragging) {
        if (Math.hypot(ddx, ddy) < DRAG_THRESHOLD_PX) return;
        st.dragging = true;
      }
      e.preventDefault();
      update(id, { dx: st.startDx + ddx, dy: st.startDy + ddy });
      lastMovedRef.current = id;
    };

    const reset = () => {
      const st = stateRef.current;
      st.a = undefined;
      st.b = undefined;
      st.origin = undefined;
      st.dragging = false;
      st.pinching = false;
    };

    const onWinUp = (e: PointerEvent) => {
      const st = stateRef.current;
      if (st.b?.id === e.pointerId) {
        st.b = undefined;
        st.pinching = false;
      }
      if (st.a?.id === e.pointerId) {
        reset();
        if (activeReset === reset) activeReset = null;
      }
    };

    window.addEventListener("pointerdown", onWinDown);
    window.addEventListener("pointermove", onWinMove, { passive: false });
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    return () => {
      window.removeEventListener("pointerdown", onWinDown);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      if (activeReset === reset) activeReset = null;
    };
  }, [id, update, lastMovedRef]);

  const onPointerDown = (e: React.PointerEvent) => {
    const st = stateRef.current;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!st.a) {
      // Become the active gesture target — clear any other Movable that
      // still has a stale primary pointer registered.
      if (activeReset && activeReset !== (stateRef.current as unknown as { _reset?: () => void })._reset) {
        try { activeReset(); } catch { /* ignore */ }
      }
      const reset = () => {
        st.a = undefined;
        st.b = undefined;
        st.origin = undefined;
        st.dragging = false;
        st.pinching = false;
      };
      (stateRef.current as unknown as { _reset?: () => void })._reset = reset;
      activeReset = reset;

      st.a = { id: e.pointerId, x: e.clientX, y: e.clientY };
      st.origin = { x: e.clientX, y: e.clientY };
      st.startDx = layout.dx;
      st.startDy = layout.dy;
      st.startScale = layout.s;
      st.dragging = false;
      st.pinching = false;
      lastMovedRef.current = id;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = stateRef.current;
    const wasDragging = st.dragging;
    if (wasDragging && st.a?.id === e.pointerId) {
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        el.removeEventListener("click", swallow, true);
      };
      el.addEventListener("click", swallow, true);
    }
  };

  return (
    <div
      className={className}
      style={{
        transform: `translate(${layout.dx}px, ${layout.dy}px) scale(${layout.s})`,
        transformOrigin: origin,
        touchAction: "none",
        zIndex,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}
