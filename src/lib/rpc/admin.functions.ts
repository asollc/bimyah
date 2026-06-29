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
export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return { is_admin: !!data };
  });

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
  status: z.enum(["all", "active", "cancelled"]).default("all"),
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
        status: "cancelled",
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
    const [rolesRes, subsRes, foundersRes, usersRes] = await Promise.all([
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
      // auth.admin.listUsers paginates; pull enough to cover this page of profiles.
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: Math.max(data.limit, 200) }),
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
    const emailByUser = new Map<string, string | null>();
    for (const u of usersRes.data?.users ?? []) emailByUser.set(u.id, u.email ?? null);

    return {
      rows: (profs ?? []).map((p) => ({
        ...p,
        email: emailByUser.get(p.id) ?? null,
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

// ---------- Share tracking ----------
const recordShareSchema = z.object({
  method: z.enum(["web_share", "clipboard", "referral"]),
  source: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).default("home"),
  user_id: z.string().uuid().nullable().optional(),
});
export const recordShareEvent = createServerFn({ method: "POST" })
  .inputValidator((d) => recordShareSchema.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("share_events").insert({
      user_id: data.user_id ?? null,
      method: data.method,
      source: data.source,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Referral visits ----------
const referralVisitSchema = z.object({
  username: z.string().min(1).max(64),
});
export const recordReferralVisit = createServerFn({ method: "POST" })
  .inputValidator((d) => referralVisitSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", data.username)
      .maybeSingle();
    if (!prof) return { ok: false, found: false };
    const { error } = await supabaseAdmin.from("share_events").insert({
      user_id: prof.id,
      method: "referral",
      source: "referral_link",
    });
    if (error) throw new Error(error.message);
    return { ok: true, found: true };
  });

export const getShareStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, last30Res, last7Res, recentRes] = await Promise.all([
      supabaseAdmin.from("share_events").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("share_events")
        .select("method", { count: "exact" })
        .gte("created_at", since30),
      supabaseAdmin
        .from("share_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7),
      supabaseAdmin
        .from("share_events")
        .select("id, user_id, method, source, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const byMethod30: Record<string, number> = { web_share: 0, clipboard: 0 };
    for (const row of last30Res.data ?? []) {
      byMethod30[row.method] = (byMethod30[row.method] ?? 0) + 1;
    }

    const userIds = Array.from(
      new Set((recentRes.data ?? []).map((r) => r.user_id).filter((v): v is string => !!v))
    );
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      for (const p of profs ?? []) nameById.set(p.id, p.display_name);
    }

    return {
      total: totalRes.count ?? 0,
      last_30d: (last30Res.data ?? []).length,
      last_7d: last7Res.count ?? 0,
      web_share_30d: byMethod30.web_share ?? 0,
      clipboard_30d: byMethod30.clipboard ?? 0,
      recent: (recentRes.data ?? []).map((r) => ({
        ...r,
        display_name: r.user_id ? (nameById.get(r.user_id) ?? "(unknown)") : "Anonymous",
      })),
    };
  });

// ---------- Per-user admin profile editor ----------
const userIdSchema = z.object({ user_id: z.string().uuid() });

export const getAdminUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => userIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const [profileRes, rolesRes, subRes, founderRes, cardBackRes, userRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .eq("id", data.user_id)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
      supabaseAdmin
        .from("subscriptions")
        .select("plan, status")
        .eq("user_id", data.user_id)
        .eq("status", "active")
        .maybeSingle(),
      supabaseAdmin
        .from("founding_members")
        .select("user_id")
        .eq("user_id", data.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("card_backs")
        .select("image_url")
        .eq("user_id", data.user_id)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.user_id),
    ]);
    if (!profileRes.data) throw new Error("User not found");
    return {
      id: profileRes.data.id,
      display_name: profileRes.data.display_name,
      avatar_url: profileRes.data.avatar_url as string | null,
      created_at: profileRes.data.created_at,
      email: userRes.data?.user?.email ?? null,
      roles: (rolesRes.data ?? []).map((r) => r.role),
      active_plan: subRes.data?.plan ?? null,
      founding_member: !!founderRes.data,
      active_card_back_url: (cardBackRes.data?.image_url as string | undefined) ?? null,
    };
  });

const setAvatarSchema = z.object({
  user_id: z.string().uuid(),
  avatar_url: z.string().url().nullable(),
});
export const adminSetAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setAvatarSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.avatar_url })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const setDisplayNameSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().min(1).max(14).regex(/^[\S ]+$/, "Invalid characters"),
});
export const adminSetDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setDisplayNameSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const trimmed = data.display_name.trim();
    if (!trimmed) throw new Error("Display name cannot be empty");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("display_name", trimmed)
      .neq("id", data.user_id)
      .maybeSingle();
    if (existing) throw new Error("That display name is already taken");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const setCardBackSchema = z.object({
  user_id: z.string().uuid(),
  image_url: z.string().url(),
});
export const adminSetCardBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setCardBackSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin
      .from("card_backs")
      .update({ is_active: false })
      .eq("user_id", data.user_id)
      .eq("is_active", true);
    const { error } = await supabaseAdmin
      .from("card_backs")
      .insert({ user_id: data.user_id, image_url: data.image_url, is_active: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminClearCardBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => userIdSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin
      .from("card_backs")
      .update({ is_active: false })
      .eq("user_id", data.user_id)
      .eq("is_active", true);
    return { ok: true };
  });

const uploadSchema = z.object({
  user_id: z.string().uuid(),
  bucket: z.enum(["avatars", "card-backs"]),
  filename: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  content_base64: z.string().min(1),
  content_type: z.string().min(1).max(100),
});
export const adminUploadAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => uploadSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const buffer = Buffer.from(data.content_base64, "base64");
    const maxBytes = data.bucket === "avatars" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (buffer.byteLength > maxBytes) {
      throw new Error(`File too large (max ${Math.floor(maxBytes / 1024 / 1024)} MB)`);
    }
    const path = `${data.user_id}/${data.filename}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(path, buffer, { upsert: true, contentType: data.content_type });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ---------- Delete user account (permanent) ----------
const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
  confirm: z.literal("DELETE"),
});
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteUserSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const uid = data.user_id;

    // Delete all rows in public schema that reference this user.
    // Errors are logged but don't abort — we want the auth user gone.
    const ops = [
      supabaseAdmin.from("bplus_gifts").delete().eq("purchaser_id", uid),
      supabaseAdmin.from("bplus_gifts").delete().eq("recipient_user_id", uid),
      supabaseAdmin.from("bplus_gifts").delete().eq("allocated_by", uid),
      supabaseAdmin.from("bulletin_hides").delete().eq("user_id", uid),
      supabaseAdmin.from("bulletin_reads").delete().eq("user_id", uid),
      supabaseAdmin.from("bulletins").delete().eq("author_id", uid),
      supabaseAdmin.from("card_backs").delete().eq("user_id", uid),
      supabaseAdmin.from("friendships").delete().eq("requester_id", uid),
      supabaseAdmin.from("friendships").delete().eq("addressee_id", uid),
      supabaseAdmin.from("founding_members").delete().eq("user_id", uid),
      supabaseAdmin.from("payments").delete().eq("user_id", uid),
      supabaseAdmin.from("push_subscriptions").delete().eq("user_id", uid),
      supabaseAdmin.from("share_events").delete().eq("user_id", uid),
      supabaseAdmin.from("subscriptions").delete().eq("user_id", uid),
      supabaseAdmin.from("user_keybinds").delete().eq("user_id", uid),
      supabaseAdmin.from("user_presence").delete().eq("user_id", uid),
      supabaseAdmin.from("user_roles").delete().eq("user_id", uid),
      supabaseAdmin.from("public_matches").delete().eq("host_id", uid),
      supabaseAdmin.from("games").delete().eq("host_id", uid),
      supabaseAdmin.from("profiles").delete().eq("id", uid),
    ];
    await Promise.allSettled(ops);

    // Best-effort: remove storage assets in user folders.
    for (const bucket of ["avatars", "card-backs"] as const) {
      try {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list(uid);
        if (files?.length) {
          await supabaseAdmin.storage
            .from(bucket)
            .remove(files.map((f) => `${uid}/${f.name}`));
        }
      } catch {
        // ignore
      }
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });
