// GET /api/discord/sku-catalog
// Public mapping of Bimyah purchase options to Discord Premium Apps SKU ids,
// so the Activity client knows which SKU to pass to startPurchase().
// SKU ids are public identifiers (not secrets). Configured via the same
// DISCORD_SKU_MAP env var as the entitlements endpoint:
//   { "<sku_id>": { "kind": "bplus", "plan": "lifetime" } }
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/discord/sku-catalog")({
  server: {
    handlers: {
      GET: async () => {
        let map: Record<string, { kind: string; plan?: string }> = {};
        try {
          map = JSON.parse(process.env.DISCORD_SKU_MAP ?? "{}");
        } catch {
          /* empty */
        }
        const plans: Record<string, string> = {};
        for (const [skuId, grant] of Object.entries(map)) {
          if (grant.kind === "bplus" && grant.plan) plans[grant.plan] = skuId;
        }
        return Response.json({ plans });
      },
    },
  },
});
