import { useEffect, useRef, useState } from "react";
import { Lock, Upload, Plus, X, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyCustomCardState,
  purchaseCustomCardSlots,
  addCustomCardBack,
  SLOT_COST_BIMBUCKS,
} from "@/server/customCards.functions";
import { CardCropModal } from "@/components/profile/CardCropModal";
import { BimbucksIcon } from "@/components/wallet/CurrencyIcons";

type CardBack = { id: string; image_url: string };

type Props = {
  userId: string;
  isPlus: boolean;
  /** Called whenever the user's custom card-back collection changes. */
  onCardBacksChanged: (cards: CardBack[]) => void;
  /** Open the wallet overlay so the user can buy Bimbucks. */
  onRequestBuyBimbucks: () => void;
  setMsg: (s: string | null) => void;
  setErr: (s: string | null) => void;
};

const BASE_VISIBLE = 6;

export function CustomCardBackSlots({
  userId,
  isPlus,
  onCardBacksChanged,
  onRequestBuyBimbucks,
  setMsg,
  setErr,
}: Props) {
  const [bimbucks, setBimbucks] = useState(0);
  const [purchased, setPurchased] = useState(0);
  const [cards, setCards] = useState<CardBack[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingForSlot, setUploadingForSlot] = useState<number | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const freeSlots = isPlus ? 1 : 0;
  const totalUnlocked = purchased + freeSlots;
  const filledCount = cards.length;
  const visibleCount = Math.max(BASE_VISIBLE, totalUnlocked + 1);

  async function refresh() {
    try {
      const data = await getMyCustomCardState();
      setBimbucks(data.bimbucks);
      setPurchased(data.customSlotsPurchased);
      const list: CardBack[] = data.cardBacks.map((c) => ({
        id: c.id,
        image_url: c.image_url,
      }));
      setCards(list);
      onCardBacksChanged(list);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`custom-cards-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_backs", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function openPurchaseModal() {
    setPurchaseQty(1);
    setPurchaseOpen(true);
  }

  async function confirmPurchase() {
    const cost = SLOT_COST_BIMBUCKS * purchaseQty;
    if (cost > bimbucks) {
      setPurchaseOpen(false);
      onRequestBuyBimbucks();
      return;
    }
    setPurchasing(true);
    setErr(null);
    setMsg(null);
    try {
      await purchaseCustomCardSlots({ data: { quantity: purchaseQty } });
      await refresh();
      setMsg(`Unlocked ${purchaseQty} card slot${purchaseQty > 1 ? "s" : ""}.`);
      setPurchaseOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPurchasing(false);
    }
  }

  function pickFileForSlot(slotIndex: number) {
    setUploadingForSlot(slotIndex);
    fileInputRef.current?.click();
  }

  async function onFileSelected(file: File) {
    setErr(null);
    setMsg(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      const url = URL.createObjectURL(file);
      const { width, height } = await measureImage(url);
      const target = 5 / 7;
      const actual = width / height;
      const off = Math.abs(actual - target) / target;
      if (off > 0.02) {
        setPendingCrop({ url, name: file.name, type: file.type });
        return;
      }
      URL.revokeObjectURL(url);
      await uploadFile(file);
    } catch (e) {
      setErr((e as Error).message);
      setUploadingForSlot(null);
    }
  }

  async function uploadFile(file: File) {
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("card-backs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("card-backs").getPublicUrl(path);
      await addCustomCardBack({ data: { imageUrl: pub.publicUrl } });
      await refresh();
      setMsg("Card back added. Slot is now locked.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingForSlot(null);
    }
  }

  function measureImage(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = url;
    });
  }

  const slots = Array.from({ length: visibleCount }, (_, i) => i);
  const horizontalScroll = visibleCount > BASE_VISIBLE;
  const cost = SLOT_COST_BIMBUCKS * purchaseQty;
  const canAfford = cost <= bimbucks;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-white/50">
          Custom card backs
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/60">
          <BimbucksIcon size={12} /> {bimbucks.toLocaleString()}
        </div>
      </div>

      <div
        className={
          horizontalScroll
            ? "flex gap-2 overflow-x-auto pb-1"
            : "grid grid-cols-6 gap-2"
        }
      >
        {slots.map((i) => {
          const isFilled = i < filledCount;
          const isEmptyUnlocked = !isFilled && i < totalUnlocked;
          const isPurchaseSlot = !isFilled && !isEmptyUnlocked && i === visibleCount - 1;
          const isLocked = !isFilled && !isEmptyUnlocked && !isPurchaseSlot;
          const card = isFilled ? cards[i] : null;
          const isFreeSlot = isPlus && i === 0 && !isFilled && isEmptyUnlocked;
          return (
            <SlotTile
              key={i}
              imageUrl={card?.image_url ?? null}
              state={
                isFilled
                  ? "filled"
                  : isEmptyUnlocked
                    ? "empty"
                    : isPurchaseSlot
                      ? "purchase"
                      : "locked"
              }
              showFreeBadge={isFreeSlot}
              horizontalScroll={horizontalScroll}
              loading={uploadingForSlot === i}
              onClick={() => {
                if (isFilled) return;
                if (isEmptyUnlocked) {
                  pickFileForSlot(i);
                } else {
                  openPurchaseModal();
                }
              }}
            />
          );
        })}
      </div>

      <div className="text-[10px] text-white/40">
        {totalUnlocked === 0
          ? `Tap any slot to unlock it for ${SLOT_COST_BIMBUCKS} Bimbucks. Once you upload a card back, the slot locks permanently.`
          : `${totalUnlocked - filledCount} unlocked slot${totalUnlocked - filledCount === 1 ? "" : "s"} ready for upload. Tap the + slot to buy more.`}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFileSelected(f);
          else setUploadingForSlot(null);
        }}
      />

      {purchaseOpen && (
        <PurchaseModal
          qty={purchaseQty}
          setQty={setPurchaseQty}
          cost={cost}
          bimbucks={bimbucks}
          canAfford={canAfford}
          busy={purchasing}
          onClose={() => setPurchaseOpen(false)}
          onConfirm={confirmPurchase}
          onBuyBimbucks={() => {
            setPurchaseOpen(false);
            onRequestBuyBimbucks();
          }}
        />
      )}

      {pendingCrop && (
        <CardCropModal
          imageUrl={pendingCrop.url}
          fileName={pendingCrop.name}
          mimeType={pendingCrop.type}
          onCancel={() => {
            URL.revokeObjectURL(pendingCrop.url);
            setPendingCrop(null);
            setUploadingForSlot(null);
          }}
          onConfirm={async (file) => {
            const url = pendingCrop.url;
            setPendingCrop(null);
            URL.revokeObjectURL(url);
            await uploadFile(file);
          }}
        />
      )}

      {loading && (
        <div className="text-[10px] uppercase tracking-widest text-white/30">Loading…</div>
      )}
    </section>
  );
}

function SlotTile({
  imageUrl,
  state,
  showFreeBadge,
  horizontalScroll,
  loading,
  onClick,
}: {
  imageUrl: string | null;
  state: "filled" | "empty" | "locked" | "purchase";
  showFreeBadge?: boolean;
  horizontalScroll: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const wrapperClass = horizontalScroll
    ? "shrink-0"
    : "";
  const wrapperStyle = horizontalScroll ? { width: 56 } : undefined;

  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "filled" || loading}
        className={`relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-lg border bg-black/40 transition ${
          state === "filled"
            ? "border-[var(--gold)]/50 cursor-default"
            : state === "purchase"
              ? "border-dashed border-[var(--gold)]/60 hover:border-[var(--gold)] hover:bg-[var(--gold)]/10"
              : state === "empty"
                ? "border-[var(--mint)]/50 hover:border-[var(--mint)] hover:bg-[var(--mint)]/10"
                : "border-white/15 hover:border-white/30"
        }`}
      >
        {state === "filled" && imageUrl && (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        )}
        {state === "filled" && (
          <div className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-[var(--gold)]">
            <Lock className="h-2.5 w-2.5" />
          </div>
        )}
        {state === "empty" && (
          <Upload className="h-4 w-4 text-[var(--mint)]" />
        )}
        {state === "locked" && (
          <Lock className="h-4 w-4 text-white/40" />
        )}
        {state === "purchase" && (
          <Plus className="h-6 w-6 text-[var(--gold)]" strokeWidth={2.5} />
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-[9px] uppercase tracking-widest text-white/70">
            …
          </div>
        )}
        {showFreeBadge && (
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--gold)]/80 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-black">
            Free
          </div>
        )}
      </button>
    </div>
  );
}

function PurchaseModal({
  qty,
  setQty,
  cost,
  bimbucks,
  canAfford,
  busy,
  onClose,
  onConfirm,
  onBuyBimbucks,
}: {
  qty: number;
  setQty: (n: number) => void;
  cost: number;
  bimbucks: number;
  canAfford: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBuyBimbucks: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--gold)]/40 bg-[#0a0d0a] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base uppercase tracking-widest text-[var(--gold)]">
            Buy card slots
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 text-center text-[11px] uppercase tracking-widest text-white/60">
          {SLOT_COST_BIMBUCKS} Bimbucks per slot
        </div>

        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setQty(Math.max(1, qty - 1))}
            disabled={qty <= 1 || busy}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 disabled:opacity-30"
            aria-label="Decrease"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="font-display text-4xl text-white">{qty}</div>
          <button
            type="button"
            onClick={() => setQty(Math.min(50, qty + 1))}
            disabled={qty >= 50 || busy}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 disabled:opacity-30"
            aria-label="Increase"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-white/40">
          slot{qty === 1 ? "" : "s"}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs">
          <span className="text-white/60">Total</span>
          <span className="inline-flex items-center gap-1 font-display text-[var(--gold)]">
            <BimbucksIcon size={14} /> {cost.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
          <span>Your balance</span>
          <span className="inline-flex items-center gap-1">
            <BimbucksIcon size={10} /> {bimbucks.toLocaleString()}
          </span>
        </div>

        {canAfford ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-3d btn-3d-gold mt-4 w-full text-xs"
          >
            {busy ? "Purchasing…" : `Unlock ${qty} slot${qty === 1 ? "" : "s"}`}
          </button>
        ) : (
          <>
            <div className="mt-3 rounded-lg border border-[var(--player-red)]/40 bg-[var(--player-red)]/10 px-3 py-2 text-center text-[11px] text-[var(--player-red)]">
              You need {(cost - bimbucks).toLocaleString()} more Bimbucks.
            </div>
            <button
              type="button"
              onClick={onBuyBimbucks}
              className="btn-3d btn-3d-gold mt-3 inline-flex w-full items-center justify-center gap-2 text-xs"
            >
              <BimbucksIcon size={14} /> Buy Bimbucks
            </button>
          </>
        )}
      </div>
    </div>
  );
}
