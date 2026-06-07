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
const CATEGORIES = ["cards", "victory", "titles", "backgrounds", "tabletops"] as const;

const upsertSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120).nullable().optional(),
  price: z.number().int().min(0).max(1_000_000).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  category: z.enum(CATEGORIES).nullable().optional(),
  hidden: z.boolean().optional(),
  image_url: z.string().url().max(500).nullable().optional(),
  is_custom: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
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

// ---------- Gift currency to a user ----------
const giftCurrencySchema = z.object({
  user_id: z.string().uuid(),
  currency: z.enum(CURRENCIES),
  amount: z.number().int().min(1).max(1_000_000),
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
