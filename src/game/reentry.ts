/**
 * Per-device storage for personal reentry codes.
 * Each player keeps their own 4-digit code per gameId so they can rejoin
 * the same seat after a disconnect / refresh / network change.
 */

function key(gameId: string) {
  return `bimyah_reentry_${gameId}`;
}

const LAST_ROOM_KEY = "bimyah_last_room";

export function saveLastRoom(gameId: string): void {
  try {
    localStorage.setItem(LAST_ROOM_KEY, gameId);
  } catch {
    // ignore
  }
}

export function loadLastRoom(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    // ignore
  }
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

/**
 * Seat claims (Ronya, 2026-10-27): when a player enters a lobby they are
 * assigned an invisible seat number. The device remembers which seat (and
 * player id) it holds in each room, so rejoining a started game is a
 * one-tap reclaim of exactly that seat, and only devices holding a seat
 * claim for the room can get back in as players.
 */
export type SeatClaim = { seat: number; playerId: string };

function seatKey(gameId: string) {
  return `bimyah_seat_${gameId}`;
}

export function saveSeatClaim(gameId: string, claim: SeatClaim): void {
  try {
    localStorage.setItem(seatKey(gameId), JSON.stringify(claim));
  } catch {
    // ignore
  }
}

export function loadSeatClaim(gameId: string): SeatClaim | null {
  try {
    const raw = localStorage.getItem(seatKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SeatClaim>;
    if (typeof parsed.seat !== "number" || typeof parsed.playerId !== "string") return null;
    return { seat: parsed.seat, playerId: parsed.playerId };
  } catch {
    return null;
  }
}

export function clearSeatClaim(gameId: string): void {
  try {
    localStorage.removeItem(seatKey(gameId));
  } catch {
    // ignore
  }
}
