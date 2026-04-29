import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function userIsPlus(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  return !!(data && data.length);
}

const setAvatarSchema = z.object({
  avatarUrl: z.string().url().nullable(),
});

/** Set or clear the current user's avatar URL. Requires Bimyah!+ unless clearing. */
export const setMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setAvatarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.avatarUrl) {
      const isPlus = await userIsPlus(userId);
      if (!isPlus) throw new Error("Bimyah!+ is required to set a custom avatar.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.avatarUrl })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const setCardBackSchema = z.object({
  imageUrl: z.string().url(),
});

/** Add a new card back and mark it as active. Requires Bimyah!+. */
export const setMyActiveCardBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setCardBackSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const isPlus = await userIsPlus(userId);
    if (!isPlus) throw new Error("Bimyah!+ is required to set a custom card back.");

    // Deactivate any existing active row, then insert active one.
    await supabaseAdmin
      .from("card_backs")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    const { error } = await supabaseAdmin
      .from("card_backs")
      .insert({ user_id: userId, image_url: data.imageUrl, is_active: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Clear the current user's active card back. */
export const clearMyActiveCardBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await supabaseAdmin
      .from("card_backs")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);
    return { ok: true };
  });

/** Return the signed-in user's cosmetics for use at game creation. */
export const getMyCosmetics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const [{ data: profile }, { data: cardBack }] = await Promise.all([
      supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
      supabase
        .from("card_backs")
        .select("image_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    return {
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      cardBackUrl: (cardBack?.image_url as string | null) ?? null,
    };
  });
