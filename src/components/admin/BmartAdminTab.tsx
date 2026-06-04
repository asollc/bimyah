import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Upload, Plus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  listBmartProducts,
  upsertBmartProduct,
  deleteBmartProduct,
  listBmartCategoryImages,
  upsertBmartCategoryImage,
} from "@/lib/rpc/bmart.functions";

const CURRENCIES = ["bimbucks", "bimbits"] as const;
const CATEGORIES = ["cards", "victory", "titles", "backgrounds", "tabletops"] as const;
type Currency = (typeof CURRENCIES)[number];
type Category = (typeof CATEGORIES)[number];

// Mirror of bmart.tsx PRODUCTS list (id + default metadata only).
const BUILTIN: Array<{ id: string; name: string; category: Category; price: number; currency: Currency }> = [
  { id: "card_back_crimson", name: "Bimyah! Card Back — Crimson", category: "cards", price: 0, currency: "bimbucks" },
  { id: "card_back_emerald", name: "Bimyah! Card Back — Emerald", category: "cards", price: 750, currency: "bimbucks" },
  { id: "card_back_sapphire", name: "Bimyah! Card Back — Sapphire", category: "cards", price: 1000, currency: "bimbits" },
  { id: "card_back_amethyst", name: "Bimyah! Card Back — Amethyst", category: "cards", price: 1250, currency: "bimbucks" },
  { id: "card_back_gold", name: "Bimyah! Card Back — Royal Gold", category: "cards", price: 1500, currency: "bimbucks" },
  { id: "card_back_obsidian", name: "Bimyah! Card Back — Obsidian", category: "cards", price: 1750, currency: "bimbits" },
  { id: "victory_fireworks", name: "Fireworks Victory", category: "victory", price: 1500, currency: "bimbucks" },
  { id: "victory_confetti", name: "Confetti Cannon", category: "victory", price: 750, currency: "bimbucks" },
  { id: "victory_stars", name: "Starlight Shower", category: "victory", price: 600, currency: "bimbits" },
  { id: "title_champion_3d", name: "3D Gold Champion Title", category: "titles", price: 2500, currency: "bimbucks" },
  { id: "title_legend", name: "Legend Title", category: "titles", price: 1200, currency: "bimbucks" },
  { id: "title_rookie", name: "Rookie Title", category: "titles", price: 300, currency: "bimbits" },
  { id: "bg_green", name: "Emerald Felt Background", category: "backgrounds", price: 1000, currency: "bimbucks" },
  { id: "bg_blue", name: "Sapphire Lounge Background", category: "backgrounds", price: 1000, currency: "bimbucks" },
  { id: "bg_pink", name: "Rose Boudoir Background", category: "backgrounds", price: 1000, currency: "bimbucks" },
  { id: "tabletop_gold", name: "Gold Metallic Table Top", category: "tabletops", price: 2000, currency: "bimbucks" },
  { id: "tabletop_silver", name: "Silver Metallic Table Top", category: "tabletops", price: 1500, currency: "bimbucks" },
];

type Override = {
  id: string;
  name: string | null;
  price: number | null;
  currency: Currency | null;
  category: Category | null;
  hidden: boolean;
  image_url: string | null;
  is_custom: boolean;
  sort_order: number;
};

type Row = {
  id: string;
  name: string;
  category: Category;
  price: number;
  currency: Currency;
  hidden: boolean;
  image_url: string | null;
  is_custom: boolean;
  isBuiltin: boolean;
  hasOverride: boolean;
};

function mergeRows(overrides: Override[]): Row[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const rows: Row[] = [];
  for (const b of BUILTIN) {
    const o = byId.get(b.id);
    rows.push({
      id: b.id,
      name: o?.name ?? b.name,
      category: (o?.category as Category) ?? b.category,
      price: o?.price ?? b.price,
      currency: (o?.currency as Currency) ?? b.currency,
      hidden: o?.hidden ?? false,
      image_url: o?.image_url ?? null,
      is_custom: false,
      isBuiltin: true,
      hasOverride: !!o,
    });
    byId.delete(b.id);
  }
  for (const o of byId.values()) {
    rows.push({
      id: o.id,
      name: o.name ?? o.id,
      category: (o.category as Category) ?? "cards",
      price: o.price ?? 0,
      currency: (o.currency as Currency) ?? "bimbucks",
      hidden: o.hidden,
      image_url: o.image_url,
      is_custom: true,
      isBuiltin: false,
      hasOverride: true,
    });
  }
  return rows;
}

export function BmartAdminTab() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listBmartProducts();
      setOverrides(res.rows as Override[]);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const rows = useMemo(
    () => mergeRows(overrides).filter((r) => filter === "all" || r.category === filter),
    [overrides, filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <div className="flex-1" />
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> New custom product
        </Button>
      </div>

      <CategoryImagesSection />

      {adding && (
        <NewProductForm
          existingIds={rows.map((r) => r.id)}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}

      {loading && !rows.length ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 text-xs [&_input]:h-7 [&_input]:text-xs [&_button]:text-xs [&_[role=combobox]]:h-7 [&_[role=combobox]]:text-xs">
          {rows.map((r) => (
            <ProductEditor key={r.id} row={r} onChanged={refresh} />
          ))}
          {!rows.length && (
            <div className="col-span-full p-6 text-center text-sm text-muted-foreground">
              No products
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductEditor({ row, onChanged }: { row: Row; onChanged: () => void | Promise<void> }) {
  const [name, setName] = useState(row.name);
  const [price, setPrice] = useState(row.price);
  const [currency, setCurrency] = useState<Currency>(row.currency);
  const [category, setCategory] = useState<Category>(row.category);
  const [hidden, setHidden] = useState(row.hidden);
  const [imageUrl, setImageUrl] = useState<string | null>(row.image_url);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(row.name);
    setPrice(row.price);
    setCurrency(row.currency);
    setCategory(row.category);
    setHidden(row.hidden);
    setImageUrl(row.image_url);
  }, [row]);

  async function handleSave() {
    setBusy(true);
    try {
      await upsertBmartProduct({
        data: {
          id: row.id,
          name,
          price,
          currency,
          category,
          hidden,
          image_url: imageUrl,
          is_custom: row.is_custom,
        },
      });
      toast.success("Saved");
      await onChanged();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const label = row.is_custom ? "Delete this custom product?" : "Reset overrides to defaults?";
    if (!confirm(label)) return;
    setBusy(true);
    try {
      await deleteBmartProduct({ data: { id: row.id } });
      toast.success(row.is_custom ? "Deleted" : "Reset");
      await onChanged();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bmart/${row.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Image uploaded — click Save to persist");
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-2 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/50">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[8px] text-muted-foreground text-center px-1">Built-in</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1">
            <Badge variant={row.is_custom ? "default" : "outline"} className="text-[10px]">
              {row.is_custom ? "Custom" : "Built-in"}
            </Badge>
            {row.hasOverride && !row.is_custom && (
              <Badge variant="secondary" className="text-[10px]">Overridden</Badge>
            )}
            {hidden && <Badge variant="destructive" className="text-[10px]">Hidden</Badge>}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground truncate">{row.id}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</label>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(parseInt(e.target.value || "0", 10))}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Currency</label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</label>
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3 mr-1" />
          )}
          Image
        </Button>
        {imageUrl && (
          <Button size="sm" variant="ghost" onClick={() => setImageUrl(null)}>
            Clear image
          </Button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setHidden((h) => !h)}
          title={hidden ? "Show in Bmart" : "Hide from Bmart"}
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={() => void handleSave()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        {row.hasOverride && (
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            <Trash2 className="h-3 w-3 mr-1" />
            {row.is_custom ? "Delete" : "Reset"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function NewProductForm({
  existingIds,
  onCancel,
  onSaved,
}: {
  existingIds: string[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(100);
  const [currency, setCurrency] = useState<Currency>("bimbucks");
  const [category, setCategory] = useState<Category>("cards");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const slug = id || `custom_${Date.now()}`;
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bmart/${slug}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!id.match(/^[a-zA-Z0-9_-]+$/)) {
      toast.error("ID must be alphanumeric/underscore/dash");
      return;
    }
    if (existingIds.includes(id)) {
      toast.error("ID already exists");
      return;
    }
    if (!name) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      await upsertBmartProduct({
        data: {
          id,
          name,
          price,
          currency,
          category,
          image_url: imageUrl,
          is_custom: true,
          hidden: false,
        },
      });
      toast.success("Product created");
      await onSaved();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3 border-primary">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">New custom product</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">ID (slug, no spaces)</label>
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="custom_my_item" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Price</label>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(parseInt(e.target.value || "0", 10))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Currency</label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] uppercase text-muted-foreground">Category</label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
          Upload image
        </Button>
        {imageUrl && (
          <img src={imageUrl} alt="" className="h-12 w-12 object-contain rounded border" />
        )}
      </div>
      <Button disabled={busy} onClick={() => void handleSave()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create product"}
      </Button>
    </Card>
  );
}

function CategoryImagesSection() {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listBmartCategoryImages();
      const map: Record<string, string | null> = {};
      for (const r of res.rows) map[r.id] = r.image_url;
      setImages(map);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Category card images</h3>
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORIES.map((c) => (
          <CategoryImageEditor
            key={c}
            category={c}
            imageUrl={images[c] ?? null}
            onChanged={refresh}
          />
        ))}
      </div>
    </Card>
  );
}

function CategoryImageEditor({
  category,
  imageUrl,
  onChanged,
}: {
  category: Category;
  imageUrl: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(imageUrl);
  }, [imageUrl]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `bmart/category-${category}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function save(next: string | null) {
    setSaving(true);
    try {
      await upsertBmartCategoryImage({ data: { id: category, image_url: next } });
      toast.success("Category image saved");
      setUrl(next);
      await onChanged();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{category}</div>
      <div className="grid h-20 w-full place-items-center overflow-hidden rounded bg-muted/50">
        {url ? (
          <img src={url} alt={category} className="h-full w-full object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">Default icon</span>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()} className="h-7 text-xs">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
          Upload
        </Button>
        <Button
          size="sm"
          disabled={saving || url === imageUrl}
          onClick={() => void save(url)}
          className="h-7 text-xs"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
        {imageUrl && (
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => void save(null)}
            className="h-7 text-xs"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
