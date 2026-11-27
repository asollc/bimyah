import type { PeerSession } from "./peer";

// Module-level registry so a session created on one route (e.g. host on `/`)
// can be picked up on another route (`/game/$gameId`) without prop drilling.
const sessions = new Map<string, PeerSession>();

export function registerSession(session: PeerSession): void {
  sessions.set(session.code, session);
}

export function getSession(code: string): PeerSession | undefined {
  return sessions.get(code);
}

export function dropSession(code: string): void {
  const s = sessions.get(code);
  if (s) {
    try {
      s.destroy();
    } catch {
      // ignore
    }
    sessions.delete(code);
  }
}
