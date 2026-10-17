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

export type DecorDefaultOverride = {
  kind: (typeof KINDS)[number];
  default_key: string;
  name_override: string | null;
  image_url_override: string | null;
};

/** Public: returns all admin-set overrides of built-in decor defaults. The
 *  client merges these over the bundled defaults so every user sees the
 *  admin's name / image edits. */
export const getDecorDefaults = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("decor_defaults")
      .select("kind, default_key, name_override, image_url_override");
    return { overrides: (data ?? []) as DecorDefaultOverride[] };
  },
);

const upsertSchema = z.object({
  kind: z.enum(KINDS),
  defaultKey: z.string().min(1).max(120),
  name: z.string().min(1).max(120).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
});

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

/** Admin-only: set or clear the name / image override for one default item.
 *  Pass `null` to clear that field. */
export const adminUpsertDefaultOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: Record<string, unknown> = {
      kind: data.kind,
      default_key: data.defaultKey,
      updated_by: context.userId,
    };
    if (data.name !== undefined) payload.name_override = data.name;
    if (data.imageUrl !== undefined) payload.image_url_override = data.imageUrl;
    const { error } = await supabaseAdmin
      .from("decor_defaults")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "kind,default_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
