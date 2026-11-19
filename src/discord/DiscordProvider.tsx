// Discord Activity provider (minimal).
// The Discord SDK was removed (handshake unreliable).
// The Activity runs as the regular site in an iframe.
// This provider only exposes whether we're in Discord.
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { isDiscordActivity, getDiscordFrameParams } from "./detection";

type DiscordContextValue = {
  active: boolean;
  status: "inactive" | "ready";
  error: string | null;
  sdk: null;
  instanceId: string | null;
  channelId: string | null;
  guildId: string | null;
  participants: Array<{ id: string; username: string }>;
  discordUserId: string | null;
  authenticate: () => Promise<void>;
};

const DiscordContext = createContext<DiscordContextValue>({
  active: false,
  status: "inactive",
  error: null,
  sdk: null,
  instanceId: null,
  channelId: null,
  guildId: null,
  participants: [],
  discordUserId: null,
  authenticate: async () => {},
});

export function DiscordProvider({ children }: { children: ReactNode }) {
  const value = useMemo<DiscordContextValue>(() => {
    const active = isDiscordActivity();
    const frame = getDiscordFrameParams();
    return {
      active,
      status: active ? "ready" : "inactive",
      error: null,
      sdk: null,
      instanceId: frame?.instanceId ?? null,
      channelId: null,
      guildId: null,
      participants: [],
      discordUserId: null,
      authenticate: async () => {},
    };
  }, []);

  return (
    <DiscordContext.Provider value={value}>{children}</DiscordContext.Provider>
  );
}

export function useDiscord() {
  return useContext(DiscordContext);
}
