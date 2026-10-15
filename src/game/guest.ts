// Guest identity helpers. A "guest" is anyone playing without a Supabase
// account. Their display name is stored locally and always prefixed with
// "_" so other players can recognize them as a guest.

export const GUEST_NAME_KEY = "bimyah_guest_name";
const LAST_NAME_KEY = "bimyah_last_name";

export function getGuestName(): string | null {
  try {
    const n = localStorage.getItem(GUEST_NAME_KEY)?.trim();
    return n && n.length > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Normalize and persist a guest display name. The leading "_" guest marker
 * is added if missing. Returns the final (prefixed) name.
 */
export function setGuestName(raw: string): string {
  // Strip any leading underscores the user may have typed so we don't
  // produce "__name" and so we have room for our own marker.
  const cleaned = raw.replace(/^_+/, "").trim().slice(0, 13);
  const safe = cleaned.length > 0 ? cleaned : "Guest";
  const prefixed = `_${safe}`;
  try {
    localStorage.setItem(GUEST_NAME_KEY, prefixed);
    localStorage.setItem(LAST_NAME_KEY, prefixed);
  } catch {
    /* ignore */
  }
  return prefixed;
}

export function clearGuestName(): void {
  try {
    localStorage.removeItem(GUEST_NAME_KEY);
  } catch {
    /* ignore */
  }
}
