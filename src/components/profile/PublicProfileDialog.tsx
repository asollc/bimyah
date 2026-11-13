import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Clock,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyPublicProfile,
  getPublicProfile,
  setProfileSectionVisibility,
  type ProfileSection,
  type PublicProfile,
} from "@/lib/rpc/publicProfile.functions";
import {
  getFriendState,
  sendFriendRequestById,
  type FriendState,
} from "@/lib/rpc/friends.functions";
import { useAuth } from "@/auth/AuthProvider";
import { ChallengesPanel } from "@/components/profile/ChallengesPanel";
import { StatsPanel } from "@/components/profile/StatsPanel";
import { getPublicStats, type MyStats } from "@/lib/rpc/stats.functions";
import { VICTORY_EFFECT_LABELS } from "@/components/game/VictoryEffects";
import randomDecorImg from "@/assets/random-decor.png";
import standardBimyahImg from "@/assets/card-standard-bimyah.webp";
import foundingCarderImg from "@/assets/card-founding-carder.webp";

/* ---------- Public player profile (Ronya 2026-11-09) ----------
 * Opened by tapping a player's avatar (in game, in chat, in the
 * viewers list, in the friends panel), or from "View Public Profile"
 * on your own profile page (selfView). Shows ONLY public info:
 * name, avatar, equipped decor, the decor collection, and challenge
 * progress. No email, balances, friends list, referrals, or
 * settings ever render here.
 *
 * Under the name sits a friend request button (its state follows
 * the viewer's relationship to the player). The panel carries the
 * red game background. The server only sends items that actually
 * exist in the game, and Random appears only in the Equipped area.
 *
 * In selfView every section header carries an eyeball: open means
 * the section shows on the public profile, closed means it is
 * hidden from everyone else (enforced server-side in
 * getPublicProfile; the owner's preview always loads unfiltered). */

type Item = { id: string; name: string | null; image_url: string | null; effect_type: string | null };

const KIND_LABELS: Record<string, string> = {
  title: "Titles",
  badge: "Badges",
  emblem: "Stickers",
  victory: "Victory FX",
  background: "Backgrounds",
  tabletop: "Table Tops",
  table_art: "Table Art",
  card_back: "Card Backs",
};
const KIND_ORDER = ["title", "badge", "emblem", "victory", "background", "tabletop", "table_art", "card_back"];

/** Inventory kind → visibility section key (mirrors the server map). */
const KIND_TO_SECTION: Record<string, ProfileSection> = {
  title: "titles",
  badge: "badges",
  emblem: "stickers",
  victory: "victory",
  background: "backgrounds",
  tabletop: "tabletops",
  table_art: "tableart",
  card_back: "cardbacks",
};

/** Built-in card backs ship as bundled assets, not hosted files; the
 *  server marks them with a "builtin:" image_url. */
const BUILTIN_IMAGES: Record<string, string> = {
  "standard-bimyah": standardBimyahImg,
  "founding-carder": foundingCarderImg,
};

function ItemImage({ item, className }: { item: Item; className: string }) {
  if (item.id === "__random__") {
    return <img src={randomDecorImg} alt="" className={className} draggable={false} />;
  }
  if (item.image_url?.startsWith("builtin:")) {
    const src = BUILTIN_IMAGES[item.id];
    if (src) return <img src={src} alt="" className={className} draggable={false} />;
  }
  if (item.image_url) {
    return <img src={item.image_url} alt="" className={className} draggable={false} loading="lazy" />;
  }
  return (
    <span className={`grid place-items-center bg-white/10 text-white/40 ${className}`}>
      ?
    </span>
  );
}

function itemLabel(item: Item): string {
  if (item.id === "victory_confetti" || item.effect_type === "confetti") return "Confetti Cannon";
  const lbl = item.effect_type
    ? VICTORY_EFFECT_LABELS[item.effect_type as keyof typeof VICTORY_EFFECT_LABELS]
    : undefined;
  if (lbl) return lbl;
  return item.name ?? "Item";
}

function EyeToggle({
  section,
  title,
  hidden,
  onToggle,
}: {
  section: ProfileSection;
  title: string;
  hidden: boolean;
  onToggle: (section: ProfileSection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(section)}
      aria-label={
        hidden
          ? `Show ${title} on your public profile`
          : `Hide ${title} from your public profile`
      }
      className={`grid h-6 w-6 place-items-center rounded-full active:scale-90 ${
        hidden ? "bg-white/5 text-white/35" : "bg-white/10 text-white/75"
      }`}
    >
      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}

function SectionHeader({
  title,
  section,
  selfView,
  hidden,
  onToggle,
}: {
  title: string;
  section?: ProfileSection;
  selfView?: boolean;
  hidden?: boolean;
  onToggle?: (section: ProfileSection) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/40">
        {title}
      </h3>
      {selfView && section && onToggle && (
        <EyeToggle
          section={section}
          title={title}
          hidden={!!hidden}
          onToggle={onToggle}
        />
      )}
      {selfView && hidden && (
        <span className="text-[9px] uppercase tracking-wider text-white/30">
          Hidden from public
        </span>
      )}
    </div>
  );
}

export function PublicProfileDialog({
  userId,
  onClose,
  selfView = false,
}: {
  userId: string;
  onClose: () => void;
  selfView?: boolean;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"decor" | "challenges" | "stats">("decor");
  const [stats, setStats] = useState<MyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [friendState, setFriendState] = useState<FriendState | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setStats(null);
    setTab("decor");
    (async () => {
      try {
        const res = selfView
          ? await getMyPublicProfile()
          : await getPublicProfile({ data: { userId } });
        if (!cancelled) {
          setProfile(res);
          setHiddenSections(res?.hiddenSections ?? []);
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, selfView]);

  // Stats tab loads lazily the first time it is opened (Ronya
  // 2026-11-09: stats are viewable from the public profile too).
  useEffect(() => {
    if (tab !== "stats" || stats) return;
    let cancelled = false;
    setStatsLoading(true);
    (async () => {
      try {
        const res = await getPublicStats({ data: { userId } });
        if (!cancelled) setStats(res);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, stats, userId]);

  // Friend button state for a signed-in viewer looking at someone else.
  useEffect(() => {
    if (selfView || !user || user.id === userId) {
      setFriendState(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getFriendState({ data: { targetId: userId } });
        if (!cancelled) setFriendState(res.state);
      } catch {
        if (!cancelled) setFriendState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selfView, user, userId]);

  const toggleSection = async (section: ProfileSection) => {
    const nextHidden = !hiddenSections.includes(section);
    setHiddenSections((cur) =>
      nextHidden ? [...cur, section] : cur.filter((s) => s !== section),
    );
    try {
      const res = await setProfileSectionVisibility({
        data: { section, hidden: nextHidden },
      });
      setHiddenSections(res.hiddenSections);
    } catch {
      setHiddenSections((cur) =>
        nextHidden ? cur.filter((s) => s !== section) : [...cur, section],
      );
      toast.error("Could not update profile visibility.");
    }
  };

  const sendRequest = async () => {
    setFriendBusy(true);
    try {
      await sendFriendRequestById({ data: { targetId: userId } });
      setFriendState("pending_out");
      toast.success("Friend request sent.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the request.");
      try {
        const res = await getFriendState({ data: { targetId: userId } });
        setFriendState(res.state);
      } catch {
        /* keep the button as it was */
      }
    } finally {
      setFriendBusy(false);
    }
  };

  const eq = profile?.equipped;
  const equippedRows: Array<{ label: string; item: Item }> = [];
  if (eq) {
    if (eq.title) equippedRows.push({ label: "Title", item: eq.title });
    if (eq.badge) equippedRows.push({ label: "Badge", item: eq.badge });
    if (eq.badge2) equippedRows.push({ label: "Badge", item: eq.badge2 });
    if (eq.sticker) equippedRows.push({ label: "Sticker", item: eq.sticker });
    if (eq.sticker2) equippedRows.push({ label: "Sticker", item: eq.sticker2 });
    if (eq.victory) equippedRows.push({ label: "Victory FX", item: eq.victory });
    if (eq.background) equippedRows.push({ label: "Background", item: eq.background });
    if (eq.tabletop) equippedRows.push({ label: "Table Top", item: eq.tabletop });
    if (eq.tableArt) equippedRows.push({ label: "Table Art", item: eq.tableArt });
    if (eq.cardBack) equippedRows.push({ label: "Card Back", item: eq.cardBack });
  }
  const equippedIds = new Set(equippedRows.map((r) => r.item.id));
  if (eq?.cardBackUrl) equippedIds.add("__cardback__");
  const kinds = KIND_ORDER.filter((k) => (profile?.collection[k]?.length ?? 0) > 0);
  const challengesHidden = (profile?.hiddenFromViewer ?? []).includes("challenges");
  // Match ChallengesPanel's own total: the unique First Match entry
  // only exists in the list once it has been completed.
  const visibleChallenges = (profile?.challenges ?? []).filter(
    (e) => e.id !== "first-match" || e.completed_at,
  );
  const challengesDone = visibleChallenges.filter((e) => e.completed_at).length;

  const friendButton: ReactNode =
    !selfView && profile && user && user.id !== userId ? (
      friendState === "friends" ? (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70">
          <Check className="h-3.5 w-3.5" /> Friends
        </span>
      ) : friendState === "pending_out" ? (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/50">
          <Clock className="h-3.5 w-3.5" /> Request sent
        </span>
      ) : friendState === "pending_in" ? (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70">
          <Inbox className="h-3.5 w-3.5" /> Sent you a request
        </span>
      ) : friendState === "none" ? (
        <button
          type="button"
          onClick={() => void sendRequest()}
          disabled={friendBusy}
          className="btn-3d btn-3d-red mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-60"
        >
          {friendBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          Add Friend
        </button>
      ) : null
    ) : null;

  const dimIfHidden = (section: ProfileSection) =>
    selfView && hiddenSections.includes(section) ? "opacity-40" : "";

  return (
    <div
      className="fixed inset-0 z-[300] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Player profile"
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "var(--gradient-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-white/10 p-4 pb-3">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/20"
              draggable={false}
            />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/10 font-display text-2xl font-black text-white/80">
              {(profile?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-display text-lg font-bold text-white">
                {loading ? "Loading..." : (profile?.name ?? "Player not found")}
              </span>
              {profile?.isPlus && (
                <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                  Bimyah!+
                </span>
              )}
            </div>
            {friendButton}
            {profile && !challengesHidden && (
              <div className="mt-1 text-[11px] uppercase tracking-widest text-white/40">
                {challengesDone} of {visibleChallenges.length} challenges done
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
            aria-label="Close profile"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => setTab("decor")}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              tab === "decor" ? "bg-white text-black" : "bg-white/10 text-white/70"
            }`}
          >
            Decor
          </button>
          {!challengesHidden && (
            <span
              className={`inline-flex items-center gap-1 rounded-full pr-1 ${
                tab === "challenges" ? "bg-white text-black" : "bg-white/10 text-white/70"
              }`}
            >
              <button
                type="button"
                onClick={() => setTab("challenges")}
                className="py-1 pl-3 text-xs font-bold uppercase tracking-wider"
              >
                Challenges
              </button>
              {selfView && (
                <EyeToggle
                  section="challenges"
                  title="Challenges"
                  hidden={hiddenSections.includes("challenges")}
                  onToggle={(s) => void toggleSection(s)}
                />
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTab("stats")}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              tab === "stats" ? "bg-white text-black" : "bg-white/10 text-white/70"
            }`}
          >
            Stats
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-white/50" />
            </div>
          ) : !profile ? (
            <div className="py-10 text-center text-sm text-white/50">
              This profile could not be loaded.
            </div>
          ) : tab === "challenges" && !challengesHidden ? (
            <div className={dimIfHidden("challenges")}>
              <ChallengesPanel entries={profile.challenges} loading={false} />
            </div>
          ) : tab === "stats" ? (
            <StatsPanel stats={stats} loading={statsLoading} />
          ) : (
            <div className="flex flex-col gap-5">
              {equippedRows.length > 0 || eq?.cardBackUrl ? (
                <section>
                  <SectionHeader
                    title="Equipped"
                    section="equipped"
                    selfView={selfView}
                    hidden={hiddenSections.includes("equipped")}
                    onToggle={(s) => void toggleSection(s)}
                  />
                  <div className={`grid grid-cols-4 gap-2 ${dimIfHidden("equipped")}`}>
                    {equippedRows.map((r, i) => (
                      <div key={`${r.item.id}-${i}`} className="flex flex-col items-center gap-1">
                        <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-black/30 ring-1 ring-[var(--gold)]/60">
                          <ItemImage item={r.item} className="h-full w-full object-contain p-1" />
                        </div>
                        <div className="w-full truncate text-center text-[10px] text-white/60">
                          {itemLabel(r.item)}
                        </div>
                        <div className="-mt-1 text-[9px] uppercase tracking-wider text-white/30">
                          {r.label}
                        </div>
                      </div>
                    ))}
                    {eq?.cardBackUrl && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-black/30 ring-1 ring-[var(--gold)]/60">
                          <img src={eq.cardBackUrl} alt="" className="h-full w-full object-contain p-1" draggable={false} />
                        </div>
                        <div className="w-full truncate text-center text-[10px] text-white/60">Card Back</div>
                        <div className="-mt-1 text-[9px] uppercase tracking-wider text-white/30">Equipped</div>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              {kinds.length === 0 && equippedRows.length === 0 && !eq?.cardBackUrl ? (
                <div className="py-6 text-center text-sm text-white/50">No decor yet.</div>
              ) : (
                kinds.map((kind) => {
                  const section = KIND_TO_SECTION[kind];
                  return (
                    <section key={kind}>
                      <SectionHeader
                        title={KIND_LABELS[kind] ?? kind}
                        section={section}
                        selfView={selfView}
                        hidden={section ? hiddenSections.includes(section) : false}
                        onToggle={(s) => void toggleSection(s)}
                      />
                      <div
                        className={`grid grid-cols-4 gap-2 ${section ? dimIfHidden(section) : ""}`}
                      >
                        {(profile.collection[kind] ?? []).map((item) => (
                          <div key={item.id} className="flex flex-col items-center gap-1">
                            <div
                              className={`grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-black/30 ${
                                equippedIds.has(item.id) ? "ring-1 ring-[var(--gold)]/60" : "ring-1 ring-white/10"
                              }`}
                            >
                              <ItemImage item={item} className="h-full w-full object-contain p-1" />
                            </div>
                            <div className="w-full truncate text-center text-[10px] text-white/60">
                              {itemLabel(item)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
