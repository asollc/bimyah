import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyUsers } from "@/lib/server/pushNotify";
import * as React from "react";
import { render } from "@react-email/components";
import { template as gameInviteTemplate } from "@/lib/email-templates/game-invite";
import { sendEmailDirect } from "@/lib/email/send-direct";

const SITE_NAME = "bimyahcards";
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

      // Send immediately (no queue; Ronya's call, 2026-10-24).
      const sentRes = await sendEmailDirect({
        message_id: messageId,
        to: recipientEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        subject,
        html,
        text: plainText,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
      });

      if (!sentRes.ok) {
        failures.push(recipientName ?? fid);
        continue;
      }

      sent += 1;
    }

    // Push every invited friend as well (template: game.invite, Admin >
    // Push > Alerts). Independent of the email outcome: a suppressed or
    // spam-foldered email can still be reached by push. Best-effort:
    // notifyUsers never throws. The deep link is the join page for this
    // exact game, so a tap lands the friend straight in the lobby.
    let joinPath = `/join/${gameCode}`;
    try {
      joinPath = new URL(joinUrl).pathname || joinPath;
    } catch {
      /* keep the fallback path */
    }
    const push = await notifyUsers(allowedIds, {
      key: "game.invite",
      vars: { inviter: inviterName, code: gameCode },
      url: joinPath,
      tag: `bimyah-game-invite-${gameCode}`,
    });

    return { sent, failed: failures, pushed: push.sent };
  });
