/**
 * Movable: generic drag-and-resize wrapper for any HUD element.
 *
 * - Drag with one pointer (mouse or touch). A small threshold prevents
 *   accidental drags from interfering with taps/clicks on inner buttons.
 * - Pinch with two touch pointers on the same element to resize.
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

export function useMovableLayouts(mode: string, scope: string | number) {
  // Key by mode + layout scope so each seat configuration (2..8) has its
  // own saved HUD layout. Matches the per-seat-count "SET" workflow on
  // the Map Game Screen. The scope can also be the dedicated "hostlobby"
  // profile used while the host is alone in a lobby (Ronya 2026-11-07).
  const key = `bimyah_movables_${mode}_${scope}`;
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
  defaultLayout,
  holdToDragMs,
}: {
  id: string;
  layouts: MovableLayoutMap;
  update: (id: string, patch: Partial<MovableLayout>) => void;
  lastMovedRef: LastMovedRef;
  children: React.ReactNode;
  className?: string;
  origin?: string;
  zIndex?: number;
  defaultLayout?: Partial<MovableLayout>;
  /**
   * When set, a drag only arms after the pointer is held in place for
   * this many ms. Plain taps and swipes that happen to start on the
   * element then never move it; only a deliberate press-and-hold followed
   * by a drag repositions it. Used for the How to Play button, whose tap
   * opens a dialog (Ronya 2026-11-01: the button kept ending up displaced
   * and cut off after the menu was opened and closed).
   */
  holdToDragMs?: number;
}) {
  const layout = layouts[id] ?? { ...DEFAULT_LAYOUT, ...(defaultLayout ?? {}) };
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    // Hold-to-drag pending press (see holdToDragMs): the pointer is down
    // but the drag has not armed yet.
    pendId?: number;
    pendStartX: number;
    pendStartY: number;
    pendX: number;
    pendY: number;
    pendTimer?: number;
  }>({
    startDx: 0,
    startDy: 0,
    startScale: 1,
    startDist: 0,
    dragging: false,
    pinching: false,
    pendStartX: 0,
    pendStartY: 0,
    pendX: 0,
    pendY: 0,
  });

  const resetGesture = useCallback(() => {
    const st = stateRef.current;
    if (st.pendTimer !== undefined) {
      window.clearTimeout(st.pendTimer);
      st.pendTimer = undefined;
    }
    st.pendId = undefined;
    st.a = undefined;
    st.b = undefined;
    st.origin = undefined;
    st.dragging = false;
    st.pinching = false;
  }, []);

  // Arm a drag/pinch gesture for a pointer that is already down. Shared by
  // the immediate pointerdown path and the hold-to-drag timer.
  const armGesture = useCallback(
    (pointerId: number, x: number, y: number) => {
      const st = stateRef.current;
      // Become the active gesture target — clear any other Movable that
      // still has a stale primary pointer registered.
      if (activeReset && activeReset !== resetGesture) {
        try { activeReset(); } catch { /* ignore */ }
      }
      activeReset = resetGesture;
      st.a = { id: pointerId, x, y };
      st.origin = { x, y };
      st.startDx = layoutRef.current.dx;
      st.startDy = layoutRef.current.dy;
      st.startScale = layoutRef.current.s;
      st.dragging = false;
      st.pinching = false;
      lastMovedRef.current = id;
    },
    [id, lastMovedRef, resetGesture],
  );

  // Window-level move/up handlers keep an active drag or pinch responsive
  // even after the user's finger moves outside the element.
  useEffect(() => {
    const onWinDown = (e: PointerEvent) => {
      const st = stateRef.current;
      // A second touch while a hold-to-drag press is pending cancels the
      // pending drag (it is a pinch/scroll gesture, not a reposition).
      if (st.pendId !== undefined && e.pointerId !== st.pendId) {
        resetGesture();
        return;
      }
      if (!st.a || st.b || st.pinching || e.pointerType !== "touch") return;
      if (e.pointerId === st.a.id) return;
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;

      st.b = { id: e.pointerId, x: e.clientX, y: e.clientY };
      const dx = st.b.x - st.a.x;
      const dy = st.b.y - st.a.y;
      st.startDist = Math.hypot(dx, dy) || 1;
      st.startScale = layoutRef.current.s;
      st.pinching = true;
      st.dragging = false;
      lastMovedRef.current = id;
      e.preventDefault();
    };

    const onWinMove = (e: PointerEvent) => {
      const st = stateRef.current;

      // Hold-to-drag pending press: track the pointer, and cancel the
      // pending drag if it strays too far (a swipe/scroll, not a hold).
      if (st.pendId !== undefined) {
        if (e.pointerId !== st.pendId) return;
        st.pendX = e.clientX;
        st.pendY = e.clientY;
        if (Math.hypot(e.clientX - st.pendStartX, e.clientY - st.pendStartY) > 10) {
          resetGesture();
        }
        return;
      }

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

    const onWinUp = (e: PointerEvent) => {
      const st = stateRef.current;
      const wasA = st.a?.id === e.pointerId;
      const wasB = st.b?.id === e.pointerId;
      const wasPend = st.pendId !== undefined && st.pendId === e.pointerId;
      if (!wasA && !wasB && !wasPend) return;
      const wasDragging = st.dragging;
      // Any tracked finger lifting ends the whole gesture. Keeping the
      // primary pointer alive after a pinch would leave a stale origin /
      // startDx, causing the next move to jump the element. Requiring a
      // fresh press also makes subsequent taps on other elements work.
      resetGesture();
      if (activeReset === resetGesture) activeReset = null;
      if (wasDragging) {
        // A real drag just ended. Swallow the click the browser is about
        // to synthesize so it cannot also activate the wrapped control
        // (e.g. open a dialog) on top of having moved it. Installed here,
        // on the native window handler, because the React pointerup on
        // the wrapper does not fire reliably on every touch device
        // (implicit pointer capture / event ordering), which let a drag
        // fall through into a click.
        const el = rootRef.current;
        if (el) {
          const swallow = (ev: Event) => {
            ev.stopPropagation();
            ev.preventDefault();
            el.removeEventListener("click", swallow, true);
          };
          el.addEventListener("click", swallow, true);
        }
      }
    };

    const onBlur = () => {
      resetGesture();
      if (activeReset === resetGesture) activeReset = null;
    };

    window.addEventListener("pointerdown", onWinDown, { passive: false });
    window.addEventListener("pointermove", onWinMove, { passive: false });
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onWinDown);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
      if (activeReset === resetGesture) activeReset = null;
    };
  }, [id, lastMovedRef, resetGesture, update]);

  const onPointerDown = (e: React.PointerEvent) => {
    const st = stateRef.current;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (st.a || st.pendId !== undefined) return;
    if (holdToDragMs && holdToDragMs > 0) {
      // Hold-to-drag: do not arm yet. A tap, or a swipe that starts on
      // this element, must never move it; the drag arms only after the
      // pointer has been held in place for holdToDragMs (see onWinMove
      // for the stray-distance cancel).
      const pointerId = e.pointerId;
      st.pendId = pointerId;
      st.pendStartX = e.clientX;
      st.pendStartY = e.clientY;
      st.pendX = e.clientX;
      st.pendY = e.clientY;
      st.pendTimer = window.setTimeout(() => {
        st.pendTimer = undefined;
        if (st.pendId !== pointerId) return;
        const x = st.pendX;
        const y = st.pendY;
        st.pendId = undefined;
        armGesture(pointerId, x, y);
      }, holdToDragMs);
      return;
    }
    armGesture(e.pointerId, e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = stateRef.current;
    const wasDragging = st.dragging;
    const wasA = st.a?.id === e.pointerId;
    const wasB = st.b?.id === e.pointerId;
    const wasPend = st.pendId !== undefined && st.pendId === e.pointerId;
    if (wasDragging && wasA) {
      // The drag ended on the element: swallow the synthesized click so
      // it cannot also activate the wrapped control. (The window-level
      // pointerup handler installs the same swallow for drags that end
      // off the element, or when this React handler does not fire.)
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        el.removeEventListener("click", swallow, true);
      };
      el.addEventListener("click", swallow, true);
    }
    // Defensive cleanup: ensure the gesture fully resets when the finger
    // lifts on this element. The window-level pointerup handler also does
    // this, but on some touch devices it does not fire reliably, leaving
    // st.a stale and blocking the next press via the guards above.
    if (wasA || wasB || wasPend) {
      resetGesture();
      if (activeReset === resetGesture) activeReset = null;
    }
  };

  return (
    <div
      ref={rootRef}
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
