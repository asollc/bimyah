import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Throws 403 if the authenticated caller is not an admin. */
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

// ---------- Verify a recipient email exists as a member ----------
const verifySchema = z.object({
  email: z.string().email().max(255),
});

export const verifyGiftRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => verifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    // Pull a page of users and match (small user base for now)
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error("Lookup failed");
    const match = users?.users.find((u) => u.email?.toLowerCase() === email);
    if (!match) return { found: false as const };
    if (match.id === context.userId) {
      return { found: false as const, reason: "self" as const };
    }
    // Check if recipient already has active sub
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", match.id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      return { found: false as const, reason: "already_plus" as const };
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", match.id)
      .maybeSingle();
    return {
      found: true as const,
      display_name: profile?.display_name ?? "Member",
    };
  });

// ---------- Admin: list random-gift purchasers ----------
type RandomGiftRow = {
  id: string;
  purchaser_id: string;
  status: "pending" | "fulfilled" | "refunded";
  recipient_user_id: string | null;
  stripe_session_id: string | null;
  amount_cents: number;
  created_at: string;
  allocated_at: string | null;
};

export const listRandomGifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: gifts, error } = await supabaseAdmin
      .from("bplus_gifts")
      .select(
        "id, purchaser_id, status, recipient_user_id, stripe_session_id, amount_cents, created_at, allocated_at"
      )
      .eq("gift_type", "random")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const rows = (gifts ?? []) as RandomGiftRow[];

    const purchaserIds = Array.from(new Set(rows.map((r) => r.purchaser_id)));
    const recipientIds = Array.from(
      new Set(rows.map((r) => r.recipient_user_id).filter((v): v is string => !!v))
    );
    const allIds = Array.from(new Set([...purchaserIds, ...recipientIds]));

    const profById = new Map<string, { display_name: string }>();
    if (allIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", allIds);
      for (const p of profs ?? []) profById.set(p.id, { display_name: p.display_name });
    }
    const emailById = new Map<string, string | null>();
    if (purchaserIds.length) {
      const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of usersRes?.users ?? []) emailById.set(u.id, u.email ?? null);
    }

    // Group by purchaser for the summary view
    type PurchaserSummary = {
      purchaser_id: string;
      display_name: string;
      email: string | null;
      total_purchased: number;
      pending: number;
      fulfilled: number;
      total_amount_cents: number;
      first_purchase_at: string;
      last_purchase_at: string;
      gifts: Array<{
        id: string;
        status: RandomGiftRow["status"];
        created_at: string;
        allocated_at: string | null;
        recipient_user_id: string | null;
        recipient_display_name: string | null;
        amount_cents: number;
      }>;
    };
    const byPurchaser = new Map<string, PurchaserSummary>();
    for (const r of rows) {
      const existing = byPurchaser.get(r.purchaser_id);
      const recipientName = r.recipient_user_id
        ? (profById.get(r.recipient_user_id)?.display_name ?? null)
        : null;
      const giftEntry = {
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        allocated_at: r.allocated_at,
        recipient_user_id: r.recipient_user_id,
        recipient_display_name: recipientName,
        amount_cents: r.amount_cents,
      };
      if (existing) {
        existing.total_purchased += 1;
        existing.total_amount_cents += r.amount_cents;
        if (r.status === "pending") existing.pending += 1;
        if (r.status === "fulfilled") existing.fulfilled += 1;
        if (r.created_at < existing.first_purchase_at) existing.first_purchase_at = r.created_at;
        if (r.created_at > existing.last_purchase_at) existing.last_purchase_at = r.created_at;
        existing.gifts.push(giftEntry);
      } else {
        byPurchaser.set(r.purchaser_id, {
          purchaser_id: r.purchaser_id,
          display_name: profById.get(r.purchaser_id)?.display_name ?? "(unknown)",
          email: emailById.get(r.purchaser_id) ?? null,
          total_purchased: 1,
          pending: r.status === "pending" ? 1 : 0,
          fulfilled: r.status === "fulfilled" ? 1 : 0,
          total_amount_cents: r.amount_cents,
          first_purchase_at: r.created_at,
          last_purchase_at: r.created_at,
          gifts: [giftEntry],
        });
      }
    }

    return {
      purchasers: Array.from(byPurchaser.values()).sort(
        (a, b) => (b.last_purchase_at > a.last_purchase_at ? 1 : -1)
      ),
    };
  });

// ---------- Admin: allocate a random gift to a recipient ----------
const allocateSchema = z.object({
  gift_id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
});
export const allocateRandomGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => allocateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: gift, error: gErr } = await supabaseAdmin
      .from("bplus_gifts")
      .select("id, gift_type, status, amount_cents, currency, environment, stripe_session_id")
      .eq("id", data.gift_id)
      .single();
    if (gErr || !gift) throw new Error("Gift not found");
    if (gift.status !== "pending") throw new Error("Gift already processed");
    if (gift.gift_type !== "random") throw new Error("Only random gifts allocate this way");

    // Refuse if recipient already has active sub
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", data.recipient_user_id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) throw new Error("Recipient already has Bimyah!+");

    const { data: subRow, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: data.recipient_user_id,
        plan: "lifetime",
        status: "active",
        source: "stripe_gift_random",
        environment: gift.environment,
        price_id: "bplus_lifetime_onetime",
      })
      .select("id")
      .single();
    if (subErr || !subRow) throw new Error(subErr?.message ?? "Failed to grant");

    await supabaseAdmin.from("payments").insert({
      user_id: data.recipient_user_id,
      subscription_id: subRow.id,
      amount_cents: gift.amount_cents,
      currency: gift.currency,
      plan: "lifetime",
      status: "completed",
      stripe_session_id: gift.stripe_session_id,
      environment: gift.environment,
    });
    await supabaseAdmin
      .from("founding_members")
      .insert({ user_id: data.recipient_user_id })
      .select();

    await supabaseAdmin
      .from("bplus_gifts")
      .update({
        status: "fulfilled",
        recipient_user_id: data.recipient_user_id,
        subscription_id: subRow.id,
        allocated_by: context.userId,
        allocated_at: new Date().toISOString(),
      })
      .eq("id", data.gift_id);

    return { ok: true };
  });
