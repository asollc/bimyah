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
    if (!ALLOWED_PRICE_IDS.has(priceId)) throw new Error("Invalid priceId");
    if (!/^https?:\/\//.test(returnUrl)) throw new Error("Invalid returnUrl");
    if (rawEnv !== "sandbox" && rawEnv !== "live") throw new Error("Invalid environment");
    const env: StripeEnv = rawEnv;

    // Optional auth — attach userId if logged in
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

    // Lifetime: enforce slot still available
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

    const stripe = createStripeClient(env);
    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata: { userId, priceId },
      ...(isRecurring && {
        subscription_data: { metadata: { userId, priceId } },
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
