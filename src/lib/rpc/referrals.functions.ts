import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const claimSchema = z.object({
  username: z.string().min(1).max(64),
});

/**
 * Called by a newly-signed-in user when they have a `bimyah_referrer`
 * value stored locally. Idempotent: each referred user can only have
 * a single sponsor row.
 */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => claimSchema.parse(d))
  .handler(async ({ context, data }) => {
    const referredId = context.userId;

    // Already has a sponsor? Nothing to do.
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", referredId)
      .maybeSingle();
    if (existing) return { ok: true, claimed: false };

    // Resolve username -> user id (case-insensitive, exact match).
    const { data: refProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("display_name", data.username)
      .maybeSingle();
    if (!refProfile) return { ok: false, claimed: false, reason: "not_found" };
    if (refProfile.id === referredId) {
      return { ok: false, claimed: false, reason: "self" };
    }

    const { error } = await supabaseAdmin.from("referrals").insert({
      referrer_id: refProfile.id,
      referred_id: referredId,
    });
    if (error && !error.message.includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true, claimed: true };
  });

export const getMyReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: refs, error } = await supabaseAdmin
      .from("referrals")
      .select("referred_id, created_at")
      .eq("referrer_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (refs ?? []).map((r) => r.referred_id);
    if (!ids.length) return { rows: [] as Array<{
      user_id: string;
      display_name: string;
      joined_at: string;
      is_plus: boolean;
    }> };

    const [profsRes, subsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name").in("id", ids),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id")
        .eq("status", "active")
        .in("user_id", ids),
    ]);

    const nameById = new Map<string, string>();
    for (const p of profsRes.data ?? []) nameById.set(p.id, p.display_name);
    const plusSet = new Set((subsRes.data ?? []).map((s) => s.user_id));

    return {
      rows: (refs ?? []).map((r) => ({
        user_id: r.referred_id,
        display_name: nameById.get(r.referred_id) ?? "(unknown)",
        joined_at: r.created_at,
        is_plus: plusSet.has(r.referred_id),
      })),
    };
  });
