import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { PowLogo } from "@/components/game/Visuals";
import {
  getBplusStatus,
  getMyEntitlement,
  createLifetimeOrder,
  captureLifetimeOrder,
  getPaypalClientConfig,
} from "@/server/bplus.functions";

export const Route = createFileRoute("/plus")({
  head: () => ({
    meta: [
      { title: "BIMYAH!+ — Lifetime Founding Member" },
      {
        name: "description",
        content:
          "Become a Bimyah!+ Founding Member. $5 lifetime — limited preorder. Custom avatars, card backs, 8-player rooms.",
      },
    ],
  }),
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

  useEffect(() => {
    if (!user) {
      setEntitlement(null);
      return;
    }
    void getMyEntitlement().then(setEntitlement).catch(() => setEntitlement(null));
  }, [user]);

  const remaining = status.lifetime_remaining;
  const dollars = (status.lifetime_price_cents / 100).toFixed(2);
  const monthly = (status.monthly_price_cents / 100).toFixed(2);
  const annual = (status.annual_price_cents / 100).toFixed(2);

  const isPlus = entitlement?.is_plus ?? false;

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center px-4 py-6">
      <Link to="/" className="mb-2">
        <PowLogo size={120} />
      </Link>

      <div className="text-3d-yellow font-display text-center text-2xl font-black uppercase tracking-widest sm:text-3xl">
        Bimyah!<span className="text-[var(--gold)]">+</span>
      </div>
      <div className="mt-1 text-center text-[10px] uppercase tracking-[0.3em] text-white/50">
        Founding Member Preorder
      </div>

      {/* Status banners */}
      {success && (
        <div className="mt-4 w-full max-w-md rounded-xl border border-[var(--mint)]/40 bg-[var(--mint)]/10 p-4 text-center">
          <div className="font-display text-lg font-black text-[var(--mint)]">
            Welcome, Founding Member!
          </div>
          <div className="mt-1 text-xs text-white/70">
            Your Bimyah!+ access is now active for life.
          </div>
          <Link to="/" className="btn-3d btn-3d-mint mt-3 inline-block text-xs">
            Back to home
          </Link>
        </div>
      )}

      {!success && isPlus && (
        <div className="mt-4 w-full max-w-md rounded-xl border border-[var(--gold)]/50 bg-black/40 p-4 text-center">
          <div className="font-display text-base font-black text-[var(--gold)]">
            You have Bimyah!+ ({entitlement?.plan})
          </div>
          {entitlement?.founding_member && (
            <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
              Founding Member
            </div>
          )}
        </div>
      )}

      {/* Pricing card */}
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
          <div className="mt-2 text-center text-[10px] uppercase tracking-widest text-white/40">
            After preorder: ${monthly}/mo or ${annual}/yr
          </div>

          <ul className="mt-4 space-y-2 text-sm text-white/80">
            <li>✦ Custom avatar in every game</li>
            <li>✦ Upload your own card backs</li>
            <li>✦ Host games up to 8 players (5–8 seat rooms)</li>
            <li>✦ Founding Member badge — yours forever</li>
            <li>✦ All future Bimyah!+ features included for life</li>
          </ul>

          {err && (
            <div className="mt-3 text-center text-xs text-[var(--player-red)]">
              {err}
            </div>
          )}

          <div className="mt-5">
            {authLoading ? null : !user ? (
              <button
                onClick={() => navigate({ to: "/auth" })}
                className="btn-3d btn-3d-gold w-full text-sm"
              >
                Sign in to claim your spot
              </button>
            ) : !status.preorder_open ? (
              <button
                disabled
                className="btn-3d btn-3d-dark w-full cursor-not-allowed text-sm opacity-60"
              >
                Sold out
              </button>
            ) : !PAYPAL_CLIENT_ID ? (
              <div className="rounded-lg border border-[var(--player-red)]/40 bg-black/40 p-3 text-center text-xs text-white/70">
                Checkout is not yet configured. Please check back shortly.
              </div>
            ) : (
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
                  forceReRender={[user.id, dollars]}
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
                      // Refresh entitlement + session.
                      void supabase.auth.refreshSession();
                      void getMyEntitlement().then(setEntitlement);
                    } catch (e) {
                      setErr((e as Error).message);
                    } finally {
                      setPaying(false);
                    }
                  }}
                  onCancel={() => {
                    setPaying(false);
                  }}
                  onError={(e) => {
                    setErr((e as { message?: string })?.message ?? "Payment error");
                    setPaying(false);
                  }}
                />
              </PayPalScriptProvider>
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
