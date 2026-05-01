/**
 * Keybinding system: defaults, types, normalization, persistence.
 *
 * Bindings map an action id -> normalized key string. We store them in
 * localStorage and (when signed in) mirror to the `user_keybinds` table.
 */

import { supabase } from "@/integrations/supabase/client";

export type ActionId =
  // Center cards (top row 1-4, bottom 5-8)
  | "center1" | "center2" | "center3" | "center4"
  | "center5" | "center6" | "center7" | "center8"
  // Alternate center top/bottom row
  | "centerAlt1" | "centerAlt2" | "centerAlt3" | "centerAlt4"
  | "centerAlt5" | "centerAlt6" | "centerAlt7" | "centerAlt8"
  // Piles (1-4)
  | "pile1" | "pile2" | "pile3" | "pile4"
  // Hand cards in opened pile (1-4 visible slots)
  | "hand1" | "hand2" | "hand3" | "hand4"
  // Actions
  | "set" | "sort" | "bimyah"
  // Sizing
  | "playerZoomIn" | "playerZoomOut"
  | "centerZoomIn" | "centerZoomOut";

export type Keybinds = Record<ActionId, string>;

/**
 * Defaults — pile keys and hand keys are SWAPPED relative to the previous
 * scheme: u/i/o/p now select piles, j/k/l/; select hand cards.
 * Sort defaults to Shift.
 */
export const DEFAULT_KEYBINDS: Keybinds = {
  center1: "1", center2: "2", center3: "3", center4: "4",
  center5: "5", center6: "6", center7: "7", center8: "8",
  centerAlt1: "q", centerAlt2: "w", centerAlt3: "e", centerAlt4: "r",
  centerAlt5: "a", centerAlt6: "s", centerAlt7: "d", centerAlt8: "f",
  pile1: "u", pile2: "i", pile3: "o", pile4: "p",
  hand1: "j", hand2: "k", hand3: "l", hand4: ";",
  set: " ",
  sort: "Shift",
  bimyah: "Enter",
  playerZoomIn: "ArrowUp",
  playerZoomOut: "ArrowDown",
  centerZoomIn: "ArrowRight",
  centerZoomOut: "ArrowLeft",
};

export const ACTION_GROUPS: { title: string; actions: { id: ActionId; label: string }[] }[] = [
  {
    title: "Center cards",
    actions: [
      { id: "center1", label: "Center top 1" },
      { id: "center2", label: "Center top 2" },
      { id: "center3", label: "Center top 3" },
      { id: "center4", label: "Center top 4" },
      { id: "center5", label: "Center bottom 1" },
      { id: "center6", label: "Center bottom 2" },
      { id: "center7", label: "Center bottom 3" },
      { id: "center8", label: "Center bottom 4" },
    ],
  },
  {
    title: "Center cards (alternate)",
    actions: [
      { id: "centerAlt1", label: "Alt center top 1" },
      { id: "centerAlt2", label: "Alt center top 2" },
      { id: "centerAlt3", label: "Alt center top 3" },
      { id: "centerAlt4", label: "Alt center top 4" },
      { id: "centerAlt5", label: "Alt center bottom 1" },
      { id: "centerAlt6", label: "Alt center bottom 2" },
      { id: "centerAlt7", label: "Alt center bottom 3" },
      { id: "centerAlt8", label: "Alt center bottom 4" },
    ],
  },
  {
    title: "Piles",
    actions: [
      { id: "pile1", label: "Open pile 1" },
      { id: "pile2", label: "Open pile 2" },
      { id: "pile3", label: "Open pile 3" },
      { id: "pile4", label: "Open pile 4" },
    ],
  },
  {
    title: "Hand cards (in opened pile)",
    actions: [
      { id: "hand1", label: "Hand card 1" },
      { id: "hand2", label: "Hand card 2" },
      { id: "hand3", label: "Hand card 3" },
      { id: "hand4", label: "Hand card 4" },
    ],
  },
  {
    title: "Actions",
    actions: [
      { id: "set", label: "SET" },
      { id: "sort", label: "SORT" },
      { id: "bimyah", label: "BIMYAH!" },
    ],
  },
  {
    title: "Sizing",
    actions: [
      { id: "playerZoomIn", label: "Grow your hand/piles" },
      { id: "playerZoomOut", label: "Shrink your hand/piles" },
      { id: "centerZoomIn", label: "Grow center table" },
      { id: "centerZoomOut", label: "Shrink center table" },
    ],
  },
];

const LS_KEY = "bimyah_keybinds_v1";

/** Normalize a KeyboardEvent into the canonical string we store. */
export function normalizeKey(e: KeyboardEvent): string {
  // Special keys: keep the raw .key (Enter, Shift, Tab, Escape, Backspace, Arrow keys, Space)
  const special = new Set([
    "Enter", "Shift", "Tab", "Escape", "Backspace",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    " ",
  ]);
  if (special.has(e.key)) return e.key;
  // Letters / digits / punctuation: lowercase form of e.key
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Display label for a stored key string. */
export function displayKey(k: string): string {
  if (k === " ") return "Space";
  if (k === ";") return ";";
  if (k.startsWith("Arrow")) return k.replace("Arrow", "") + " ↑↓←→".charAt(["Up","Down","Left","Right"].indexOf(k.slice(5)) + 1);
  if (k === "Enter" || k === "Shift" || k === "Tab" || k === "Escape" || k === "Backspace") return k;
  return k.length === 1 ? k.toUpperCase() : k;
}

export function loadLocal(): Keybinds {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_KEYBINDS };
    const parsed = JSON.parse(raw) as Partial<Keybinds>;
    return { ...DEFAULT_KEYBINDS, ...parsed };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveLocal(b: Keybinds): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(b));
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent("bimyah:keybinds-changed"));
  } catch { /* ignore */ }
}

export function resetLocal(): Keybinds {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("bimyah:keybinds-changed")); } catch { /* ignore */ }
  return { ...DEFAULT_KEYBINDS };
}

/** Fetch saved keybinds for the current user (or null). */
export async function loadCloud(userId: string): Promise<Keybinds | null> {
  try {
    const { data, error } = await supabase
      .from("user_keybinds")
      .select("bindings")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    if (!data?.bindings) return null;
    return { ...DEFAULT_KEYBINDS, ...(data.bindings as Partial<Keybinds>) };
  } catch {
    return null;
  }
}

export async function saveCloud(userId: string, b: Keybinds): Promise<void> {
  try {
    await supabase.from("user_keybinds").upsert({
      user_id: userId,
      bindings: b,
      updated_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
}

export async function clearCloud(userId: string): Promise<void> {
  try {
    await supabase.from("user_keybinds").delete().eq("user_id", userId);
  } catch { /* ignore */ }
}
