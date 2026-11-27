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

async function grantLifetimeToUser(
  sb: ReturnType<typeof createClient>,
  recipientUserId: string,
  env: StripeEnv,
  source: string,
  sessionId: string | null,
  amountCents: number,
  currency: string,
): Promise<string | null> {
  // Skip if recipient already has an active sub
  const { data: existing } = await sb
    .from("subscriptions")
    .select("id")
    .eq("user_id", recipientUserId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: subRow, error: subErr } = await sb
    .from("subscriptions")
    .insert({
      user_id: recipientUserId,
      plan: "lifetime",
      status: "active",
      source,
      environment: env,
      price_id: "bplus_lifetime_onetime",
    })
    .select("id")
    .single();
  if (subErr || !subRow) {
    console.error("Failed to insert gifted lifetime sub:", subErr);
    return null;
  }
  await sb.from("payments").insert({
    user_id: recipientUserId,
    subscription_id: subRow.id,
    amount_cents: amountCents,
    currency,
    plan: "lifetime",
    status: "completed",
    stripe_session_id: sessionId,
    environment: env,
  });
  await sb.from("founding_members").insert({ user_id: recipientUserId }).select();
  return subRow.id as string;
}

async function handleGiftCheckout(session: any, env: StripeEnv) {
  if (session.payment_status !== "paid") return;
  const sb = getSupabase();
  const purchaserId: string = session.metadata.userId;
  const priceId: string = session.metadata.priceId;
  const giftType: "friend" | "random" = session.metadata.giftType;
  const quantity = Math.max(1, Number(session.metadata.giftQuantity ?? 1));
  const recipientUserId: string | null = session.metadata.recipientUserId ?? null;
  const recipientEmail: string | null = session.metadata.recipientEmail ?? null;
  const currency = (session.currency ?? "usd").toUpperCase();
  const unitAmount = Math.round((session.amount_total ?? 500 * quantity) / quantity);

  // Idempotency: skip if we've already processed this session
  const { data: existing } = await sb
    .from("bplus_gifts")
    .select("id")
    .eq("stripe_session_id", session.id)
    .limit(1);
  if (existing && existing.length) return;

  if (giftType === "friend" && recipientUserId) {
    const subId = await grantLifetimeToUser(
      sb, recipientUserId, env, "stripe_gift_friend",
      session.id, unitAmount, currency,
    );
    await sb.from("bplus_gifts").insert({
      purchaser_id: purchaserId,
      gift_type: "friend",
      status: subId ? "fulfilled" : "pending",
      stripe_session_id: session.id,
      amount_cents: unitAmount,
      currency,
      environment: env,
      recipient_email: recipientEmail,
      recipient_user_id: recipientUserId,
      subscription_id: subId,
      allocated_at: subId ? new Date().toISOString() : null,
    });
    return;
  }

  if (giftType === "random") {
    // Insert one pending row per gifted membership
    const rows = Array.from({ length: quantity }, () => ({
      purchaser_id: purchaserId,
      gift_type: "random" as const,
      status: "pending" as const,
      stripe_session_id: session.id,
      amount_cents: unitAmount,
      currency,
      environment: env,
    }));
    await sb.from("bplus_gifts").insert(rows);
  }
}

const BIMBUCKS_AMOUNTS: Record<string, number> = {
  bimbucks_1000_onetime: 1000,
  bimbucks_5000_onetime: 5500,
  bimbucks_10000_onetime: 12000,
};

async function handleBimbucksCheckout(session: any, userId: string, priceId: string, env: StripeEnv) {
  if (session.payment_status !== "paid") return;
  const amount = BIMBUCKS_AMOUNTS[priceId];
  if (!amount) return;
  const sb = getSupabase();

  // Idempotency
  const { data: existing } = await sb
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return;

  const { error: creditErr } = await sb.rpc("credit_bimbucks", {
    _user_id: userId,
    _amount: amount,
  });
  if (creditErr) {
    console.error("credit_bimbucks failed:", creditErr);
    return;
  }

  await sb.from("payments").insert({
    user_id: userId,
    amount_cents: session.amount_total ?? 0,
    currency: (session.currency ?? "usd").toUpperCase(),
    plan: "lifetime",
    status: "completed",
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    environment: env,
    raw: { kind: "bimbucks", priceId, amount, session },
  });
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const userId: string | undefined = session.metadata?.userId;
  const priceId: string | undefined = session.metadata?.priceId;
  if (!userId || !priceId) {
    console.error("checkout.session.completed missing metadata", session.id);
    return;
  }
  // Bimbucks purchases credit the player's wallet.
  if (BIMBUCKS_AMOUNTS[priceId]) {
    await handleBimbucksCheckout(session, userId, priceId, env);
    return;
  }
  // Route gift checkouts to a separate handler — they do NOT consume a
  // lifetime slot and don't grant entitlement to the purchaser.
  if (priceId === "bplus_gift_friend_onetime" || priceId === "bplus_gift_random_onetime") {
    await handleGiftCheckout(session, env);
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
