// Discord Activity provider: initializes the Embedded App SDK when the app
// is running inside Discord, authenticates the Discord user against our
// Supabase backend (linking them to their Bimyah player record), and exposes
// instance context + the participant roster for voice-channel rooms.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DiscordSDK, Events } from "@discord/embedded-app-sdk";
import { supabase } from "@/integrations/supabase/client";
import { getDiscordClientId, getDiscordFrameParams, isDiscordActivity } from "./detection";

export type DiscordAuthStatus =
  | "inactive" // not running inside Discord
  | "initializing"
  | "ready" // SDK ready, not yet authenticated with our backend
  | "authenticating"
  | "authenticated"
  | "error";

export type DiscordParticipant = {
  id: string;
  username: string;
};

export type Sku = {
  id: string;
  type: number;
  name: string;
  price: { amount: number; currency: string };
};

type DiscordContextValue = {
  active: boolean;
  status: DiscordAuthStatus;
  error: string | null;
  sdk: DiscordSDK | null;
  instanceId: string | null;
  channelId: string | null;
  guildId: string | null;
  participants: DiscordParticipant[];
  discordUserId: string | null;
  authenticate: () => Promise<void>;
  getSkus: () => Promise<Sku[]>;
  startPurchase: (skuId: string) => Promise<void>;
  syncEntitlements: () => Promise<void>;
};

const DiscordContext = createContext<DiscordContextValue | undefined>(undefined);

export function DiscordProvider({ children }: { children: ReactNode }) {
  const [active] = useState(() => isDiscordActivity());
  const [status, setStatus] = useState<DiscordAuthStatus>(() =>
    isDiscordActivity() ? "initializing" : "inactive",
  );
  const [error, setError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<DiscordSDK | null>(null);
  const [participants, setParticipants] = useState<DiscordParticipant[]>([]);
  const [discordUserId, setDiscordUserId] = useState<string | null>(null);
  const sdkRef = useRef<DiscordSDK | null>(null);
  const participantTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  type SdkParticipant = { id: string | number; username?: string | null };
  type SdkSku = {
    id: string | number;
    type: number;
    name: string;
    price?: { amount?: number | string; currency?: string } | null;
  };

  // Discord SDK auto-auth was removed (handshake unreliable across clients).
  // The Activity runs as the regular site in an iframe; users sign in
  // with email or play as guest. The provider stays for `active` detection.
  useEffect(() => {
    if (!active) return;
    // Skip SDK initialization entirely.
    setStatus("inactive");
    return;
  }, [active]);

  const syncEntitlements = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      await fetch("/api/discord/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
    } catch {
      /* best-effort; purchase modal already confirmed with the user */
    }
  }, []);

  const authenticate = useCallback(async () => {
    const instance = sdkRef.current;
    const clientId = getDiscordClientId();
    if (!instance || !clientId) throw new Error("Discord SDK not ready.");
    setStatus("authenticating");
    setError(null);
    try {
      // 1. Get an OAuth code from the Discord client.
      const { code } = await instance.commands.authorize({
        client_id: clientId,
        response_type: "code",
        scope: ["identify"],
      });
      // 2. Exchange it server-side for a Bimyah session (identity linking
      // happens on the backend; the client secret never leaves the server).
      const res = await fetch("/api/discord/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Discord sign-in failed.");
      // 3. Adopt the Supabase session so the entire app (RLS, profiles,
      // purchases, game state) works unchanged for Discord players.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) throw sessionError;
      setDiscordUserId(data.discord_user_id ?? null);
      setStatus("authenticated");
      // 4. Pick up any existing Discord entitlements (prior purchases).
      void syncEntitlements();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Discord sign-in failed.");
      throw e;
    }
  }, [syncEntitlements]);

  const getSkus = useCallback(async (): Promise<Sku[]> => {
    const instance = sdkRef.current;
    if (!instance) return [];
    const res = await instance.commands.getSkus();
    return ((res.skus ?? []) as SdkSku[]).map((s) => ({
      id: String(s.id),
      type: Number(s.type),
      name: String(s.name),
      price: { amount: Number(s.price?.amount ?? 0), currency: String(s.price?.currency ?? "USD") },
    }));
  }, []);

  const startPurchase = useCallback(
    async (skuId: string) => {
      const instance = sdkRef.current;
      if (!instance) throw new Error("Discord SDK not ready.");
      await instance.commands.startPurchase({ sku_id: skuId });
      // ENTITLEMENT_CREATE fires on success; sync as a fallback too.
      await syncEntitlements();
    },
    [syncEntitlements],
  );

  const frame = getDiscordFrameParams();
  const value = useMemo<DiscordContextValue>(
    () => ({
      active,
      status,
      error,
      sdk,
      instanceId: frame?.instanceId ?? sdk?.instanceId ?? null,
      channelId: sdk?.channelId ?? null,
      guildId: sdk?.guildId ?? null,
      participants,
      discordUserId,
      authenticate,
      getSkus,
      startPurchase,
      syncEntitlements,
    }),
    [
      active,
      status,
      error,
      sdk,
      participants,
      discordUserId,
      authenticate,
      getSkus,
      startPurchase,
      syncEntitlements,
      frame?.instanceId,
    ],
  );

  return <DiscordContext.Provider value={value}>{children}</DiscordContext.Provider>;
}

export function useDiscord() {
  const ctx = useContext(DiscordContext);
  if (!ctx) throw new Error("useDiscord must be used within DiscordProvider");
  return ctx;
}
