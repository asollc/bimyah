import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = [
  "card_back",
  "title",
  "badge",
  "victory",
  "background",
  "tabletop",
  "table_art",
] as const;
export type DecorKind = (typeof KINDS)[number];

const equippedKindToColumn: Record<DecorKind, string> = {
  card_back: "card_back_id",
  title: "title_id",
  badge: "badge_id",
  victory: "victory_id",
  background: "background_id",
  tabletop: "tabletop_id",
  table_art: "table_art_id",
};

/** Inventory + currently equipped selections for the signed-in user. */
export const getMyDecor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: inv }, { data: eq }] = await Promise.all([
      supabase
        .from("user_inventory")
        .select("kind, item_id, acquired_at")
        .eq("user_id", userId),
      supabase
        .from("user_equipped")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    return {
      inventory: (inv ?? []) as Array<{ kind: DecorKind; item_id: string; acquired_at: string }>,
      equipped: (eq ?? null) as null | Record<string, string | null>,
    };
  });

const equipSchema = z.object({
  kind: z.enum(KINDS),
  itemId: z.string().nullable(),
});

/** Equip (or clear with null) the given decor kind for the signed-in user. */
export const setEquipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => equipSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const col = equippedKindToColumn[data.kind];
    const { error } = await supabase
      .from("user_equipped")
      .upsert(
        { user_id: userId, [col]: data.itemId } as Record<string, unknown>,
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const purchaseSchema = z.object({
  itemId: z.string(),
  itemName: z.string().min(1).max(200),
  currency: z.enum(["bimbucks", "bimbits"]),
  price: z.number().int().min(0).max(10_000_000),
  kind: z.enum(KINDS),
});

/** Atomically purchase a Bmart item: debit wallet, add to inventory, record ledger. */
export const purchaseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => purchaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("purchase_bmart_item", {
      _user_id: userId,
      _item_id: data.itemId,
      _item_name: data.itemName,
      _currency: data.currency,
      _price: data.price,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    void supabase; // silence unused
    return res as { bimbucks: number; bimbits: number };
  });

/** Recent purchase history for the signed-in user. */
export const getMyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("purchase_ledger")
      .select("id, item_id, item_name, currency, price, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { rows: data ?? [] };
  });
