/**
 * Bimyah for Discord: the bot brain behind /api/discord/interactions.
 *
 * A faithful port of the Yapin' bot (~/workspace/bimyah-yapin/worker.js,
 * v0.6.1): the same 12 commands, the same views, the same owner-locked
 * buttons, the same game RPCs. Platform differences:
 *  - Delivery is Discord interactions: slash commands answer with a
 *    message (type 4), button clicks update it (type 7), private
 *    answers are ephemeral (flags 64). /link shows its code in an
 *    ephemeral reply, which is Discord's private delivery (Yapin' had
 *    to fall back to a DM because its slash commands cannot reply
 *    privately).
 *  - Links live in discord_links / discord_link_codes (migration
 *    20261105010000_discord_linking.sql); Discord user ids are
 *    snowflakes, stored as text.
 *  - Bmart art uses the game's own image_url first (Discord renders
 *    any HTTPS host), falling back to the GitHub mirror map the Yapin'
 *    bot needs for its host whitelist.
 *  - /play is answered by the route itself (the established Activity
 *    rich-card reply), not from here.
 *
 * Data access mirrors the Yapin' worker: PostgREST with the service
 * role key from the server env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
 */

export const APP_ID = "1560384511793958922";
export const PLAY_URL = "https://playbimyah.com";
/** OAuth invite for the /add command: view/send/embed/history plus Manage Roles (the auto-roles Verified sweep needs it in each server). */
export const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1560384511793958922&permissions=268520448&integration_type=0&scope=bot+applications.commands";
const GOLD = 16711680;
/** #ff0000 is every Bimyah bot embed's color on both platforms: Bmart first (Ronya, 2026-11-05), then all embeds (Ronya, 2026-11-08). GOLD now holds that red. */
const BMART_RED = 16711680;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 10 * 60 * 1000;
export const COMMANDS = [
  "play", "bimyah", "help", "link", "profile", "unlink",
  "bank", "send", "challenges", "ref", "bmart", "decor", "add",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/* ------------------------------ DB ------------------------------- */
function makeDb() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  async function sb(path: string, opts: { method?: string; body?: unknown } = {}): Promise<Any> {
    if (!base || !key) throw new Error("Supabase server env is not set");
    const res = await fetch(`${base}/rest/v1${path}`, {
      method: opts.method ?? "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (res.status === 204) return null;
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        (out as { message?: string }).message || `Supabase ${opts.method ?? "GET"} ${path} failed (${res.status})`,
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return out;
  }
  return {
    sb,
    async rpc(fn: string, args: Record<string, unknown>): Promise<Any> {
      return sb(`/rpc/${fn}`, { method: "POST", body: args });
    },
    async linkForDiscord(discordUserId: string) {
      const rows = await sb(
        `/discord_links?discord_user_id=eq.${discordUserId}&select=bimyah_user_id,discord_username,created_at`,
      );
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    },
  };
}
type Db = ReturnType<typeof makeDb>;
type Link = { bimyah_user_id: string; discord_user_id: string; discord_username?: string | null };

/* ------------------------- mirrored images ------------------------ */
const ASSET_ROOT = "https://raw.githubusercontent.com/asollc/discopost-assets/main/bimyah";
const PRODUCT_IMG: Record<string, string> = {
  Bplus_founder_badge: `${ASSET_ROOT}/bmart/custom_1793053722408-1793053722408.png`,
  Dev_title: `${ASSET_ROOT}/bmart/Dev_title-1780484639904.png`,
  bg_blue: `${ASSET_ROOT}/bmart/bg_blue-1780920198697.png`,
  bg_green: `${ASSET_ROOT}/bmart/bg_green-1780919352286.jpg`,
  bg_pink: `${ASSET_ROOT}/bmart/bg_pink-1781050841059.png`,
  bg_yellow: `${ASSET_ROOT}/bmart/bg_yellow-1781128329893.png`,
  bplus_badge: `${ASSET_ROOT}/bmart/custom_1782587037164-1782587037164.png`,
  card_back_emerald: `${ASSET_ROOT}/bmart/card_back_emerald-1780483618195.png`,
  card_back_amethyst: `${ASSET_ROOT}/swatches/card_back_amethyst.png`,
  card_back_crimson: `${ASSET_ROOT}/swatches/card_back_crimson.png`,
  card_back_gold: `${ASSET_ROOT}/swatches/card_back_gold.png`,
  card_back_obsidian: `${ASSET_ROOT}/swatches/card_back_obsidian.png`,
  card_back_sapphire: `${ASSET_ROOT}/swatches/card_back_sapphire.png`,
  bg_original_red: `${ASSET_ROOT}/swatches/bg_original_red.png`,
  tabletop_silver: `${ASSET_ROOT}/swatches/tabletop_silver.png`,
  victory_confetti: `${ASSET_ROOT}/swatches/victory_confetti.png`,
  tableart_original: `${ASSET_ROOT}/defaults/tableart_original-table_art-tableart_original-1781587573681.png`,
  tabletop_wooden: `${ASSET_ROOT}/defaults/tabletop_wooden-tabletop_mahogany-1793664182351.png`,
  falling_roses_victory: `${ASSET_ROOT}/bmart/falling_roses_victory-1780934926920.png`,
  founding_carder_title: `${ASSET_ROOT}/bmart/founding_carder_title-1793053698505.png`,
  tabletop_gold: `${ASSET_ROOT}/bmart/tabletop_gold-1793663846461.png`,
  tabletop_oak: `${ASSET_ROOT}/bmart/tabletop_oak-1793662631820.png`,
  tabletop_plastic: `${ASSET_ROOT}/bmart/tabletop_plastic-1793663846461.png`,
  tabletop_rug_plush_pink: `${ASSET_ROOT}/bmart/tabletop_rug_plush_pink-1793665964254.png`,
  tabletop_rug_plush_purple: `${ASSET_ROOT}/bmart/tabletop_rug_plush_purple-1793665964254.png`,
  tabletop_rug_shag_pink: `${ASSET_ROOT}/bmart/tabletop_rug_shag_pink-1793665964254.png`,
  tabletop_rug_shag_purple: `${ASSET_ROOT}/bmart/tabletop_rug_shag_purple-1793665964254.png`,
  tabletop_walnut: `${ASSET_ROOT}/bmart/tabletop_walnut-1793662631820.png`,
  test_background_mq9i14y1_etfpbj: `${ASSET_ROOT}/bmart/test-background-1781182432059.png`,
  test_badge_mq9i4lvj_y8do7b: `${ASSET_ROOT}/bmart/test-badge-1781182592010.png`,
  test_badge_mq9i5ddl_qv4ihb: `${ASSET_ROOT}/bmart/test-badge-1781182629163.png`,
  test_badge_mqpp36o6_3jxp28: `${ASSET_ROOT}/bmart/test-badge-1782161745343.png`,
  test_emblem_mr9fth1y_awhvrl: `${ASSET_ROOT}/bmart/test-emblem-1783355497032.png`,
  test_emblem_mr9ftqc3_mn2r4y: `${ASSET_ROOT}/bmart/test-emblem-1783355508712.png`,
  test_table_art_mq536j72_5mc8lf: `${ASSET_ROOT}/bmart/test-table_art-1780915623984.png`,
  test_tabletop_mq5bx4be_d43sx7: `${ASSET_ROOT}/bmart/tabletop_platinum-1793663846461.png`,
  victory_fireworks: `${ASSET_ROOT}/bmart/victory_fireworks-1781024454045.png`,
  victory_stars: `${ASSET_ROOT}/bmart/victory_stars-1781024467563.png`,
};
const CARDBACK_IMG: Record<string, string> = {
  "3ea14175-021b-4b27-9235-f8ed8948fdef": `${ASSET_ROOT}/cardbacks/3ea14175-021b-4b27-9235-f8ed8948fdef-1780478123165.jpg`,
  "d0f8bcb1-ef5c-4b96-9dee-0831baf63535": `${ASSET_ROOT}/cardbacks/d0f8bcb1-ef5c-4b96-9dee-0831baf63535-1780291935027.jpg`,
};
const CATEGORY_IMG: Record<string, string> = {
  cards: `${ASSET_ROOT}/bmart/cat-category-cards-1780874731055.jpg`,
  victory: `${ASSET_ROOT}/bmart/cat-category-victory-1782170227466.webp`,
  tabletops: `${ASSET_ROOT}/bmart/cat-tabletop_platinum-1793663846461.png`,
  bplus_rewards: `${ASSET_ROOT}/bmart/cat-custom-cat-bplus_rewards-1782206166845.webp`,
};
const BANK_IMG = `${ASSET_ROOT}/bank/wallet-bank-final.png`;
/** The Bmart icon (the cream trading-card shop from the home header),
 * self-hosted at a stable URL under public/ so embeds can hotlink it. */
const BMART_ICON = `${PLAY_URL}/bmart-icon.webp`;
function productImg(p: { id: string; image_url?: string | null }): string | undefined {
  return p.image_url || PRODUCT_IMG[p.id];
}

/* --------------------- challenge catalog (ported) ------------------ */
function buildCatalog() {
  const defs: Any[] = [{
    id: "first-match", name: "First Match", description: "Play your first ever match.",
    target: 1, reward: 1, category: "human", seats: 2,
  }];
  const sizeName = (n: number) => (n === 2 ? "1-on-1" : `${n}-Player`);
  const sizeNameBot = (n: number) => (n === 2 ? "1-on-1" : `${n}-Seat`);
  const sizeTitle = (n: number) => (n === 2 ? "Solo" : n === 8 ? "Full House" : `${n} Seat`);
  const sizeDesc = (n: number) => (n === 2 ? "a 1-on-1 match" : `a match with exactly ${n} players`);
  const sizeDescBot = (n: number) => (n === 2 ? "a 1-on-1 match" : `a match with exactly ${n} seats`);
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    if (n === 2) {
      defs.push({ id: "winner", name: "Solo Winner", description: "Win a 1-on-1 match.", target: 1, reward: 1, category: "human", seats: 2 });
    }
    defs.push(
      { id: `first-of-many-${n}`, name: `First of Many (${n} seats)`, description: n === 2 ? "Complete a 1-on-1 match." : `Complete a match with exactly ${n} players.`, target: 1, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "real-competition" : `play-humans-${n}`, name: `Play ${n === 8 ? "an" : "a"} ${sizeName(n)} Game`, description: `Complete ${sizeDesc(n)} against other players.`, target: 1, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "top-player" : `win-humans-${n}`, name: `Win ${n === 8 ? "an" : "a"} ${sizeName(n)} Game`, description: `Win ${sizeDesc(n)} against other players.`, target: 1, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "bot-battle" : `play-bots-${n}`, name: `Play ${n === 8 ? "an" : "a"} ${sizeNameBot(n)} Game`, description: `Complete ${sizeDescBot(n)} against bots.`, target: 1, reward: 1, category: "bot", seats: n },
      { id: n === 2 ? "bot-champion" : `win-bots-${n}`, name: `Win ${n === 8 ? "an" : "a"} ${sizeNameBot(n)} Game`, description: `Win ${sizeDescBot(n)} against bots.`, target: 1, reward: 1, category: "bot", seats: n },
      { id: `tournament-bots-${n}`, name: `${sizeTitle(n)} Tournament Champion`, description: `Win ${sizeDescBot(n)} in a tournament, against bots.`, target: 1, reward: 1, category: "bot", seats: n },
      { id: n === 2 ? "host-with-the-most" : `host-${n}`, name: `Gracious Host (${n} seats)`, description: `Host ${sizeDesc(n)} that finishes.`, target: 1, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "tournament-champion" : `tournament-${n}`, name: `${sizeTitle(n)} Tournament Champion`, description: `Win ${sizeDesc(n)} in a tournament.`, target: 1, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "regular" : `regular-${n}`, name: `${sizeTitle(n)} Regular`, description: n === 2 ? "Complete 10 1-on-1 matches." : `Complete 10 matches with exactly ${n} players.`, target: 10, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "veteran" : `veteran-${n}`, name: `${sizeTitle(n)} Veteran`, description: n === 2 ? "Complete 25 1-on-1 matches." : `Complete 25 matches with exactly ${n} players.`, target: 25, reward: 1, category: "human", seats: n },
      { id: n === 2 ? "legend" : `legend-${n}`, name: `${sizeTitle(n)} Legend`, description: n === 2 ? "Complete 50 1-on-1 matches." : `Complete 50 matches with exactly ${n} players.`, target: 50, reward: 1, category: "human", seats: n },
    );
  }
  defs.push(
    { id: "party-of-five", name: "Party of Five", description: "Complete a match with exactly 5 players.", target: 1, reward: 1, category: "human", seats: 5 },
    { id: "full-house", name: "Full House", description: "Complete a match in a full 8-player room.", target: 1, reward: 1, category: "human", seats: 8 },
  );
  return defs;
}
const CHALLENGES = buildCatalog();
const CHALLENGE_MAP = new Map(CHALLENGES.map((c) => [c.id, c]));

/* ---------------------------- helpers ---------------------------- */
const fmtN = (n: unknown) => Number(n || 0).toLocaleString("en-US");
const curName = (c: string) => (c === "bimbits" ? "Bimbits" : "Bimbucks");
const row = (...components: Any[]) => ({ type: 1, components });
function withHome(rowsIn: Any[]) {
  const out = rowsIn.filter((r) => r.components.length);
  if (!out.length) return [row(HOME_BUTTON)];
  const last = out[out.length - 1];
  if (last.components.length < 5) last.components.push(HOME_BUTTON);
  else out.push(row(HOME_BUTTON));
  return out;
}
const STYLE_NUM: Record<string, number> = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
const btn = (custom_id: string, label: string, style: string | number = "secondary", extra: Record<string, unknown> = {}) => ({
  type: 2, style: typeof style === "string" ? STYLE_NUM[style] : style, label, custom_id, ...extra,
});
const linkBtn = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const LINK_BUTTON = btn("bimyah:link", "Link my account", "success");
const HOME_BUTTON = btn("nav:home", "Home", "secondary", { emoji: { name: "🏠" } });
const NAV_BUTTONS = [
  btn("nav:profile", "Profile", "primary", { emoji: { name: "👤" } }),
  btn("nav:bank", "Bank", "primary", { emoji: { name: "🏦" } }),
  btn("nav:challenges", "Challenges", "primary", { emoji: { name: "🏆" } }),
  btn("nav:ref", "Referrals", "primary", { emoji: { name: "🔗" } }),
  btn("nav:bmart", "Bmart", "primary", { emoji: { name: "🛒" } }),
  btn("nav:decor", "Decor", "primary", { emoji: { name: "🎨" } }),
  btn("nav:rules", "Rules", "primary", { emoji: { name: "📖" } }),
];
function prettify(id: string) {
  return String(id).replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function newCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/* ---------------------------- link flow --------------------------- */
/**
 * The shared core of the link flow: check for an existing link,
 * otherwise replace any stale code with a fresh one and return it.
 * Delivery is the caller's job and is always private: /link and the
 * "Link my account" button both answer ephemerally on Discord.
 */
async function createLinkCode(db: Db, { userId, username }: { userId: string; username: string | null }) {
  const existing = await db.linkForDiscord(userId);
  if (existing) {
    let name = "your Bimyah account";
    try {
      const rows = await db.sb(`/profiles?id=eq.${existing.bimyah_user_id}&select=display_name`);
      if (rows.length) name = `**${rows[0].display_name}**`;
    } catch {
      /* keep the generic wording */
    }
    return { kind: "already" as const, name };
  }
  const code = newCode();
  await db.sb(`/discord_link_codes?discord_user_id=eq.${userId}&redeemed_at=is.null`, {
    method: "DELETE",
  });
  await db.sb("/discord_link_codes", {
    method: "POST",
    body: {
      code,
      discord_user_id: userId,
      discord_username: username,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    },
  });
  return { kind: "created" as const, code };
}

function linkCodeEmbed(code: string) {
  return {
    title: "🔗 Your Bimyah link code",
    description:
      `**${code}**\n\n` +
      `Open ${PLAY_URL}/profile, sign in, and paste this code under **Connections**, then hit **Link Discord**. It expires in 10 minutes.\n\n` +
      "Only you can see this message. Keep the code to yourself: whoever redeems it links that Bimyah account to your Discord account. If this message disappears, tap **Link my account** again for a fresh code.",
    color: GOLD,
  };
}

/** The shared not-linked card for every link-gated command. Per the
 * standing rule it always carries the button that runs the link flow
 * for the person who needs it. */
function notLinkedPayload() {
  return {
    embeds: [{
      title: "🃏 Link your Bimyah account",
      description:
        "Your Discord account isn't linked to a Bimyah account yet.\n\n" +
        "Tap **Link my account** below and I'll show you a private code that only you can see (or run **/link**). Paste it in Bimyah under **Profile → Connections** (takes about 30 seconds, one time), then this command will show your real account here.",
      color: GOLD,
    }],
    components: [row(LINK_BUTTON, linkBtn("Open Bimyah", `${PLAY_URL}/profile`))],
  };
}

/* --------------------------- data reads -------------------------- */
async function getProfileRow(db: Db, uid: string) {
  const rows = await db.sb(`/profiles?id=eq.${uid}&select=id,display_name,avatar_url,created_at`);
  return rows[0] || { id: uid, display_name: "Player", created_at: null };
}
async function getWallet(db: Db, uid: string) {
  const rows = await db.sb(`/wallets?user_id=eq.${uid}&select=bimbucks,bimbits`);
  return rows[0] || { bimbucks: 0, bimbits: 0 };
}
async function getChallengeRows(db: Db, uid: string) {
  return db.sb(`/user_challenges?user_id=eq.${uid}&select=challenge_id,progress,completed_at,awarded,seats`);
}
/** Bank activity, mirroring the game's getMyLedger merge exactly. */
async function getLedger(db: Db, uid: string) {
  const rows: Any[] = [];
  const ledger = await db.sb(`/purchase_ledger?user_id=eq.${uid}&select=id,item_id,item_name,currency,price,created_at&order=created_at.desc&limit=100`);
  for (const r of ledger) {
    rows.push({ name: r.item_name, currency: r.currency, price: r.price, gain: r.item_id === "admin_gift", created_at: r.created_at });
  }
  const awarded = await db.sb(`/user_challenges?user_id=eq.${uid}&awarded=eq.true&select=challenge_id,completed_at,updated_at`);
  for (const r of awarded) {
    const def = CHALLENGE_MAP.get(r.challenge_id);
    if (!def) continue;
    rows.push({ name: `Challenge reward: ${def.name}`, currency: "bimbits", price: def.reward, gain: true, created_at: r.completed_at || r.updated_at });
  }
  const [tIn, tOut] = await Promise.all([
    db.sb(`/bimbuck_transfers?recipient_id=eq.${uid}&select=id,sender_id,amount,note,created_at&order=created_at.desc&limit=50`),
    db.sb(`/bimbuck_transfers?sender_id=eq.${uid}&select=id,recipient_id,amount,note,created_at&order=created_at.desc&limit=50`),
  ]);
  const otherIds = [...new Set([...tIn.map((r: Any) => r.sender_id), ...tOut.map((r: Any) => r.recipient_id)])];
  const names = new Map<string, string>();
  if (otherIds.length) {
    const profs = await db.sb(`/profiles?id=in.(${otherIds.join(",")})&select=id,display_name`);
    for (const p of profs) names.set(p.id, p.display_name || "Player");
  }
  for (const r of tIn) {
    rows.push({ name: `From ${names.get(r.sender_id) || "Player"}${r.note ? `: ${r.note}` : ""}`, currency: "bimbucks", price: r.amount, gain: true, created_at: r.created_at });
  }
  for (const r of tOut) {
    rows.push({ name: `To ${names.get(r.recipient_id) || "Player"}${r.note ? `: ${r.note}` : ""}`, currency: "bimbucks", price: r.amount, gain: false, created_at: r.created_at });
  }
  rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return rows;
}
async function getReferrals(db: Db, uid: string) {
  const refs = await db.sb(`/referrals?referrer_id=eq.${uid}&select=referred_id,created_at&order=created_at.asc`);
  if (!refs.length) return { rows: [] as Any[], activeCount: 0 };
  const ids = refs.map((r: Any) => r.referred_id);
  const [profs, subs, acts] = await Promise.all([
    db.sb(`/profiles?id=in.(${ids.join(",")})&select=id,display_name`),
    db.sb(`/subscriptions?user_id=in.(${ids.join(",")})&status=eq.active&select=user_id`),
    db.sb(`/recruit_activations?referred_id=in.(${ids.join(",")})&select=referred_id`),
  ]);
  const names = new Map(profs.map((p: Any) => [p.id, p.display_name || "(unknown)"]));
  const plus = new Set(subs.map((s: Any) => s.user_id));
  const active = new Set(acts.map((a: Any) => a.referred_id));
  return {
    rows: refs.map((r: Any) => ({
      display_name: names.get(r.referred_id) || "(unknown)",
      joined_at: r.created_at,
      is_plus: plus.has(r.referred_id),
      active: active.has(r.referred_id),
    })),
    activeCount: active.size,
  };
}
const CATEGORY_ORDER = ["tabletops", "cards", "backgrounds", "titles", "victory", "badges", "emblems", "bplus_rewards"];
const CATEGORY_LABEL: Record<string, string> = { tabletops: "Table Tops", cards: "Card Backs", emblems: "Stickers", badges: "Badges", backgrounds: "Backgrounds", titles: "Titles", victory: "Victory", bplus_rewards: "B+ Member Rewards" };
const CATEGORY_KIND: Record<string, string | null> = { tabletops: "tabletop", cards: "card_back", backgrounds: "background", titles: "title", victory: "victory", badges: "badge", emblems: "emblem", bplus_rewards: null };
/** Ids purged from the game in the admin (Ronya 2026-11-09: delete
 * purges globally). Purged items never sell, equip, or display. */
async function getPurgedIds(db: Db): Promise<Set<string>> {
  const rows = await db.sb("/bmart_purged_items?select=id").catch(() => []);
  return new Set((rows as Any[]).map((r) => r.id as string));
}
async function getProducts(db: Db) {
  const [rows, purged] = await Promise.all([
    db.sb("/bmart_products?hidden=eq.false&select=id,name,price,alt_price,currency,category,kind,image_url,sort_order,created_at&order=sort_order.asc,created_at.asc"),
    getPurgedIds(db),
  ]);
  return rows
    .filter((p: Any) => !purged.has(p.id))
    .sort((a: Any, b: Any) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}
async function getOwned(db: Db, uid: string) {
  return db.sb(`/user_inventory?user_id=eq.${uid}&select=kind,item_id,acquired_at&order=acquired_at.desc`);
}
/** Every product, hidden ones included. The shop sells only visible
 * products, but decor an owner holds is real decor even when the shop
 * no longer lists it (gem card backs, test items), and it must render
 * with its real name and art. Purged ids are excluded entirely: they
 * were deleted from the game, not hidden. */
async function getAllProducts(db: Db) {
  const [rows, purged] = await Promise.all([
    db.sb("/bmart_products?select=id,name,price,alt_price,currency,category,kind,image_url,sort_order,created_at&order=sort_order.asc,created_at.asc"),
    getPurgedIds(db),
  ]);
  return rows.filter((p: Any) => !purged.has(p.id));
}
/** The decor catalog a player's collection is checked against: all
 * products plus the built-in decor defaults. An inventory row that
 * matches neither is not part of any decor menu (its product was
 * deleted) and is never shown. */
async function decorCatalog(db: Db) {
  const [products, defaults] = await Promise.all([
    getAllProducts(db),
    db.sb("/decor_defaults?select=kind,default_key,name_override"),
  ]);
  return {
    byId: new Map<string, Any>(products.map((p: Any) => [p.id, p])),
    defNames: new Map<string, string>(defaults.map((d: Any) => [`${d.kind}:${d.default_key}`, d.name_override || prettify(d.default_key)])),
  };
}
async function getEquipped(db: Db, uid: string) {
  const rows = await db.sb(`/user_equipped?user_id=eq.${uid}&select=*`);
  return rows[0] || {};
}

/* ------------------------------ views ---------------------------- */
/** The How to Play guide for /rules: the same canonical content as
 * the #how_to_play channel post in the Bimyah Discord server.
 * Page 1 (Home) carries the animated banner; the Tournament page
 * ends with a Continue to Scoring link (Ronya, 2026-11-08). */
const GUIDE_PAGES: { title: string; description: string; image?: string }[] = [
  { title: "Home", description: "**Objective**\nBe the first to have **four-of-a-kind** in **all** your face-down piles.\n\n**Setup**\n\u2022 2\u20134 players standard. Up to **8 players** with **Bimyah!+**.\n\u2022 Mix humans and bots however you like. One person can also play solo against bots.\n\u2022 One standard 52-card deck (no Jokers) for 2\u20134 players. Two decks shuffled together for 5\u20138 players.\n\u2022 Cards are dealt into face-down piles of 4. Piles per player: **6** with 2 players, **4** with 3, 6, or 7 players, **5** with 5 players, and **3** with 4 or 8 players.\n\u2022 The middle starts with shared face-up cards: **4 cards** in 2\u20135 player games, **8 cards** in 6\u20138 player games.\n\u2022 No account is needed to play. A guest name is enough. Signing in (free) keeps your currencies, cosmetics, and challenges.\n\n**Winning**\nWhen all 4 cards in your hand are the same rank, tap **SET** to lock that pile. When all your piles are SET, tap the red **BIMYAH!** button to declare victory.", image: "https://raw.githubusercontent.com/asollc/discopost-assets/main/bimyah/bimyah-banner-v4.gif" },
  { title: "Gameplay", description: "**Gameplay**\n1. **Start:** all players tap Ready, then a 3-second countdown begins.\n2. **No turns**: everyone plays at once.\n3. Tap one of your piles to open it. Its 4 cards become your hand.\n4. Tap a center card to **hold** it (your color outlines the empty slot). You have 5 seconds to swap one of your hand cards for it. Otherwise it returns.\n5. Build **four of a kind** in a pile by swapping cards through the center. The center is the bridge between your own piles: swap a card out of one pile into the center, open another pile, and swap it in.\n6. Tap **SORT** to group the cards in your hand by rank.\n\n**Free Cards**\nFree Cards are an option, not an automatic rule. The host can switch them on or off with the **Inactivity timers** toggle in the game's Settings. When the option is on, a player who stops playing for about a minute has their piles become **Free Cards**: face-up and open to everyone. Anyone can hold and swap one Free Card at a time, exactly like a center card, until that player comes back. When the option is off, idle players simply keep their piles and nothing changes." },
  { title: "Limitations", description: "**Limitations**\n\u2022 You can hold only one card at a time (a center card or a Free Card), for up to 5 seconds.\n\u2022 Only one open pile at a time. Opening another pile puts the current one back first.\n\u2022 The center has 4 cards in 2\u20135 player games and 8 cards in 6\u20138 player games.\n\u2022 Your hand is the 4 cards of the pile you have open." },
  { title: "Controls", description: "**Repositioning Seats**\n\u2022 Every **name tag** doubles as a drag handle: press and drag it to move that seat anywhere on the table.\n\u2022 That includes your own seat: drag your name tag to move your hand and piles where you want them.\n\u2022 Layouts are saved per game mode and player count, so your arrangement persists across matches.\n\n**Resizing In-Game Elements**\n\u2022 **Pinch any seat** with two fingers on touch devices to resize it. Pinching your own seat resizes your hand, piles, and SET/SORT buttons.\n\u2022 **Pinch to zoom** the center table (table, center cards, and BIMYAH! button scale together); drag the table to move it.\n\u2022 On a keyboard, use **\u2191 / \u2193** to grow/shrink your own seat and **\u2190 / \u2192** to shrink/grow the center table.\n\u2022 Sizes are remembered locally per mode and player count.\n\n**Stickers**\n\u2022 Equip stickers from the **Decor \u2192 Stickers** tab in your Profile. Equipped stickers appear on either side of your seat.\n\u2022 Stickers are visible in the **lobby** before a match so you can pre-arrange them.\n\u2022 **Drag** your own stickers anywhere on screen with one finger (or mouse): they move independently of your hand and seat.\n\u2022 **Pinch to resize:** InShot-style: keep one finger on the sticker and place a second finger anywhere on the screen; move them apart/together to grow/shrink it.\n\u2022 **Tap another player's sticker** to hide it from your screen. Hidden stickers stay hidden across sessions on this device.\n\u2022 Position and size are remembered locally per sticker." },
  { title: "Keyboard", description: "**Default Center Cards**\n\u2022 **1 \u2013 4**: top row of center cards (left \u2192 right). With 4 or fewer center cards, these are the only row.\n\u2022 **5 \u2013 8**: bottom row of center cards (left \u2192 right), when the center has 8 cards.\n\u2022 **Q W E R**: alternative for the first 4 center cards (top row).\n\u2022 **A S D F**: alternative for the bottom 4 center cards.\n\n**Default Piles & Hand**\n\u2022 **U I O P**: open / interact with pile 1 \u2013 4 (left \u2192 right).\n\u2022 **J K L ;**: select hand cards 1 \u2013 4 (left \u2192 right) inside the opened pile.\n\n**Default Action Keys**\n\u2022 **Spacebar**: tap the **SET** button.\n\u2022 **Shift**: tap the **SORT** button.\n\u2022 **Enter**: tap the **BIMYAH!** button.\n\n**Customize your keybinds**\nRebind any action in the game's **How to Play \u2192 Controls** tab. Changes apply instantly on this device. Sign in and tap **Save** to sync across devices, or **Reset to defaults** to undo all customizations." },
  { title: "Tournament", description: "**Tournament Objective**\nBe the first player to reach the **point limit** set by the host across multiple matches.\n\n**Setup**\n\u2022 The host picks a **point limit** (e.g. 50, 100, 200) when creating the tournament.\n\u2022 All standard BIMYAH rules apply within each match.\n\u2022 Only the **winner** of each match earns points. Everyone else gets 0 for that match.\n\n**Between Matches**\n\u2022 After each match, tap **Start Next Match** and ready up again to begin. Players who don't ready up sit out the next match.\n\u2022 Scores carry over until someone reaches the limit.\n\u2022 When a champion is crowned, the host can tap **Start New Tournament** to reset scores and choose a new point limit.\n\nContinue to [Scoring](https://discord.com/channels/1498968074609627216/1569146060134289460) \u27a1\ufe0f" },
  { title: "Scoring", description: "**Point System**\nPoints are awarded based on the ranks in the winner's locked piles:\n\u2022 **Ace** = 1 point\n\u2022 **2 \u2013 10** = face value (2 = 2 points, etc.)\n\u2022 **Jack** = 11 points\n\u2022 **Queen** = 12 points\n\u2022 **King** = 13 points\nOne rank value is awarded per locked set. Higher cards = bigger payouts.\n\n**Scoreboard**\n\u2022 Tap the gold **Scoreboard** button at the top of the table any time to view it.\n\u2022 Each row is a match; each column is a player.\n\u2022 Cumulative totals appear in the sticky header.\n\u2022 The current leader's column is highlighted in their player color.\n\u2022 Once someone hits the limit, a 3D crown marks the **Champion**." },
  { title: "Multiplayer", description: "**Hosting a Game**\n1. From the home screen, tap **Create Game**.\n2. Choose **Standard** or **Tournament** mode.\n3. Guests enter a player name. Signed-in players use their profile name. For tournaments, set the point limit.\n4. Pick the table size (2\u20134 players free, up to 8 with **Bimyah!+**) and whether the game is public or private.\n5. You'll receive a **4-digit room code**: share it with friends.\n6. Wait in the lobby until everyone joins. When all players have tapped **Ready**, the match begins.\n\n**Joining a Game**\n1. Open the link the host shared, tap **Join with Code** and enter the 4-digit room code, or pick a public game from the list on the home screen.\n2. Enter your player name if you're playing as a guest.\n3. You'll be placed in the lobby. Tap **Ready** when you're set to play.\n4. Rooms also take up to **20 spectators**, who can watch and chat without a seat.\n\n**Reentry Codes**\n\u2022 Each seat has a private **4-digit reentry code** shown when you join.\n\u2022 If you lose connection or close the game, tap **Join with Code**, enter the room code, then tap **Use Reentry Code** to take back your seat: hand, piles, and score intact.\n\u2022 Your most recent reentry code for a room is remembered on this device." },
];

/** One page of the /rules guide as a message payload. The nav
 * buttons are public (any clicker, no link needed): the guide is
 * reference material, not account data. */
function rulesView(page: number) {
  const total = GUIDE_PAGES.length;
  const idx = Math.min(Math.max(page || 0, 0), total - 1);
  const p = GUIDE_PAGES[idx];
  const embed: Any = {
    title: p.title,
    description: p.description,
    color: GOLD,
    author: { name: "How to Play BIMYAH!", icon_url: "https://raw.githubusercontent.com/asollc/discopost-assets/main/bimyah/bimyah-logo-v2.webp" },
    footer: { text: `Page ${idx + 1}/${total} - Bimyah!` },
  };
  if (p.image) embed.image = { url: p.image };
  const buttons = GUIDE_PAGES.map((pg, i) =>
    btn(`rules:${i}`, pg.title, i === idx ? "primary" : "secondary"));
  return { embeds: [embed], components: [row(...buttons.slice(0, 5)), row(...buttons.slice(5))] };
}

function helpPayload() {
  return {
    embeds: [{
      title: "🃏 Bimyah Bot Help",
      description:
        "Everything the Bimyah bot can do here. Commands that show your account need a one-time link (run **/link**).\n\n" +
        "**/play** · post the Bimyah play card\n" +
        "**/bimyah** or **/help** · this help card\n" +
        "**/link** · link your Discord account to your Bimyah account\n" +
        "**/unlink** · remove that link\n" +
        "**/profile** · your Bimyah profile: balances and stats\n" +
        "**/bank** · your Bank: balances, activity, sending\n" +
        "**/send <amount> <player name>** · send Bimbucks to a player\n" +
        "**/challenges** · your challenge progress, by players or bots and table size\n" +
        "**/ref** · your referral link and your referrals\n" +
        "**/bmart** · browse and buy from Bmart\n" +
        "**/decor** · the decor you own, by type\n" +
        "**/rules** · the How to Play guide\n" +
        "**/add** · invite the Bimyah! bot to your server\n\n" +
        "Tap one of the buttons below to open that command right here.\n\n" +
        "Want to play right here? Join a voice channel, open **Activities**, and pick **Bimyah**.",
      color: GOLD,
    }],
    components: [
      row(linkBtn("🃏 Play Bimyah! in your browser", PLAY_URL), LINK_BUTTON),
      row(...NAV_BUTTONS.slice(0, 3)),
      row(...NAV_BUTTONS.slice(3)),
    ],
  };
}

async function profileView(db: Db, link: Link) {
  const uid = link.bimyah_user_id;
  const [profiles, wallets, plus, challenges] = await Promise.all([
    db.sb(`/profiles?id=eq.${uid}&select=display_name,created_at`),
    db.sb(`/wallets?user_id=eq.${uid}&select=bimbits,bimbucks`),
    db.rpc("has_bimyah_plus", { _user_id: uid }).catch(() => false),
    db.sb(`/user_challenges?user_id=eq.${uid}&select=challenge_id,progress,completed_at`),
  ]);
  const profile = Array.isArray(profiles) && profiles.length ? profiles[0] : null;
  const wallet = Array.isArray(wallets) && wallets.length ? wallets[0] : { bimbits: 0, bimbucks: 0 };
  const rows = Array.isArray(challenges) ? challenges : [];
  const completed = rows.filter((r: Any) => r.completed_at).length;
  const recruiter = rows.find((r: Any) => r.challenge_id === "recruiter");
  const lines = [
    `**Bimbucks:** ${fmtN(wallet.bimbucks)}`,
    `**Bimbits:** ${fmtN(wallet.bimbits)}`,
    `**Challenges completed:** ${completed} of ${CHALLENGES.length}`,
  ];
  if (recruiter && recruiter.progress > 0) {
    lines.push(`**Recruiter level:** ${recruiter.progress} (${recruiter.progress} recruit${recruiter.progress === 1 ? "" : "s"})`);
  }
  const since = profile?.created_at ? fmtDate(profile.created_at) : "";
  return {
    embeds: [
      {
        title: `🃏 ${profile?.display_name || "Bimyah player"}${plus ? " · Bimyah!+" : ""}`,
        description: lines.join("\n"),
        color: GOLD,
        ...(since ? { footer: { text: `Playing since ${since}` } } : {}),
      },
    ],
    components: [row(linkBtn("Open Bimyah profile", `${PLAY_URL}/profile`), HOME_BUTTON)],
  };
}

async function bankHomeView(db: Db, link: Link) {
  const [profile, wallet] = await Promise.all([getProfileRow(db, link.bimyah_user_id), getWallet(db, link.bimyah_user_id)]);
  return {
    embeds: [{
      title: `🏦 ${profile.display_name}'s Bank`,
      description:
        `**Bimbucks:** ${fmtN(wallet.bimbucks)} · purchased currency\n` +
        `**Bimbits:** ${fmtN(wallet.bimbits)} · earned by completing tasks`,
      image: { url: BANK_IMG },
      color: GOLD,
      footer: { text: "Bimyah Bank" },
    }],
    components: [row(
      linkBtn("Buy Bimbucks", `${PLAY_URL}/profile`),
      btn(`b:send:${link.discord_user_id}`, "Send Bimbucks", "primary"),
      btn(`b:act:${link.discord_user_id}:0`, "Activity", "secondary"),
      HOME_BUTTON,
    )],
  };
}

const PAGE10 = 10;
async function bankActivityView(db: Db, link: Link, page: number) {
  const all = await getLedger(db, link.bimyah_user_id);
  const pages = Math.max(1, Math.ceil(all.length / PAGE10));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = all.slice(p * PAGE10, p * PAGE10 + PAGE10);
  const lines = slice.map((r: Any) =>
    `${r.gain ? "+" : "-"}**${fmtN(r.price)}** ${curName(r.currency)} · ${r.name} · ${fmtDate(r.created_at)}`);
  return {
    embeds: [{
      title: "🏦 Bank Activity",
      description: lines.length ? lines.join("\n") : "No activity yet.",
      color: GOLD,
      footer: { text: `Page ${p + 1} of ${pages}` },
    }],
    components: [row(
      btn(`b:act:${link.discord_user_id}:${p - 1}`, "◀ Prev", "secondary", p === 0 ? { disabled: true } : {}),
      btn(`b:home:${link.discord_user_id}`, "Bank", "primary"),
      btn(`b:act:${link.discord_user_id}:${p + 1}`, "Next ▶", "secondary", p >= pages - 1 ? { disabled: true } : {}),
      HOME_BUTTON,
    )],
    page: p, pages,
  };
}

function challengesCounts(rows: Any[]) {
  const byId = new Map(rows.map((r) => [r.challenge_id, r]));
  const done = (defs: Any[]) => defs.filter((d) => byId.get(d.id)?.completed_at).length;
  return {
    byId,
    total: CHALLENGES.length,
    doneTotal: done(CHALLENGES),
    human: CHALLENGES.filter((c) => c.category === "human"),
    bot: CHALLENGES.filter((c) => c.category === "bot"),
    done,
  };
}
function seatDefs(cat: string, seats: number, byId: Map<string, Any>) {
  return CHALLENGES.filter((c) => {
    if (c.category !== cat) return false;
    if (c.id === "first-match") {
      const rowSeats = byId.get("first-match")?.seats;
      return (rowSeats ?? 2) === seats;
    }
    return c.seats === seats;
  });
}
const seatLabel = (cat: string, n: number) => (n === 2 ? "1-on-1" : cat === "bot" ? `${n}-Seat` : `${n}-Player`);

async function challengesHomeView(db: Db, link: Link) {
  const rows = await getChallengeRows(db, link.bimyah_user_id);
  const c = challengesCounts(rows);
  return {
    embeds: [{
      title: "🏆 Your Challenges",
      description:
        `**${c.doneTotal} of ${c.total}** challenges completed.\n\n` +
        `👤 Against players: **${c.done(c.human)} of ${c.human.length}**\n` +
        `🤖 Against bots: **${c.done(c.bot)} of ${c.bot.length}**\n\n` +
        "Pick a side to browse by table size.",
      color: GOLD,
    }],
    components: [row(
      btn(`c:cat:${link.discord_user_id}:human`, "👤 Players", "primary"),
      btn(`c:cat:${link.discord_user_id}:bot`, "🤖 Bots", "primary"),
      HOME_BUTTON,
    )],
  };
}
async function challengesCatView(db: Db, link: Link, cat: string) {
  const rows = await getChallengeRows(db, link.bimyah_user_id);
  const c = challengesCounts(rows);
  const defs = cat === "bot" ? c.bot : c.human;
  const lines = [2, 3, 4, 5, 6, 7, 8].map((n) => {
    const sd = seatDefs(cat, n, c.byId);
    return `**${seatLabel(cat, n)}:** ${c.done(sd)} of ${sd.length} completed`;
  });
  const seatBtns = [2, 3, 4, 5, 6, 7, 8].map((n) =>
    btn(`c:seat:${link.discord_user_id}:${cat}:${n}:0`, seatLabel(cat, n), "secondary"));
  return {
    embeds: [{
      title: cat === "bot" ? "🤖 Bot Challenges" : "👤 Player Challenges",
      description: `**${c.done(defs)} of ${defs.length}** completed.\n\n${lines.join("\n")}\n\nPick a table size:`,
      color: GOLD,
    }],
    components: [row(...seatBtns.slice(0, 4)), row(...seatBtns.slice(4), btn(`c:home:${link.discord_user_id}`, "↩ Types", "primary"), HOME_BUTTON)],
  };
}
const CH_PAGE = 5;
async function challengesSeatView(db: Db, link: Link, cat: string, seats: number, page: number) {
  const rows = await getChallengeRows(db, link.bimyah_user_id);
  const c = challengesCounts(rows);
  const defs = seatDefs(cat, seats, c.byId);
  const pages = Math.max(1, Math.ceil(defs.length / CH_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = defs.slice(p * CH_PAGE, p * CH_PAGE + CH_PAGE);
  const lines = slice.map((d) => {
    const r = c.byId.get(d.id);
    if (r?.completed_at) return `✅ **${d.name}** · +${d.reward} Bimbit\n${d.description}`;
    return `⬜ **${d.name}** · ${fmtN(r?.progress || 0)}/${d.target}\n${d.description}`;
  });
  return {
    embeds: [{
      title: `${cat === "bot" ? "🤖" : "👤"} ${seatLabel(cat, seats)} Challenges`,
      description: lines.join("\n\n") || "Nothing here.",
      color: GOLD,
      footer: { text: `Page ${p + 1} of ${pages}` },
    }],
    components: [row(
      btn(`c:seat:${link.discord_user_id}:${cat}:${seats}:${p - 1}`, "◀ Prev", "secondary", p === 0 ? { disabled: true } : {}),
      btn(`c:cat:${link.discord_user_id}:${cat}`, "↩ Sizes", "primary"),
      btn(`c:seat:${link.discord_user_id}:${cat}:${seats}:${p + 1}`, "Next ▶", "secondary", p >= pages - 1 ? { disabled: true } : {}),
      HOME_BUTTON,
    )],
    page: p, pages,
  };
}

async function refView(db: Db, link: Link, page: number) {
  const profile = await getProfileRow(db, link.bimyah_user_id);
  const { rows, activeCount } = await getReferrals(db, link.bimyah_user_id);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE10));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = rows.slice(p * PAGE10, p * PAGE10 + PAGE10);
  const list = slice.map((r: Any) =>
    `• **${r.display_name}**${r.is_plus ? " · Bimyah!+" : ""} · ${r.active ? "✅ Active recruit" : `joined ${fmtDate(r.joined_at)}`}`);
  const url = `${PLAY_URL}/?ref=${encodeURIComponent(profile.display_name)}`;
  return {
    embeds: [{
      title: "🔗 Your Referrals",
      description:
        `**Your referral link:** ${url}\n\n` +
        "Share it: when a player who joined with your link finishes a game with at least one other human player, they become an active recruit and raise your Recruiter level.\n\n" +
        `**Referrals:** ${rows.length} · **Active recruits:** ${activeCount} (Recruiter level ${activeCount})\n\n` +
        (list.length ? list.join("\n") : "No referrals yet. Share your link to invite players."),
      color: GOLD,
      footer: { text: `Page ${p + 1} of ${pages}` },
    }],
    components: [row(
      btn(`r:page:${link.discord_user_id}:${p - 1}`, "◀ Prev", "secondary", p === 0 ? { disabled: true } : {}),
      btn(`r:page:${link.discord_user_id}:${p + 1}`, "Next ▶", "secondary", p >= pages - 1 ? { disabled: true } : {}),
      HOME_BUTTON,
    )],
    page: p, pages,
  };
}

function balanceFooter(profile: Any, wallet: Any, extra = "") {
  return { text: `${profile.display_name} · ${fmtN(wallet.bimbucks)} Bimbucks · ${fmtN(wallet.bimbits)} Bimbits${extra}` };
}
async function bmartHomeView(db: Db, link: Link) {
  const [profile, wallet, products] = await Promise.all([
    getProfileRow(db, link.bimyah_user_id), getWallet(db, link.bimyah_user_id), getProducts(db)]);
  const lines = CATEGORY_ORDER
    .map((cat) => ({ cat, n: products.filter((p: Any) => p.category === cat).length }))
    .filter((x) => x.n > 0)
    .map((x) => `**${CATEGORY_LABEL[x.cat]}:** ${x.n} item${x.n === 1 ? "" : "s"}`);
  const catBtns = CATEGORY_ORDER
    .filter((cat) => products.some((p: Any) => p.category === cat))
    .map((cat) => btn(`m:cat:${link.discord_user_id}:${cat}:0`, CATEGORY_LABEL[cat], "primary"));
  return {
    embeds: [{
      title: "🛒 Bmart",
      description: "Pick a category to browse. Most items can be bought with Bimbucks or Bimbits at the alternate price shown on each item.\n\n" + lines.join("\n"),
      thumbnail: { url: BMART_ICON },
      color: BMART_RED,
      footer: balanceFooter(profile, wallet),
    }],
    components: withHome([row(...catBtns.slice(0, 3)), row(...catBtns.slice(3))]),
  };
}
const SHOP_PAGE = 4;
async function bmartCatView(db: Db, link: Link, cat: string, page: number) {
  const [profile, wallet, products, inv] = await Promise.all([
    getProfileRow(db, link.bimyah_user_id), getWallet(db, link.bimyah_user_id),
    getProducts(db), getOwned(db, link.bimyah_user_id)]);
  const owned = new Set(inv.map((i: Any) => i.item_id));
  const items = products.filter((p: Any) => p.category === cat);
  const pages = Math.max(1, Math.ceil(items.length / SHOP_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * SHOP_PAGE, p * SHOP_PAGE + SHOP_PAGE);
  const embeds: Any[] = slice.map((item: Any) => {
    const isOwned = owned.has(item.id);
    const priceLine = item.price === 0
      ? "**Free**"
      : `**${fmtN(item.price)} ${curName(item.currency)}**${item.alt_price ? ` or **${fmtN(item.alt_price)} ${curName(item.currency === "bimbucks" ? "bimbits" : "bimbucks")}**` : ""}`;
    const img = productImg(item);
    return {
      title: item.name.trim(),
      description: priceLine + (isOwned ? "\n✅ Owned" : "") + (cat === "bplus_rewards" ? "\nBimyah!+ members only" : ""),
      ...(img ? { image: { url: img } } : {}),
      color: BMART_RED,
    };
  });
  if (!embeds.length) embeds.push({ title: CATEGORY_LABEL[cat] || cat, description: "Nothing here right now.", color: BMART_RED });
  embeds[embeds.length - 1].footer = balanceFooter(profile, wallet, ` · Page ${p + 1} of ${pages}`);
  const components = slice.map((item: Any) => {
    if (owned.has(item.id)) return row(btn(`m:noop:${link.discord_user_id}:${item.id}`, `✅ ${item.name.trim().slice(0, 30)} owned`, "secondary", { disabled: true }));
    const buttons = [btn(`m:buy:${link.discord_user_id}:${cat}:${p}:${item.id}:${item.currency}`,
      item.price === 0 ? "Claim free" : `${fmtN(item.price)} ${curName(item.currency)}`, "success", { emoji: { name: "🛒" } })];
    if (item.alt_price) {
      buttons.push(btn(`m:buy:${link.discord_user_id}:${cat}:${p}:${item.id}:${item.currency === "bimbucks" ? "bimbits" : "bimbucks"}`,
        `${fmtN(item.alt_price)} ${curName(item.currency === "bimbucks" ? "bimbits" : "bimbucks")}`, "primary", { emoji: { name: "🛒" } }));
    }
    return row(...buttons);
  });
  components.push(row(
    btn(`m:cat:${link.discord_user_id}:${cat}:${p - 1}`, "◀ Prev", "secondary", p === 0 ? { disabled: true } : {}),
    btn(`m:home:${link.discord_user_id}`, "↩ Categories", "primary"),
    btn(`m:cat:${link.discord_user_id}:${cat}:${p + 1}`, "Next ▶", "secondary", p >= pages - 1 ? { disabled: true } : {}),
    HOME_BUTTON,
  ));
  return { embeds, components, page: p, pages };
}

const KIND_LABEL: Record<string, string> = { card_back: "Card Backs", title: "Titles", badge: "Badges", victory: "Victory", background: "Backgrounds", tabletop: "Table Tops", table_art: "Table Art", emblem: "Stickers" };
const KIND_ORDER = ["tabletop", "card_back", "background", "title", "badge", "emblem", "victory", "table_art"];
const EQUIP_COLS: Record<string, string[]> = {
  title: ["title_id"], badge: ["badge_id", "badge_id_2"], victory: ["victory_id"],
  background: ["background_id"], tabletop: ["tabletop_id"], table_art: ["table_art_id"],
  card_back: ["card_back_id"], emblem: ["emblem_id", "emblem_id_2"],
};
async function decorHomeView(db: Db, link: Link) {
  const [inv, customs, catalog] = await Promise.all([
    getOwned(db, link.bimyah_user_id),
    db.sb(`/card_backs?user_id=eq.${link.bimyah_user_id}&select=id,is_active`),
    decorCatalog(db),
  ]);
  const counts = new Map<string, number>();
  for (const i of inv) {
    if (!catalog.byId.has(i.item_id) && !catalog.defNames.has(`${i.kind}:${i.item_id}`)) continue;
    counts.set(i.kind, (counts.get(i.kind) || 0) + 1);
  }
  if (customs.length) counts.set("card_back", (counts.get("card_back") || 0) + customs.length);
  const kinds = KIND_ORDER.filter((k) => counts.get(k));
  const lines = kinds.map((k) => `**${KIND_LABEL[k]}:** ${counts.get(k)} item${counts.get(k) === 1 ? "" : "s"}`);
  const kindBtns = kinds.map((k) => btn(`d:kind:${link.discord_user_id}:${k}:0`, KIND_LABEL[k], "primary"));
  return {
    embeds: [{
      title: "🎨 Your Decor",
      description: kinds.length
        ? "Everything you own, by type. Pick a type to look through your collection.\n\n" + lines.join("\n")
        : "You don't own any decor yet. Browse **/bmart** to pick some up.",
      color: GOLD,
    }],
    components: withHome([row(...kindBtns.slice(0, 4)), row(...kindBtns.slice(4))]),
  };
}
async function decorKindView(db: Db, link: Link, kind: string, page: number) {
  const [inv, equipped, catalog] = await Promise.all([
    getOwned(db, link.bimyah_user_id), getEquipped(db, link.bimyah_user_id), decorCatalog(db)]);
  const { byId, defNames } = catalog;
  const items: Any[] = inv.filter((i: Any) => i.kind === kind &&
    (byId.has(i.item_id) || defNames.has(`${kind}:${i.item_id}`))).map((i: Any) => ({
    item_id: i.item_id, acquired_at: i.acquired_at, custom: false,
  }));
  if (kind === "card_back") {
    const customs = await db.sb(`/card_backs?user_id=eq.${link.bimyah_user_id}&select=id,is_active,created_at&order=created_at.desc`);
    for (const c of customs) items.push({ item_id: c.id, acquired_at: c.created_at, custom: true, active: c.is_active });
  }
  const equippedIds = new Set((EQUIP_COLS[kind] || []).map((col) => equipped[col]).filter(Boolean));
  const pages = Math.max(1, Math.ceil(items.length / SHOP_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * SHOP_PAGE, p * SHOP_PAGE + SHOP_PAGE);
  const embeds: Any[] = slice.map((i: Any) => {
    const prod = byId.get(i.item_id);
    const name = i.custom ? "Custom Card Back" : prod ? prod.name.trim() : defNames.get(`${kind}:${i.item_id}`) || prettify(i.item_id);
    const isEq = i.custom ? i.active : equippedIds.has(i.item_id);
    const img = i.custom ? CARDBACK_IMG[i.item_id] : prod ? productImg(prod) : PRODUCT_IMG[i.item_id];
    return {
      title: name,
      description: (isEq ? "✅ Equipped\n" : "") + `Owned · ${fmtDate(i.acquired_at)}`,
      ...(img ? { image: { url: img } } : {}),
      color: GOLD,
    };
  });
  if (!embeds.length) embeds.push({ title: KIND_LABEL[kind], description: "Nothing here yet.", color: GOLD });
  embeds[embeds.length - 1].footer = { text: `Page ${p + 1} of ${pages}` };
  if (equippedIds.has("__random__")) {
    embeds.push({ title: "🎲 Random", description: "✅ Equipped: a random owned item is picked each match.", color: GOLD });
  }
  return {
    embeds,
    components: [row(
      btn(`d:kind:${link.discord_user_id}:${kind}:${p - 1}`, "◀ Prev", "secondary", p === 0 ? { disabled: true } : {}),
      btn(`d:home:${link.discord_user_id}`, "↩ All decor", "primary"),
      btn(`d:kind:${link.discord_user_id}:${kind}:${p + 1}`, "Next ▶", "secondary", p >= pages - 1 ? { disabled: true } : {}),
      HOME_BUTTON,
    )],
    page: p, pages,
  };
}

/* --------------------- Discord response shapes -------------------- */
const EPHEMERAL = 64;
function msg(payload: Record<string, unknown>, ephemeral = false) {
  return { type: 4, data: ephemeral ? { ...payload, flags: EPHEMERAL } : payload };
}
function update(payload: Record<string, unknown>) {
  return { type: 7, data: payload };
}
const ACK = { type: 6 };

type Interaction = {
  member?: { user?: { id: string; username?: string } };
  user?: { id: string; username?: string };
  data?: {
    name?: string;
    custom_id?: string;
    options?: { name: string; value: unknown }[];
  };
};
function ixUser(ix: Interaction) {
  const u = ix.member?.user ?? ix.user ?? { id: "" };
  return { id: u.id, username: u.username ?? null };
}
function option(ix: Interaction, name: string) {
  return ix.data?.options?.find((o) => o.name === name)?.value;
}

/* ----------------------------- commands --------------------------- */
async function requireLink(db: Db, userId: string): Promise<Link | null> {
  const link = await db.linkForDiscord(userId);
  if (!link) return null;
  return { ...link, discord_user_id: userId };
}

export async function handleCommandInteraction(ix: Interaction) {
  const db = makeDb();
  const { id: userId, username } = ixUser(ix);
  const name = ix.data?.name ?? "";
  try {
    if (name === "bimyah" || name === "help") {
      return msg(helpPayload());
    }
    if (name === "rules") {
      return msg(rulesView(0));
    }
    if (name === "add") {
      return msg({
        content: "Click the button below to invite the Bimyah! bot to your servers",
        components: [row(linkBtn("Add Bimyah! to your server", INVITE_URL))],
      });
    }
    if (name === "link") {
      const r = await createLinkCode(db, { userId, username });
      if (r.kind === "already") {
        return msg({
          content:
            `Your Discord account is already linked to ${r.name}. ` +
            "Run /profile to see it here, or /unlink if you want to connect a different Bimyah account.",
        }, true);
      }
      return msg({ embeds: [linkCodeEmbed(r.code)] }, true);
    }
    if (name === "unlink") {
      await db.sb(`/discord_links?discord_user_id=eq.${userId}`, { method: "DELETE" });
      return msg({
        content: "Done: your Discord account is unlinked from Bimyah. Run /link whenever you want to connect it again.",
      });
    }
    if (name === "profile") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      return msg(await profileView(db, link));
    }
    if (name === "bank") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      return msg(await bankHomeView(db, link));
    }
    if (name === "challenges") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      return msg(await challengesHomeView(db, link));
    }
    if (name === "ref") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      const view = await refView(db, link, 0);
      return msg({ embeds: view.embeds, components: view.components });
    }
    if (name === "bmart") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      return msg(await bmartHomeView(db, link));
    }
    if (name === "decor") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      return msg(await decorHomeView(db, link));
    }
    if (name === "send") {
      const link = await requireLink(db, userId);
      if (!link) return msg(notLinkedPayload());
      const reply = (content: string) => msg({ content });
      const amountRaw = option(ix, "amount");
      const playerRaw = option(ix, "player");
      const amount = typeof amountRaw === "number" ? amountRaw : NaN;
      const playerName = String(playerRaw ?? "").trim().replace(/^@/, "");
      if (!Number.isFinite(amount) || !playerName) {
        return reply("Usage: **/send <amount> <player name>**, for example `/send 50 Ronya`. Bimbucks only.");
      }
      if (!(amount >= 1 && amount <= 1000000)) {
        return reply("The amount has to be between 1 and 1,000,000 Bimbucks.");
      }
      const profs = await db.sb(`/profiles?display_name=ilike.${encodeURIComponent(playerName)}&select=id,display_name&limit=2`);
      if (!profs.length) return reply(`No player found with the name **${playerName}**.`);
      if (profs.length > 1) return reply(`More than one player is named **${playerName}**, so I can't tell who to send to. Sending by name only works when the name is unique.`);
      if (profs[0].id === link.bimyah_user_id) return reply("You can't send Bimbucks to yourself.");
      try {
        const res = await db.rpc("transfer_bimbucks", {
          _sender_id: link.bimyah_user_id, _recipient_id: profs[0].id, _amount: amount, _note: null,
        });
        const bal = res && typeof res === "object" ? (res as Any).sender_bimbucks : null;
        return reply(`💸 Sent **${fmtN(amount)} Bimbucks** to **${profs[0].display_name}**.${bal != null ? ` Your new balance: **${fmtN(bal)} Bimbucks**.` : ""}`);
      } catch (e) {
        return reply(`❌ The send didn't go through: ${(e as Error).message}`);
      }
    }
    return msg({ content: "Unknown command." }, true);
  } catch (e) {
    console.error(`[bimyah-discord] /${name} failed:`, (e as Error)?.message || e);
    return msg({ content: `Something went wrong with /${name}. Try again in a bit.` }, true);
  }
}

/* ---------------------------- components -------------------------- */
/** One Bmart purchase, mirroring the game's purchaseItem checks:
 * fresh product row, ownership, the Bimyah!+ gate for plus-only
 * categories, then the same purchase_bmart_item RPC the game calls.
 * Yapin' answers with an update plus a separate ephemeral note;
 * Discord gets one response, so the confirmation rides as the first
 * embed of the updated category view. */
async function doBuy(db: Db, link: Link, cat: string, page: number, itemId: string, currency: string) {
  const purged = await getPurgedIds(db);
  if (purged.has(itemId)) {
    return msg({ content: "That item is no longer available in Bmart." }, true);
  }
  const rows = await db.sb(`/bmart_products?id=eq.${encodeURIComponent(itemId)}&hidden=eq.false&select=id,name,price,alt_price,currency,category,kind`);
  const product = rows[0];
  if (!product) {
    return msg({ content: "That item is no longer available in Bmart." }, true);
  }
  const inv = await getOwned(db, link.bimyah_user_id);
  if (inv.some((i: Any) => i.item_id === itemId)) {
    return msg({ content: `You already own **${product.name.trim()}**.` }, true);
  }
  const price = currency === product.currency ? product.price : product.alt_price;
  if (price == null) {
    return msg({ content: `**${product.name.trim()}** can't be bought with ${curName(currency)}.` }, true);
  }
  const cats = await db.sb(`/bmart_custom_categories?id=eq.${encodeURIComponent(product.category)}&select=requires_plus`);
  if (cats[0]?.requires_plus) {
    const plus = await db.rpc("has_bimyah_plus", { _user_id: link.bimyah_user_id }).catch(() => false);
    if (!plus) {
      return msg({ content: "That category is for **Bimyah!+** members only." }, true);
    }
  }
  const kind = product.kind || CATEGORY_KIND[product.category];
  if (!kind) {
    return msg({ content: "That item can't be bought from Discord yet." }, true);
  }
  try {
    const res = await db.rpc("purchase_bmart_item", {
      _user_id: link.bimyah_user_id,
      _item_id: product.id,
      _item_name: product.name,
      _currency: currency,
      _price: price,
      _kind: kind,
    });
    const view = await bmartCatView(db, link, cat, page);
    const confirm = {
      title: "✅ Purchase complete",
      description:
        `You bought **${product.name.trim()}** for **${fmtN(price)} ${curName(currency)}**.` +
        (res && typeof res === "object" ? ` New balances: **${fmtN((res as Any).bimbucks)} Bimbucks** · **${fmtN((res as Any).bimbits)} Bimbits**.` : "") +
        " Find it in **/decor**.",
      color: BMART_RED,
    };
    return update({ embeds: [confirm, ...view.embeds].slice(0, 10), components: view.components });
  } catch (e) {
    return msg({ content: `❌ The purchase didn't go through: ${(e as Error).message}` }, true);
  }
}

/** Button clicks. custom_id shapes (owner is always parts[2]):
 * bimyah:link · b:home|send|act · c:home|cat|seat · r:page ·
 * m:home|cat|buy|noop · d:home|kind · rules:<page> (public guide).
 * Personal views are owner-locked:
 * only the player who ran the command can drive their buttons.
 * nav:home turns the message back into the help card (any clicker);
 * nav:<command> on the help card opens that command's view for the
 * clicker, whose buttons are then owner-locked to them. */
export async function handleComponentInteraction(ix: Interaction) {
  const db = makeDb();
  const { id: clickerId, username } = ixUser(ix);
  const id = String(ix.data?.custom_id || "");
  try {
    if (id === "bimyah:link") {
      const r = await createLinkCode(db, { userId: clickerId, username });
      if (r.kind === "already") {
        return msg({ content: `Your Discord account is already linked to ${r.name}. Run /profile to see it here.` }, true);
      }
      return msg({ embeds: [linkCodeEmbed(r.code)] }, true);
    }
    if (id === "nav:home") {
      return update(helpPayload());
    }
    if (id.startsWith("nav:")) {
      const target = id.slice(4);
      if (target === "rules") return update(rulesView(0));
      const link = await requireLink(db, clickerId);
      if (!link) return update(notLinkedPayload());
      let view: Any = null;
      if (target === "profile") view = await profileView(db, link);
      else if (target === "bank") view = await bankHomeView(db, link);
      else if (target === "challenges") view = await challengesHomeView(db, link);
      else if (target === "ref") view = await refView(db, link, 0);
      else if (target === "bmart") view = await bmartHomeView(db, link);
      else if (target === "decor") view = await decorHomeView(db, link);
      if (view) return update({ embeds: view.embeds, components: view.components });
      return ACK;
    }
    if (id.startsWith("rules:")) {
      return update(rulesView(parseInt(id.slice(6), 10) || 0));
    }
    const parts = id.split(":");
    const ns = parts[0];
    const action = parts[1];
    const owner = parts[2];
    if (!["b", "c", "r", "m", "d"].includes(ns) || !owner) {
      return ACK;
    }
    if (clickerId !== owner) {
      return msg({
        content: "These buttons belong to the player who ran the command. Run the command yourself to see your own.",
      }, true);
    }
    const link = await requireLink(db, owner);
    if (!link) {
      return msg({ content: "Your accounts aren't linked anymore. Run /link to reconnect them." }, true);
    }
    const upd = async (view: Any) => update({ embeds: view.embeds, components: view.components });
    if (ns === "b") {
      if (action === "send") {
        return msg({ content: "To send Bimbucks, run **/send <amount> <player name>**, for example `/send 50 Ronya`." }, true);
      }
      if (action === "home") return upd(await bankHomeView(db, link));
      if (action === "act") return upd(await bankActivityView(db, link, parseInt(parts[3], 10) || 0));
    } else if (ns === "c") {
      if (action === "home") return upd(await challengesHomeView(db, link));
      else if (action === "cat") return upd(await challengesCatView(db, link, parts[3]));
      else if (action === "seat") return upd(await challengesSeatView(db, link, parts[3], parseInt(parts[4], 10), parseInt(parts[5], 10) || 0));
    } else if (ns === "r") {
      return upd(await refView(db, link, parseInt(parts[3], 10) || 0));
    } else if (ns === "m") {
      if (action === "home") return upd(await bmartHomeView(db, link));
      else if (action === "cat") return upd(await bmartCatView(db, link, parts[3], parseInt(parts[4], 10) || 0));
      else if (action === "noop") return ACK;
      else if (action === "buy") return doBuy(db, link, parts[3], parseInt(parts[4], 10) || 0, parts[5], parts[6]);
    } else if (ns === "d") {
      if (action === "home") return upd(await decorHomeView(db, link));
      else if (action === "kind") return upd(await decorKindView(db, link, parts[3], parseInt(parts[4], 10) || 0));
    }
    return ACK;
  } catch (e) {
    console.error("[bimyah-discord] button failed:", (e as Error)?.message || e);
    return msg({ content: "Something went wrong with that button. Try the command again." }, true);
  }
}
