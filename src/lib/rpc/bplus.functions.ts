import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { paypalFetch } from "@/lib/server/paypal.server";

// Expose only the client id (publishable, safe in browser) to the SPA so it
// can mount PayPal Smart Buttons.
export const getPaypalClientConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      clientId: process.env.PAYPAL_CLIENT_ID ?? "",
      env: (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase(),
    };
  }
);

type BplusConfigRow = {
  lifetime_quota: number;
  lifetime_sold: number;
  lifetime_price_cents: number;
  monthly_price_cents: number;
  annual_price_cents: number;
};

// ---------- Public status (no auth required) ----------
export const getBplusStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("bplus_config")
      .select(
        "lifetime_quota, lifetime_sold, lifetime_price_cents, monthly_price_cents, annual_price_cents"
      )
      .eq("id", 1)
      .single<BplusConfigRow>();
    if (error || !data) {
      return {
        lifetime_remaining: 0,
        lifetime_quota: 100,
        lifetime_sold: 0,
        lifetime_price_cents: 500,
        monthly_price_cents: 200,
        annual_price_cents: 2000,
        preorder_open: false,
      };
    }
    return {
      lifetime_quota: data.lifetime_quota,
      lifetime_sold: data.lifetime_sold,
      lifetime_remaining: Math.max(data.lifetime_quota - data.lifetime_sold, 0),
      lifetime_price_cents: data.lifetime_price_cents,
      monthly_price_cents: data.monthly_price_cents,
      annual_price_cents: data.annual_price_cents,
      preorder_open: data.lifetime_sold < data.lifetime_quota,
    };
  }
);

// ---------- Authed: am I a B+ member? ----------
// Returns a safe "not plus" default for unauthenticated callers instead of
// throwing a 401 Response (which surfaces as "[object Response]" in the
// browser's global error handler and triggers the blank-screen detector).
export const getMyEntitlement = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    const empty = {
      is_plus: false,
      plan: null as string | null,
      current_period_end: null as string | null,
      founding_member: false,
    };
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return empty;

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return empty;
    const token = authHeader.slice("Bearer ".length);
    if (!token) return empty;

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } =
      await supabase.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) return empty;

    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan, status, current_period_end, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1);
    const sub = subs?.[0] ?? null;
    const { data: founder } = await supabaseAdmin
      .from("founding_members")
      .select("user_id, granted_at")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      is_plus: !!sub,
      plan: sub?.plan ?? null,
      current_period_end: sub?.current_period_end ?? null,
      founding_member: !!founder,
    };
  }
);

// ---------- Create the PayPal order for $5 lifetime ----------
export const createLifetimeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Reject if user already has an active subscription.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1);
    if (existing && existing.length) {
      throw new Error("You already have Bimyah!+");
    }

    // Read live price + remaining quota from DB.
    const { data: cfg } = await supabaseAdmin
      .from("bplus_config")
      .select("lifetime_quota, lifetime_sold, lifetime_price_cents")
      .eq("id", 1)
      .single<{
        lifetime_quota: number;
        lifetime_sold: number;
        lifetime_price_cents: number;
      }>();
    if (!cfg) throw new Error("Pricing unavailable");
    if (cfg.lifetime_sold >= cfg.lifetime_quota) {
      throw new Error("Lifetime preorder is sold out");
    }

    const dollars = (cfg.lifetime_price_cents / 100).toFixed(2);

    const order = await paypalFetch<{ id: string; status: string }>(
      "/v2/checkout/orders",
      {
        method: "POST",
        json: {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: `bplus_lifetime:${userId}`,
              description: "Bimyah!+ Lifetime (Founding Member)",
              custom_id: userId,
              amount: { currency_code: "USD", value: dollars },
            },
          ],
          application_context: {
            brand_name: "Bimyah!",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
          },
        },
      }
    );

    return { orderId: order.id };
  });

// ---------- Capture & grant entitlement ----------
const captureSchema = z.object({ orderId: z.string().min(5).max(64) });

export const captureLifetimeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => captureSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { orderId } = data;

    type CaptureResp = {
      id: string;
      status: string;
      purchase_units: Array<{
        custom_id?: string;
        payments?: {
          captures?: Array<{
            id: string;
            status: string;
            amount: { value: string; currency_code: string };
          }>;
        };
      }>;
    };

    const cap = await paypalFetch<CaptureResp>(
      `/v2/checkout/orders/${orderId}/capture`,
      { method: "POST", json: {} }
    );

    if (cap.status !== "COMPLETED") {
      throw new Error(`Capture not completed: ${cap.status}`);
    }

    const capture = cap.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== "COMPLETED") {
      throw new Error("Missing completed capture");
    }
    const customId = cap.purchase_units?.[0]?.custom_id;
    if (customId && customId !== userId) {
      throw new Error("Order user mismatch");
    }

    const amountCents = Math.round(parseFloat(capture.amount.value) * 100);
    const currency = capture.amount.currency_code;

    // Idempotency: if we've already recorded this capture, just return success.
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("paypal_capture_id", capture.id)
      .maybeSingle();

    if (existingPayment) {
      return { ok: true, alreadyRecorded: true };
    }

    // Atomically claim a lifetime slot.
    const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
      "claim_lifetime_slot"
    );
    if (claimErr || !claimed) {
      // Sold out between order create + capture. Refund.
      try {
        await paypalFetch(`/v2/payments/captures/${capture.id}/refund`, {
          method: "POST",
          json: {},
        });
      } catch (e) {
        console.error("Refund after sold-out failed:", e);
      }
      throw new Error(
        "Lifetime preorder just sold out — your payment has been refunded."
      );
    }

    // Create the active subscription row.
    const { data: subRow, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan: "lifetime",
        status: "active",
        source: "paypal",
      })
      .select("id")
      .single();
    if (subErr || !subRow) {
      // Roll back the slot.
      await supabaseAdmin.rpc("release_lifetime_slot");
      throw new Error("Failed to record subscription");
    }

    // Record the payment.
    await supabaseAdmin.from("payments").insert({
      user_id: userId,
      subscription_id: subRow.id,
      amount_cents: amountCents,
      currency,
      plan: "lifetime" as const,
      status: "completed" as const,
      paypal_order_id: orderId,
      paypal_capture_id: capture.id,
      raw: JSON.parse(JSON.stringify(cap)),
    });

    // Founding member badge.
    await supabaseAdmin
      .from("founding_members")
      .insert({ user_id: userId })
      .select();

    return { ok: true, founding: true };
  });
