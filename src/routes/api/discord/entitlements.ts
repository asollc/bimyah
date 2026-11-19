// POST /api/discord/entitlements
// Syncs a player's Discord Premium Apps entitlements into Bimyah's own
// subscriptions table, so B+ status works identically whether it was bought
// on the website (Stripe/PayPal) or inside the Discord Activity (Discord SKU).
// Discord policy requires paid features offered in the Activity to be
// purchasable through Discord's Premium Apps products, so in-Activity
// purchases use startPurchase() + this sync; the website checkout is untouched.
//
// SKU mapping is configured via the DISCORD_SKU_MAP env var (JSON):
//   { "<sku_id>": { "kind": "bplus", "plan": "lifetime" } }
// kind=bplus, plan=lifetime|monthly|annual. Consumable SKUs (bimbucks packs)
// can be added later as { "kind": "bimbucks", "amount": 1000 }.
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DISCORD_API = "https://discord.com/api/v10";

type SkuGrant =
  | { kind: "bplus"; plan: "lifetime" | "monthly" | "annual" }
  | { kind: "bimbucks"; amount: number };

function getSkuMap(): Record<string, SkuGrant> {
  try {
    const raw = process.env.DISCORD_SKU_MAP ?? "{}";
    return JSON.parse(raw) as Record<string, SkuGrant>;
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/api/discord/entitlements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const appId = process.env.DISCORD_CLIENT_ID;
        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!botToken || !appId || !supabaseUrl || !publishableKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 1. Authenticate the caller via their Supabase JWT.
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const supabase = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub as string | undefined;
        if (claimsErr || !userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

        // 2. Resolve the player's Discord id from the linked identity.
        const { data: authUser, error: userErr } =
          await supabaseAdmin.auth.admin.getUserById(userId);
        const discordId = (
          authUser?.user?.user_metadata as unknown as { discord_id?: string } | null
        )?.discord_id as string | undefined;
        if (userErr || !discordId) {
          return Response.json({ error: "Discord account not linked" }, { status: 400 });
        }

        // 3. Pull entitlements from Discord (server-side, bot token; the
        // client SDK event is only a trigger, never trusted on its own).
        type DiscordEntitlement = {
          id: string;
          sku_id: string;
          deleted?: boolean;
          ends_at?: string | null;
        };
        let entitlements: DiscordEntitlement[];
        try {
          const entRes = await fetch(
            `${DISCORD_API}/applications/${appId}/entitlements?user_id=${discordId}&limit=100`,
            { headers: { authorization: `Bot ${botToken}` } },
          );
          if (!entRes.ok) return Response.json({ error: "Discord lookup failed" }, { status: 502 });
          entitlements = (await entRes.json()) as DiscordEntitlement[];
        } catch {
          return Response.json({ error: "Discord lookup failed" }, { status: 502 });
        }

        const skuMap = getSkuMap();
        const granted: string[] = [];

        for (const ent of entitlements) {
          if (ent.deleted) continue;
          const grant = skuMap[String(ent.sku_id)];
          if (!grant) continue;

          if (grant.kind === "bplus") {
            // Skip if this plan is already active from any source.
            const { data: existing } = await supabaseAdmin
              .from("subscriptions")
              .select("id")
              .eq("user_id", userId)
              .eq("plan", grant.plan)
              .eq("status", "active")
              .limit(1);
            if (existing && existing.length > 0) continue;

            const { error: insErr } = await supabaseAdmin.from("subscriptions").insert({
              user_id: userId,
              plan: grant.plan,
              status: "active",
              source: "discord",
              current_period_end: ent.ends_at ?? null,
            });
            if (!insErr) granted.push(`bplus:${grant.plan}`);
          } else if (grant.kind === "bimbucks") {
            // NOTE: consumable SKUs (bimbucks packs) are a future launch. The
            // grant table + credit RPC land with that launch; until then the
            // entitlement is acknowledged here so nothing is silently dropped.
            granted.push(`bimbucks:${grant.amount}:pending-launch`);
          }
        }

        return Response.json({ granted });
      },
    },
  },
});
