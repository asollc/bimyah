import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

// ---------- User-facing ----------
export const listMyBulletins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const [bulletinsRes, readsRes, hidesRes] = await Promise.all([
      supabaseAdmin
        .from("bulletins")
        .select("id, title, content_html, media_url, created_at, author_id")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("bulletin_reads").select("bulletin_id").eq("user_id", userId),
      supabaseAdmin.from("bulletin_hides").select("bulletin_id").eq("user_id", userId),
    ]);
    const reads = new Set((readsRes.data ?? []).map((r) => r.bulletin_id));
    const hides = new Set((hidesRes.data ?? []).map((r) => r.bulletin_id));
    const rows = (bulletinsRes.data ?? [])
      .filter((b) => !hides.has(b.id))
      .map((b) => ({ ...b, read: reads.has(b.id) }));
    return { rows, unread: rows.filter((r) => !r.read).length };
  });

const idSchema = z.object({ id: z.string().uuid() });

export const markBulletinRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    await supabaseAdmin
      .from("bulletin_reads")
      .upsert({ user_id: context.userId, bulletin_id: data.id }, { onConflict: "user_id,bulletin_id" });
    return { ok: true };
  });

export const markAllBulletinsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: bulletins } = await supabaseAdmin.from("bulletins").select("id");
    if (!bulletins?.length) return { ok: true };
    await supabaseAdmin
      .from("bulletin_reads")
      .upsert(
        bulletins.map((b) => ({ user_id: context.userId, bulletin_id: b.id })),
        { onConflict: "user_id,bulletin_id" },
      );
    return { ok: true };
  });

export const hideBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    await supabaseAdmin
      .from("bulletin_hides")
      .upsert({ user_id: context.userId, bulletin_id: data.id }, { onConflict: "user_id,bulletin_id" });
    return { ok: true };
  });

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const hideBulletins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idsSchema.parse(d))
  .handler(async ({ context, data }) => {
    await supabaseAdmin
      .from("bulletin_hides")
      .upsert(
        data.ids.map((id) => ({ user_id: context.userId, bulletin_id: id })),
        { onConflict: "user_id,bulletin_id" },
      );
    return { ok: true };
  });

// ---------- Admin ----------
export const adminListBulletins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("bulletins")
      .select("id, title, content_html, media_url, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return { rows: data ?? [] };
  });

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content_html: z.string().min(1).max(50_000),
  media_url: z.string().url().nullable().optional(),
});
export const adminCreateBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bulletins").insert({
      title: data.title,
      content_html: data.content_html,
      media_url: data.media_url ?? null,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateSchema = createSchema.extend({ id: z.string().uuid() });
export const adminUpdateBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("bulletins")
      .update({
        title: data.title,
        content_html: data.content_html,
        media_url: data.media_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("bulletin_reads").delete().eq("bulletin_id", data.id);
    await supabaseAdmin.from("bulletin_hides").delete().eq("bulletin_id", data.id);
    const { error } = await supabaseAdmin.from("bulletins").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const uploadSchema = z.object({
  filename: z.string().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  content_base64: z.string().min(1),
  content_type: z.string().min(1).max(100),
});
export const adminUploadBulletinMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => uploadSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const buffer = Buffer.from(data.content_base64, "base64");
    if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");
    const path = `${context.userId}/${Date.now()}_${data.filename}`;
    const { error } = await supabaseAdmin.storage
      .from("bulletin-media")
      .upload(path, buffer, { upsert: false, contentType: data.content_type });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("bulletin-media").getPublicUrl(path);
    return { url: pub.publicUrl };
  });
