import type { GameState } from "./types";

/**
 * localStorage-based persistence so a player can:
 *  - close and reopen the tab
 *  - background the app on mobile (and have iOS/Android kill the page)
 *  - lose network briefly
 * ...and still rejoin the same game with the same identity, restoring
 * the last-known authoritative state immediately while the WebRTC
 * connection re-establishes in the background.
 */

type StoredIdentity = {
  meId: string;
  name: string;
  role: "host" | "joiner" | "spectator";
  updatedAt: number;
};

function stateKey(gameId: string) {
  return `bimyah_state_${gameId}`;
}
function identityKey(gameId: string) {
  return `bimyah_identity_${gameId}`;
}

export function saveState(gameId: string, state: GameState): void {
  try {
    localStorage.setItem(stateKey(gameId), JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
}

export function loadState(gameId: string): GameState | null {
  try {
    const raw = localStorage.getItem(stateKey(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function saveIdentity(gameId: string, identity: Omit<StoredIdentity, "updatedAt">): void {
  try {
    const payload: StoredIdentity = { ...identity, updatedAt: Date.now() };
    localStorage.setItem(identityKey(gameId), JSON.stringify(payload));
    // Mirror to sessionStorage for any legacy reads.
    sessionStorage.setItem(`bimyah_me_${gameId}`, identity.meId);
    sessionStorage.setItem(`bimyah_name_${gameId}`, identity.name);
  } catch {
    // ignore
  }
}

export function loadIdentity(gameId: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(identityKey(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredIdentity;
  } catch {
    return null;
  }
}

export function clearGame(gameId: string): void {
  try {
    localStorage.removeItem(stateKey(gameId));
    localStorage.removeItem(identityKey(gameId));
    sessionStorage.removeItem(`bimyah_me_${gameId}`);
    sessionStorage.removeItem(`bimyah_name_${gameId}`);
  } catch {
    // ignore
  }
}
