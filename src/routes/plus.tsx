import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { PowLogo } from "@/components/game/Visuals";
import { BplusIcon } from "@/components/BplusIcon";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { hasStripeConfigured } from "@/lib/stripe";
import {
  getBplusStatus,
  getMyEntitlement,
  createLifetimeOrder,
  captureLifetimeOrder,
  getPaypalClientConfig,
} from "@/server/bplus.functions";

type StripePlan = "lifetime" | "monthly" | "yearly";
const STRIPE_PRICE_IDS: Record<StripePlan, string> = {
  lifetime: "bplus_lifetime_onetime",
  monthly: "bplus_monthly",
  yearly: "bplus_yearly",
};

export const Route = createFileRoute("/plus")({
  head: () => {
    const title = "Bimyah!+ — Lifetime Founding Member";
    const description =
      "Become a Bimyah!+ Founding Member. $5 lifetime — limited preorder. Custom avatars, card backs, and 8-player rooms.";
    const image = "https://qorqfqwjmkyosplldovh.supabase.co/storage/v1/object/public/public-assets/og-bimyah.jpg";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:url", content: "https://playbimyah.com/plus" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: "https://playbimyah.com/plus" }],
    };
  },
  loader: async () => {
    const [status, paypal] = await Promise.all([
      getBplusStatus(),
      getPaypalClientConfig(),
    ]);
    return { status, paypal };
  },
  component: PlusPage,
});

function PlusPage() {
  const { status, paypal } = Route.useLoaderData();
  const PAYPAL_CLIENT_ID = paypal.clientId;
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [entitlement, setEntitlement] = useState<{
    is_plus: boolean;
    plan: string | null;
    founding_member: boolean;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [stripePlan, setStripePlan] = useState<StripePlan | null>(null);

  const refreshEntitlement = async () => {
    try {
      const nextEntitlement = await getMyEntitlement();
      setEntitlement(nextEntitlement);
      return nextEntitlement;
    } catch (e) {
      console.warn("getMyEntitlement failed:", e);
      setEntitlement(null);
      return null;
    }
  };

  useEffect(() => {
    if (!user) {
      setEntitlement(null);
      return;
    }
    void refreshEntitlement();
  }, [user]);

  const remaining = status.lifetime_remaining;
  const dollars = (status.lifetime_price_cents / 100).toFixed(2);
  const monthly = (status.monthly_price_cents / 100).toFixed(2);
  const annual = (status.annual_price_cents / 100).toFixed(2);

  const isPlus = entitlement?.is_plus ?? false;
  const stripeReady = hasStripeConfigured();
  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/plus/return`
    : "/plus/return";

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center px-4 py-6">
      <PaymentTestModeBanner />
      <Link to="/" className="mb-2 mt-2">
        <PowLogo size={120} />
      </Link>

      <div className="text-3d-yellow font-display flex items-center justify-center gap-2 text-center text-2xl font-black uppercase tracking-widest sm:text-3xl">
        <span>Bimyah!<span className="text-[var(--gold)]">+</span></span>
        <BplusIcon size={36} />
      </div>
      <div className="mt-1 text-center text-[10px] uppercase tracking-[0.3em] text-stone-950">
        Founding Member Preorder
      </div>

      {success && (
        <div className="mt-4 w-full max-w-md rounded-xl border border-[var(--mint)]/40 bg-[var(--mint)]/10 p-4 text-center">
          <div className="font-display text-lg font-black text-[var(--mint)]">
            Welcome, Founding Member!
          </div>
          <div className="mt-1 text-xs text-white/70">
            Your Bimyah!+ access is now active.
          </div>
          <Link to="/" className="btn-3d btn-3d-mint mt-3 inline-block text-xs">
            Back to home
          </Link>
        </div>
      )}

      {!success && isPlus && (
        <div className="mt-4 w-full max-w-md rounded-xl border border-[var(--gold)]/50 bg-black/40 p-4 text-center">
          <div className="font-display flex items-center justify-center gap-2 text-base font-black text-[var(--gold)]">
            <BplusIcon size={22} />
            <span>You have Bimyah!+ ({entitlement?.plan})</span>
          </div>
          {entitlement?.founding_member && (
            <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
              Founding Member
            </div>
          )}
        </div>
      )}

      {!success && !isPlus && (
        <div className="mt-5 w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-black/50 p-5 backdrop-blur">
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-display text-5xl font-black text-[var(--gold)]">
              ${dollars}
            </span>
            <span className="text-xs uppercase tracking-widest text-white/50">
              one-time / lifetime
            </span>
          </div>
          <div className="mt-2 text-center text-[11px] uppercase tracking-widest text-white/60">
            {status.preorder_open ? (
              <>
                Only{" "}
                <span className="font-black text-[var(--mint)]">{remaining}</span>{" "}
                of {status.lifetime_quota} lifetime spots left
              </>
            ) : (
              <span className="text-[var(--player-red)]">
                Sold out — preorder closed
              </span>
            )}
          </div>
          <div className="mt-2 text-center text-[10px] uppercase tracking-widest text-yellow-400">
            After preorder expires: ${monthly}/mo or ${annual}/yr
          </div>

          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>✦ Custom avatar in every game</li>
            <li>✦ Display your badges in-game</li>
            <li>✦ Upload your own card backs</li>
            <li>✦ Access to members only tournaments</li>
            <li>✦ Access to the Bimyah! market where cards, sounds and other cosmetics can be purchased</li>
            <li>✦ Host games up to 8 players (5–8 seat rooms)</li>
            <li>✦ Founding Carder title and diamond card</li>
            <li>✦ Exclusive Discord roles</li>
            <li>✦ All future Bimyah!+ features included for life</li>
          </ul>

          {err && (
            <div className="mt-3 text-center text-xs text-[var(--player-red)]">
              {err}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {authLoading ? null : !user ? (
              <button
                onClick={() => navigate({ to: "/auth" })}
                className="btn-3d btn-3d-gold mx-auto block w-[70%] text-xs text-center"
              >
                GIMME THESE PERKS!
              </button>
            ) : (
              <>
                {/* Stripe (card) checkout */}
                {stripeReady && (
                  <div className="space-y-2">
                    <div className="text-center text-[10px] uppercase tracking-widest text-white/50">
                      Pay with card
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!status.preorder_open}
                        onClick={() => {
                          setErr(null);
                          setStripePlan("lifetime");
                        }}
                        className={`btn-3d ${stripePlan === "lifetime" ? "btn-3d-gold" : "btn-3d-dark"} text-[11px] disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Lifetime ${dollars}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErr(null);
                          setStripePlan("monthly");
                        }}
                        className={`btn-3d ${stripePlan === "monthly" ? "btn-3d-gold" : "btn-3d-dark"} text-[11px]`}
                      >
                        ${monthly}/mo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErr(null);
                          setStripePlan("yearly");
                        }}
                        className={`btn-3d ${stripePlan === "yearly" ? "btn-3d-gold" : "btn-3d-dark"} text-[11px]`}
                      >
                        ${annual}/yr
                      </button>
                    </div>
                    {stripePlan && (
                      <div className="mt-3 overflow-hidden rounded-lg bg-white">
                        <StripeEmbeddedCheckout
                          key={stripePlan}
                          priceId={STRIPE_PRICE_IDS[stripePlan]}
                          returnUrl={returnUrl}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* PayPal — hidden for now */}
                {false && status.preorder_open && PAYPAL_CLIENT_ID && (
                  <div className="space-y-2">
                    <div className="text-center text-[10px] uppercase tracking-widest text-white/50">
                      Or pay with PayPal (lifetime only)
                    </div>
                    <PayPalScriptProvider
                      options={{
                        clientId: PAYPAL_CLIENT_ID,
                        currency: "USD",
                        intent: "capture",
                      }}
                    >
                      <PayPalButtons
                        style={{
                          layout: "vertical",
                          color: "gold",
                          shape: "pill",
                          label: "paypal",
                        }}
                        disabled={paying}
                        forceReRender={[user?.id ?? "", dollars]}
                        createOrder={async () => {
                          setErr(null);
                          setPaying(true);
                          try {
                            const { orderId } = await createLifetimeOrder();
                            return orderId;
                          } catch (e) {
                            setErr((e as Error).message);
                            setPaying(false);
                            throw e;
                          }
                        }}
                        onApprove={async (data) => {
                          try {
                            await captureLifetimeOrder({
                              data: { orderId: data.orderID },
                            });
                            setSuccess(true);
                            void supabase.auth.refreshSession();
                            void refreshEntitlement();
                          } catch (e) {
                            setErr((e as Error).message);
                          } finally {
                            setPaying(false);
                          }
                        }}
                        onCancel={() => setPaying(false)}
                        onError={(e) => {
                          setErr((e as { message?: string })?.message ?? "Payment error");
                          setPaying(false);
                        }}
                      />
                    </PayPalScriptProvider>
                  </div>
                )}

                {!stripeReady && !PAYPAL_CLIENT_ID && (
                  <div className="rounded-lg border border-[var(--player-red)]/40 bg-black/40 p-3 text-center text-xs text-white/70">
                    Checkout is not yet configured. Please check back shortly.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Link
        to="/"
        className="mt-6 text-xs uppercase tracking-widest text-white/50 hover:text-white"
      >
        ← Back to home
      </Link>
    </div>
  );
}
