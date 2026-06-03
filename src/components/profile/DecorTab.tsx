import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/auth/AuthProvider";
import {
  getMyDecor,
  setEquipped,
  type DecorKind,
  type DecorInventoryItem,
} from "@/lib/rpc/decor.functions";
import {
  persistEquippedDecorUrls,
  type DecorKindKey,
  type EquippedDecorUrls,
} from "@/game/cosmetics";


type InventoryRow = DecorInventoryItem;
type EquippedRow = Record<string, string | null> | null;

/* ---------- Built-in defaults (the "NONE" / original entries) ---------- */

type Shape = "rect" | "square" | "wide";
type DefaultItem = {
  id: string;
  label: string;
  shape: Shape;
  preview: React.ReactNode;
  isClear?: boolean;
};

const NONE_RECT: DefaultItem = {
  id: "__none__",
  label: "NONE",
  shape: "rect",
  isClear: true,
  preview: (
    <div className="grid h-full w-full place-items-center rounded-md border-2 border-dashed border-white/30 bg-black/50 font-display text-sm font-black tracking-widest text-white/60">
      NONE
    </div>
  ),
};

const NONE_SQUARE: DefaultItem = {
  id: "__none__",
  label: "NONE",
  shape: "square",
  isClear: true,
  preview: (
    <div className="grid h-full w-full place-items-center rounded-md border-2 border-dashed border-white/30 bg-black/50 font-display text-xs font-black tracking-widest text-white/60">
      NONE
    </div>
  ),
};

const DEFAULT_VICTORY: DefaultItem = {
  id: "victory_confetti",
  label: "Confetti",
  shape: "square",
  preview: (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-gradient-to-b from-[#1a0608] to-black">
      <div className="absolute inset-0">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              width: 4,
              height: 7,
              background: ["#2dd4a8", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa"][i % 5],
              transform: `rotate(${i * 33}deg)`,
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  ),
};

const DEFAULT_BACKGROUND: DefaultItem = {
  id: "bg_original_red",
  label: "Original Red",
  shape: "wide",
  preview: (
    <div
      className="h-full w-full rounded-md border border-white/15"
      style={{
        background:
          "radial-gradient(ellipse at center, oklch(0.55 0.22 25) 0%, oklch(0.2 0.1 25) 100%)",
      }}
    />
  ),
};

const DEFAULT_TABLETOP: DefaultItem = {
  id: "tabletop_wooden",
  label: "Wooden",
  shape: "square",
  preview: (
    <div
      className="h-full w-full rounded-full border border-white/30"
      style={{
        background:
          "radial-gradient(circle at 35% 30%, #c69457 0%, #8a5a2b 50%, #4a2e10 100%)",
        boxShadow:
          "inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -6px 12px rgba(0,0,0,0.5)",
      }}
    />
  ),
};

const DEFAULT_TABLE_ART: DefaultItem = {
  id: "tableart_original",
  label: "Bimyah!",
  shape: "square",
  preview: (
    <div className="grid h-full w-full place-items-center rounded-md bg-gradient-to-b from-black/60 to-black/80">
      <span className="font-display text-xl font-black italic text-[var(--gold)] drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
        B!
      </span>
    </div>
  ),
};

/* ---------- Tile ---------- */

function DecorTile({
  item,
  active,
  onClick,
}: {
  item: { id: string; label: string; shape: Shape; preview: React.ReactNode };
  active: boolean;
  onClick: () => void;
}) {
  const w = item.shape === "rect" ? "w-32" : item.shape === "wide" ? "w-36" : "w-24";
  const h = item.shape === "rect" ? "h-16" : item.shape === "wide" ? "h-20" : "h-24";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative shrink-0 overflow-hidden rounded-lg border bg-black/40 p-1 transition ${
        active
          ? "border-[var(--gold)] shadow-[0_0_0_2px_var(--gold)]"
          : "border-white/15 hover:border-white/40"
      }`}
    >
      <div className={`${w} ${h} overflow-hidden rounded-md`}>{item.preview}</div>
      <div className="mt-1 truncate text-center text-[9px] uppercase tracking-widest text-white/70">
        {item.label}
      </div>
      {active && (
        <div className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)] text-black">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

function HRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] uppercase tracking-widest text-white/50">{children}</div>
  );
}

function OwnedPreview({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        className="h-full w-full rounded-md object-cover"
      />
    );
  }
  return (
    <div className="grid h-full w-full place-items-center rounded-md bg-gradient-to-br from-white/15 to-black/40 text-[10px] uppercase tracking-widest text-white/70">
      Owned
    </div>
  );
}

/** Render the list of purchased items for a given decor section. */
function OwnedList({
  items,
  shape,
  kind,
  isActive,
  ask,
  excludeId,
}: {
  items: InventoryRow[];
  shape: Shape;
  kind: DecorKind;
  isActive: (kind: DecorKind, id: string | null) => boolean;
  ask: (kind: DecorKind, label: string, id: string | null) => void;
  excludeId?: string;
}) {
  return (
    <>
      {items
        .filter((r) => (excludeId ? r.item_id !== excludeId : true))
        .map((r) => {
          const label = r.name ?? r.item_id;
          return (
            <DecorTile
              key={r.item_id}
              item={{
                id: r.item_id,
                label,
                shape,
                preview: <OwnedPreview imageUrl={r.image_url} />,
              }}
              active={isActive(kind, r.item_id)}
              onClick={() => ask(kind, label, r.item_id)}
            />
          );
        })}
    </>
  );
}

/* ---------- DecorTab ---------- */

export function DecorTab() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [equipped, setEquippedState] = useState<EquippedRow>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{
    kind: DecorKind;
    itemId: string | null;
    label: string;
  } | null>(null);

  // Mirror the active-card-back pattern: cache the URL of each equipped decor
  // kind in localStorage so the game can resolve the active selection locally.
  useEffect(() => {
    if (!user?.id) return;
    const urlForId = (id: string | null | undefined) => {
      if (!id) return null;
      const row = inventory.find((r) => r.item_id === id);
      return row?.image_url ?? null;
    };
    const map: EquippedDecorUrls = {
      title: urlForId(equipped?.title_id),
      badge: urlForId(equipped?.badge_id),
      victory: urlForId(equipped?.victory_id),
      background: urlForId(equipped?.background_id),
      tabletop: urlForId(equipped?.tabletop_id),
      table_art: urlForId(equipped?.table_art_id),
    };
    persistEquippedDecorUrls(user.id, map);
  }, [user?.id, inventory, equipped]);


  useEffect(() => {
    void (async () => {
      try {
        const res = await getMyDecor();
        setInventory(res.inventory);
        setEquippedState(res.equipped);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ownedByKind = useMemo(() => {
    const m: Record<DecorKind, InventoryRow[]> = {
      card_back: [],
      title: [],
      badge: [],
      victory: [],
      background: [],
      tabletop: [],
      table_art: [],
    };
    for (const r of inventory) m[r.kind].push(r);
    return m;
  }, [inventory]);

  async function confirmEquip() {
    if (!pending) return;
    try {
      await setEquipped({
        data: { kind: pending.kind, itemId: pending.itemId },
      });
      setEquippedState((prev) => {
        const next = { ...(prev ?? {}) } as Record<string, string | null>;
        next[`${pending.kind}_id`] = pending.itemId;
        return next;
      });
      toast.success(
        pending.itemId
          ? `${pending.label} is now active.`
          : `Cleared active ${pending.kind.replace("_", " ")}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  function isActive(kind: DecorKind, itemId: string | null): boolean {
    const col = `${kind}_id`;
    const cur = equipped?.[col] ?? null;
    return cur === itemId;
  }

  function ask(kind: DecorKind, label: string, itemId: string | null) {
    setPending({ kind, label, itemId });
  }

  if (loading) {
    return (
      <div className="grid h-24 place-items-center text-xs text-white/40">
        Loading decor…
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="titles" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-black/30 p-1">
          <TabsTrigger value="titles" className="text-[9px] uppercase tracking-wider">Titles</TabsTrigger>
          <TabsTrigger value="badges" className="text-[9px] uppercase tracking-wider">Badges</TabsTrigger>
          <TabsTrigger value="victory" className="text-[9px] uppercase tracking-wider">Victory FX</TabsTrigger>
          <TabsTrigger value="backgrounds" className="text-[9px] uppercase tracking-wider">Backgrounds</TabsTrigger>
          <TabsTrigger value="tables" className="text-[9px] uppercase tracking-wider">Tables</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="mt-3">
          <SectionLabel>Titles</SectionLabel>
          <HRow>
            <DecorTile
              item={NONE_RECT}
              active={isActive("title", null)}
              onClick={() => ask("title", "No title", null)}
            />
            <OwnedList items={ownedByKind.title} shape="rect" kind="title" isActive={isActive} ask={ask} />
          </HRow>
          {ownedByKind.title.length === 0 && (
            <EmptyHint label="Purchased titles will appear here." />
          )}
        </TabsContent>

        <TabsContent value="badges" className="mt-3">
          <SectionLabel>Badges</SectionLabel>
          <HRow>
            <DecorTile
              item={NONE_SQUARE}
              active={isActive("badge", null)}
              onClick={() => ask("badge", "No badge", null)}
            />
            <OwnedList items={ownedByKind.badge} shape="square" kind="badge" isActive={isActive} ask={ask} />
          </HRow>
          {ownedByKind.badge.length === 0 && (
            <EmptyHint label="Purchased badges will appear here." />
          )}
        </TabsContent>

        <TabsContent value="victory" className="mt-3">
          <SectionLabel>Victory Effects</SectionLabel>
          <HRow>
            <DecorTile
              item={DEFAULT_VICTORY}
              active={isActive("victory", null) || isActive("victory", DEFAULT_VICTORY.id)}
              onClick={() => ask("victory", DEFAULT_VICTORY.label, null)}
            />
            <OwnedList
              items={ownedByKind.victory}
              shape="square"
              kind="victory"
              isActive={isActive}
              ask={ask}
              excludeId={DEFAULT_VICTORY.id}
            />
          </HRow>
        </TabsContent>

        <TabsContent value="backgrounds" className="mt-3">
          <SectionLabel>Backgrounds (host-only in matches)</SectionLabel>
          <HRow>
            <DecorTile
              item={DEFAULT_BACKGROUND}
              active={isActive("background", null) || isActive("background", DEFAULT_BACKGROUND.id)}
              onClick={() => ask("background", DEFAULT_BACKGROUND.label, null)}
            />
            <OwnedList
              items={ownedByKind.background}
              shape="wide"
              kind="background"
              isActive={isActive}
              ask={ask}
              excludeId={DEFAULT_BACKGROUND.id}
            />
          </HRow>
        </TabsContent>

        <TabsContent value="tables" className="mt-3 flex flex-col gap-4">
          <div>
            <SectionLabel>Table Tops (host-only in matches)</SectionLabel>
            <HRow>
              <DecorTile
                item={DEFAULT_TABLETOP}
                active={isActive("tabletop", null) || isActive("tabletop", DEFAULT_TABLETOP.id)}
                onClick={() => ask("tabletop", DEFAULT_TABLETOP.label, null)}
              />
              <OwnedList
                items={ownedByKind.tabletop}
                shape="square"
                kind="tabletop"
                isActive={isActive}
                ask={ask}
                excludeId={DEFAULT_TABLETOP.id}
              />
            </HRow>
          </div>
          <div>
            <SectionLabel>Table Art (host-only in matches)</SectionLabel>
            <HRow>
              <DecorTile
                item={DEFAULT_TABLE_ART}
                active={isActive("table_art", null) || isActive("table_art", DEFAULT_TABLE_ART.id)}
                onClick={() => ask("table_art", DEFAULT_TABLE_ART.label, null)}
              />
              <OwnedList
                items={ownedByKind.table_art}
                shape="square"
                kind="table_art"
                isActive={isActive}
                ask={ask}
                excludeId={DEFAULT_TABLE_ART.id}
              />
            </HRow>
          </div>
        </TabsContent>
      </Tabs>

      {pending && (
        <ConfirmEquipModal
          label={pending.label}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmEquip()}
        />
      )}
    </>
  );
}

function EmptyHint({ label }: { label: string }) {
  return <div className="mt-1 text-[10px] italic text-white/40">{label}</div>;
}

function ConfirmEquipModal({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl border border-[var(--gold)]/40 bg-[#0a0d0a] p-5 text-center shadow-2xl">
        <div className="font-display text-sm uppercase tracking-widest text-[var(--gold)]">
          Use in game?
        </div>
        <div className="mt-3 text-sm text-white/80">
          Set <span className="font-bold text-white">{label}</span> as your active selection?
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-3d btn-3d-dark flex-1 !rounded-lg !px-2 !py-2 text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-3d btn-3d-gold flex-1 !rounded-lg !px-2 !py-2 text-[11px]"
          >
            Set Active
          </button>
        </div>
      </div>
    </div>
  );
}
