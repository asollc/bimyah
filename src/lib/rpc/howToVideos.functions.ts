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

export const listHowToVideos = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("how_to_videos")
    .select("id, title, description, youtube_url, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { rows: data ?? [] };
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  youtube_url: z.string().trim().url().max(500),
  sort_order: z.number().int().optional(),
});

export const adminCreateHowToVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("how_to_videos").insert({
      title: data.title,
      description: data.description?.trim() || null,
      youtube_url: data.youtube_url,
      sort_order: data.sort_order ?? 0,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateSchema = createSchema.extend({ id: z.string().uuid() });
export const adminUpdateHowToVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("how_to_videos")
      .update({
        title: data.title,
        description: data.description?.trim() || null,
        youtube_url: data.youtube_url,
        sort_order: data.sort_order ?? 0,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });
export const adminDeleteHowToVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("how_to_videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
