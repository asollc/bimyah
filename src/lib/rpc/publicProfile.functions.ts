import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { entriesForUser } from "@/lib/challengesData.server";

/* ---------- Public player profile (Ronya 2026-11-09) ----------
 * What any other player may see when they tap someone's avatar:
 * display name, avatar, BIMYAH!+ status, their equipped decor, their
 * decor collection, and their challenge progress. Deliberately
 * EXCLUDES everything private: no email, no balances, no friends
 * list, no referrals (the Recruiter challenge is referral data and
 * is not part of entriesForUser's catalog output), no settings.
 * Readable without an account session so guests in a room can view
 * profiles too; the handler only ever returns the public fields.
 *
 * Only items that actually exist in the game are shown (Ronya
 * 2026-11-09): inventory whose product row was deleted, rows the
 * shop merge would not surface (non-custom products with no kind
 * and no kind-bearing category), and items with no image at all
 * never render. The image rule is what removes the gem card backs
 * (Amethyst, Sapphire, Crimson, Royal Gold): their rows exist but
 * carry no image file, so they showed as blank "?" tiles, which
 * Ronya counts as deleted items. Random appears only as an equipped
 * choice, never as a collection item.
 *
 * Owners can hide whole sections from other viewers (the eyeball
 * toggles in the "View Public Profile" preview on their profile
 * page). Hidden sections are filtered HERE for everyone except the
 * owner themself, whose preview comes from getMyPublicProfile. */

export const PROFILE_SECTIONS = [
  "equipped",
  "titles",
  "badges",
  "stickers",
  "victory",
  "backgrounds",
  "tabletops",
  "tableart",
  "cardbacks",
  "challenges",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/** Inventory kind → the public-profile section that lists it. */
const KIND_TO_SECTION: Record<string, ProfileSection> = {
  title: "titles",
  badge: "badges",
  emblem: "stickers",
  victory: "victory",
  background: "backgrounds",
  tabletop: "tabletops",
  table_art: "tableart",
  card_back: "cardbacks",
};

/** bmart_products category → decor kind (mirrors the shop merge). */
const CATEGORY_TO_KIND: Record<string, string> = {
  cards: "card_back",
  victory: "victory",
  backgrounds: "background",
  tabletops: "tabletop",
  emblems: "emblem",
};

type ProductRow = {
  id: string;
  name: string | null;
  image_url: string | null;
  effect_type: string | null;
  category: string | null;
  kind: string | null;
  is_custom: boolean | null;
  hidden: boolean | null;
};

/**
 * Is this product a real in-game item the way the game's own shop
 * (bmart mergeCatalog) decides? Custom products are added to the
 * catalog outright, and hidden rows still resolve for inventory,
 * decor, and cards, so both count. A plain non-custom row only
 * counts when it resolves to a decor kind; anything else (and any
 * inventory row whose product was deleted) is not in the game.
 */
function isRealItem(p: ProductRow): boolean {
  // No image file = not a showable item (Ronya 2026-11-09: the
  // blank "?" tiles ARE the deleted items he kept pointing at).
  if (!p.image_url) return false;
  if (p.is_custom || p.hidden) return true;
  const kind = p.kind ?? (p.category ? CATEGORY_TO_KIND[p.category] : undefined);
  return !!kind;
}

type PublicItem = {
  id: string;
  name: string | null;
  image_url: string | null;
  effect_type: string | null;
};

async function buildPublicProfile(userId: string, forOwner: boolean) {
  const [profile, equipped, inv, activeBack, customBacks, sub, entries] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("display_name, avatar_url, public_hidden_sections")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_equipped")
        .select(
          "title_id, badge_id, badge_id_2, emblem_id, emblem_id_2, victory_id, background_id, tabletop_id, table_art_id, card_back_id",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_inventory")
        .select("kind, item_id")
        .eq("user_id", userId),
      supabaseAdmin
        .from("card_backs")
        .select("image_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("card_backs")
        .select("id, image_url")
        .eq("user_id", userId),
      supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1),
      entriesForUser(userId),
    ]);
  if (!profile.data) return null;

  const isPlus = (sub.data ?? []).length > 0;
  const hidden = new Set<string>(
    ((profile.data.public_hidden_sections as string[] | null) ?? []).filter(
      (s): s is ProfileSection =>
        (PROFILE_SECTIONS as readonly string[]).includes(s),
    ),
  );
  const visible = (s: ProfileSection) => forOwner || !hidden.has(s);

  const eq = (equipped.data ?? {}) as Record<string, string | null>;
  const ids = new Set<string>();
  for (const r of inv.data ?? []) ids.add(r.item_id);
  for (const v of Object.values(eq)) {
    if (v && v !== "__random__") ids.add(v);
  }
  const productMap = new Map<string, ProductRow>();
  if (ids.size) {
    const { data: prods } = await supabaseAdmin
      .from("bmart_products")
      .select("id, name, image_url, effect_type, category, kind, is_custom, hidden")
      .in("id", [...ids]);
    for (const p of (prods ?? []) as ProductRow[]) {
      if (isRealItem(p)) productMap.set(p.id, p);
    }
  }
  const resolve = (id: string | null | undefined): PublicItem | null => {
    if (!id) return null;
    if (id === "__random__") {
      return { id, name: "Random", image_url: null, effect_type: null };
    }
    const p = productMap.get(id);
    if (!p) return null;
    return { id: p.id, name: p.name, image_url: p.image_url, effect_type: p.effect_type };
  };

  const collection: Record<string, PublicItem[]> = {};
  for (const r of inv.data ?? []) {
    if (r.item_id === "__random__") continue;
    const p = productMap.get(r.item_id);
    if (!p) continue;
    (collection[r.kind] ??= []).push({
      id: r.item_id,
      name: p.name,
      image_url: p.image_url,
      effect_type: p.effect_type,
    });
  }
  // Card backs that live outside bmart_products (the same sources the
  // game's own Cards tab collects): the standard card everyone owns,
  // the player's uploaded custom backs, granted and purchased backs
  // (already in the inventory loop above), and Founding Carder for
  // BIMYAH!+ members. None of these is a Random item.
  const cardbacks = (collection.card_back ??= []);
  cardbacks.unshift({
    id: "standard-bimyah",
    name: "Bimyah!",
    image_url: "builtin:standard-bimyah",
    effect_type: null,
  });
  (customBacks.data ?? []).forEach((r, i) => {
    cardbacks.push({
      id: `custom-${r.id as string}`,
      name: `Custom ${i + 1}`,
      image_url: r.image_url as string,
      effect_type: null,
    });
  });
  if (isPlus) {
    cardbacks.push({
      id: "founding-carder",
      name: "Founding Carder",
      image_url: "builtin:founding-carder",
      effect_type: null,
    });
  }

  const equippedOut = visible("equipped")
    ? {
        title: resolve(eq.title_id),
        badge: resolve(eq.badge_id),
        badge2: resolve(eq.badge_id_2),
        sticker: resolve(eq.emblem_id),
        sticker2: resolve(eq.emblem_id_2),
        victory: resolve(eq.victory_id),
        background: resolve(eq.background_id),
        tabletop: resolve(eq.tabletop_id),
        tableArt: resolve(eq.table_art_id),
        cardBack: resolve(eq.card_back_id),
        cardBackUrl: (activeBack.data?.image_url as string | null) ?? null,
      }
    : null;

  const collectionOut: Record<string, PublicItem[]> = {};
  for (const [kind, items] of Object.entries(collection)) {
    const section = KIND_TO_SECTION[kind];
    if (section && !visible(section)) continue;
    collectionOut[kind] = items;
  }

  return {
    name: profile.data.display_name as string,
    avatarUrl: (profile.data.avatar_url as string | null) ?? null,
    isPlus,
    equipped: equippedOut,
    collection: collectionOut,
    challenges: visible("challenges") ? entries : [],
    /** Sections the owner hides; only the owner's own preview gets the list. */
    hiddenSections: forOwner ? [...hidden] : [],
    /** Sections withheld from this viewer (always empty for the owner). */
    hiddenFromViewer: forOwner ? [] : [...hidden],
  };
}

const schema = z.object({ userId: z.string().uuid() });

export const getPublicProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => buildPublicProfile(data.userId, false));

/** The signed-in player's own public profile, unfiltered, with the
 *  list of sections they currently hide. Backs the "View Public
 *  Profile" preview and its eyeball toggles. */
export const getMyPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => buildPublicProfile(context.userId, true));

/** Show or hide one section of the signed-in player's public profile. */
export const setProfileSectionVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        section: z.enum(PROFILE_SECTIONS),
        hidden: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("public_hidden_sections")
      .eq("id", context.userId)
      .maybeSingle();
    const current = new Set<string>(
      (row?.public_hidden_sections as string[] | null) ?? [],
    );
    if (data.hidden) current.add(data.section);
    else current.delete(data.section);
    const next = [...current].filter((s) =>
      (PROFILE_SECTIONS as readonly string[]).includes(s),
    );
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ public_hidden_sections: next })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { hiddenSections: next };
  });

export type PublicProfile = NonNullable<
  Awaited<ReturnType<typeof getPublicProfile>>
>;
