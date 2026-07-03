import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { PowLogo } from "@/components/game/Visuals";
import { BplusIcon } from "@/components/BplusIcon";
import foundingCarderAsset from "@/assets/founding-carder.png.asset.json";
import foundingCarderNewAsset from "@/assets/founding-bimyah-carder-new.jpg.asset.json";
import bplusGoldAsset from "@/assets/bplus-gold.png.asset.json";
import bplusRedAsset from "@/assets/bplus-red.png.asset.json";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { hasStripeConfigured } from "@/lib/stripe";
import { Check, Loader2 } from "lucide-react";
import {
  getBplusStatus,
  getMyEntitlement,
  getPaypalClientConfig,
} from "@/lib/rpc/bplus.functions";
import { verifyGiftRecipient } from "@/lib/rpc/gifts.functions";

const STRIPE_LIFETIME_PRICE_ID = "bplus_lifetime_onetime";


type GiftMode = "friend" | "random";
const GIFT_PRICE_IDS: Record<GiftMode, string> = {
  friend: "bplus_gift_friend_onetime",
  random: "bplus_gift_random_onetime",
};

export const Route = createFileRoute("/plus")({
  head: () => {
    const title = "Bimyah!+ — Lifetime Founding Member";
    const description = "Become a Bimyah!+ Founding Member. $5 lifetime — one-time payment. Custom avatars, card backs, and 8-player rooms.";

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
  const { status } = Route.useLoaderData();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [entitlement, setEntitlement] = useState<{
    is_plus: boolean;
    plan: string | null;
    founding_member: boolean;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // Gift flow state
  const [giftMode, setGiftMode] = useState<GiftMode | null>(null);
  // Friend gift
  const [giftEmail, setGiftEmail] = useState("");
  const [giftEmailVerified, setGiftEmailVerified] = useState<{
    name: string;
  } | null>(null);
  const [giftEmailVerifying, setGiftEmailVerifying] = useState(false);
  const [giftEmailError, setGiftEmailError] = useState<string | null>(null);
  // Random gift
  const [randomQty, setRandomQty] = useState(1);
  const [randomAck, setRandomAck] = useState(false);
  // Both
  const [giftCheckoutOpen, setGiftCheckoutOpen] = useState(false);

  // Reset checkout when key inputs change
  useEffect(() => {
    setGiftCheckoutOpen(false);
  }, [giftMode, giftEmail, randomQty]);

  // Debounced email verification
  useEffect(() => {
    if (giftMode !== "friend") return;
    const email = giftEmail.trim().toLowerCase();
    setGiftEmailVerified(null);
    setGiftEmailError(null);
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setGiftEmailVerifying(true);
    const handle = setTimeout(async () => {
      try {
        const res = await verifyGiftRecipient({ data: { email } });
        if (res.found) {
          setGiftEmailVerified({ name: res.display_name });
        } else if ((res as { reason?: string }).reason === "self") {
          setGiftEmailError("You can't gift yourself");
        } else if ((res as { reason?: string }).reason === "already_plus") {
          setGiftEmailError("That member already has Bimyah!+");
        } else {
          setGiftEmailError("No member found with that email");
        }
      } catch (e) {
        setGiftEmailError((e as Error).message ?? "Lookup failed");
      } finally {
        setGiftEmailVerifying(false);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [giftMode, giftEmail]);

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

  const dollars = (status.lifetime_price_cents / 100).toFixed(2);

  const isPlus = entitlement?.is_plus ?? false;
  const stripeReady = hasStripeConfigured();
  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/plus/return`
    : "/plus/return";

  const perks = (
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
  );

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center px-4 py-6">
      <PaymentTestModeBanner />
      <Link to="/" className="mb-2 mt-2">
        <PowLogo size={156} />
      </Link>

      <div className="text-3d-yellow font-display flex items-center justify-center gap-2 text-center text-2xl font-black uppercase tracking-widest sm:text-3xl">
        <span>Bimyah!<span className="text-[var(--gold)]">+</span></span>
        <BplusIcon size={36} />
      </div>
      <div className="mt-1 text-center text-xs font-semibold uppercase tracking-widest text-[var(--gold)]/90 sm:text-sm">
        Only {status.lifetime_remaining}/{status.lifetime_quota} Founding Carder Accounts Left
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
        <div className="mt-5 w-full max-w-md rounded-2xl border border-[var(--gold)]/50 bg-black/50 p-5 backdrop-blur">
          <div className="font-display flex items-center justify-center gap-2 text-base font-black text-[var(--gold)]">
            <BplusIcon size={22} />
            <span>You have Bimyah!+</span>
          </div>
          {entitlement?.founding_member && (
            <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
              Founding Member
            </div>
          )}
          <div className="mt-3 text-center text-[11px] uppercase tracking-widest text-white/60">
            Your perks
          </div>
          {perks}
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

          {perks}

          {err && (
            <div className="mt-3 text-center text-xs text-[var(--player-red)]">
              {err}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {authLoading ? null : !user ? (
              <button
                onClick={() => navigate({ to: "/auth" })}
                className="btn-3d btn-3d-gold w-full text-xs text-center"
              >
                Sign in to upgrade
              </button>
            ) : stripeReady ? (
              <div className="space-y-2">
                {!showCheckout ? (
                  <button
                    type="button"
                    onClick={() => {
                      setErr(null);
                      setShowCheckout(true);
                    }}
                    className="btn-3d btn-3d-gold w-full text-xs"
                  >
                    Upgrade — ${dollars} lifetime
                  </button>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-lg bg-white">
                    <StripeEmbeddedCheckout
                      priceId={STRIPE_LIFETIME_PRICE_ID}
                      returnUrl={returnUrl}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--player-red)]/40 bg-black/40 p-3 text-center text-xs text-white/70">
                Checkout is not yet configured. Please check back shortly.
              </div>
            )}
          </div>
        </div>
      )}



      {!success && (
        <div className="mt-5 w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-black/50 p-5 backdrop-blur">
          <div className="font-display text-center text-[30px] font-black uppercase tracking-widest text-[var(--gold)]">
            B+ Exclusive Items
          </div>
          <div className="mt-4 flex flex-col items-center gap-4">
            <img
              src={foundingCarderAsset.url}
              alt="Founding Carder"
              className="h-auto w-full max-w-[140px] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
            <img
              src={foundingCarderNewAsset.url}
              alt="Founding Bimyah Carder"
              className="h-auto w-full max-w-[120px] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
            <div className="flex items-center justify-center gap-6">
              <img
                src={bplusGoldAsset.url}
                alt="B+ Gold Badge"
                className="h-auto w-28 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
                draggable={false}
              />
              <img
                src={bplusRedAsset.url}
                alt="B+ Red Badge"
                className="h-auto w-24 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}

      {!success && user && stripeReady && (
        <div className="mt-5 w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-black/50 p-5 backdrop-blur">
          <div className="font-display text-center text-lg font-black uppercase tracking-widest text-[var(--gold)]">
            Gift Bimyah!+
          </div>
          <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-white/60">
            Lifetime gift — ${dollars} each
          </div>

          <div className="mt-4 space-y-3">
            <fieldset className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-black/30 p-2 text-sm text-white/90 hover:border-[var(--gold)]/40">
                <input
                  type="radio"
                  name="giftMode"
                  checked={giftMode === "friend"}
                  onChange={() => setGiftMode("friend")}
                  className="accent-[var(--gold)]"
                />
                <span>Gift a friend</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-black/30 p-2 text-sm text-white/90 hover:border-[var(--gold)]/40">
                <input
                  type="radio"
                  name="giftMode"
                  checked={giftMode === "random"}
                  onChange={() => setGiftMode("random")}
                  className="accent-[var(--gold)]"
                />
                <span>Gift a random</span>
              </label>
            </fieldset>

            {giftMode === "friend" && (
              <div className="space-y-2">
                <label className="block text-[10px] uppercase tracking-widest text-white/60">
                  Recipient email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoComplete="off"
                    value={giftEmail}
                    onChange={(e) => setGiftEmail(e.target.value)}
                    placeholder="friend@example.com"
                    className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 pr-9 text-sm text-white placeholder:text-white/30 focus:border-[var(--gold)]/60 focus:outline-none"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    {giftEmailVerifying && (
                      <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                    )}
                    {!giftEmailVerifying && giftEmailVerified && (
                      <Check className="h-5 w-5 text-[var(--mint)]" strokeWidth={3} />
                    )}
                  </div>
                </div>
                {giftEmailVerified && (
                  <div className="text-xs text-[var(--mint)]">
                    ✓ Member found: {giftEmailVerified.name}
                  </div>
                )}
                {giftEmailError && (
                  <div className="text-xs text-[var(--player-red)]">
                    {giftEmailError}
                  </div>
                )}
                {giftEmailVerified && !giftCheckoutOpen && (
                  <button
                    type="button"
                    onClick={() => setGiftCheckoutOpen(true)}
                    className="btn-3d btn-3d-gold w-full text-[11px]"
                  >
                    Proceed to checkout
                  </button>
                )}
              </div>
            )}

            {giftMode === "random" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-widest text-white/60">
                    Quantity (1–50)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={randomQty}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isNaN(n)) return setRandomQty(1);
                      setRandomQty(Math.max(1, Math.min(50, n)));
                    }}
                    className="w-24 rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-[var(--gold)]/60 focus:outline-none"
                  />
                  <div className="text-xs text-white/60">
                    Total: ${(randomQty * status.lifetime_price_cents / 100).toFixed(2)}
                  </div>
                </div>
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-[11px] leading-relaxed text-yellow-100/90">
                  By choosing to "gift a random" you understand that this upgrade
                  will NOT be applied to your account, and that it will be given
                  to someone else within the community.
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-white/80">
                  <input
                    type="checkbox"
                    checked={randomAck}
                    onChange={(e) => setRandomAck(e.target.checked)}
                    className="mt-0.5 accent-[var(--gold)]"
                  />
                  <span>I acknowledge and agree.</span>
                </label>
                {randomAck && !giftCheckoutOpen && (
                  <button
                    type="button"
                    onClick={() => setGiftCheckoutOpen(true)}
                    className="btn-3d btn-3d-gold w-full text-[11px]"
                  >
                    Proceed to checkout
                  </button>
                )}
              </div>
            )}

            {giftCheckoutOpen && giftMode && (
              <div className="mt-3 overflow-hidden rounded-lg bg-white">
                <StripeEmbeddedCheckout
                  key={`gift-${giftMode}-${giftMode === "random" ? randomQty : giftEmail}`}
                  priceId={GIFT_PRICE_IDS[giftMode]}
                  returnUrl={returnUrl}
                  giftType={giftMode}
                  quantity={giftMode === "random" ? randomQty : 1}
                  recipientEmail={
                    giftMode === "friend" ? giftEmail.trim().toLowerCase() : undefined
                  }
                />
              </div>
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
