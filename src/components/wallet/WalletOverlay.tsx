import { useEffect, useState } from "react";
import { X, ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { sendBimbucks } from "@/lib/rpc/transfers.functions";
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
  const [view, setView] = useState<"wallet" | "buy" | "checkout" | "share">("wallet");
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareAmount, setShareAmount] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  type LedgerRow = {
    id: string;
    item_name: string;
    currency: string;
    price: number;
    created_at: string;
  };
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

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

  async function loadLedger() {
    try {
      const res = await getMyLedger();
      setLedger(res.rows as LedgerRow[]);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadWallet();
    void loadLedger();
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
                  setShareError(null);
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
            {view === "wallet"
              ? "Wallet"
              : view === "buy"
                ? "Buy Bimbucks"
                : view === "share"
                  ? "Send Bimbucks"
                  : "Checkout"}
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
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setView("buy")}
                className="btn-3d btn-3d-gold inline-flex items-center justify-center gap-2 text-xs"
              >
                <BimbucksIcon size={14} /> Buy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareError(null);
                  setShareRecipient("");
                  setShareAmount("");
                  setShareNote("");
                  setView("share");
                }}
                className="btn-3d btn-3d-gold inline-flex items-center justify-center gap-2 text-xs"
              >
                <Send className="h-3 w-3" /> 💸SEND
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-white/50">
                ACTIVITY
              </div>
              {ledger.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-4 text-center text-[11px] text-white/40">
                  No purchases yet.
                </div>
              ) : (
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
                  {ledger.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-black/40 px-2 py-1.5 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white/90">{row.item_name}</div>
                        <div className="text-[9px] uppercase tracking-widest text-white/40">
                          {new Date(row.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--gold)]">
                        {row.currency === "bimbucks" ? (
                          <BimbucksIcon size={12} />
                        ) : (
                          <BimbitsIcon size={12} />
                        )}
                        <span className="font-display">{row.price.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "share" && (
          <form
            className="mt-5 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setShareError(null);
              const amt = parseInt(shareAmount, 10);
              if (!shareRecipient.trim()) {
                setShareError("Enter a player name or email.");
                return;
              }
              if (!Number.isFinite(amt) || amt <= 0) {
                setShareError("Enter a valid amount.");
                return;
              }
              if (amt > wallet.bimbucks) {
                setShareError("You don't have enough Bimbucks.");
                return;
              }
              setShareSending(true);
              try {
                const res = await sendBimbucks({
                  data: {
                    recipient: shareRecipient.trim(),
                    amount: amt,
                    note: shareNote.trim() || undefined,
                  },
                });
                toast.success(
                  `Sent ${res.amount.toLocaleString()} Bimbucks to ${res.recipient_name}`,
                  { icon: <BimbucksIcon size={18} /> },
                );
                await loadWallet();
                await loadLedger();
                setShareRecipient("");
                setShareAmount("");
                setShareNote("");
                setView("wallet");
              } catch (err) {
                setShareError((err as Error).message ?? "Failed to send.");
              } finally {
                setShareSending(false);
              }
            }}
          >
            <div className="rounded-lg border border-[var(--gold)]/30 bg-black/40 px-3 py-2 text-center text-xs text-white/80">
              Your balance: <BimbucksIcon size={12} className="inline" />{" "}
              <span className="font-display text-[var(--gold)]">
                {wallet.bimbucks.toLocaleString()}
              </span>
            </div>
            <label className="text-[10px] uppercase tracking-widest text-white/60">
              Recipient (player name or email)
            </label>
            <input
              type="text"
              value={shareRecipient}
              onChange={(e) => setShareRecipient(e.target.value)}
              placeholder="e.g. Bimster or player@email.com"
              maxLength={255}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]/60"
            />
            <label className="text-[10px] uppercase tracking-widest text-white/60">Amount</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={wallet.bimbucks || undefined}
              value={shareAmount}
              onChange={(e) => setShareAmount(e.target.value)}
              placeholder="0"
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]/60"
            />
            <label className="text-[10px] uppercase tracking-widest text-white/60">
              Note (optional)
            </label>
            <input
              type="text"
              value={shareNote}
              onChange={(e) => setShareNote(e.target.value)}
              placeholder="Thanks for the game!"
              maxLength={140}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]/60"
            />
            {shareError && (
              <div className="rounded-lg border border-[var(--player-red)]/40 bg-black/40 p-2 text-center text-[11px] text-[var(--player-red)]">
                {shareError}
              </div>
            )}
            <button
              type="submit"
              disabled={shareSending}
              className="btn-3d btn-3d-gold mt-2 inline-flex items-center justify-center gap-2 text-xs disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {shareSending ? "Sending…" : "Send Bimbucks"}
            </button>
          </form>
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
