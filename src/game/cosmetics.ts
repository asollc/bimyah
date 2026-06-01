/**
 * Client-side helpers for reading the player's "active card slots" — the
 * 6 card backs the player has equipped on the Cards tab of their profile.
 * Slots are persisted in localStorage by `CardsTab` under the key
 * `bimyah:activeCardSlots:${userId}` as a length-6 array of card IDs.
 *
 * We resolve those IDs to public image URLs here so they can be sent over
 * the wire as part of the Player payload (`cardBackUrls`) and rendered by
 * the game table.
 */
import standardBimyahImg from "@/assets/card-standard-bimyah.jpeg";
import foundingCarderImg from "@/assets/card-founding-carder.jpeg";

export const ACTIVE_SLOT_COUNT = 6;

const BUILTIN_URL_BY_ID: Record<string, string> = {
  "standard-bimyah": standardBimyahImg,
  "founding-carder": foundingCarderImg,
};

function slotsKey(userId: string) {
  return `bimyah:activeCardSlots:${userId}`;
}

/**
 * Read the user's active card slot selections and resolve each to an image
 * URL (or `null` for empty slots / unknown ids). Returns a length-6 array.
 * Safe to call without a userId — returns all nulls in that case.
 */
export function getActiveCardSlotImages(
  userId: string | null | undefined,
  customCardBackUrl: string | null,
): (string | null)[] {
  const out: (string | null)[] = Array(ACTIVE_SLOT_COUNT).fill(null);
  if (!userId) return out;
  let ids: (string | null)[] = [];
  try {
    const raw = localStorage.getItem(slotsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed;
    }
  } catch {
    /* ignore */
  }
  for (let i = 0; i < ACTIVE_SLOT_COUNT; i++) {
    const id = ids[i];
    if (!id) continue;
    if (id === "custom-back") {
      out[i] = customCardBackUrl ?? null;
    } else {
      out[i] = BUILTIN_URL_BY_ID[id] ?? null;
    }
  }
  return out;
}
