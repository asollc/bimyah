import { useEffect, useState } from "react";
import { X, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BimbucksIcon, BimbitsIcon } from "./CurrencyIcons";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { hasStripeConfigured } from "@/lib/stripe";
import { getMyLedger } from "@/lib/rpc/decor.functions";

type Pack = { priceId: string; base: number; amount: number; priceUsd: number; bonusPct?: number };

const PACKS: Pack[] = [
  { priceId: "bimbucks_1000_onetime", base: 1000, amount: 1000, priceUsd: 1 },
  { priceId: "bimbucks_5000_onetime", base: 5000, amount: 5500, priceUsd: 5, bonusPct: 10 },
  { priceId: "bimbucks_10000_onetime", base: 10000, amount: 12000, priceUsd: 10, bonusPct: 20 },
];

type Wallet = { bimbucks: number; bimbits: number };

export function WalletOverlay({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [wallet, setWallet] = useState<Wallet>({ bimbucks: 0, bimbits: 0 });
  const [view, setView] = useState<"wallet" | "buy" | "checkout">("wallet");
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);

  async function loadWallet() {
    const { data } = await supabase
      .from("wallets")
      .select("bimbucks, bimbits")
      .eq("user_id", userId)
      .maybeSingle();
    setWallet({
      bimbucks: (data?.bimbucks as number) ?? 0,
      bimbits: (data?.bimbits as number) ?? 0,
    });
  }

  useEffect(() => {
    void loadWallet();
    // Realtime: refresh when wallet changes (e.g. webhook credits Bimbucks).
    const channel = supabase
      .channel(`wallet-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        () => void loadWallet(),
      )
      .subscribe();
    // Also poll on focus, as a safety net.
    const onFocus = () => void loadWallet();
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
      <div className="relative my-auto w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-[#0a0d0a] p-5 shadow-2xl">

        <div className="flex items-center justify-between">
          {view !== "wallet" ? (
            <button
              type="button"
              onClick={() => {
                if (view === "checkout") {
                  setSelectedPack(null);
                  setView("buy");
                } else {
                  setView("wallet");
                }
              }}
              className="text-white/60 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span />
          )}
          <h2 className="font-display text-lg uppercase tracking-widest text-[var(--gold)]">
            {view === "wallet" ? "Wallet" : view === "buy" ? "Buy Bimbucks" : "Checkout"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {view === "wallet" && (
          <div className="mt-5 flex flex-col gap-3">
            <BalanceRow
              icon={<BimbucksIcon size={28} />}
              label="Bimbucks"
              sublabel="Purchased currency"
              value={wallet.bimbucks}
            />
            <BalanceRow
              icon={<BimbitsIcon size={28} />}
              label="Bimbits"
              sublabel="Earned by completing tasks"
              value={wallet.bimbits}
            />
            <button
              type="button"
              onClick={() => setView("buy")}
              className="btn-3d btn-3d-gold mt-4 inline-flex items-center justify-center gap-2 text-xs"
            >
              <BimbucksIcon size={14} /> Buy Bimbucks
            </button>
          </div>
        )}

        {view === "buy" && (
          <div className="mt-5 flex flex-col gap-3">
            {!hasStripeConfigured() && (
              <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center text-xs text-white/60">
                Payments are not configured yet. Please try again soon.
              </div>
            )}
            {PACKS.map((pack) => (
              <button
                key={pack.priceId}
                type="button"
                disabled={!hasStripeConfigured()}
                onClick={() => {
                  setSelectedPack(pack);
                  setView("checkout");
                }}
                className="flex items-center justify-between rounded-xl border border-[var(--gold)]/30 bg-black/40 px-4 py-3 text-left transition hover:border-[var(--gold)]/70 hover:bg-black/60 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <BimbucksIcon size={28} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base text-white">
                        {pack.amount.toLocaleString()} Bimbucks
                      </span>
                      {pack.bonusPct ? (
                        <span className="rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
                          +{pack.bonusPct}% bonus
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-white/50">
                      {pack.bonusPct
                        ? `${pack.base.toLocaleString()} + ${(pack.amount - pack.base).toLocaleString()} bonus`
                        : "One-time purchase"}
                    </div>
                  </div>
                </div>
                <div className="font-display text-lg text-[var(--gold)]">
                  ${pack.priceUsd}
                </div>
              </button>
            ))}
          </div>
        )}

        {view === "checkout" && selectedPack && (
          <div className="mt-5">
            <div className="mb-3 rounded-lg border border-[var(--gold)]/30 bg-black/40 px-3 py-2 text-center text-xs text-white/80">
              <BimbucksIcon size={14} className="mr-1" />
              {selectedPack.amount.toLocaleString()} Bimbucks — ${selectedPack.priceUsd}
            </div>
            <StripeEmbeddedCheckout
              priceId={selectedPack.priceId}
              returnUrl={`${window.location.origin}/profile?bimbucks=success&session_id={CHECKOUT_SESSION_ID}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceRow({
  icon,
  label,
  sublabel,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="font-display text-sm uppercase tracking-widest text-white">
            {label}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            {sublabel}
          </div>
        </div>
      </div>
      <div className="font-display text-xl text-[var(--gold)]">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
