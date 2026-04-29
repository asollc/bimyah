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

// ---------- Lightweight: am I admin? (used by header) ----------
export const getMyAdminStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return { is_admin: false };

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return { is_admin: false };
    const token = authHeader.slice("Bearer ".length);
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claims } = await supabase.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) return { is_admin: false };
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return { is_admin: !!data };
  }
);

// ---------- Overview metrics ----------
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      profilesCount,
      activeSubsCount,
      cfgRow,
      revenue30,
      gamesCount,
      lobbyCount,
      foundingCount,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("bplus_config")
        .select("lifetime_quota, lifetime_sold, lifetime_price_cents, monthly_price_cents, annual_price_cents")
        .eq("id", 1)
        .single(),
      supabaseAdmin
        .from("payments")
        .select("amount_cents, currency, created_at, status")
        .eq("status", "completed")
        .gte("created_at", since30),
      supabaseAdmin.from("games").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("status", "lobby"),
      supabaseAdmin.from("founding_members").select("user_id", { count: "exact", head: true }),
    ]);

    const revenueCents30 = (revenue30.data ?? []).reduce(
      (sum, row) => sum + (row.amount_cents ?? 0),
      0
    );

    return {
      total_users: profilesCount.count ?? 0,
      active_subs: activeSubsCount.count ?? 0,
      founding_members: foundingCount.count ?? 0,
      lifetime_quota: cfgRow.data?.lifetime_quota ?? 0,
      lifetime_sold: cfgRow.data?.lifetime_sold ?? 0,
      lifetime_remaining: Math.max(
        (cfgRow.data?.lifetime_quota ?? 0) - (cfgRow.data?.lifetime_sold ?? 0),
        0
      ),
      revenue_cents_30d: revenueCents30,
      payments_30d: (revenue30.data ?? []).length,
      games_total: gamesCount.count ?? 0,
      games_in_lobby: lobbyCount.count ?? 0,
    };
  });

// ---------- Subscriptions list ----------
const listSubsSchema = z.object({
  search: z.string().max(120).optional(),
  status: z.enum(["all", "active", "canceled"]).default("all"),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSubsSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, plan, status, source, current_period_end, cancel_at_period_end, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: subs, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
    const profilesById = new Map<string, { display_name: string }>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profs ?? []) profilesById.set(p.id, { display_name: p.display_name });
    }
    const enriched = (subs ?? []).map((s) => ({
      ...s,
      display_name: profilesById.get(s.user_id)?.display_name ?? "(unknown)",
    }));
    const term = data.search?.trim().toLowerCase();
    const filtered = term
      ? enriched.filter(
          (r) =>
            r.display_name.toLowerCase().includes(term) ||
            r.user_id.toLowerCase().includes(term)
        )
      : enriched;
    return { rows: filtered };
  });

// ---------- Grant Bimyah!+ manually ----------
const grantSchema = z.object({
  user_id: z.string().uuid(),
  plan: z.enum(["lifetime", "monthly", "annual"]),
});
export const grantBplus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => grantSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", data.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) throw new Error("User already has an active subscription");

    const periodEnd =
      data.plan === "monthly"
        ? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString()
        : data.plan === "annual"
          ? new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString()
          : null;

    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: data.user_id,
      plan: data.plan,
      status: "active",
      source: "admin_grant",
      current_period_end: periodEnd,
    });
    if (error) throw new Error(error.message);
    if (data.plan === "lifetime") {
      await supabaseAdmin
        .from("founding_members")
        .insert({ user_id: data.user_id })
        .select();
    }
    return { ok: true };
  });

// ---------- Revoke Bimyah!+ ----------
const revokeSchema = z.object({ subscription_id: z.string().uuid() });
export const revokeBplus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => revokeSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancelled_at: new Date().toISOString(),
        cancel_at_period_end: false,
      })
      .eq("id", data.subscription_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Users list ----------
const listUsersSchema = z.object({
  search: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listUsersSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search?.trim()) {
      q = q.ilike("display_name", `%${data.search.trim()}%`);
    }
    const { data: profs, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (profs ?? []).map((p) => p.id);
    const [rolesRes, subsRes, foundersRes] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
        : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
      ids.length
        ? supabaseAdmin
            .from("subscriptions")
            .select("user_id, plan, status")
            .in("user_id", ids)
            .eq("status", "active")
        : Promise.resolve({ data: [] as { user_id: string; plan: string; status: string }[] }),
      ids.length
        ? supabaseAdmin.from("founding_members").select("user_id").in("user_id", ids)
        : Promise.resolve({ data: [] as { user_id: string }[] }),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    const subByUser = new Map<string, { plan: string; status: string }>();
    for (const s of subsRes.data ?? []) subByUser.set(s.user_id, { plan: s.plan, status: s.status });
    const founders = new Set((foundersRes.data ?? []).map((f) => f.user_id));

    return {
      rows: (profs ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? ["user"],
        active_plan: subByUser.get(p.id)?.plan ?? null,
        founding_member: founders.has(p.id),
      })),
    };
  });

// ---------- Promote / demote admin ----------
const roleSchema = z.object({
  user_id: z.string().uuid(),
  make_admin: z.boolean(),
});
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => roleSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && !data.make_admin) {
      throw new Error("You cannot demote yourself");
    }
    if (data.make_admin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: "admin" });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Toggle founding member ----------
const founderSchema = z.object({
  user_id: z.string().uuid(),
  grant: z.boolean(),
});
export const setFoundingMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => founderSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.grant) {
      await supabaseAdmin
        .from("founding_members")
        .insert({ user_id: data.user_id })
        .select();
    } else {
      await supabaseAdmin
        .from("founding_members")
        .delete()
        .eq("user_id", data.user_id);
    }
    return { ok: true };
  });

// ---------- Pricing & quota config ----------
const cfgSchema = z.object({
  lifetime_quota: z.number().int().min(0).max(1_000_000),
  lifetime_price_cents: z.number().int().min(0).max(10_000_000),
  monthly_price_cents: z.number().int().min(0).max(10_000_000),
  annual_price_cents: z.number().int().min(0).max(10_000_000),
});
export const updateBplusConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => cfgSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("bplus_config")
      .update({
        lifetime_quota: data.lifetime_quota,
        lifetime_price_cents: data.lifetime_price_cents,
        monthly_price_cents: data.monthly_price_cents,
        annual_price_cents: data.annual_price_cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminBplusConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("bplus_config")
      .select("lifetime_quota, lifetime_sold, lifetime_price_cents, monthly_price_cents, annual_price_cents, updated_at")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });
