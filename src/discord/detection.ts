// Discord Activity detection + configuration helpers.
// An Activity is the same web app loaded inside the Discord client iframe.
// Discord appends frame_id + instance_id query params to the Activity URL,
// which is the reliable signal (window.top comparison is unreliable cross-origin).

export type DiscordFrameParams = {
  frameId: string;
  instanceId: string;
};

export function getDiscordFrameParams(): DiscordFrameParams | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const frameId = q.get("frame_id");
    const instanceId = q.get("instance_id");
    if (frameId && instanceId) return { frameId, instanceId };
    // Manual override: Activity URL mapping can include ?discord=1
    if (q.get("discord") === "1") return { frameId: "manual", instanceId: "manual" };
  } catch {
    /* ignore */
  }
  return null;
}

function isInDiscordIframe(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    // In an iframe (cross-origin access to window.top throws, which also means iframe)
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    if (!inIframe) return false;
    // Check referrer for discord.com
    const ref = document.referrer || "";
    if (ref.includes("discord.com")) return true;
    // Check ancestor origins (may throw cross-origin)
    try {
      const ancestors = (document as unknown as { ancestorOrigins?: DOMStringList }).ancestorOrigins;
      if (ancestors) {
        for (let i = 0; i < ancestors.length; i++) {
          if (ancestors[i]?.includes("discord.com")) return true;
        }
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isDiscordActivity(): boolean {
  // Primary: Discord appends frame_id + instance_id to the Activity URL
  if (getDiscordFrameParams() !== null) return true;
  // Fallback: running in a Discord iframe (mobile or URL override may skip params)
  return isInDiscordIframe();
}

// Public client id of the Bimyah Discord application. Safe to expose.
export function getDiscordClientId(): string | null {
  let id: unknown = null;
  try {
    id =
      (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_DISCORD_CLIENT_ID ??
      null;
  } catch {
    /* ignore */
  }
  if (!id && typeof process !== "undefined") {
    try {
      id = (process as unknown as { env?: Record<string, unknown> }).env?.DISCORD_CLIENT_ID ?? null;
    } catch {
      /* ignore */
    }
  }
  return typeof id === "string" && id.length > 5 ? id : null;
}
