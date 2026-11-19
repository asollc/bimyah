import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_PRICE_IDS = new Set([
  "bplus_lifetime_onetime",
  "bplus_monthly",
  "bplus_yearly",
  "bplus_gift_friend_onetime",
  "bplus_gift_random_onetime",
  "bimbucks_1000_onetime",
  "bimbucks_5000_onetime",
  "bimbucks_10000_onetime",
]);

const GIFT_PRICE_IDS = new Set([
  "bplus_gift_friend_onetime",
  "bplus_gift_random_onetime",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const priceId = String(body?.priceId ?? "");
    const returnUrl = String(body?.returnUrl ?? "");
    const rawEnv = String(body?.environment ?? "");
    const quantity = Math.max(1, Math.min(50, Number(body?.quantity ?? 1) || 1));
    const giftType = body?.giftType === "friend" || body?.giftType === "random"
      ? (body.giftType as "friend" | "random")
      : null;
    const recipientEmail = typeof body?.recipientEmail === "string"
      ? body.recipientEmail.trim().toLowerCase().slice(0, 255)
      : null;

    if (!ALLOWED_PRICE_IDS.has(priceId)) throw new Error("Invalid priceId");
    if (!/^https?:\/\//.test(returnUrl)) throw new Error("Invalid returnUrl");
    if (rawEnv !== "sandbox" && rawEnv !== "live") throw new Error("Invalid environment");
    const env: StripeEnv = rawEnv;

    // Gift consistency checks
    const isGift = GIFT_PRICE_IDS.has(priceId);
    if (isGift) {
      if (!giftType) throw new Error("giftType required for gift purchases");
      if (priceId === "bplus_gift_friend_onetime") {
        if (giftType !== "friend") throw new Error("Mismatched gift price/type");
        if (quantity !== 1) throw new Error("Friend gifts must have quantity 1");
        if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
          throw new Error("Valid recipient email required for friend gifts");
        }
      }
      if (priceId === "bplus_gift_random_onetime") {
        if (giftType !== "random") throw new Error("Mismatched gift price/type");
      }
    }

    // Optional auth — required for all purchases
    let userId: string | null = null;
    let customerEmail: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data } = await sb.auth.getUser(token);
      if (data.user) {
        userId = data.user.id;
        customerEmail = data.user.email ?? null;
      }
    }
    if (!userId) throw new Error("You must be signed in to checkout");

    // For self-purchase lifetime, enforce slot still available.
    // Gifts do NOT consume the lifetime slot pool — they're a separate product.
    if (priceId === "bplus_lifetime_onetime") {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: cfg } = await sb
        .from("bplus_config")
        .select("lifetime_quota, lifetime_sold")
        .eq("id", 1)
        .single();
      if (!cfg || cfg.lifetime_sold >= cfg.lifetime_quota) {
        throw new Error("Lifetime preorder is sold out");
      }
    }

    // For friend gifts, verify recipient email maps to a real user before charging.
    let recipientUserId: string | null = null;
    if (isGift && giftType === "friend" && recipientEmail) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      // Search auth users for matching email (paginated lookup)
      const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = users?.users.find(
        (u) => u.email?.toLowerCase() === recipientEmail
      );
      if (!match) throw new Error("No member found with that email");
      if (match.id === userId) throw new Error("You can't gift yourself");
      // Reject if recipient already has active sub
      const { data: existing } = await sb
        .from("subscriptions")
        .select("id")
        .eq("user_id", match.id)
        .eq("status", "active")
        .maybeSingle();
      if (existing) throw new Error("That member already has Bimyah!+");
      recipientUserId = match.id;
    }

    const stripe = createStripeClient(env);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    const metadata: Record<string, string> = {
      userId,
      priceId,
    };
    if (isGift && giftType) metadata.giftType = giftType;
    if (recipientUserId) metadata.recipientUserId = recipientUserId;
    if (recipientEmail) metadata.recipientEmail = recipientEmail;
    if (isGift) metadata.giftQuantity = String(quantity);

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata,
      ...(isRecurring && {
        subscription_data: { metadata },
      }),
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Checkout failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
