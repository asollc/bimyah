import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { paypalFetch } from "@/lib/server/paypal.server";

// PayPal webhook for lifetime captures and refunds.
// Configure in PayPal Developer Dashboard → your app → Webhooks:
//   URL: https://playbimyah.com/api/public/paypal-webhook
//   Events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.DENIED
// Then save the resulting Webhook ID as the PAYPAL_WEBHOOK_ID secret.

export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        const body = await request.text();

        // Hard-fail if the webhook ID is not configured. Skipping signature
        // verification would let an attacker forge PAYMENT.CAPTURE.COMPLETED
        // events and grant themselves a free lifetime subscription.
        if (!webhookId) {
          console.error("PAYPAL_WEBHOOK_ID is not configured — refusing to process webhook");
          return new Response("Webhook not configured", { status: 500 });
        }

        try {
          const verifyRes = await paypalFetch<{ verification_status: string }>(
            "/v1/notifications/verify-webhook-signature",
            {
              method: "POST",
              json: {
                auth_algo: request.headers.get("paypal-auth-algo"),
                cert_url: request.headers.get("paypal-cert-url"),
                transmission_id: request.headers.get("paypal-transmission-id"),
                transmission_sig: request.headers.get("paypal-transmission-sig"),
                transmission_time: request.headers.get("paypal-transmission-time"),
                webhook_id: webhookId,
                webhook_event: JSON.parse(body),
              },
            }
          );
          if (verifyRes.verification_status !== "SUCCESS") {
            return new Response("Invalid signature", { status: 401 });
          }
        } catch (e) {
          console.error("Webhook verify error:", e);
          return new Response("Verify failed", { status: 401 });
        }


        let event: {
          event_type?: string;
          resource?: {
            id?: string;
            custom_id?: string;
            amount?: { value?: string; currency_code?: string };
            supplementary_data?: { related_ids?: { order_id?: string } };
          };
        };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const type = event.event_type ?? "";
        const captureId = event.resource?.id;

        if (type === "PAYMENT.CAPTURE.COMPLETED" && captureId) {
          // The /capture endpoint already handles this synchronously, but the
          // webhook is a safety net if the user closes the tab mid-capture.
          const { data: existing } = await supabaseAdmin
            .from("payments")
            .select("id")
            .eq("paypal_capture_id", captureId)
            .maybeSingle();

          if (!existing) {
            const userId = event.resource?.custom_id;
            const amount = event.resource?.amount;
            if (userId && amount?.value) {
              const { data: claimed } = await supabaseAdmin.rpc(
                "claim_lifetime_slot"
              );
              if (claimed) {
                const { data: subRow } = await supabaseAdmin
                  .from("subscriptions")
                  .insert({
                    user_id: userId,
                    plan: "lifetime",
                    status: "active",
                    source: "paypal",
                  })
                  .select("id")
                  .single();
                await supabaseAdmin.from("payments").insert({
                  user_id: userId,
                  subscription_id: subRow?.id ?? null,
                  amount_cents: Math.round(parseFloat(amount.value) * 100),
                  currency: amount.currency_code ?? "USD",
                  plan: "lifetime",
                  status: "completed",
                  paypal_order_id:
                    event.resource?.supplementary_data?.related_ids?.order_id ??
                    null,
                  paypal_capture_id: captureId,
                  raw: JSON.parse(JSON.stringify(event)),
                });
                await supabaseAdmin
                  .from("founding_members")
                  .insert({ user_id: userId });
              }
            }
          }
          return new Response("ok");
        }

        if (
          (type === "PAYMENT.CAPTURE.REFUNDED" ||
            type === "PAYMENT.CAPTURE.DENIED") &&
          captureId
        ) {
          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("id, user_id, subscription_id, plan, status")
            .eq("paypal_capture_id", captureId)
            .maybeSingle();
          if (payment && payment.status !== "refunded") {
            await supabaseAdmin
              .from("payments")
              .update({
                status: type === "PAYMENT.CAPTURE.REFUNDED" ? "refunded" : "failed",
              })
              .eq("id", payment.id);
            // Per user spec: failed payment = immediate downgrade.
            if (payment.subscription_id) {
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  status: "cancelled",
                  cancelled_at: new Date().toISOString(),
                })
                .eq("id", payment.subscription_id);
            }
            if (payment.plan === "lifetime") {
              await supabaseAdmin.rpc("release_lifetime_slot");
            }
          }
          return new Response("ok");
        }

        return new Response("ignored");
      },
    },
  },
});
