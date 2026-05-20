/**
 * Movable: generic drag-and-resize wrapper for any HUD element.
 *
 * - Drag with one pointer (mouse or touch). A small threshold prevents
 *   accidental drags from interfering with taps/clicks on inner buttons.
 * - Pinch with two touch pointers to resize.
 * - Per-element offsets (dx, dy) and scale (s) are persisted to localStorage
 *   keyed by `${mode}_${seatCount}`, matching the existing player-hand zoom
 *   convention.
 * - The most recently interacted element is tracked via a ref so the
 *   keyboard up/down keys can resize it (see GameTable keybind handler).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type MovableLayout = { dx: number; dy: number; s: number };
export type MovableLayoutMap = Record<string, MovableLayout>;
export type LastMovedRef = { current: string | null };

const DEFAULT_LAYOUT: MovableLayout = { dx: 0, dy: 0, s: 1 };
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

  /** Bump the scale of the most-recently-touched element. Returns true on success. */
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

  const onPointerDown = (e: React.PointerEvent) => {
    const st = stateRef.current;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!st.a) {
      st.a = { id: e.pointerId, x: e.clientX, y: e.clientY };
      st.origin = { x: e.clientX, y: e.clientY };
      st.startDx = layout.dx;
      st.startDy = layout.dy;
      st.startScale = layout.s;
      st.dragging = false;
      st.pinching = false;
      // NOTE: do NOT setPointerCapture here. On desktop (mouse), capturing
      // on this wrapper reroutes the subsequent `click` event to the wrapper
      // instead of the inner button, so child <button onClick> never fires.
      // We defer capture until the drag threshold is actually exceeded
      // (see onPointerMove) or a second touch arrives (pinch).
    } else if (!st.b && e.pointerId !== st.a.id && e.pointerType === "touch") {
      st.b = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const dx = st.b.x - st.a.x;
      const dy = st.b.y - st.a.y;
      st.startDist = Math.hypot(dx, dy) || 1;
      st.startScale = layout.s;
      st.pinching = true;
      st.dragging = false;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = stateRef.current;
    if (!st.a) return;

    // Pinch path (two touch pointers).
    if (st.pinching && st.b) {
      if (st.a.id === e.pointerId) st.a = { id: st.a.id, x: e.clientX, y: e.clientY };
      else if (st.b.id === e.pointerId) st.b = { id: st.b.id, x: e.clientX, y: e.clientY };
      else return;
      const dx = st.b.x - st.a.x;
      const dy = st.b.y - st.a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const next = clampScale(st.startScale * (dist / st.startDist));
      e.preventDefault();
      update(id, { s: next });
      lastMovedRef.current = id;
      return;
    }

    // Drag path (single primary pointer).
    if (st.a.id !== e.pointerId) return;
    const orig = st.origin;
    if (!orig) return;
    const ddx = e.clientX - orig.x;
    const ddy = e.clientY - orig.y;
    if (!st.dragging) {
      if (Math.hypot(ddx, ddy) < DRAG_THRESHOLD_PX) return;
      st.dragging = true;
      // Now that we've actually started dragging, capture the pointer so
      // subsequent moves stay with this wrapper even if the cursor leaves it.
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    e.preventDefault();
    update(id, { dx: st.startDx + ddx, dy: st.startDy + ddy });
    lastMovedRef.current = id;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = stateRef.current;
    const wasDragging = st.dragging;
    if (st.a?.id === e.pointerId) {
      st.a = undefined;
      st.origin = undefined;
    }
    if (st.b?.id === e.pointerId) st.b = undefined;
    if (!st.a && !st.b) {
      st.dragging = false;
      st.pinching = false;
    }
    // If we dragged, swallow the click that's about to fire on a child button.
    if (wasDragging) {
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
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}
