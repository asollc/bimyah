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

export const getMySponsor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ref } = await supabaseAdmin
      .from("referrals")
      .select("referrer_id")
      .eq("referred_id", context.userId)
      .maybeSingle();
    if (!ref) return { sponsor: null as string | null };
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", ref.referrer_id)
      .maybeSingle();
    return { sponsor: prof?.display_name ?? null };
  });

const assignSchema = z.object({
  user_id: z.string().uuid(),
  sponsor_username: z.string().min(1).max(64),
});

/** Admin-only: assign (or reassign) a sponsor for a given user. */
export const adminAssignSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => assignSchema.parse(d))
  .handler(async ({ context, data }) => {
    // Authorize admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Response("Forbidden", { status: 403 });

    const { data: sponsorProf } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", data.sponsor_username)
      .maybeSingle();
    if (!sponsorProf) throw new Error("Sponsor username not found");
    if (sponsorProf.id === data.user_id) throw new Error("A user cannot sponsor themselves");

    // Upsert: remove any existing sponsor row for this user, then insert.
    await supabaseAdmin.from("referrals").delete().eq("referred_id", data.user_id);
    const { error } = await supabaseAdmin.from("referrals").insert({
      referrer_id: sponsorProf.id,
      referred_id: data.user_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, sponsor: sponsorProf.display_name };
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
