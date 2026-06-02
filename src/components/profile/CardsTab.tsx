import { useEffect, useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import { CustomCardBackSlots } from "@/components/profile/CustomCardBackSlots";
import { getMyDecor } from "@/lib/rpc/decor.functions";
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
  onRequestBuyBimbucks: () => void;
};

export function CardsTab({
  userId,
  isPlus,
  setMsg,
  setErr,
  onRequestBuyBimbucks,
}: Props) {
  const slotsKey = `bimyah:activeCardSlots:${userId}`;
  const [activeSlots, setActiveSlots] = useState<(string | null)[]>(() =>
    Array(ACTIVE_SLOT_COUNT).fill(null),
  );
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [customCardBacks, setCustomCardBacks] = useState<
    Array<{ id: string; image_url: string }>
  >([]);
  const [purchasedCards, setPurchasedCards] = useState<
    Array<{ id: string; name: string; imageUrl: string }>
  >([]);

  // Load card_back inventory items purchased from Bmart.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getMyDecor();
        if (cancelled) return;
        const items = res.inventory
          .filter((r) => r.kind === "card_back" && r.image_url)
          .map((r) => ({
            id: `purchased-${r.item_id}`,
            name: r.name ?? "Card",
            imageUrl: r.image_url as string,
          }));
        setPurchasedCards(items);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const customCards: CardDef[] = useMemo(
    () =>
      customCardBacks.map((c, idx) => ({
        id: `custom-${c.id}`,
        name: `Custom ${idx + 1}`,
        imageUrl: c.image_url,
      })),
    [customCardBacks],
  );

  const ownedCards: CardDef[] = useMemo(
    () => [...BUILTIN_CARDS, ...customCards],
    [customCards],
  );

  const exclusivesForMe: CardDef[] = useMemo(
    () => EXCLUSIVE_CARDS.filter((c) => !c.requiresPlus || isPlus),
    [isPlus],
  );

  const cardImageById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of [...ownedCards, ...exclusivesForMe]) map.set(c.id, c.imageUrl);
    return map;
  }, [ownedCards, exclusivesForMe]);

  function handleCardTap(cardId: string) {
    if (selectedSlot !== null) {
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

  const collectionCards = ownedCards;
  const rowCount = Math.max(1, Math.ceil((collectionCards.length + 1) / 6));
  const paddedCollection: (CardDef | null)[] = [...collectionCards];
  while (paddedCollection.length < rowCount * 6) paddedCollection.push(null);

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Custom card backs (purchasable slots) ===== */}
      <CustomCardBackSlots
        userId={userId}
        isPlus={isPlus}
        onCardBacksChanged={setCustomCardBacks}
        onRequestBuyBimbucks={onRequestBuyBimbucks}
        setMsg={setMsg}
        setErr={setErr}
      />

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
