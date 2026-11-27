import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reportSchema = z.object({
  route: z.string().nullable(),
  errorName: z.string().nullable(),
  errorMessage: z.string().nullable(),
  errorStack: z.string().nullable(),
  userAgent: z.string().nullable(),
});

/** Insert a bug report and ping Gigi instantly via Discord webhook.
 *  The webhook posts to #admin_chat mentioning @Gigi, which the existing
 *  admin-chat-watch picks up within 3 minutes. Webhook URL lives in the
 *  SUPPORT_WEBHOOK_URL Worker secret. */
export const reportBugToSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reportSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: inserted, error } = await supabase
      .from("bug_reports")
      .insert({
        user_id: userId,
        route: data.route,
        error_name: data.errorName,
        error_message: data.errorMessage,
        error_stack: data.errorStack,
        user_agent: data.userAgent,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not save bug report: ${error.message}`);
    }

    const webhookUrl = process.env.SUPPORT_WEBHOOK_URL;
    if (webhookUrl) {
      const summary = [
        `<@1553122049747066981> **New bug report** (${inserted.id.slice(0, 8)})`,
        `Route: ${data.route ?? "unknown"}`,
        `Error: ${data.errorName ?? "unknown"}: ${(data.errorMessage ?? "").slice(0, 300)}`,
        `User: ${userId.slice(0, 8)}`,
      ].join("\n");
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: summary }),
        });
      } catch {
        // Webhook failure should not fail the report itself
      }
    }

    return { ok: true, id: inserted.id };
  });
