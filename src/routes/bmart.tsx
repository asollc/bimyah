import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ShoppingCart, X, Eye, Plus, Minus, Trash2, Sparkles } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { BimbucksIcon, BimbitsIcon } from "@/components/wallet/CurrencyIcons";
import { WalletOverlay } from "@/components/wallet/WalletOverlay";
import { Confetti } from "@/components/game/Visuals";
import { CardBack } from "@/components/game/Card";
import { listBmartProducts } from "@/lib/rpc/bmart.functions";
import { purchaseItem } from "@/lib/rpc/decor.functions";
import { toast } from "sonner";

const KIND_BY_CATEGORY: Record<CategoryId, "card_back" | "victory" | "title" | "badge" | "background" | "tabletop" | "table_art"> = {
  cards: "card_back",
  victory: "victory",
  titles: "title",
  backgrounds: "background",
  tabletops: "tabletop",
};

export const Route = createFileRoute("/bmart")({
  head: () => ({
    meta: [
      { title: "Bmart — Bimyah! bling for those who like to look good while they play good." },
      { name: "description", content: "Bmart is the in-game marketplace for Bimyah! — card backs, victory effects, titles, backgrounds, and table tops." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BmartPage,
});

/* ---------------- Types ---------------- */

type Currency = "bimbucks" | "bimbits";
type CategoryId = "cards" | "victory" | "titles" | "backgrounds" | "tabletops";

type Product = {
  id: string;
  name: string;
  category: CategoryId;
  price: number;
  currency: Currency;
  /** Render the product preview thumbnail */
  preview: React.ReactNode;
  /** Optional larger preview (e.g. victory effect demo) */
  bigPreview?: React.ReactNode;
};

type CartItem = { product: Product; qty: number };

type BmartOverrideRow = {
  id: string;
  name: string | null;
  price: number | null;
  currency: Currency | null;
  category: CategoryId | null;
  hidden: boolean;
  image_url: string | null;
  is_custom: boolean;
  sort_order: number;
};

function mergeCatalog(base: Product[], overrides: BmartOverrideRow[]): Product[] {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const merged: Product[] = [];
  for (const p of base) {
    const o = byId.get(p.id);
    if (!o) {
      merged.push(p);
      continue;
    }
    if (o.hidden) continue;
    merged.push({
      ...p,
      name: o.name ?? p.name,
      price: o.price ?? p.price,
      currency: o.currency ?? p.currency,
      category: o.category ?? p.category,
      preview: o.image_url ? <ImagePreview src={o.image_url} alt={o.name ?? p.name} /> : p.preview,
    });
    byId.delete(p.id);
  }
  // Add admin-created custom products (not present in base list)
  for (const o of byId.values()) {
    if (o.hidden) continue;
    if (!o.is_custom) continue;
    if (!o.category || !o.currency || o.price == null) continue;
    merged.push({
      id: o.id,
      name: o.name ?? o.id,
      category: o.category,
      currency: o.currency,
      price: o.price,
      preview: o.image_url ? (
        <ImagePreview src={o.image_url} alt={o.name ?? o.id} />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs text-white/40">No preview</div>
      ),
    });
  }
  return merged;
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-contain"
      loading="lazy"
    />
  );
}

const CARD_COLORS: { id: string; name: string; gradient: string }[] = [
  { id: "crimson", name: "Crimson", gradient: "radial-gradient(circle at 50% 50%, oklch(0.55 0.24 25), oklch(0.18 0.08 20))" },
  { id: "emerald", name: "Emerald", gradient: "radial-gradient(circle at 50% 50%, oklch(0.55 0.22 150), oklch(0.18 0.08 150))" },
  { id: "sapphire", name: "Sapphire", gradient: "radial-gradient(circle at 50% 50%, oklch(0.55 0.22 250), oklch(0.18 0.08 250))" },
  { id: "amethyst", name: "Amethyst", gradient: "radial-gradient(circle at 50% 50%, oklch(0.55 0.22 305), oklch(0.18 0.08 305))" },
  { id: "gold", name: "Royal Gold", gradient: "radial-gradient(circle at 50% 50%, oklch(0.85 0.18 90), oklch(0.35 0.12 80))" },
  { id: "obsidian", name: "Obsidian", gradient: "radial-gradient(circle at 50% 50%, oklch(0.4 0.04 280), oklch(0.1 0.02 280))" },
];

const BG_VARIANTS: { id: string; name: string; gradient: string }[] = [
  { id: "green", name: "Emerald Felt", gradient: "radial-gradient(ellipse at center, oklch(0.55 0.18 150) 0%, oklch(0.2 0.1 150) 100%)" },
  { id: "blue", name: "Sapphire Lounge", gradient: "radial-gradient(ellipse at center, oklch(0.55 0.18 245) 0%, oklch(0.2 0.1 245) 100%)" },
  { id: "pink", name: "Rose Boudoir", gradient: "radial-gradient(ellipse at center, oklch(0.7 0.18 0) 0%, oklch(0.25 0.12 0) 100%)" },
];

const TABLETOPS: { id: string; name: string; gradient: string }[] = [
  { id: "gold", name: "Gold Metallic", gradient: "linear-gradient(135deg, #f9e08a 0%, #d9a834 40%, #8a6a16 100%)" },
  { id: "silver", name: "Silver Metallic", gradient: "linear-gradient(135deg, #f4f4f4 0%, #b8b8b8 40%, #6e6e6e 100%)" },
];

const PRODUCTS: Product[] = [
  // Cards — Bimyah! card backs in different colors
  ...CARD_COLORS.map<Product>((c, i) => ({
    id: `card_back_${c.id}`,
    name: `Bimyah! Card Back — ${c.name}`,
    category: "cards",
    price: i === 0 ? 0 : 500 + i * 250,
    currency: i % 3 === 2 ? "bimbits" : "bimbucks",
    preview: <CardBackSwatch gradient={c.gradient} />,
  })),

  // Victory effects
  {
    id: "victory_fireworks",
    name: "Fireworks Victory",
    category: "victory",
    price: 1500,
    currency: "bimbucks",
    preview: <VictoryEffectThumb effect="fireworks" />,
    bigPreview: <VictoryWinPreview effect="fireworks" />,
  },
  {
    id: "victory_confetti",
    name: "Confetti Cannon",
    category: "victory",
    price: 750,
    currency: "bimbucks",
    preview: <VictoryEffectThumb effect="confetti" />,
    bigPreview: <VictoryWinPreview effect="confetti" />,
  },
  {
    id: "victory_stars",
    name: "Starlight Shower",
    category: "victory",
    price: 600,
    currency: "bimbits",
    preview: <VictoryEffectThumb effect="stars" />,
    bigPreview: <VictoryWinPreview effect="stars" />,
  },

  // Titles
  {
    id: "title_champion_3d",
    name: "3D Gold Champion Title",
    category: "titles",
    price: 2500,
    currency: "bimbucks",
    preview: <TitleNameplatePreview />,
  },
  {
    id: "title_legend",
    name: "Legend Title",
    category: "titles",
    price: 1200,
    currency: "bimbucks",
    preview: <PlainTitleChip label="LEGEND" tone="mint" />,
  },
  {
    id: "title_rookie",
    name: "Rookie Title",
    category: "titles",
    price: 300,
    currency: "bimbits",
    preview: <PlainTitleChip label="ROOKIE" tone="dark" />,
  },

  // Backgrounds
  ...BG_VARIANTS.map<Product>((b) => ({
    id: `bg_${b.id}`,
    name: `${b.name} Background`,
    category: "backgrounds",
    price: 1000,
    currency: "bimbucks",
    preview: <BackgroundSwatch gradient={b.gradient} />,
  })),

  // Table tops
  ...TABLETOPS.map<Product>((t) => ({
    id: `tabletop_${t.id}`,
    name: `${t.name} Table Top`,
    category: "tabletops",
    price: t.id === "gold" ? 2000 : 1500,
    currency: "bimbucks",
    preview: <TableTopSwatch gradient={t.gradient} />,
  })),
];

const CATEGORIES: { id: CategoryId; name: string; tag: string; accent: string }[] = [
  { id: "cards", name: "Cards", tag: "Custom card backs", accent: "from-rose-500/30 to-rose-900/20" },
  { id: "victory", name: "Victory Effects", tag: "Win in style", accent: "from-amber-400/30 to-amber-800/20" },
  { id: "titles", name: "Titles", tag: "Wear the brag", accent: "from-emerald-400/30 to-emerald-900/20" },
  { id: "backgrounds", name: "Backgrounds", tag: "Set the mood", accent: "from-sky-400/30 to-sky-900/20" },
  { id: "tabletops", name: "Table Tops", tag: "Lay it down lux", accent: "from-yellow-300/30 to-yellow-800/20" },
];

/* ---------------- Page ---------------- */

function BmartPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState({ bimbucks: 0, bimbits: 0 });
  const [activeCat, setActiveCat] = useState<CategoryId | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [overrides, setOverrides] = useState<BmartOverrideRow[]>([]);

  useEffect(() => {
    void listBmartProducts()
      .then((res) => setOverrides(res.rows as BmartOverrideRow[]))
      .catch(() => {});
  }, []);

  const catalog = useMemo(() => mergeCatalog(PRODUCTS, overrides), [overrides]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("wallets")
        .select("bimbucks, bimbits")
        .eq("user_id", user.id)
        .maybeSingle();
      setWallet({
        bimbucks: (data?.bimbucks as number) ?? 0,
        bimbits: (data?.bimbits as number) ?? 0,
      });
    })();
  }, [user, walletOpen]);

  const cartCount = cart.reduce((n, i) => n + i.qty, 0);

  function addToCart(p: Product) {
    setCart((prev) => {
      const found = prev.find((i) => i.product.id === p.id);
      if (found) return prev.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { product: p, qty: 1 }];
    });
    toast.success(`Added to cart: ${p.name}`);
  }

  async function buyNow(p: Product) {
    const have = p.currency === "bimbucks" ? wallet.bimbucks : wallet.bimbits;
    if (have < p.price) {
      if (p.currency === "bimbucks") {
        toast.error("Not enough Bimbucks. Buy more to continue.");
        setWalletOpen(true);
      } else {
        toast.error("Not enough Bimbits. Earn more by completing tasks.");
      }
      return;
    }
    try {
      const res = await purchaseItem({
        data: {
          itemId: p.id,
          itemName: p.name,
          currency: p.currency,
          price: p.price,
          kind: KIND_BY_CATEGORY[p.category],
        },
      });
      setWallet({ bimbucks: res.bimbucks, bimbits: res.bimbits });
      toast.success(`Purchased ${p.name}! Added to your profile.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="relative min-h-[calc(100dvh-50px)] w-full text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2">
          <Link to="/" className="flex items-center gap-1 rounded-md px-2 py-1 text-white/70 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs uppercase tracking-widest">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <CurrencyChip icon={<BimbucksIcon size={16} />} value={wallet.bimbucks} />
            <CurrencyChip icon={<BimbitsIcon size={16} />} value={wallet.bimbits} />
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Open cart"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-gradient-to-b from-white/10 to-black/40 text-white shadow-[0_4px_0_0_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)] active:translate-y-0.5"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gold)] px-1 text-[10px] font-black text-black">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              className="group relative inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--gold)]/60 bg-gradient-to-b from-[#f4cf6a] via-[#d9a834] to-[#8a6a16] px-3 text-[11px] font-black uppercase tracking-wider text-[#1a1303] shadow-[0_4px_0_0_#5a4310,0_6px_12px_-2px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)] active:translate-y-0.5"
            >
              <BimbucksIcon size={14} />
              <span className="hidden sm:inline">Buy Bimbucks</span>
              <span className="sm:hidden">Buy</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        {activeCat === null ? (
          <>
            {/* Hero */}
            <header className="mb-8 mt-2 text-center">
              <h1 className="bmart-logo">Bmart</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
                Bimyah! bling for those who like to look good while they play good.
              </p>
            </header>

            {/* Category grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${c.accent} text-left shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-transform hover:-translate-y-0.5 hover:border-[var(--gold)]/50`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
                  <div className="absolute inset-x-0 top-0 grid place-items-center pt-6">
                    <CategoryIcon id={c.id} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <div className="font-display text-sm font-black uppercase tracking-widest text-white">
                      {c.name}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-white/60">
                      {c.tag}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <CategoryView
            categoryId={activeCat}
            catalog={catalog}
            onBack={() => setActiveCat(null)}
            onAdd={addToCart}
            onBuy={buyNow}
            onPreview={(p) => setPreviewProduct(p)}
          />
        )}
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <CartOverlay
          items={cart}
          wallet={wallet}
          onClose={() => setCartOpen(false)}
          onClear={() => setCart([])}
          onInc={(id) =>
            setCart((prev) => prev.map((i) => (i.product.id === id ? { ...i, qty: i.qty + 1 } : i)))
          }
          onDec={(id) =>
            setCart((prev) =>
              prev
                .map((i) => (i.product.id === id ? { ...i, qty: i.qty - 1 } : i))
                .filter((i) => i.qty > 0),
            )
          }
          onRemove={(id) => setCart((prev) => prev.filter((i) => i.product.id !== id))}
          onCheckout={() => {
            const needBimbucks = cart
              .filter((i) => i.product.currency === "bimbucks")
              .reduce((n, i) => n + i.product.price * i.qty, 0);
            const needBimbits = cart
              .filter((i) => i.product.currency === "bimbits")
              .reduce((n, i) => n + i.product.price * i.qty, 0);
            if (needBimbucks > wallet.bimbucks) {
              toast.error("Not enough Bimbucks for this cart.");
              setCartOpen(false);
              setWalletOpen(true);
              return;
            }
            if (needBimbits > wallet.bimbits) {
              toast.error("Not enough Bimbits for this cart.");
              return;
            }
            toast.success("Checkout complete (placeholder).");
            setCart([]);
            setCartOpen(false);
          }}
          onBuyBimbucks={() => {
            setCartOpen(false);
            setWalletOpen(true);
          }}
        />
      )}

      {/* Wallet overlay */}
      {walletOpen && user && (
        <WalletOverlay userId={user.id} onClose={() => setWalletOpen(false)} />
      )}

      {/* Victory preview modal */}
      {previewProduct && (
        <PreviewModal product={previewProduct} onClose={() => setPreviewProduct(null)} />
      )}
    </div>
  );
}

/* ---------------- Category view ---------------- */

function CategoryView({
  categoryId,
  catalog,
  onBack,
  onAdd,
  onBuy,
  onPreview,
}: {
  categoryId: CategoryId;
  catalog: Product[];
  onBack: () => void;
  onAdd: (p: Product) => void;
  onBuy: (p: Product) => void;
  onPreview: (p: Product) => void;
}) {
  const cat = CATEGORIES.find((c) => c.id === categoryId)!;
  const items = useMemo(() => catalog.filter((p) => p.category === categoryId), [catalog, categoryId]);


  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs uppercase tracking-widest text-white/70 hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> All categories
      </button>
      <h2 className="font-display text-2xl font-black uppercase tracking-widest text-[var(--gold)]">
        {cat.name}
      </h2>
      <p className="mb-5 text-xs uppercase tracking-widest text-white/50">{cat.tag}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} onAdd={onAdd} onBuy={onBuy} onPreview={onPreview} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
  onBuy,
  onPreview,
}: {
  product: Product;
  onAdd: (p: Product) => void;
  onBuy: (p: Product) => void;
  onPreview: (p: Product) => void;
}) {
  const isVictory = product.category === "victory";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-black/40 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-transform hover:-translate-y-0.5 hover:border-[var(--gold)]/50">
      {/* Add to cart icon */}
      <button
        type="button"
        onClick={() => onAdd(product)}
        aria-label="Add to cart"
        className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
      >
        <ShoppingCart className="h-4 w-4" />
      </button>

      <div className="relative grid aspect-square place-items-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_60%)] p-4">
        {product.preview}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="font-display text-[13px] font-bold uppercase tracking-wide text-white">
          {product.name}
        </div>
        <div className="flex items-center gap-1 text-sm">
          {product.currency === "bimbucks" ? (
            <BimbucksIcon size={16} />
          ) : (
            <BimbitsIcon size={16} />
          )}
          <span className="font-display text-[var(--gold)]">
            {product.price.toLocaleString()}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBuy(product)}
            className="btn-3d btn-3d-gold flex-1 !rounded-lg !px-2 !py-2 text-[10px]"
          >
            Buy Now
          </button>
          {isVictory && (
            <button
              type="button"
              onClick={() => onPreview(product)}
              aria-label="Preview effect"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-black/40 text-white hover:border-[var(--gold)] hover:text-[var(--gold)]"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Cart overlay ---------------- */

function CartOverlay({
  items,
  wallet,
  onClose,
  onClear,
  onInc,
  onDec,
  onRemove,
  onCheckout,
  onBuyBimbucks,
}: {
  items: CartItem[];
  wallet: { bimbucks: number; bimbits: number };
  onClose: () => void;
  onClear: () => void;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  onBuyBimbucks: () => void;
}) {
  const totalBimbucks = items
    .filter((i) => i.product.currency === "bimbucks")
    .reduce((n, i) => n + i.product.price * i.qty, 0);
  const totalBimbits = items
    .filter((i) => i.product.currency === "bimbits")
    .reduce((n, i) => n + i.product.price * i.qty, 0);
  const shortBimbucks = Math.max(0, totalBimbucks - wallet.bimbucks);

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-end bg-black/70 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col border-l border-[var(--gold)]/30 bg-[#0a0d0a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-display text-base uppercase tracking-widest text-[var(--gold)]">
            Cart
          </h2>
          <button onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close cart">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-white/50">
              Your cart is empty.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((i) => (
                <div
                  key={i.product.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-2"
                >
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-black/40">
                    <div className="scale-[0.55]">{i.product.preview}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-display text-xs uppercase tracking-wide text-white">
                      {i.product.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs">
                      {i.product.currency === "bimbucks" ? (
                        <BimbucksIcon size={12} />
                      ) : (
                        <BimbitsIcon size={12} />
                      )}
                      <span className="text-[var(--gold)]">
                        {(i.product.price * i.qty).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDec(i.product.id)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/50 hover:border-[var(--gold)]"
                      aria-label="Decrease"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-5 text-center text-xs">{i.qty}</span>
                    <button
                      onClick={() => onInc(i.product.id)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/50 hover:border-[var(--gold)]"
                      aria-label="Increase"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onRemove(i.product.id)}
                      className="ml-1 grid h-7 w-7 place-items-center rounded-md border border-white/10 text-white/50 hover:border-red-400/60 hover:text-red-300"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-black/60 p-3">
          <div className="mb-3 flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-white/70">
                <BimbucksIcon size={12} /> Total
              </span>
              <span className="font-display text-[var(--gold)]">
                {totalBimbucks.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-white/70">
                <BimbitsIcon size={12} /> Total
              </span>
              <span className="font-display text-[var(--gold)]">
                {totalBimbits.toLocaleString()}
              </span>
            </div>
            {shortBimbucks > 0 && (
              <div className="mt-1 text-[10px] uppercase tracking-widest text-red-300">
                Need {shortBimbucks.toLocaleString()} more Bimbucks
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              disabled={items.length === 0}
              className="btn-3d btn-3d-dark !rounded-lg !px-3 !py-2 text-[10px] disabled:opacity-40"
            >
              Clear
            </button>
            {shortBimbucks > 0 ? (
              <button
                onClick={onBuyBimbucks}
                className="btn-3d btn-3d-gold flex-1 !rounded-lg !px-3 !py-2 text-[11px]"
              >
                Buy Bimbucks
              </button>
            ) : (
              <button
                onClick={onCheckout}
                disabled={items.length === 0}
                className="btn-3d btn-3d-mint flex-1 !rounded-lg !px-3 !py-2 text-[11px] disabled:opacity-40"
              >
                Checkout
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Preview modal (victory effects) ---------------- */

function PreviewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-[#0a0d0a] p-5 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-2 top-2 text-white/60 hover:text-white"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center font-display text-sm uppercase tracking-widest text-[var(--gold)]">
          Preview — {product.name}
        </div>
        <div className="mt-4">{product.bigPreview ?? product.preview}</div>
      </div>
    </div>
  );
}

/* ---------------- Bits & swatches ---------------- */

function CurrencyChip({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      {icon}
      <span className="font-display text-xs font-bold text-white">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function CategoryIcon({ id }: { id: CategoryId }) {
  if (id === "cards") return <CardBackSwatch gradient={CARD_COLORS[0].gradient} size={90} />;
  if (id === "victory") return <VictoryEffectThumb effect="fireworks" small />;
  if (id === "titles") return <TitleNameplatePreview compact />;
  if (id === "backgrounds") return <BackgroundSwatch gradient={BG_VARIANTS[0].gradient} size={100} />;
  return <TableTopSwatch gradient={TABLETOPS[0].gradient} size={100} />;
}

function CardBackSwatch({ gradient, size = 110 }: { gradient: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size * 1.4, background: gradient }}
      className="relative rounded-lg border border-white/15 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.15)]"
    >
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-2xl font-black italic text-white/90 drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
          B!
        </span>
      </div>
    </div>
  );
}

function BackgroundSwatch({ gradient, size = 130 }: { gradient: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size * 0.75, background: gradient }}
      className="rounded-lg border border-white/15 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.2)]"
    />
  );
}

function TableTopSwatch({ gradient, size = 130 }: { gradient: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, background: gradient }}
      className="rounded-full border border-white/30 shadow-[0_10px_24px_-6px_rgba(0,0,0,0.8),inset_0_2px_2px_rgba(255,255,255,0.5),inset_0_-6px_12px_rgba(0,0,0,0.4)]"
    />
  );
}

function VictoryEffectThumb({ effect, small = false }: { effect: "fireworks" | "confetti" | "stars"; small?: boolean }) {
  const dim = small ? 90 : 130;
  return (
    <div
      style={{ width: dim, height: dim }}
      className="relative grid place-items-center overflow-hidden rounded-xl border border-white/15 bg-gradient-to-b from-[#1a0608] to-black shadow-[0_8px_20px_-6px_rgba(0,0,0,0.7)]"
    >
      {effect === "fireworks" && <FireworkBurst />}
      {effect === "confetti" && <MiniConfetti />}
      {effect === "stars" && <StarShower />}
      <Sparkles className="absolute h-5 w-5 text-[var(--gold)] drop-shadow" />
    </div>
  );
}

function FireworkBurst() {
  const rays = Array.from({ length: 14 });
  return (
    <div className="absolute inset-0">
      {rays.map((_, i) => {
        const angle = (i / rays.length) * 360;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 3,
              height: "42%",
              background: "linear-gradient(to top, transparent, #fbbf24, #fff)",
              transformOrigin: "bottom center",
              transform: `translate(-50%, -100%) rotate(${angle}deg)`,
              filter: "drop-shadow(0 0 4px #fbbf24)",
              animation: "pulse-ring 1.6s ease-in-out infinite",
            }}
          />
        );
      })}
    </div>
  );
}

function MiniConfetti() {
  const bits = Array.from({ length: 24 });
  const colors = ["#2dd4a8", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa"];
  return (
    <div className="absolute inset-0">
      {bits.map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            width: 5,
            height: 8,
            background: colors[i % colors.length],
            transform: `rotate(${i * 33}deg)`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function StarShower() {
  const stars = Array.from({ length: 18 });
  return (
    <div className="absolute inset-0">
      {stars.map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${(i * 47) % 100}%`,
            top: `${(i * 29) % 100}%`,
            color: "#fff",
            fontSize: 8 + (i % 4) * 3,
            textShadow: "0 0 6px #fbbf24",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function TitleNameplatePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-1 ${compact ? "scale-90" : ""}`}>
      <ChampionTitleBadge />
      <div className="flex h-9 items-center rounded-md border border-white/20 bg-black/60 px-2.5 font-display text-xs font-bold tracking-wide text-white">
        Player1
      </div>
    </div>
  );
}

function ChampionTitleBadge() {
  return (
    <div
      className="grid h-9 place-items-center rounded-md border border-[var(--gold)]/70 px-2 font-display text-[10px] font-black italic uppercase tracking-wider"
      style={{
        background: "linear-gradient(180deg, #fff2a8 0%, #f3c849 35%, #b8851d 100%)",
        color: "#3a2806",
        textShadow: "0 1px 0 rgba(255,255,255,0.5)",
        boxShadow: "0 3px 0 #5a4310, inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.3)",
      }}
    >
      ★ Champion
    </div>
  );
}

function PlainTitleChip({ label, tone }: { label: string; tone: "mint" | "dark" }) {
  return (
    <div
      className="rounded-md border border-white/20 px-3 py-2 font-display text-xs font-black uppercase tracking-widest text-white shadow-[0_4px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]"
      style={{
        background:
          tone === "mint"
            ? "linear-gradient(135deg, oklch(0.7 0.24 28), oklch(0.5 0.22 22))"
            : "linear-gradient(135deg, oklch(0.32 0.05 165), oklch(0.18 0.04 165))",
      }}
    >
      {label}
    </div>
  );
}

/* ---------------- Big victory preview (winner declaration) ---------------- */

function VictoryWinPreview({ effect }: { effect: "fireworks" | "confetti" | "stars" }) {
  return (
    <div className="relative grid h-72 place-items-center overflow-hidden rounded-xl border border-white/15 bg-gradient-to-b from-[#1a0608] to-black">
      {effect === "fireworks" && (
        <>
          <div className="absolute left-1/4 top-1/3 scale-150"><FireworkBurst /></div>
          <div className="absolute right-1/4 bottom-1/4 scale-125"><FireworkBurst /></div>
        </>
      )}
      {effect === "confetti" && <Confetti />}
      {effect === "stars" && <div className="absolute inset-0 scale-150"><StarShower /></div>}
      <div className="win-popup relative !w-[80%]">
        <div className="win-popup-inner">
          <div className="win-popup-title">BIMYAH!</div>
          <div className="win-popup-sub">Player1 Wins</div>
          <div className="win-popup-tag text-[var(--gold)]">Champion of the Round</div>
        </div>
      </div>
    </div>
  );
}
