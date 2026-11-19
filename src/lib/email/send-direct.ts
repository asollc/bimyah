import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Direct email sending (Ronya's call, 2026-10-24): no queue.
// Every email is sent through Resend at the moment it is triggered
// (signup whitelist mail, game invites). The old design enqueued
// into pgmq and relied on a pg_cron-driven processor route to drain
// every 30 seconds; that pipeline died silently once (mail stopped
// 2026-09-07) and Ronya does not want a queue in the path at all.
// The pg_cron job and the processor route are retired, the queues
// are purged, and this helper is the only send path.
//
// The caller inserts the email_send_log row as "pending" first;
// this helper flips it to "sent" or "failed" for the same
// message_id, so the log stays truthful.

export type DirectEmailPayload = {
  message_id: string;
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  unsubscribe_token?: string;
  idempotency_key?: string;
};

async function markLog(messageId: string, status: string, errorMessage?: string) {
  await supabaseAdmin
    .from("email_send_log")
    .update({ status, ...(errorMessage ? { error_message: errorMessage } : {}) })
    .eq("message_id", messageId)
    .eq("status", "pending");
}

export async function sendEmailDirect(
  payload: DirectEmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await markLog(payload.message_id, "failed", "RESEND_API_KEY is not set");
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  const headers: Record<string, string> = {};
  if (payload.unsubscribe_token) {
    headers["List-Unsubscribe"] =
      `<https://playbimyah.com/unsubscribe?token=${payload.unsubscribe_token}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(payload.idempotency_key
          ? { "Idempotency-Key": payload.idempotency_key }
          : {}),
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers,
      }),
    });
    if (res.status >= 200 && res.status < 300) {
      await markLog(payload.message_id, "sent");
      return { ok: true };
    }
    const bodyText = await res.text();
    const error = `Resend HTTP ${res.status}: ${bodyText.slice(0, 300)}`;
    await markLog(payload.message_id, "failed", error);
    return { ok: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await markLog(payload.message_id, "failed", error);
    return { ok: false, error };
  }
}
