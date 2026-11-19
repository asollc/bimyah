import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Role check failed");
  if (!data) throw new Response("Forbidden", { status: 403 });
}

const CURRENCIES = ["bimbucks", "bimbits"] as const;
const CATEGORIES = ["cards", "victory", "titles", "backgrounds", "tabletops", "badges", "emblems"] as const;
const DECOR_KINDS = [
  "card_back",
  "title",
  "badge",
  "emblem",
  "victory",
  "background",
  "tabletop",
  "table_art",
] as const;

const upsertSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120).nullable().optional(),
  price: z.number().int().min(0).max(1_000_000).nullable().optional(),
  alt_price: z.number().int().min(0).max(1_000_000).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  category: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/).nullable().optional(),
  hidden: z.boolean().optional(),
  image_url: z.string().url().max(500).nullable().optional(),
  is_custom: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  effect_type: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/).nullable().optional(),
  kind: z.enum(DECOR_KINDS).nullable().optional(),
});

export const listBmartProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("bmart_products")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { rows: data ?? [] };
});

export const upsertBmartProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("bmart_products").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    // Saving a product resurrects it if it was purged before
    // (Ronya 2026-11-09: delete purges globally; re-adding undoes it).
    await supabaseAdmin.from("bmart_purged_items").delete().eq("id", data.id);
    return { ok: true };
  });

export const deleteBmartProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bmart_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Equip columns that can reference a product id (mirrors
 *  equippedKindToColumn in decor.functions.ts, plus the badge and
 *  sticker second slots). */
const EQUIP_COLUMNS = [
  "card_back_id",
  "title_id",
  "badge_id",
  "badge_id_2",
  "emblem_id",
  "emblem_id_2",
  "victory_id",
  "background_id",
  "tabletop_id",
  "table_art_id",
] as const;

/**
 * Purge a product from the game globally (Ronya 2026-11-09: admin
 * deletes must purge, not hide). Removes the product row, every
 * player's inventory copy, every equipped reference, and the item's
 * purchase-ledger rows, then tombstones the id so built-in products
 * (which live in code) stay gone from the shop and the bots until
 * the id is saved again in the admin. Players who had it equipped
 * fall back to the default for that slot. The stored image file is
 * left in place (other surfaces may still reference the URL).
 */
export const purgeBmartProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const id = data.id;

    const { data: eqRows, error: eqErr } = await supabaseAdmin
      .from("user_equipped")
      .select(`user_id, ${EQUIP_COLUMNS.join(", ")}`);
    if (eqErr) throw new Error(eqErr.message);
    for (const row of (eqRows ?? []) as unknown as Record<string, string | null>[]) {
      const patch: Record<string, string | null> = {};
      for (const col of EQUIP_COLUMNS) {
        if (row[col] === id) patch[col] = null;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
          .from("user_equipped")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(patch as any)
          .eq("user_id", row.user_id as string);
        if (error) throw new Error(error.message);
      }
    }

    const cleanups = [
      supabaseAdmin.from("user_inventory").delete().eq("item_id", id),
      supabaseAdmin.from("purchase_ledger").delete().eq("item_id", id),
      supabaseAdmin.from("bmart_products").delete().eq("id", id),
    ];
    for (const q of cleanups) {
      const { error } = await q;
      if (error) throw new Error(error.message);
    }

    const { error: tombErr } = await supabaseAdmin
      .from("bmart_purged_items")
      .upsert({ id, purged_by: context.userId }, { onConflict: "id" });
    if (tombErr) throw new Error(tombErr.message);
    return { ok: true };
  });

export const listPurgedBmartItems = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("bmart_purged_items")
    .select("id")
    .order("purged_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { ids: (data ?? []).map((r) => r.id as string) };
});

// ---------- Gift currency to a user ----------
const giftCurrencySchema = z.object({
  user_id: z.string().uuid(),
  currency: z.enum(CURRENCIES),
  amount: z.number().int().min(1).max(1_000_000),
  memo: z.string().trim().max(140).optional(),
});

export const giftUserCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => giftCurrencySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const fnName = data.currency === "bimbucks" ? "credit_bimbucks" : "credit_bimbits";
    const { error } = await supabaseAdmin.rpc(fnName, {
      _user_id: data.user_id,
      _amount: data.amount,
    });
    if (error) throw new Error(error.message);

    const memo = data.memo?.trim();
    const itemName = memo && memo.length > 0 ? `Admin gift: ${memo}` : "Admin gift";
    await supabaseAdmin.from("purchase_ledger").insert({
      user_id: data.user_id,
      item_id: "admin_gift",
      item_name: itemName,
      currency: data.currency,
      price: data.amount,
      kind: null,
    });
    return { ok: true };
  });

// ---------- Category images ----------
const categoryImageSchema = z.object({
  id: z.enum(CATEGORIES),
  image_url: z.string().url().max(500).nullable(),
});

export const listBmartCategoryImages = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("bmart_category_images")
    .select("id, image_url");
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as { id: string; image_url: string | null }[] };
});

export const upsertBmartCategoryImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => categoryImageSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("bmart_category_images")
      .upsert({ id: data.id, image_url: data.image_url, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Bmart text overrides ----------
const textUpsertSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/),
  value: z.string().min(0).max(500),
});

export const listBmartText = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("bmart_text")
    .select("key, value");
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as { key: string; value: string }[] };
});

export const upsertBmartText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => textUpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("bmart_text")
      .upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
