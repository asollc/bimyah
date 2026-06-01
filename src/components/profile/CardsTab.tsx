import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Upload, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  setMyActiveCardBack,
  clearMyActiveCardBack,
} from "@/server/cosmetics.functions";
import { BplusIcon } from "@/components/BplusIcon";
import { CardCropModal } from "@/components/profile/CardCropModal";
import foundingCarderImg from "@/assets/card-founding-carder.jpeg";
import standardBimyahImg from "@/assets/card-standard-bimyah.jpeg";

type CardDef = {
  id: string;
  name: string;
  imageUrl: string;
  exclusive?: boolean;
  requiresPlus?: boolean;
};

const BUILTIN_CARDS: CardDef[] = [
  { id: "standard-bimyah", name: "Bimyah!", imageUrl: standardBimyahImg },
];

const EXCLUSIVE_CARDS: CardDef[] = [
  {
    id: "founding-carder",
    name: "Founding Carder",
    imageUrl: foundingCarderImg,
    exclusive: true,
    requiresPlus: true,
  },
];

const ACTIVE_SLOT_COUNT = 6;

type Props = {
  userId: string;
  isPlus: boolean;
  activeCardBack: string | null;
  setActiveCardBack: (url: string | null) => void;
  setMsg: (s: string | null) => void;
  setErr: (s: string | null) => void;
};

export function CardsTab({
  userId,
  isPlus,
  activeCardBack,
  setActiveCardBack,
  setMsg,
  setErr,
}: Props) {
  const [uploadingBack, setUploadingBack] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const slotsKey = `bimyah:activeCardSlots:${userId}`;
  const [activeSlots, setActiveSlots] = useState<(string | null)[]>(() =>
    Array(ACTIVE_SLOT_COUNT).fill(null),
  );
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Hydrate slot selections from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(slotsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as (string | null)[];
        if (Array.isArray(parsed) && parsed.length === ACTIVE_SLOT_COUNT) {
          setActiveSlots(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, [slotsKey]);

  function persistSlots(next: (string | null)[]) {
    setActiveSlots(next);
    try {
      localStorage.setItem(slotsKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Card-back upload is a one-time action — once set, the slot is permanent.
  const cardBackLocked = !!activeCardBack;

  async function pickCardBack(file: File) {
    setErr(null);
    setMsg(null);
    try {
      if (!isPlus) throw new Error("Bimyah!+ is required to set a custom card back.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      const url = URL.createObjectURL(file);
      const { width, height } = await measureImage(url);
      const target = 5 / 7;
      const actual = width / height;
      const off = Math.abs(actual - target) / target;
      if (off > 0.02) {
        // Aspect deviates from 5:7 — open crop UI.
        setPendingCrop({ url, name: file.name, type: file.type });
        return;
      }
      URL.revokeObjectURL(url);
      await uploadCardBack(file);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function uploadCardBack(file: File) {
    setErr(null);
    setMsg(null);
    setUploadingBack(true);
    try {
      if (!isPlus) throw new Error("Bimyah!+ is required to set a custom card back.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("card-backs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("card-backs").getPublicUrl(path);
      const url = pub.publicUrl;
      await setMyActiveCardBack({ data: { imageUrl: url } });
      setActiveCardBack(url);
      setMsg("Card back set. This slot is now permanent.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingBack(false);
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
    const list: CardDef[] = [...BUILTIN_CARDS];
    if (activeCardBack) {
      list.push({ id: "custom-back", name: "Custom", imageUrl: activeCardBack });
    }
    return list;
  }, [activeCardBack]);

  const exclusivesForMe: CardDef[] = useMemo(() => {
    return EXCLUSIVE_CARDS.filter((c) => !c.requiresPlus || isPlus);
  }, [isPlus]);

  // Map card id → image URL across every source the user can choose from.
  const cardImageById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of [...ownedCards, ...exclusivesForMe]) map.set(c.id, c.imageUrl);
    return map;
  }, [ownedCards, exclusivesForMe]);

  function handleCardTap(cardId: string) {
    if (selectedSlot !== null) {
      // Place into the pre-selected slot.
      const next = [...activeSlots];
      next[selectedSlot] = cardId;
      persistSlots(next);
      setSelectedSlot(null);
      setSelectedCard(null);
      return;
    }
    setSelectedCard((prev) => (prev === cardId ? null : cardId));
  }

  function handleSlotTap(slotIndex: number) {
    if (selectedCard) {
      const next = [...activeSlots];
      next[slotIndex] = selectedCard;
      persistSlots(next);
      setSelectedCard(null);
      setSelectedSlot(null);
      return;
    }
    setSelectedSlot((prev) => (prev === slotIndex ? null : slotIndex));
  }

  function clearSlot(slotIndex: number) {
    const next = [...activeSlots];
    next[slotIndex] = null;
    persistSlots(next);
  }

  function applyToAllSlots() {
    if (!selectedCard) return;
    persistSlots(Array(ACTIVE_SLOT_COUNT).fill(selectedCard));
    setSelectedCard(null);
    setSelectedSlot(null);
  }

  // Cards section pads to multiples of 6 rows; the first card is always the
  // standard Bimyah! back.
  const collectionCards = ownedCards; // already starts with standard-bimyah
  const rowCount = Math.max(1, Math.ceil((collectionCards.length + 1) / 6));
  const paddedCollection: (CardDef | null)[] = [...collectionCards];
  while (paddedCollection.length < rowCount * 6) paddedCollection.push(null);

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Custom card back ===== */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Custom card back
          </div>
          {cardBackLocked && (
            <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
              <Lock className="h-3 w-3" /> Locked
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CardSlot imageUrl={activeCardBack} label="custom" locked={cardBackLocked} />
          {!cardBackLocked && (
            <label
              className={`btn-3d ${isPlus ? "btn-3d-gold" : "btn-3d-dark"} inline-flex cursor-pointer items-center gap-1.5 text-[11px] ${
                !isPlus ? "opacity-70" : ""
              }`}
            >
              {isPlus ? <Upload className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {uploadingBack ? "Uploading…" : "Upload (5:7 image)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={!isPlus || uploadingBack}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadCardBack(f);
                }}
              />
            </label>
          )}
        </div>
        {cardBackLocked && (
          <div className="text-[10px] text-white/40">
            Your custom card back is permanent and now appears in your collection below.
          </div>
        )}
        {!isPlus && !cardBackLocked && (
          <Link
            to="/plus"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80 underline"
          >
            Custom card backs unlock with <BplusIcon size={14} /> Bimyah!+
          </Link>
        )}
        {/* Dev/admin escape hatch: only visible during development. */}
        {cardBackLocked && import.meta.env.DEV && (
          <button
            type="button"
            onClick={async () => {
              try {
                await clearMyActiveCardBack();
                setActiveCardBack(null);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="self-start text-[9px] uppercase tracking-widest text-white/30 hover:text-white/60"
          >
            [dev] reset card back
          </button>
        )}
      </section>

      {/* ===== Active Cards ===== */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Active Cards
          </div>
          <div className="flex items-center gap-2">
            {activeSlots.some((s) => s !== null) && (
              <button
                type="button"
                onClick={() => {
                  persistSlots(Array(ACTIVE_SLOT_COUNT).fill(null));
                  setSelectedSlot(null);
                  setSelectedCard(null);
                }}
                className="text-[10px] uppercase tracking-widest text-white/40 hover:text-[var(--player-red)]"
              >
                Reset all
              </button>
            )}
            {selectedCard && (
              <button
                type="button"
                onClick={applyToAllSlots}
                className="btn-3d btn-3d-gold inline-flex items-center gap-1 text-[10px]"
              >
                <Check className="h-3 w-3" /> Add to all slots
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {activeSlots.map((cardId, i) => {
            const img = cardId ? cardImageById.get(cardId) ?? null : null;
            const isSelected = selectedSlot === i;
            return (
              <SlotButton
                key={i}
                index={i + 1}
                imageUrl={img}
                selected={isSelected}
                onClick={() => handleSlotTap(i)}
                onClear={cardId ? () => clearSlot(i) : undefined}
              />
            );
          })}
        </div>
        <div className="text-[10px] text-white/40">
          Select a slot then tap a card below — or pick a card first and tap a slot.
        </div>
      </section>

      {/* ===== Card Collection ===== */}
      <section className="flex flex-col gap-3">
        <div className="text-[10px] uppercase tracking-widest text-white/50">
          Card Collection
        </div>

        {/* Bimyah! Exclusives */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-widest text-[var(--gold)]/80">
            Bimyah! Exclusives
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-full gap-2 pb-1">
              {exclusivesForMe.length === 0 ? (
                <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-[9px] uppercase tracking-widest text-white/30">
                  {isPlus ? "No exclusives yet" : "Exclusives appear with Bimyah!+"}
                </div>
              ) : (
                exclusivesForMe.map((c) => (
                  <div
                    key={c.id}
                    className="shrink-0"
                    style={{ flex: "0 0 calc((100% - 2.5rem) / 6)" }}
                  >
                    <CollectionCard
                      card={c}
                      selected={selectedCard === c.id}
                      onClick={() => handleCardTap(c.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Owned cards (grows in rows of 6) */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-widest text-white/60">Cards</div>
          <div className="grid grid-cols-6 gap-2">
            {paddedCollection.map((c, i) =>
              c ? (
                <CollectionCard
                  key={`${c.id}-${i}`}
                  card={c}
                  selected={selectedCard === c.id}
                  onClick={() => handleCardTap(c.id)}
                />
              ) : (
                <EmptyCollectionSlot key={`empty-${i}`} />
              ),
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ===== sub-components ===== */

function CardSlot({
  imageUrl,
  label,
  locked,
}: {
  imageUrl: string | null;
  label: string;
  locked?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-black/40 ${
        locked ? "border-[var(--gold)]/50" : "border-white/15"
      }`}
      style={{ width: 60, height: 84 }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-white/30">
          {label}
        </div>
      )}
      {locked && (
        <div className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-[var(--gold)]">
          <Lock className="h-2.5 w-2.5" />
        </div>
      )}
    </div>
  );
}

function SlotButton({
  index,
  imageUrl,
  selected,
  onClick,
  onClear,
}: {
  index: number;
  imageUrl: string | null;
  selected: boolean;
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-lg border transition ${
          selected
            ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/60"
            : "border-white/15 hover:border-white/30"
        } bg-black/40`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-lg text-white/40">{index}</span>
        )}
      </button>
      {onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Clear slot ${index}`}
          className="absolute -right-1 -top-1 rounded-full bg-black/80 p-0.5 text-white/70 hover:text-white"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function CollectionCard({
  card,
  selected,
  onClick,
}: {
  card: CardDef;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={card.name}
      className={`relative flex aspect-[5/7] w-full items-center justify-center overflow-hidden rounded-lg border bg-black/40 transition ${
        selected
          ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/60"
          : "border-white/15 hover:border-white/30"
      }`}
    >
      <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
      {selected && (
        <div className="absolute inset-x-0 bottom-0 bg-[var(--gold)]/90 py-0.5 text-center text-[8px] font-semibold uppercase tracking-widest text-black">
          Selected
        </div>
      )}
    </button>
  );
}

function EmptyCollectionSlot() {
  return (
    <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20" />
  );
}

export default CardsTab;
