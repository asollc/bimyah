import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deliver,
  endpointFp,
  logPushEvent,
  resolvePushCopy,
  rowsForUsers,
} from "@/lib/server/pushNotify";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/* ---------- User: sync / remove my browser subscription ----------
   Mirrored from Creator Shout's /api/push-subscribe: the client hands
   over its browser subscription and the server simply saves it
   (service-role upsert). No send happens here, and nothing is ever
   deleted here. Earlier builds turned this into a verdict machine:
   every sync fired a confirmation send and "expired" answers deleted
   rows and triggered client-side re-registration, which churned
   endpoint after endpoint (see push_debug_log, 2026-10-21: first
   sends accepted, every later send refused, zero displays). CS saves
   quietly and sends only through the explicit send paths, and CS has
   worked from day one. The confirmation test lives in sendTestPush,
   fired by the Enable button after the save, exactly like CS's
   self-test. */
const syncSubSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  user_agent: z.string().max(300).optional(),
  // Accepted for compatibility with older cached clients; ignored.
  confirm: z.boolean().optional(),
});

export const syncPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => syncSubSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: prior } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    const existed = !!prior && prior.user_id === context.userId;
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    await logPushEvent(context.userId, "sync", {
      host: new URL(data.endpoint).host,
      fp: endpointFp(data.endpoint),
      existed,
      verdict: "saved",
      status: null,
    });
    return { saved: true as const, existed };
  });

/* ---------- Diagnostics: does the server's VAPID key check out? ----------
   Returns only PUBLIC material (the derived public key is not a secret;
   its client twin ships in the bundle). sign_ok proves the stored
   private key and its public half actually belong together: a keypair
   mismatch makes every real push service reject every send while every
   fake-endpoint test still passes. */
export const pushKeyDiagnostics = createServerFn({ method: "GET" }).handler(async () => {
  const jwkRaw = process.env.VAPID_PRIVATE_JWK;
  if (!jwkRaw) return { has_secret: false as const };
  const jwk = JSON.parse(jwkRaw) as JsonWebKey;
  const b64urlToBytes = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const bytesToB64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const x = b64urlToBytes(String(jwk.x));
  const y = b64urlToBytes(String(jwk.y));
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(x, 1);
  pub.set(y, 33);
  let signOk = false;
  try {
    const priv = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const pubKey = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode("bimyah-push-diagnostics");
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, data);
    signOk = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, data);
  } catch {
    signOk = false;
  }
  return { has_secret: true as const, derived_public_key: bytesToB64url(pub), sign_ok: signOk };
});

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().max(1000) }).parse(d))
  .handler(async ({ context, data }) => {
    await logPushEvent(context.userId, "disable", { fp: endpointFp(data.endpoint) });
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

/* ---------- User: test push to my own devices ---------- */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await rowsForUsers([context.userId]);
    if (!rows.length) throw new Error("No push subscription found for your account yet.");
    const copy = await resolvePushCopy("push.test", {});
    return deliver(rows, {
      title: copy.title,
      body: copy.body,
      url: "/",
      tag: "bimyah-test",
      ...(copy.image ? { image: copy.image } : {}),
    }, "test");
  });

/* ---------- Admin: subscriber directory ---------- */
export type PushSubscriber = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  devices: number;
};

export const adminListPushSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id");
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const s of subs ?? []) counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1);
    const userIds = [...counts.keys()];
    if (!userIds.length) return { count: 0, subscribers: [] as PushSubscriber[] };

    const [{ data: profiles }, usersRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name").in("id", userIds),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const emails = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
    const subscribers: PushSubscriber[] = userIds.map((id) => ({
      user_id: id,
      display_name: names.get(id) ?? null,
      email: emails.get(id) ?? null,
      devices: counts.get(id) ?? 0,
    }));
    subscribers.sort((a, b) =>
      (a.display_name || a.email || "").localeCompare(b.display_name || b.email || ""),
    );
    return { count: (subs ?? []).length, subscribers };
  });

/* ---------- Admin: member directory for the bulletin picker ----------
   All members (not just push subscribers): a targeted bulletin shows in
   the member's in-app bell even when they have no push device. */
export const adminListMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: profiles }, usersRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name"),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const members = (usersRes.data?.users ?? []).map((u) => ({
      user_id: u.id,
      display_name:
        names.get(u.id) ??
        (typeof u.user_metadata?.name === "string" ? u.user_metadata.name : null) ??
        (typeof u.user_metadata?.display_name === "string" ? u.user_metadata.display_name : null),
      email: u.email ?? null,
    }));
    members.sort((a, b) =>
      (a.display_name || a.email || "").localeCompare(b.display_name || b.email || ""),
    );
    return { members };
  });

/* ---------- Admin: broadcast / targeted push ---------- */
const sendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(240),
  url: z.string().max(500).optional(),
  image: z
    .string()
    .max(500)
    .regex(/^https:\/\//i, "Image must be an https URL")
    .optional(),
  user_ids: z.array(z.string().uuid()).max(500).optional(),
});

export const adminSendPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const rows = await rowsForUsers(data.user_ids?.length ? data.user_ids : null);
    if (!rows.length) {
      throw new Error("No subscribed devices for the selected recipients.");
    }
    let url = data.url || "/";
    if (url && !/^(\/|https?:\/\/)/i.test(url)) url = "https://" + url;
    return deliver(rows, {
      title: data.title,
      body: data.body,
      url,
      tag: "bimyah-push",
      ...(data.image ? { image: data.image } : {}),
    }, "admin");
  });

/* ---------- Admin: bulletin-posted push (template-driven) ----------
   Fired by the bulletin composer for every new bulletin. Copy comes from
   the bulletin.posted template (Admin > Push > Alerts) with {subject}
   substituted; the deep link always targets the bulletin. */
const bulletinPushSchema = z.object({
  bulletin_id: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  user_ids: z.array(z.string().uuid()).max(500).optional(),
});

export const adminSendBulletinPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bulletinPushSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const rows = await rowsForUsers(data.user_ids?.length ? data.user_ids : null);
    if (!rows.length) {
      throw new Error("No subscribed devices for the selected recipients.");
    }
    const copy = await resolvePushCopy("bulletin.posted", { subject: data.subject });
    return deliver(rows, {
      title: copy.title,
      body: copy.body,
      url: `/?bulletin=${data.bulletin_id}`,
      tag: "bimyah-push",
      ...(copy.image ? { image: copy.image } : {}),
    }, "bulletin");
  });

/* ---------- Admin: push alert templates (Admin > Push > Alerts) ---------- */
export type PushTemplate = {
  key: string;
  name: string;
  title: string;
  body: string;
  image_url: string | null;
  variables: string;
  updated_at: string;
};

export const adminListPushTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("push_templates")
      .select("key, name, title, body, image_url, variables, updated_at")
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    return { templates: (data ?? []) as PushTemplate[] };
  });

const saveTemplateSchema = z.object({
  key: z.string().trim().min(1).max(80),
  title: z.string().max(120),
  body: z.string().max(240),
  image_url: z
    .string()
    .max(500)
    .regex(/^https:\/\//i, "Image must be an https URL")
    .nullable()
    .optional(),
});

export const adminSavePushTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveTemplateSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    // The key must already exist: this edits copy, it never creates new
    // alert types (those are wired in code first, then seeded).
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("push_templates")
      .select("key")
      .eq("key", data.key)
      .maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (!existing) throw new Error("Unknown template key");
    const { data: saved, error } = await supabaseAdmin
      .from("push_templates")
      .update({
        title: data.title,
        body: data.body,
        image_url: data.image_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("key", data.key)
      .select("key, name, title, body, image_url, variables, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { saved: saved as PushTemplate };
  });
