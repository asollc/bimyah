import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook, createStripeClient } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _supabase;
}

function planFromPriceId(priceId: string | undefined): "lifetime" | "monthly" | "annual" | null {
  if (priceId === "bplus_lifetime_onetime") return "lifetime";
  if (priceId === "bplus_monthly") return "monthly";
  if (priceId === "bplus_yearly") return "annual";
  return null;
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const userId: string | undefined = session.metadata?.userId;
  const priceId: string | undefined = session.metadata?.priceId;
  if (!userId || !priceId) {
    console.error("checkout.session.completed missing metadata", session.id);
    return;
  }
  if (priceId !== "bplus_lifetime_onetime") return; // subscriptions handled separately
  if (session.payment_status !== "paid") return;

  const sb = getSupabase();

  // Idempotency
  const { data: existing } = await sb
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return;

  // Claim a lifetime slot
  const { data: claimed, error: claimErr } = await sb.rpc("claim_lifetime_slot");
  if (claimErr || !claimed) {
    console.error("Could not claim lifetime slot — refunding", claimErr);
    try {
      const stripe = createStripeClient(env);
      if (session.payment_intent) {
        await stripe.refunds.create({ payment_intent: session.payment_intent });
      }
    } catch (e) {
      console.error("Refund failed:", e);
    }
    return;
  }

  const { data: subRow, error: subErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan: "lifetime",
      status: "active",
      source: "stripe",
      environment: env,
      price_id: priceId,
      stripe_customer_id: session.customer ?? null,
    })
    .select("id")
    .single();
  if (subErr || !subRow) {
    await sb.rpc("release_lifetime_slot");
    console.error("Failed to insert lifetime subscription:", subErr);
    return;
  }

  await sb.from("payments").insert({
    user_id: userId,
    subscription_id: subRow.id,
    amount_cents: session.amount_total ?? 500,
    currency: (session.currency ?? "usd").toUpperCase(),
    plan: "lifetime",
    status: "completed",
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    environment: env,
    raw: session,
  });

  await sb.from("founding_members").insert({ user_id: userId }).select();
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const userId: string | undefined = subscription.metadata?.userId;
  const priceId: string | undefined =
    subscription.metadata?.priceId ||
    subscription.items?.data?.[0]?.price?.metadata?.lovable_external_id;
  if (!userId) {
    console.error("subscription event missing userId", subscription.id);
    return;
  }
  const plan = planFromPriceId(priceId);
  if (!plan || plan === "lifetime") return;

  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const status = subscription.status === "active" || subscription.status === "trialing"
    ? "active"
    : subscription.status === "past_due"
      ? "past_due"
      : "cancelled";

  const sb = getSupabase();
  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status,
      source: "stripe",
      environment: env,
      price_id: priceId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
    },
    { onConflict: "stripe_subscription_id" }
  );
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const env: StripeEnv = rawEnv;
  try {
    const event = await verifyWebhook(req, env);
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object, env);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object, env);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, env);
        break;
      default:
        console.log("Unhandled event:", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
