/* Shared server-side push delivery for Bimyah.
   One home for the send machinery so every automatic alert (bulletins,
   test pushes, friend requests, game invites, and whatever comes next)
   goes through the exact same path: template copy from push_templates
   with built-in fallbacks, delivery to the recipient's saved devices,
   dead-endpoint pruning, and a push_debug_log row per send.
   Server-only: imports the service-role client and the VAPID secret. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush, type PushSubscriptionKeys } from "@/lib/server/webpush";

function vapidConfig(): { privateJwk: JsonWebKey; subject: string } {
  const jwkRaw = process.env.VAPID_PRIVATE_JWK;
  if (!jwkRaw) throw new Error("Push is not configured on the server yet.");
  return {
    privateJwk: JSON.parse(jwkRaw) as JsonWebKey,
    subject: "mailto:virtualboy38@yahoo.com",
  };
}

export type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const toSub = (r: SubRow): PushSubscriptionKeys => ({
  endpoint: r.endpoint,
  keys: { p256dh: r.p256dh, auth: r.auth },
});

/* Short correlation fingerprint for an endpoint: enough to tell "same
   address" apart across log rows, useless for sending to it. */
export function endpointFp(endpoint: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < endpoint.length; i++) {
    h ^= endpoint.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function logPushEvent(
  userId: string | null,
  event: string,
  detail: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("push_debug_log").insert({
      user_id: userId,
      event,
      detail: JSON.stringify(detail),
    });
  } catch {
    /* logging must never break the operation */
  }
}

/* Send to a set of subscription rows; prunes dead endpoints. Every
   outcome is logged with the endpoint fingerprint and HTTP status: a
   send that silently deletes rows is how this stayed invisible. */
export async function deliver(
  rows: SubRow[],
  payload: Record<string, unknown>,
  via = "deliver",
) {
  const vapid = vapidConfig();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
      const { outcome, status } = await sendPush(toSub(r), body, vapid);
      await logPushEvent(r.user_id, "deliver", {
        via,
        fp: endpointFp(r.endpoint),
        verdict: outcome,
        status,
      });
      if (outcome === "sent") sent++;
      else if (outcome === "expired") {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", r.id);
      } else failed++;
    }),
  );
  return { sent, failed, total: rows.length };
}

export async function rowsForUsers(userIds: string[] | null): Promise<SubRow[]> {
  let q = supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");
  if (userIds && userIds.length) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SubRow[];
}

/* ---------- Editable automatic-alert copy (Admin > Push > Alerts) ----------
   Same model as Creator Shout: overrides live in the push_templates table.
   A saved row replaces the built-in copy per field (title, body, image);
   {variables} are substituted at send time; a row with empty title AND
   body (or no row) means the built-in wording below is used. */
const PUSH_TEMPLATE_DEFAULTS: Record<string, { title: string; body: string }> = {
  "bulletin.posted": {
    title: "A New Bulletin was Posted",
    body: "{subject}... see more",
  },
  "push.test": {
    title: "Testing, testing",
    body: "Looks like your notifications are enabled! I'll let you know stuff when it happens.",
  },
  "friend.request": {
    title: "New friend request",
    body: "{sender} wants to be your friend. Tap to view and respond.",
  },
  "game.invite": {
    title: "You're invited to a game!",
    body: "{inviter} invited you to play Bimyah! Tap to join game {code}.",
  },
};

function renderPushCopy(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z0-9_]+)\}/gi, (m, k) =>
    vars[k] == null ? m : String(vars[k]),
  );
}

export async function resolvePushCopy(
  key: string,
  vars: Record<string, string>,
): Promise<{ title: string; body: string; image?: string }> {
  const builtin = PUSH_TEMPLATE_DEFAULTS[key] ?? { title: "Bimyah!", body: "" };
  let title = builtin.title;
  let body = builtin.body;
  let image: string | undefined;
  try {
    const { data } = await supabaseAdmin
      .from("push_templates")
      .select("title, body, image_url")
      .eq("key", key)
      .maybeSingle();
    if (data) {
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.image_url) image = data.image_url;
    }
  } catch {
    /* table unreachable: built-in copy stands */
  }
  return {
    title: renderPushCopy(title, vars).slice(0, 120),
    body: renderPushCopy(body, vars).slice(0, 240),
    image,
  };
}

/* ---------- The one call automatic alerts make ----------
   Best-effort by design: a push must never fail the action that caused
   it (a friend request, a game invite). No subscribed devices is a
   normal outcome, not an error. Outcomes land in push_debug_log via
   deliver(), tagged with the template key. */
export async function notifyUsers(
  userIds: string[],
  opts: {
    key: string;
    vars: Record<string, string>;
    url: string;
    tag: string;
  },
): Promise<{ sent: number; failed: number; total: number }> {
  const zero = { sent: 0, failed: 0, total: 0 };
  try {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return zero;
    const rows = await rowsForUsers(ids);
    if (!rows.length) return zero;
    const copy = await resolvePushCopy(opts.key, opts.vars);
    return await deliver(
      rows,
      {
        title: copy.title,
        body: copy.body,
        url: opts.url,
        tag: opts.tag,
        ...(copy.image ? { image: copy.image } : {}),
      },
      opts.key,
    );
  } catch {
    return zero;
  }
}
