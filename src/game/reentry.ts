/**
 * Per-device storage for personal reentry codes.
 * Each player keeps their own 4-digit code per gameId so they can rejoin
 * the same seat after a disconnect / refresh / network change.
 */

function key(gameId: string) {
  return `bimyah_reentry_${gameId}`;
}

export function saveReentryCode(gameId: string, code: string): void {
  try {
    localStorage.setItem(key(gameId), code);
  } catch {
    // ignore
  }
}

export function loadReentryCode(gameId: string): string | null {
  try {
    return localStorage.getItem(key(gameId));
  } catch {
    return null;
  }
}

export function clearReentryCode(gameId: string): void {
  try {
    localStorage.removeItem(key(gameId));
  } catch {
    // ignore
  }
}
