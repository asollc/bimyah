/**
 * Client-side helpers for reading the player's "active card slots" — the
 * 6 card backs the player has equipped on the Cards tab of their profile.
 * Slots are persisted in localStorage by `CardsTab` under the key
 * `bimyah:activeCardSlots:${userId}` as a length-6 array of card IDs.
 * A sibling key `bimyah:cardImagesById:${userId}` holds an id→image-url map
 * written by `CardsTab` so we can resolve custom / purchased card backs
 * (whose images do not live in this module).
 */
import standardBimyahImg from "@/assets/card-standard-bimyah.webp";
import foundingCarderImg from "@/assets/card-founding-carder.webp";

export const ACTIVE_SLOT_COUNT = 6;

const BUILTIN_URL_BY_ID: Record<string, string> = {
  "standard-bimyah": standardBimyahImg,
  "founding-carder": foundingCarderImg,
};

function slotsKey(userId: string) {
  return `bimyah:activeCardSlots:${userId}`;
}

function imagesKey(userId: string) {
  return `bimyah:cardImagesById:${userId}`;
}

function decorKey(userId: string) {
  return `bimyah:equippedDecorUrls:${userId}`;
}

/** Persist the id→image-url map used by `getActiveCardSlotImages`. */
export function persistCardImageMap(
  userId: string | null | undefined,
  map: Record<string, string>,
) {
  if (!userId) return;
  try {
    localStorage.setItem(imagesKey(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export type DecorKindKey =
  | "title"
  | "badge"
  | "badge2"
  | "emblem"
  | "emblem2"
  | "victory"
  | "background"
  | "tabletop"
  | "table_art";

export type EquippedDecorUrls = Partial<Record<DecorKindKey, string | null>>;


/** Cache the URL for each equipped decor kind so the game can resolve the
 *  active item locally even when the server lookup hasn't refreshed. */
export function persistEquippedDecorUrls(
  userId: string | null | undefined,
  urls: EquippedDecorUrls,
) {
  if (!userId) return;
  try {
    localStorage.setItem(decorKey(userId), JSON.stringify(urls));
  } catch {
    /* ignore */
  }
}

export function readEquippedDecorUrls(
  userId: string | null | undefined,
): EquippedDecorUrls {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(decorKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as EquippedDecorUrls;
  } catch {
    /* ignore */
  }
  return {};
}

/** Merge the locally-cached equipped decor URLs onto a server cosmetics
 *  payload. A non-null cached value wins so the active selection always
 *  renders, mirroring the active-card-back resolution flow. */
export function applyDecorOverrides<
  T extends {
    titleUrl: string | null;
    badgeUrl: string | null;
    badgeUrl2?: string | null;
    emblemUrl?: string | null;
    emblemUrl2?: string | null;
    victoryUrl: string | null;
    victoryEffectType?: string | null;
    backgroundUrl: string | null;
    tabletopUrl: string | null;
    tableArtUrl: string | null;
    specialBadgeUrl?: string | null;
  },
>(userId: string | null | undefined, cosmetics: T): T {
  const overrides = readEquippedDecorUrls(userId);
  return {
    ...cosmetics,
    titleUrl: overrides.title ?? cosmetics.titleUrl,
    badgeUrl: overrides.badge ?? cosmetics.badgeUrl,
    badgeUrl2: overrides.badge2 ?? cosmetics.badgeUrl2 ?? null,
    emblemUrl: overrides.emblem ?? cosmetics.emblemUrl ?? null,
    emblemUrl2: overrides.emblem2 ?? cosmetics.emblemUrl2 ?? null,
    victoryUrl: overrides.victory ?? cosmetics.victoryUrl,
    victoryEffectType: cosmetics.victoryEffectType ?? null,
    backgroundUrl: overrides.background ?? cosmetics.backgroundUrl,
    tabletopUrl: overrides.tabletop ?? cosmetics.tabletopUrl,
    tableArtUrl: overrides.table_art ?? cosmetics.tableArtUrl,
    specialBadgeUrl: cosmetics.specialBadgeUrl ?? null,
  };
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
  let imgMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(slotsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(imagesKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") imgMap = parsed;
    }
  } catch {
    /* ignore */
  }
  for (let i = 0; i < ACTIVE_SLOT_COUNT; i++) {
    const id = ids[i];
    if (!id) continue;
    if (id === "custom-back") {
      out[i] = customCardBackUrl ?? null;
    } else if (imgMap[id]) {
      out[i] = imgMap[id];
    } else if (BUILTIN_URL_BY_ID[id]) {
      out[i] = BUILTIN_URL_BY_ID[id];
    }
  }
  return out;
}
