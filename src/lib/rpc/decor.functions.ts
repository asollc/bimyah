import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = [
  "card_back",
  "title",
  "badge",
  "emblem",
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
  emblem: "emblem_id",
  victory: "victory_id",
  background: "background_id",
  tabletop: "tabletop_id",
  table_art: "table_art_id",
};

export type DecorInventoryItem = {
  kind: DecorKind;
  item_id: string;
  acquired_at: string;
  name: string | null;
  image_url: string | null;
};

/** Inventory + currently equipped selections for the signed-in user.
 *  Each inventory row is augmented with `name` and `image_url` looked up
 *  from `bmart_products` so the profile can show real previews. */
export const getMyDecor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: inv }, { data: eq }, { data: wallet }, { data: sub }] =
      await Promise.all([
        supabase
          .from("user_inventory")
          .select("kind, item_id, acquired_at")
          .eq("user_id", userId),
        supabase
          .from("user_equipped")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("wallets")
          .select("badge_slots_purchased, emblem_slots_purchased")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1),
      ]);
    const inventoryRows = (inv ?? []) as Array<{
      kind: DecorKind;
      item_id: string;
      acquired_at: string;
    }>;
    const ids = Array.from(new Set(inventoryRows.map((r) => r.item_id)));
    let productMap = new Map<string, { name: string | null; image_url: string | null }>();
    if (ids.length) {
      const { data: prods } = await supabase
        .from("bmart_products")
        .select("id, name, image_url")
        .in("id", ids);
      productMap = new Map(
        (prods ?? []).map((p) => [
          p.id as string,
          {
            name: (p.name as string | null) ?? null,
            image_url: (p.image_url as string | null) ?? null,
          },
        ]),
      );
    }
    const inventory: DecorInventoryItem[] = inventoryRows.map((r) => ({
      ...r,
      name: productMap.get(r.item_id)?.name ?? null,
      image_url: productMap.get(r.item_id)?.image_url ?? null,
    }));
    const isPlus = !!(sub && sub.length);
    const purchased = (wallet?.badge_slots_purchased as number | undefined) ?? 0;
    const badgeSlotCount = Math.min(2, 1 + purchased + (isPlus ? 1 : 0));
    const emblemPurchased =
      (wallet?.emblem_slots_purchased as number | undefined) ?? 0;
    const emblemSlotCount = Math.min(2, 1 + emblemPurchased + (isPlus ? 1 : 0));
    return {
      inventory,
      equipped: (eq ?? null) as null | Record<string, string | null>,
      badgeSlotCount,
      badgeSlotsPurchased: purchased,
      emblemSlotCount,
      emblemSlotsPurchased: emblemPurchased,
      isPlus,
    };
  });


const equipSchema = z.object({
  kind: z.enum(KINDS),
  itemId: z.string().nullable(),
  /** For badges/emblems, slot 2 writes to `<kind>_id_2`. */
  slot: z.union([z.literal(1), z.literal(2)]).optional(),
});

/** Equip (or clear with null) the given decor kind for the signed-in user.
 *  For badges and emblems, an optional slot (1|2) targets the primary or secondary column. */
export const setEquipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => equipSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let col = equippedKindToColumn[data.kind];
    if (data.slot === 2 && (data.kind === "badge" || data.kind === "emblem")) {
      col = `${data.kind}_id_2`;
    }
    const payload: Record<string, string | null> = { user_id: userId };
    payload[col] = data.itemId;
    const { error } = await supabase
      .from("user_equipped")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Spend 150 Bimbucks to unlock the second badge slot. Returns updated wallet. */
export const purchaseBadgeSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("purchase_badge_slot", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as { bimbucks: number; badge_slots_purchased: number };
  });

/** Spend 150 Bimbucks to unlock the second emblem slot. Returns updated wallet. */
export const purchaseEmblemSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("purchase_emblem_slot", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as { bimbucks: number; emblem_slots_purchased: number };
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

    // Enforce Bimyah!+ gating: if the product belongs to a custom category
    // marked requires_plus, the buyer must have an active subscription.
    const { data: prod } = await supabaseAdmin
      .from("bmart_products")
      .select("category")
      .eq("id", data.itemId)
      .maybeSingle();
    const category = prod?.category as string | null | undefined;
    if (category) {
      const { data: cat } = await supabaseAdmin
        .from("bmart_custom_categories")
        .select("requires_plus")
        .eq("id", category)
        .maybeSingle();
      if (cat?.requires_plus) {
        const { data: subs } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1);
        if (!subs || subs.length === 0) {
          throw new Error("Bimyah!+ membership is required to purchase items in this category.");
        }
      }
    }

    const { data: res, error } = await supabaseAdmin.rpc("purchase_bmart_item", {
      _user_id: userId,
      _item_id: data.itemId,
      _item_name: data.itemName,
      _currency: data.currency,
      _price: data.price,
      _kind: data.kind,
    });
    if (error) throw new Error(error.message);
    void supabase;
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

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Role check failed");
  if (!data) throw new Response("Forbidden", { status: 403 });
}

const adminTestUploadSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().min(1).max(120),
  image_url: z.string().url().max(500),
});

/** Admin-only: register a test decor item (creates a hidden bmart_products
 *  row + adds it to the admin's own inventory so it appears under the matching
 *  category in the profile Decor tab). */
export const adminCreateTestDecor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adminTestUploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = `test_${data.kind}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const categoryByKind: Partial<Record<DecorKind, string>> = {
      card_back: "cards",
      title: "titles",
      victory: "victory",
      background: "backgrounds",
      tabletop: "tabletops",
      emblem: "emblems",
    };
    const { error: prodErr } = await supabaseAdmin.from("bmart_products").insert({
      id,
      name: data.name,
      price: 0,
      currency: "bimbucks",
      category: categoryByKind[data.kind] ?? null,
      hidden: true,
      image_url: data.image_url,
      is_custom: true,
      kind: data.kind,
    });
    if (prodErr) throw new Error(prodErr.message);
    const { error: invErr } = await supabaseAdmin.from("user_inventory").insert({
      user_id: context.userId,
      kind: data.kind,
      item_id: id,
      source: "admin_test",
    });
    if (invErr) throw new Error(invErr.message);
    return { id, name: data.name, image_url: data.image_url };
  });

const deleteInventorySchema = z.object({
  kind: z.enum(KINDS),
  itemId: z.string().min(1).max(200),
});

/** Delete an item from the signed-in user's inventory plus any matching
 *  purchase-ledger entries. If the item is currently equipped, unequip it so
 *  the default takes over. Admin test items (id starts with `test_`) also
 *  remove the underlying bmart_products row when no longer owned. */
export const deleteMyInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteInventorySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const col = equippedKindToColumn[data.kind];

    const { data: eq } = await supabaseAdmin
      .from("user_equipped")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const eqRow = (eq ?? {}) as Record<string, string | null>;
    // Badges have a second slot — clear whichever slot held the deleted item.
    const colsToCheck =
      data.kind === "badge" ? [col, "badge_id_2"] : [col];
    const activeCols = colsToCheck.filter((c) => eqRow[c] === data.itemId);
    const wasActive = activeCols.length > 0;
    if (wasActive) {
      const patch: Record<string, string | null> = { user_id: userId };
      for (const c of activeCols) patch[c] = null;
      await supabaseAdmin
        .from("user_equipped")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(patch as any, { onConflict: "user_id" });
    }


    await supabaseAdmin
      .from("user_inventory")
      .delete()
      .eq("user_id", userId)
      .eq("kind", data.kind)
      .eq("item_id", data.itemId);
    await supabaseAdmin
      .from("purchase_ledger")
      .delete()
      .eq("user_id", userId)
      .eq("item_id", data.itemId);

    if (data.itemId.startsWith("test_")) {
      const { data: stillOwned } = await supabaseAdmin
        .from("user_inventory")
        .select("id")
        .eq("item_id", data.itemId)
        .limit(1);
      if (!stillOwned || stillOwned.length === 0) {
        await supabaseAdmin.from("bmart_products").delete().eq("id", data.itemId);
      }
    }

    return { ok: true, wasActive };
  });
