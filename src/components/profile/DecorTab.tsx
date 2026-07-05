import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Upload, X, Loader2, Pencil, Plus, Crown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/auth/AuthProvider";
import {
  getMyDecor,
  setEquipped,
  adminCreateTestDecor,
  deleteMyInventoryItem,
  purchaseBadgeSlot,
  purchaseEmblemSlot,
  type DecorKind,
  type DecorInventoryItem,
} from "@/lib/rpc/decor.functions";
import {
  getDecorDefaults,
  adminUpsertDefaultOverride,
  type DecorDefaultOverride,
} from "@/lib/rpc/decorDefaults.functions";
import { getMyAdminStatus } from "@/lib/rpc/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  persistEquippedDecorUrls,
  type EquippedDecorUrls,
} from "@/game/cosmetics";


type InventoryRow = DecorInventoryItem;
type EquippedRow = Record<string, string | null> | null;

/* ---------- Built-in defaults ---------- */

type Shape = "rect" | "square" | "wide";
type DefaultItem = {
  id: string;
  /** Stable key used to look up admin overrides in `decor_defaults`. */
  defaultKey: string;
  kind: DecorKind;
  label: string;
  shape: Shape;
  preview: React.ReactNode;
  isClear?: boolean;
};

const NONE_RECT: DefaultItem = {
  id: "__none__",
  defaultKey: "none",
  kind: "title",
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
  defaultKey: "none",
  kind: "badge",
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
  defaultKey: "victory_confetti",
  kind: "victory",
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
  defaultKey: "bg_original_red",
  kind: "background",
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
  defaultKey: "tabletop_wooden",
  kind: "tabletop",
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
  defaultKey: "tableart_original",
  kind: "table_art",
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

/** Merge admin overrides onto a built-in default. */
function withOverride(
  base: DefaultItem,
  overrides: Map<string, DecorDefaultOverride>,
): DefaultItem {
  const key = `${base.kind}::${base.defaultKey}`;
  const o = overrides.get(key);
  if (!o) return base;
  const nextLabel = o.name_override ?? base.label;
  if (o.image_url_override) {
    return {
      ...base,
      label: nextLabel,
      preview: (
        <img
          src={o.image_url_override}
          alt=""
          draggable={false}
          className="h-full w-full rounded-md object-cover"
        />
      ),
    };
  }
  return { ...base, label: nextLabel };
}

/* ---------- Tile ---------- */

function DecorTile({
  item,
  active,
  onClick,
  onDelete,
  onEditDefault,
}: {
  item: { id: string; label: string; shape: Shape; preview: React.ReactNode };
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onEditDefault?: () => void;
}) {
  const aspect =
    item.shape === "rect"
      ? "aspect-[2/1]"
      : item.shape === "wide"
        ? "aspect-[9/5]"
        : "aspect-square";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`group relative w-full overflow-hidden rounded-lg border bg-black/40 p-1 transition ${
          active
            ? "border-[var(--gold)] shadow-[0_0_0_2px_var(--gold)]"
            : "border-white/15 hover:border-white/40"
        }`}
      >
        <div className={`${aspect} w-full overflow-hidden rounded-md`}>{item.preview}</div>
        <div className="mt-1 truncate text-center text-[9px] uppercase tracking-widest text-white/70">
          {item.label}
        </div>
        {active && (
          <div className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)] text-black">
            <Check className="h-3 w-3" strokeWidth={3} />
          </div>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete item"
          className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600/90 text-white hover:bg-red-500"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      )}
      {onEditDefault && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditDefault();
          }}
          aria-label="Admin: edit default"
          title="Edit default (admin)"
          className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)]/90 text-black hover:bg-[var(--gold)]"
        >
          <Pencil className="h-3 w-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

function HRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-2 pb-2">{children}</div>;
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

function OwnedList({
  items,
  shape,
  kind,
  isActive,
  ask,
  excludeId,
  onDelete,
}: {
  items: InventoryRow[];
  shape: Shape;
  kind: DecorKind;
  isActive: (kind: DecorKind, id: string | null) => boolean;
  ask: (kind: DecorKind, label: string, id: string | null) => void;
  excludeId?: string;
  onDelete?: (kind: DecorKind, label: string, id: string) => void;
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
              onDelete={onDelete ? () => onDelete(kind, label, r.item_id) : undefined}
            />
          );
        })}
    </>
  );
}

/* ---------- Admin Test uploader ---------- */

function AdminTestUploader({
  kind,
  onCreated,
}: {
  kind: DecorKind;
  onCreated: (item: InventoryRow) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || `test ${kind}`;
      const path = `bmart/test-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("public-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("public-assets").getPublicUrl(path);
      const res = await adminCreateTestDecor({
        data: { kind, name: baseName, image_url: pub.publicUrl },
      });
      onCreated({
        kind,
        item_id: res.id,
        acquired_at: new Date().toISOString(),
        name: res.name,
        image_url: res.image_url,
      });
      toast.success("Test item added");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mt-2 rounded-md border border-dashed border-[var(--gold)]/40 bg-[var(--gold)]/5 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
          Admin · Test upload
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md border border-[var(--gold)]/50 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--gold)] hover:bg-[var(--gold)]/10 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Upload media
        </button>
      </div>
      <p className="text-[9px] text-white/40">
        Pick any image — it appears below and previews automatically.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}

/* ---------- Admin "Edit Default" dialog ---------- */

function EditDefaultModal({
  kind,
  defaultKey,
  initialLabel,
  initialImage,
  onSaved,
  onClose,
}: {
  kind: DecorKind;
  defaultKey: string;
  initialLabel: string;
  initialImage: string | null;
  onSaved: (next: { name: string; imageUrl: string | null }) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialLabel);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImage);
  const [busy, setBusy] = useState(false);

  async function pickFile(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `decor-defaults/${kind}-${defaultKey}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("public-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("public-assets").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      toast.success("Image uploaded — click Save to apply.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await adminUpsertDefaultOverride({
        data: {
          kind,
          defaultKey,
          name: name.trim() || initialLabel,
          imageUrl,
        },
      });
      onSaved({ name: name.trim() || initialLabel, imageUrl });
      toast.success("Default updated for all users.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await adminUpsertDefaultOverride({
        data: { kind, defaultKey, name: null, imageUrl: null },
      });
      onSaved({ name: initialLabel, imageUrl: null });
      toast.success("Reverted to built-in default.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--gold)]/40 bg-[#0a0d0a] p-5 text-left shadow-2xl">
        <div className="font-display text-sm uppercase tracking-widest text-[var(--gold)]">
          Edit default · {kind.replace("_", " ")}
        </div>
        <p className="mt-1 text-[10px] text-white/50">Applies to every user.</p>

        <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/60">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
        />

        <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/60">
          Image
        </label>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-md border border-[var(--gold)]/50 px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--gold)] hover:bg-[var(--gold)]/10 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </button>
          {imageUrl && (
            <img src={imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
          }}
        />

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-3d btn-3d-dark flex-1 !rounded-lg !px-2 !py-2 text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="btn-3d flex-1 !rounded-lg !bg-red-600 !px-2 !py-2 text-[11px] !text-white hover:!bg-red-500"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-3d btn-3d-gold flex-1 !rounded-lg !px-2 !py-2 text-[11px]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Active Badges section ---------- */

type BadgeSlotState = {
  count: number; // 1 or 2 unlocked
  canPurchase: boolean; // true if user can buy slot 2 for 150 Bimbucks
  isPlus: boolean;
};

function ActiveBadges({
  slotState,
  slot1Id,
  slot2Id,
  inventory,
  selectedId,
  onTapSlot,
  onClearSlot,
  onPurchaseSlot,
}: {
  slotState: BadgeSlotState;
  slot1Id: string | null;
  slot2Id: string | null;
  inventory: InventoryRow[];
  selectedId: string | null;
  onTapSlot: (slot: 1 | 2) => void;
  onClearSlot: (slot: 1 | 2) => void;
  onPurchaseSlot: () => void;
}) {
  const urlForId = (id: string | null) =>
    id ? inventory.find((r) => r.item_id === id)?.image_url ?? null : null;
  const slot1Url = urlForId(slot1Id);
  const slot2Url = urlForId(slot2Id);
  return (
    <section className="mb-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-white/60">
          Active Badges
        </div>
        <div className="text-[9px] uppercase tracking-widest text-white/40">
          {slotState.count}/2 slots
          {slotState.isPlus && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[var(--gold)]">
              <Crown className="h-3 w-3" /> B+
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <BadgeSlot
          label="Slot 1"
          imageUrl={slot1Url}
          selected={selectedId !== null && slotState.count >= 2}
          onClick={() => onTapSlot(1)}
          onClear={slot1Id ? () => onClearSlot(1) : undefined}
        />
        {slotState.count >= 2 ? (
          <BadgeSlot
            label="Slot 2"
            imageUrl={slot2Url}
            selected={selectedId !== null}
            onClick={() => onTapSlot(2)}
            onClear={slot2Id ? () => onClearSlot(2) : undefined}
          />
        ) : slotState.canPurchase ? (
          <button
            type="button"
            onClick={onPurchaseSlot}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border-2 border-dashed border-[var(--gold)]/60 bg-[var(--gold)]/10 text-[var(--gold)] hover:bg-[var(--gold)]/20"
            title="Unlock a second badge slot · 150 Bimbucks"
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">Unlock second slot</span>
          </button>
        ) : (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/40 text-[8px] uppercase tracking-widest text-white/30">
            Locked
          </div>
        )}
        <div className="ml-1 flex-1 text-[10px] text-white/40">
          {slotState.count === 1
            ? "Tap a badge below to equip it. Tap the slot to clear."
            : selectedId
              ? "Tap a slot to place the selected badge."
              : "Tap a badge below, then tap a slot to place it. Tap an equipped badge to clear it."}
        </div>
      </div>
      {slotState.canPurchase && (
        <p className="mt-2 text-[9px] text-white/40">
          Unlock 2 badge slots for 150 Bimbucks. B+ members get the 2nd slot free.
        </p>
      )}
    </section>
  );
}

function BadgeSlot({
  label,
  imageUrl,
  selected,
  onClick,
  onClear,
}: {
  label: string;
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
        title={label}
        className={`relative grid h-12 w-12 place-items-center overflow-hidden rounded-lg border transition ${
          selected
            ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/60"
            : "border-white/15 hover:border-white/40"
        } bg-black/40`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[8px] uppercase tracking-widest text-white/40">{label}</span>
        )}
      </button>
      {onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Clear ${label}`}
          className="absolute -right-1 -top-1 rounded-full bg-black/80 p-0.5 text-white/70 hover:text-white"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

/* ---------- DecorTab ---------- */

export function DecorTab() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [equipped, setEquippedState] = useState<EquippedRow>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [badgeSlotCount, setBadgeSlotCount] = useState(1);
  const [badgeSlotsPurchased, setBadgeSlotsPurchased] = useState(0);
  const [emblemSlotCount, setEmblemSlotCount] = useState(1);
  const [emblemSlotsPurchased, setEmblemSlotsPurchased] = useState(0);
  const [isPlus, setIsPlus] = useState(false);
  const [defaultOverrides, setDefaultOverrides] = useState<
    Map<string, DecorDefaultOverride>
  >(new Map());
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [selectedEmblemId, setSelectedEmblemId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    kind: DecorKind;
    itemId: string | null;
    label: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: DecorKind;
    itemId: string;
    label: string;
  } | null>(null);
  const [editingDefault, setEditingDefault] = useState<DefaultItem | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const urlForId = (id: string | null | undefined) => {
      if (!id) return null;
      if (id === "__none__") return "__none__";
      const row = inventory.find((r) => r.item_id === id);
      return row?.image_url ?? null;
    };
    const map: EquippedDecorUrls = {
      title: urlForId(equipped?.title_id),
      badge: urlForId(equipped?.badge_id),
      badge2: urlForId(equipped?.badge_id_2),
      emblem: urlForId(equipped?.emblem_id),
      emblem2: urlForId(equipped?.emblem_id_2),
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
        const [res, admin, defs] = await Promise.all([
          getMyDecor(),
          getMyAdminStatus().catch(() => ({ is_admin: false })),
          getDecorDefaults().catch(() => ({ overrides: [] })),
        ]);
        setInventory(res.inventory);
        setEquippedState(res.equipped);
        setBadgeSlotCount(res.badgeSlotCount);
        setBadgeSlotsPurchased(res.badgeSlotsPurchased);
        setEmblemSlotCount(res.emblemSlotCount);
        setEmblemSlotsPurchased(res.emblemSlotsPurchased);
        setIsPlus(res.isPlus);
        setIsAdmin(!!admin.is_admin);
        const m = new Map<string, DecorDefaultOverride>();
        for (const o of defs.overrides) {
          m.set(`${o.kind}::${o.default_key}`, o);
        }
        setDefaultOverrides(m);
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
      emblem: [],
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
      await setEquipped({ data: { kind: pending.kind, itemId: pending.itemId } });
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, itemId } = pendingDelete;
    try {
      const res = await deleteMyInventoryItem({ data: { kind, itemId } });
      setInventory((prev) =>
        prev.filter((r) => !(r.kind === kind && r.item_id === itemId)),
      );
      if (res.wasActive) {
        setEquippedState((prev) => {
          const next = { ...(prev ?? {}) } as Record<string, string | null>;
          // Clear whichever badge/emblem slot held it.
          if (kind === "badge") {
            if (next.badge_id === itemId) next.badge_id = null;
            if (next.badge_id_2 === itemId) next.badge_id_2 = null;
          } else if (kind === "emblem") {
            if (next.emblem_id === itemId) next.emblem_id = null;
            if (next.emblem_id_2 === itemId) next.emblem_id_2 = null;
          } else {
            next[`${kind}_id`] = null;
          }
          return next;
        });
      }
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingDelete(null);
    }
  }

  function isActive(kind: DecorKind, itemId: string | null): boolean {
    if (kind === "badge") {
      const a = equipped?.badge_id ?? null;
      const b = equipped?.badge_id_2 ?? null;
      return a === itemId || b === itemId;
    }
    if (kind === "emblem") {
      const a = equipped?.emblem_id ?? null;
      const b = equipped?.emblem_id_2 ?? null;
      return a === itemId || b === itemId;
    }
    const col = `${kind}_id`;
    const cur = equipped?.[col] ?? null;
    return cur === itemId;
  }

  function ask(kind: DecorKind, label: string, itemId: string | null) {
    // Badges/Emblems use tap-to-equip, not the confirm modal.
    if (kind === "badge") {
      void handleBadgeTap(itemId, label);
      return;
    }
    if (kind === "emblem") {
      void handleEmblemTap(itemId, label);
      return;
    }
    setPending({ kind, label, itemId });
  }

  function askDelete(kind: DecorKind, label: string, itemId: string) {
    setPendingDelete({ kind, label, itemId });
  }

  function handleTestCreated(item: InventoryRow) {
    setInventory((prev) => [...prev, item]);
  }

  /** Tap-to-equip for badges. Rules:
   *  - If 1 slot unlocked: tap a badge to equip into slot 1, tap the same
   *    badge to clear.
   *  - If 2 slots unlocked: first tap selects; second tap on a slot places
   *    it. Tap the equipped badge to clear from whichever slot holds it. */
  async function handleBadgeTap(itemId: string | null, label: string) {
    if (badgeSlotCount === 1) {
      const cur = equipped?.badge_id ?? null;
      // Tap empty "NONE" tile clears slot 1.
      if (itemId === null) {
        await applyBadge(1, null, "No badge");
        return;
      }
      // Tapping the active badge clears it.
      if (cur === itemId) {
        await applyBadge(1, null, label);
        return;
      }
      await applyBadge(1, itemId, label);
      return;
    }
    // 2 slots
    if (itemId === null) {
      // Tap NONE — clear both slots.
      await applyBadge(1, null, "Cleared");
      await applyBadge(2, null, "Cleared");
      setSelectedBadgeId(null);
      return;
    }
    const a = equipped?.badge_id ?? null;
    const b = equipped?.badge_id_2 ?? null;
    // Tap an active badge to clear whichever slot holds it.
    if (a === itemId) {
      await applyBadge(1, null, label);
      return;
    }
    if (b === itemId) {
      await applyBadge(2, null, label);
      return;
    }
    setSelectedBadgeId((prev) => (prev === itemId ? null : itemId));
  }

  async function applyBadge(slot: 1 | 2, itemId: string | null, label: string) {
    try {
      await setEquipped({ data: { kind: "badge", itemId, slot } });
      setEquippedState((prev) => {
        const next = { ...(prev ?? {}) } as Record<string, string | null>;
        if (slot === 1) next.badge_id = itemId;
        else next.badge_id_2 = itemId;
        return next;
      });
      if (itemId) toast.success(`${label} equipped in slot ${slot}.`);
      else toast.success(`Slot ${slot} cleared.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSlotTap(slot: 1 | 2) {
    if (selectedBadgeId) {
      const label =
        inventory.find((r) => r.item_id === selectedBadgeId)?.name ?? selectedBadgeId;
      await applyBadge(slot, selectedBadgeId, label);
      setSelectedBadgeId(null);
      return;
    }
    // Empty tap on a slot with content clears it.
    const cur = slot === 1 ? equipped?.badge_id : equipped?.badge_id_2;
    if (cur) {
      await applyBadge(slot, null, "Cleared");
    }
  }

  async function handleClearSlot(slot: 1 | 2) {
    await applyBadge(slot, null, "Cleared");
  }

  async function handlePurchaseSlot() {
    try {
      const res = await purchaseBadgeSlot();
      setBadgeSlotsPurchased(res.badge_slots_purchased);
      setBadgeSlotCount(
        Math.min(2, 1 + res.badge_slots_purchased + (isPlus ? 1 : 0)),
      );
      toast.success("Second badge slot unlocked!");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /* ---- Emblems (mirrors badge logic) ---- */
  async function handleEmblemTap(itemId: string | null, label: string) {
    if (emblemSlotCount === 1) {
      const cur = equipped?.emblem_id ?? null;
      if (itemId === null) {
        await applyEmblem(1, null, "No emblem");
        return;
      }
      if (cur === itemId) {
        await applyEmblem(1, null, label);
        return;
      }
      await applyEmblem(1, itemId, label);
      return;
    }
    if (itemId === null) {
      await applyEmblem(1, null, "Cleared");
      await applyEmblem(2, null, "Cleared");
      setSelectedEmblemId(null);
      return;
    }
    const a = equipped?.emblem_id ?? null;
    const b = equipped?.emblem_id_2 ?? null;
    if (a === itemId) {
      await applyEmblem(1, null, label);
      return;
    }
    if (b === itemId) {
      await applyEmblem(2, null, label);
      return;
    }
    setSelectedEmblemId((prev) => (prev === itemId ? null : itemId));
  }

  async function applyEmblem(slot: 1 | 2, itemId: string | null, label: string) {
    try {
      await setEquipped({ data: { kind: "emblem", itemId, slot } });
      setEquippedState((prev) => {
        const next = { ...(prev ?? {}) } as Record<string, string | null>;
        if (slot === 1) next.emblem_id = itemId;
        else next.emblem_id_2 = itemId;
        return next;
      });
      if (itemId) toast.success(`${label} equipped in slot ${slot}.`);
      else toast.success(`Slot ${slot} cleared.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleEmblemSlotTap(slot: 1 | 2) {
    if (selectedEmblemId) {
      const label =
        inventory.find((r) => r.item_id === selectedEmblemId)?.name ?? selectedEmblemId;
      await applyEmblem(slot, selectedEmblemId, label);
      setSelectedEmblemId(null);
      return;
    }
    const cur = slot === 1 ? equipped?.emblem_id : equipped?.emblem_id_2;
    if (cur) {
      await applyEmblem(slot, null, "Cleared");
    }
  }

  async function handleEmblemClearSlot(slot: 1 | 2) {
    await applyEmblem(slot, null, "Cleared");
  }

  async function handlePurchaseEmblemSlot() {
    try {
      const res = await purchaseEmblemSlot();
      setEmblemSlotsPurchased(res.emblem_slots_purchased);
      setEmblemSlotCount(
        Math.min(2, 1 + res.emblem_slots_purchased + (isPlus ? 1 : 0)),
      );
      toast.success("Second emblem slot unlocked!");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function handleDefaultSaved(
    base: DefaultItem,
    next: { name: string; imageUrl: string | null },
  ) {
    setDefaultOverrides((prev) => {
      const m = new Map(prev);
      const key = `${base.kind}::${base.defaultKey}`;
      if (next.imageUrl === null && next.name === base.label) {
        m.delete(key);
      } else {
        m.set(key, {
          kind: base.kind,
          default_key: base.defaultKey,
          name_override: next.name === base.label ? null : next.name,
          image_url_override: next.imageUrl,
        });
      }
      return m;
    });
  }

  if (loading) {
    return (
      <div className="grid h-24 place-items-center text-xs text-white/40">
        Loading decor…
      </div>
    );
  }

  const deleteFn = (kind: DecorKind, label: string, id: string) =>
    askDelete(kind, label, id);

  // Apply admin overrides to default items.
  const dTitle = NONE_RECT;
  const dBadge = NONE_SQUARE;
  const dEmblem = { ...NONE_SQUARE, kind: "emblem" as DecorKind };
  const dVictory = withOverride(DEFAULT_VICTORY, defaultOverrides);
  const dBg = withOverride(DEFAULT_BACKGROUND, defaultOverrides);
  const dTabletop = withOverride(DEFAULT_TABLETOP, defaultOverrides);
  const dTableArt = withOverride(DEFAULT_TABLE_ART, defaultOverrides);

  const slotState: BadgeSlotState = {
    count: badgeSlotCount,
    canPurchase: badgeSlotCount < 2 && !isPlus && badgeSlotsPurchased === 0,
    isPlus,
  };

  const emblemSlotState: BadgeSlotState = {
    count: emblemSlotCount,
    canPurchase: emblemSlotCount < 2 && !isPlus && emblemSlotsPurchased === 0,
    isPlus,
  };

  const editAdmin = (base: DefaultItem) =>
    isAdmin && !base.isClear ? () => setEditingDefault(base) : undefined;

  return (
    <>
      <Tabs defaultValue="titles" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-black/30 p-1">
          <TabsTrigger value="titles" className="text-[9px] uppercase tracking-wider">Titles</TabsTrigger>
          <TabsTrigger value="badges" className="text-[9px] uppercase tracking-wider">Badges</TabsTrigger>
          <TabsTrigger value="emblems" className="text-[9px] uppercase tracking-wider">Emblems</TabsTrigger>
          <TabsTrigger value="victory" className="text-[9px] uppercase tracking-wider">Victory FX</TabsTrigger>
          <TabsTrigger value="backgrounds" className="text-[9px] uppercase tracking-wider">Backgrounds</TabsTrigger>
          <TabsTrigger value="tables" className="text-[9px] uppercase tracking-wider">Tables</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="mt-3">
          <SectionLabel>Titles</SectionLabel>
          <HRow>
            <DecorTile item={dTitle} active={isActive("title", null)} onClick={() => ask("title", "No title", null)} />
            <OwnedList items={ownedByKind.title} shape="rect" kind="title" isActive={isActive} ask={ask} onDelete={deleteFn} />
          </HRow>
          {ownedByKind.title.length === 0 && (
            <EmptyHint label="Purchased titles will appear here." />
          )}
          {isAdmin && <AdminTestUploader kind="title" onCreated={handleTestCreated} />}
        </TabsContent>

        <TabsContent value="badges" className="mt-3">
          <ActiveBadges
            slotState={slotState}
            slot1Id={equipped?.badge_id ?? null}
            slot2Id={equipped?.badge_id_2 ?? null}
            inventory={ownedByKind.badge}
            selectedId={selectedBadgeId}
            onTapSlot={(s) => void handleSlotTap(s)}
            onClearSlot={(s) => void handleClearSlot(s)}
            onPurchaseSlot={() => void handlePurchaseSlot()}
          />
          <SectionLabel>Badges</SectionLabel>
          <HRow>
            <DecorTile
              item={dBadge}
              active={isActive("badge", null) && !(equipped?.badge_id) && !(equipped?.badge_id_2)}
              onClick={() => ask("badge", "No badge", null)}
            />
            {ownedByKind.badge.map((r) => {
              const label = r.name ?? r.item_id;
              const selected = selectedBadgeId === r.item_id;
              return (
                <DecorTile
                  key={r.item_id}
                  item={{
                    id: r.item_id,
                    label,
                    shape: "square",
                    preview: <OwnedPreview imageUrl={r.image_url} />,
                  }}
                  active={isActive("badge", r.item_id) || selected}
                  onClick={() => ask("badge", label, r.item_id)}
                  onDelete={() => deleteFn("badge", label, r.item_id)}
                />
              );
            })}
          </HRow>
          {ownedByKind.badge.length === 0 && (
            <EmptyHint label="Purchased badges will appear here." />
          )}
          {isAdmin && <AdminTestUploader kind="badge" onCreated={handleTestCreated} />}
        </TabsContent>

        <TabsContent value="emblems" className="mt-3">
          <ActiveBadges
            slotState={emblemSlotState}
            slot1Id={equipped?.emblem_id ?? null}
            slot2Id={equipped?.emblem_id_2 ?? null}
            inventory={ownedByKind.emblem}
            selectedId={selectedEmblemId}
            onTapSlot={(s) => void handleEmblemSlotTap(s)}
            onClearSlot={(s) => void handleEmblemClearSlot(s)}
            onPurchaseSlot={() => void handlePurchaseEmblemSlot()}
          />
          <SectionLabel>Emblems</SectionLabel>
          <HRow>
            <DecorTile
              item={dEmblem}
              active={isActive("emblem", null) && !(equipped?.emblem_id) && !(equipped?.emblem_id_2)}
              onClick={() => ask("emblem", "No emblem", null)}
            />
            {ownedByKind.emblem.map((r) => {
              const label = r.name ?? r.item_id;
              const selected = selectedEmblemId === r.item_id;
              return (
                <DecorTile
                  key={r.item_id}
                  item={{
                    id: r.item_id,
                    label,
                    shape: "square",
                    preview: <OwnedPreview imageUrl={r.image_url} />,
                  }}
                  active={isActive("emblem", r.item_id) || selected}
                  onClick={() => ask("emblem", label, r.item_id)}
                  onDelete={() => deleteFn("emblem", label, r.item_id)}
                />
              );
            })}
          </HRow>
          {ownedByKind.emblem.length === 0 && (
            <EmptyHint label="Purchased emblems will appear here." />
          )}
          {isAdmin && <AdminTestUploader kind="emblem" onCreated={handleTestCreated} />}
        </TabsContent>


        <TabsContent value="victory" className="mt-3">
          <SectionLabel>Victory Effects</SectionLabel>
          <HRow>
            <DecorTile
              item={dVictory}
              active={isActive("victory", null) || isActive("victory", dVictory.id)}
              onClick={() => ask("victory", dVictory.label, null)}
              onEditDefault={editAdmin(DEFAULT_VICTORY)}
            />
            <OwnedList
              items={ownedByKind.victory}
              shape="square"
              kind="victory"
              isActive={isActive}
              ask={ask}
              excludeId={dVictory.id}
              onDelete={deleteFn}
            />
          </HRow>
          {isAdmin && <AdminTestUploader kind="victory" onCreated={handleTestCreated} />}
        </TabsContent>

        <TabsContent value="backgrounds" className="mt-3">
          <SectionLabel>Backgrounds (host-only in matches)</SectionLabel>
          <HRow>
            <DecorTile
              item={dBg}
              active={isActive("background", null) || isActive("background", dBg.id)}
              onClick={() => ask("background", dBg.label, null)}
              onEditDefault={editAdmin(DEFAULT_BACKGROUND)}
            />
            <OwnedList
              items={ownedByKind.background}
              shape="wide"
              kind="background"
              isActive={isActive}
              ask={ask}
              excludeId={dBg.id}
              onDelete={deleteFn}
            />
          </HRow>
          {isAdmin && <AdminTestUploader kind="background" onCreated={handleTestCreated} />}
        </TabsContent>

        <TabsContent value="tables" className="mt-3 flex flex-col gap-4">
          <div>
            <SectionLabel>Table Tops (host-only in matches)</SectionLabel>
            <HRow>
              <DecorTile
                item={dTabletop}
                active={isActive("tabletop", null) || isActive("tabletop", dTabletop.id)}
                onClick={() => ask("tabletop", dTabletop.label, null)}
                onEditDefault={editAdmin(DEFAULT_TABLETOP)}
              />
              <OwnedList
                items={ownedByKind.tabletop}
                shape="square"
                kind="tabletop"
                isActive={isActive}
                ask={ask}
                excludeId={dTabletop.id}
                onDelete={deleteFn}
              />
            </HRow>
            {isAdmin && <AdminTestUploader kind="tabletop" onCreated={handleTestCreated} />}
          </div>
          <div>
            <SectionLabel>Table Art (host-only in matches)</SectionLabel>
            <HRow>
              <DecorTile
                item={dTableArt}
                active={isActive("table_art", null) || isActive("table_art", dTableArt.id)}
                onClick={() => ask("table_art", dTableArt.label, null)}
                onEditDefault={editAdmin(DEFAULT_TABLE_ART)}
              />
              <DecorTile
                item={{
                  id: "__none__",
                  label: "None",
                  shape: "square",
                  preview: (
                    <div className="grid h-full w-full place-items-center rounded-md bg-black/60 text-[10px] uppercase tracking-widest text-white/60">
                      None
                    </div>
                  ),
                }}
                active={isActive("table_art", "__none__")}
                onClick={() => ask("table_art", "None (hide art)", "__none__")}
              />
              <OwnedList
                items={ownedByKind.table_art}
                shape="square"
                kind="table_art"
                isActive={isActive}
                ask={ask}
                excludeId={dTableArt.id}
                onDelete={deleteFn}
              />
            </HRow>
            {isAdmin && <AdminTestUploader kind="table_art" onCreated={handleTestCreated} />}
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
      {pendingDelete && (
        <ConfirmDeleteModal
          label={pendingDelete.label}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
      {editingDefault && (
        <EditDefaultModal
          kind={editingDefault.kind}
          defaultKey={editingDefault.defaultKey}
          initialLabel={
            defaultOverrides.get(`${editingDefault.kind}::${editingDefault.defaultKey}`)
              ?.name_override ?? editingDefault.label
          }
          initialImage={
            defaultOverrides.get(`${editingDefault.kind}::${editingDefault.defaultKey}`)
              ?.image_url_override ?? null
          }
          onSaved={(n) => handleDefaultSaved(editingDefault, n)}
          onClose={() => setEditingDefault(null)}
        />
      )}
    </>
  );
}

function ConfirmDeleteModal({
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
      <div className="w-full max-w-xs rounded-2xl border border-red-500/40 bg-[#0a0d0a] p-5 text-center shadow-2xl">
        <div className="font-display text-sm uppercase tracking-widest text-red-400">
          Delete item?
        </div>
        <div className="mt-3 text-sm text-white/80">
          Remove <span className="font-bold text-white">{label}</span> from your decor? Purchase history for this item will also be erased. If it's currently active, the default will take over.
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
            className="btn-3d flex-1 !rounded-lg !bg-red-600 !px-2 !py-2 text-[11px] !text-white hover:!bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
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
