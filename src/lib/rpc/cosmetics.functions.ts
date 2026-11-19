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

/** Return the signed-in user's cosmetics + equipped decor URLs for use at
 *  game creation. The equipped decor (title / badge / victory) travels with
 *  the player payload; backgrounds and tabletop / table art only render in
 *  game when the player is the host (enforced client-side). */
export const getMyCosmetics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const [{ data: profile }, { data: cardBack }, { data: equipped }] =
      await Promise.all([
        supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
        supabase
          .from("card_backs")
          .select("image_url")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("user_equipped")
          .select(
            "title_id, badge_id, badge_id_2, emblem_id, emblem_id_2, victory_id, background_id, tabletop_id, table_art_id",
          )
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    // "Random" decor (equipped id "__random__") resolves to a random owned
    // item of that kind, picked fresh on every call (i.e. every match).
    // Badges and emblems never randomize.
    const RANDOM_KIND_BY_COL: Record<string, string> = {
      title_id: "title",
      victory_id: "victory",
      background_id: "background",
      tabletop_id: "tabletop",
      table_art_id: "table_art",
    };
    const eff: Record<string, string | null> = {
      title_id: equipped?.title_id ?? null,
      badge_id: equipped?.badge_id ?? null,
      badge_id_2: equipped?.badge_id_2 ?? null,
      emblem_id: equipped?.emblem_id ?? null,
      emblem_id_2: equipped?.emblem_id_2 ?? null,
      victory_id: equipped?.victory_id ?? null,
      background_id: equipped?.background_id ?? null,
      tabletop_id: equipped?.tabletop_id ?? null,
      table_art_id: equipped?.table_art_id ?? null,
    };
    const randomCols = Object.keys(RANDOM_KIND_BY_COL).filter(
      (c) => eff[c] === "__random__",
    );
    if (randomCols.length) {
      const { data: inv } = await supabase
        .from("user_inventory")
        .select("kind, item_id")
        .eq("user_id", userId);
      for (const col of randomCols) {
        const pool = (inv ?? [])
          .filter((r) => r.kind === RANDOM_KIND_BY_COL[col])
          .map((r) => r.item_id as string);
        eff[col] = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : null;
      }
    }

    const ids = [
      eff.title_id,
      eff.badge_id,
      eff.badge_id_2,
      eff.emblem_id,
      eff.emblem_id_2,
      eff.victory_id,
      eff.background_id,
      eff.tabletop_id,
      eff.table_art_id,
    ].filter((v): v is string => !!v);

    const urlById = new Map<string, string>();
    const effectById = new Map<string, string>();
    if (ids.length) {
      const { data: prods } = await supabaseAdmin
        .from("bmart_products")
        .select("id, image_url, effect_type")
        .in("id", ids);
      for (const p of prods ?? []) {
        if (p.image_url) urlById.set(p.id as string, p.image_url as string);
        if (p.effect_type) effectById.set(p.id as string, p.effect_type as string);
      }
    }

    const lookup = (id: string | null | undefined) =>
      id ? urlById.get(id) ?? null : null;
    const lookupEffect = (id: string | null | undefined) =>
      id ? effectById.get(id) ?? null : null;

    return {
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      cardBackUrl: (cardBack?.image_url as string | null) ?? null,
      titleUrl: lookup(eff.title_id),
      badgeUrl: lookup(eff.badge_id),
      badgeUrl2: lookup(eff.badge_id_2),
      emblemUrl: lookup(eff.emblem_id),
      emblemUrl2: lookup(eff.emblem_id_2),
      victoryUrl: lookup(eff.victory_id),
      victoryEffectType: lookupEffect(eff.victory_id),
      backgroundUrl: lookup(eff.background_id),
      tabletopUrl: lookup(eff.tabletop_id),
      tableArtUrl: lookup(eff.table_art_id),
    };
  });

