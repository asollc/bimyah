import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as React from "react";
import { render } from "@react-email/components";
import { template as gameInviteTemplate } from "@/lib/email-templates/game-invite";

const SITE_NAME = "bimyahcards";
const SENDER_DOMAIN = "notify.playbimyah.com";
const FROM_DOMAIN = "playbimyah.com";

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const inviteFriendsToGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        friendUserIds: z.array(z.string().uuid()).min(1).max(20),
        gameCode: z.string().min(1).max(16),
        joinUrl: z.string().url().max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { friendUserIds, gameCode, joinUrl } = data;

    // Inviter display name
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const inviterName =
      (inviterProfile as { display_name?: string } | null)?.display_name ?? "A friend";

    // Verify friendships (accepted) — only allow inviting accepted friends
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    const friendSet = new Set<string>();
    for (const f of (friendships ?? []) as Array<{
      requester_id: string;
      addressee_id: string;
    }>) {
      const other = f.requester_id === userId ? f.addressee_id : f.requester_id;
      friendSet.add(other);
    }

    const allowedIds = friendUserIds.filter((id) => friendSet.has(id));
    if (allowedIds.length === 0) {
      throw new Error("No valid friends selected.");
    }

    // Profiles for recipient names
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", allowedIds);
    const nameById = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string }>) {
      nameById.set(p.id, p.display_name);
    }

    let sent = 0;
    const failures: string[] = [];

    for (const fid of allowedIds) {
      // Look up email via admin auth API
      const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(fid);
      if (userErr || !userRes?.user?.email) {
        failures.push(nameById.get(fid) ?? fid);
        continue;
      }
      const recipientEmail = userRes.user.email;
      const recipientName = nameById.get(fid);

      // Suppression check
      const { data: suppressed } = await supabaseAdmin
        .from("suppressed_emails")
        .select("id")
        .eq("email", recipientEmail.toLowerCase())
        .maybeSingle();
      if (suppressed) {
        failures.push(recipientName ?? fid);
        continue;
      }

      // Unsubscribe token (one per email)
      const normalizedEmail = recipientEmail.toLowerCase();
      let unsubscribeToken: string;
      const { data: existingToken } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token, used_at")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (existingToken && !(existingToken as { used_at: string | null }).used_at) {
        unsubscribeToken = (existingToken as { token: string }).token;
      } else if (!existingToken) {
        unsubscribeToken = randomToken();
        await supabaseAdmin
          .from("email_unsubscribe_tokens")
          .upsert(
            { token: unsubscribeToken, email: normalizedEmail },
            { onConflict: "email", ignoreDuplicates: true },
          );
        const { data: stored } = await supabaseAdmin
          .from("email_unsubscribe_tokens")
          .select("token")
          .eq("email", normalizedEmail)
          .maybeSingle();
        if (stored) unsubscribeToken = (stored as { token: string }).token;
      } else {
        failures.push(recipientName ?? fid);
        continue;
      }

      const templateData = {
        inviterName,
        recipientName,
        joinUrl,
        gameCode,
      };
      const element = React.createElement(gameInviteTemplate.component, templateData);
      const html = await render(element);
      const plainText = await render(element, { plainText: true });
      const subject =
        typeof gameInviteTemplate.subject === "function"
          ? gameInviteTemplate.subject(templateData)
          : gameInviteTemplate.subject;

      const messageId = crypto.randomUUID();
      const idempotencyKey = `game-invite-${gameCode}-${userId}-${fid}`;

      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "game-invite",
        recipient_email: recipientEmail,
        status: "pending",
      });

      const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: recipientEmail,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: plainText,
          purpose: "transactional",
          label: "game-invite",
          idempotency_key: idempotencyKey,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqErr) {
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "game-invite",
          recipient_email: recipientEmail,
          status: "failed",
          error_message: "Failed to enqueue invite email",
        });
        failures.push(recipientName ?? fid);
        continue;
      }

      sent += 1;
    }

    return { sent, failed: failures };
  });
