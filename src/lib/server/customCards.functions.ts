import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SLOT_COST_BIMBUCKS = 250;

/** Return the current player's wallet + custom card-back state. */
export const getMyCustomCardState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const [walletRes, cardsRes] = await Promise.all([
      supabase
        .from("wallets")
        .select("bimbucks, custom_slots_purchased")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("card_backs")
        .select("id, image_url, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);
    return {
      bimbucks: (walletRes.data?.bimbucks as number) ?? 0,
      customSlotsPurchased:
        (walletRes.data?.custom_slots_purchased as number) ?? 0,
      cardBacks: (cardsRes.data ?? []) as Array<{
        id: string;
        image_url: string;
        created_at: string;
      }>,
    };
  });

/** Purchase N custom card-back slots at 250 Bimbucks each (atomic). */
export const purchaseCustomCardSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quantity: z.number().int().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rpc, error } = await supabaseAdmin.rpc(
      "purchase_custom_card_slots",
      { _user_id: userId, _quantity: data.quantity },
    );
    if (error) throw new Error(error.message);
    return rpc as { bimbucks: number; custom_slots_purchased: number };
  });

/** Add a new uploaded image to the user's next empty unlocked slot. */
export const addCustomCardBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ imageUrl: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Compute available slots: purchased + (B+ ? 1 : 0) vs. filled rows.
    const [{ data: wallet }, { count: filledCount }, { data: sub }] = await Promise.all([
      supabaseAdmin
        .from("wallets")
        .select("custom_slots_purchased")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("card_backs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);

    const purchased = (wallet?.custom_slots_purchased as number) ?? 0;
    const freeSlots = sub ? 1 : 0;
    const totalUnlocked = purchased + freeSlots;
    const filled = filledCount ?? 0;
    if (filled >= totalUnlocked) {
      throw new Error("No empty unlocked slot available. Purchase a slot first.");
    }

    const { error } = await supabaseAdmin
      .from("card_backs")
      .insert({ user_id: userId, image_url: data.imageUrl, is_active: false });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
