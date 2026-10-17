import { isDiscordActivity } from "@/discord/detection";
import { APP_VERSION } from "@/version";

/**
 * Version display at the bottom right.
 * Discord: "disv: {hash}"
 * Regular site: "v{hash}"
 */
export function VersionDisplay() {
  const text = isDiscordActivity() ? `disv: ${APP_VERSION}` : `v${APP_VERSION}`;
  return (
    <div
      className="pointer-events-none fixed bottom-1 right-2 z-[100] select-none text-[10px] font-mono text-white/40"
      aria-hidden="true"
    >
      {text}
    </div>
  );
}
