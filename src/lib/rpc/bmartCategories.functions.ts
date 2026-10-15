import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const listBmartCustomCategories = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("bmart_custom_categories")
    .select("id, name, tag, image_url, sort_order, hidden, requires_plus")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { rows: data ?? [] };
});

const upsertSchema = z.object({
  id: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, _ or -"),
  name: z.string().trim().min(1).max(60),
  tag: z.string().trim().max(120).optional().nullable(),
  image_url: z.string().url().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  hidden: z.boolean().optional(),
  requires_plus: z.boolean().optional(),
});

export const upsertBmartCustomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bmart_custom_categories").upsert(
      {
        id: data.id,
        name: data.name,
        tag: data.tag ?? "",
        image_url: data.image_url ?? null,
        sort_order: data.sort_order ?? 0,
        hidden: data.hidden ?? false,
        requires_plus: data.requires_plus ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteBmartCustomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bmart_custom_categories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
