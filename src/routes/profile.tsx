import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, LogOut, Upload, Lock, X, Map as MapIcon, ArrowDown, Copy, Check } from "lucide-react";
import { setMyAvatar } from "@/lib/rpc/cosmetics.functions";
import { getMyEntitlement } from "@/lib/rpc/bplus.functions";
import { BplusIcon } from "@/components/BplusIcon";
import { isDiscordActivity } from "@/discord/detection";
import iconBag from "@/assets/icons3d/bmart-tcgshop.webp";
import iconChallengeMedal from "@/assets/icons3d/medal-challenge.webp";
import iconDiscord from "@/assets/icons3d/discord.webp";
import iconYapin from "@/assets/icons3d/yapin.webp";
import iconStats from "@/assets/icons3d/stats.webp";
import { KeybindEditor } from "@/components/game/KeybindEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FriendsPanel } from "@/components/FriendsPanel";
import { CardsTab } from "@/components/profile/CardsTab";
import { WalletOverlay } from "@/components/wallet/WalletOverlay";
import { DecorTab } from "@/components/profile/DecorTab";
import { ReferralsTab } from "@/components/profile/ReferralsTab";
import { ChallengesDialog } from "@/components/profile/ChallengesPanel";
import { StatsDialog } from "@/components/profile/StatsPanel";
import { PublicProfileDialog } from "@/components/profile/PublicProfileDialog";
import { DeleteAccountSection } from "@/components/profile/DeleteAccountSection";
import { YapinLinkSection } from "@/components/profile/YapinLinkSection";
import { DiscordLinkSection } from "@/components/profile/DiscordLinkSection";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-10 text-center">
      <div className="font-display text-sm uppercase tracking-widest text-white/70">{label}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">Coming soon</div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  head: () => {
    const title = "Profile — Bimyah!";
    const description = "Manage your Bimyah! profile, avatar, card backs, and table décor.";
    const url = "https://playbimyah.com/profile";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  validateSearch: (
    s: Record<string, unknown> | undefined,
  ): { bimbucks?: string; tab?: string; focus?: string } => ({
    ...(typeof s?.bimbucks === "string" ? { bimbucks: s.bimbucks } : {}),
    ...(typeof s?.tab === "string" ? { tab: s.tab } : {}),
    ...(typeof s?.focus === "string" ? { focus: s.focus } : {}),
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/profile" });
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [activeCardBack, setActiveCardBack] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  // Controlled tab state, driven by ?tab= so a push notification tap
  // switches to the right tab even when the profile page is already open
  // (an uncontrolled defaultValue would only apply on a fresh mount).
  const TAB_VALUES = ["cards", "friends", "decor", "keys", "referrals"] as const;
  type TabValue = (typeof TAB_VALUES)[number];
  const tabFromSearch: TabValue | null =
    search.tab && (TAB_VALUES as readonly string[]).includes(search.tab)
      ? (search.tab as TabValue)
      : null;
  const [activeTab, setActiveTab] = useState<TabValue>(tabFromSearch ?? "cards");
  useEffect(() => {
    if (tabFromSearch) setActiveTab(tabFromSearch);
  }, [tabFromSearch]);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // If returning from a Bimbucks purchase, open the wallet so the user
  // sees their new balance (credited by the webhook).
  useEffect(() => {
    if (search.bimbucks === "success") {
      setWalletOpen(true);
      void navigate({ to: "/profile", search: {}, replace: true });
    }
  }, [search.bimbucks, navigate]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const ent = await getMyEntitlement();
        setIsPlus(ent.is_plus);
      } catch {
        setIsPlus(false);
      }
      const { data } = await supabase
        .from("card_backs")
        .select("image_url")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      setActiveCardBack((data?.image_url as string | undefined) ?? null);
    })();
  }, [user]);


  async function uploadAvatar(file: File) {
    if (!user) return;
    setErr(null);
    setMsg(null);
    setUploadingAvatar(true);
    try {
      if (!isPlus) throw new Error("Bimyah!+ is required to set a custom avatar.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2 MB.");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so newly uploaded avatar shows immediately.
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      await setMyAvatar({ data: { avatarUrl: url } });
      await refreshProfile();
      setMsg("Avatar updated.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function clearAvatar() {
    if (!user) return;
    setErr(null);
    setMsg(null);
    try {
      await setMyAvatar({ data: { avatarUrl: null } });
      await refreshProfile();
      setMsg("Avatar removed.");
    } catch (e) {
      setErr((e as Error).message);
    }
  }



  if (loading || !user) return null;

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-50px)] w-full max-w-md flex-col px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1.5">
          <Link to="/" className="text-white/60 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <button
            onClick={async () => {
              await signOut();
              void navigate({ to: "/" });
            }}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <div className="flex items-start gap-3 py-1">
            {!isDiscordActivity() && (
              <Link
                to="/bmart"
                aria-label="Shop Bmart"
                title="Bmart"
                className="flex flex-col items-center gap-1 transition-transform hover:scale-105 active:scale-95"
              >
                <img
                  src={iconBag}
                  alt=""
                  draggable={false}
                  className="h-[38px] w-[38px] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
                />
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                  Shop
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setWalletOpen(true)}
              aria-label="Open bank"
              title="Bank"
              className="flex flex-col items-center gap-1 transition-transform hover:scale-105 active:scale-95"
            >
              <img
                src="/images/wallet-bank-final.png"
                alt=""
                draggable={false}
                className="h-[38px] w-[38px] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
              />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                Bank
              </span>
            </button>
            <button
              type="button"
              onClick={() => setChallengesOpen(true)}
              aria-label="Open challenges"
              title="Challenges"
              className="flex flex-col items-center gap-1 transition-transform hover:scale-105 active:scale-95"
            >
              <img
                src={iconChallengeMedal}
                alt=""
                draggable={false}
                className="h-[38px] w-[38px] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
              />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                Challenges
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              aria-label="Open stats"
              title="Stats"
              className="flex flex-col items-center gap-1 transition-transform hover:scale-105 active:scale-95"
            >
              <img
                src={iconStats}
                alt=""
                draggable={false}
                className="h-[38px] w-[38px] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]"
              />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                Stats
              </span>
            </button>
          </div>
        </div>
      </div>

      <h1 className="mt-2 text-center font-display text-2xl uppercase tracking-widest text-[var(--gold)]">
        Profile
      </h1>

      {/* Avatar */}
      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full border-2 border-[var(--gold)]/40 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--mint)]/20 font-display text-3xl text-white">
              {(profile?.display_name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          {avatarUrl && (
            <button
              type="button"
              onClick={clearAvatar}
              className="absolute -right-1 -top-1 rounded-full bg-black/80 p-1 text-white/70 hover:text-white"
              aria-label="Remove avatar"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="text-xs text-white/50">{user.email}</div>
        {user && (
          <button
            type="button"
            onClick={() => setPublicProfileOpen(true)}
            className="text-[11px] font-bold uppercase tracking-widest text-[var(--gold)] underline"
          >
            View Public Profile
          </button>
        )}

        <div className="flex items-end gap-3">
          <label
            className={`btn-3d ${isPlus ? "btn-3d-gold" : "btn-3d-dark"} inline-flex cursor-pointer items-center gap-1.5 text-[11px] ${
              !isPlus ? "opacity-70" : ""
            }`}
          >
            {isPlus ? <Upload className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {uploadingAvatar ? "Uploading…" : "Upload avatar"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={!isPlus || uploadingAvatar}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadAvatar(f);
              }}
            />
          </label>

          {/* Map Game Screen entry: handwritten label, flashing arrow, golden map icon. */}
          <div className="relative flex flex-col items-center">
            <span
              className="whitespace-nowrap text-[11px] leading-none"
              style={{
                fontFamily: "'Comic Sans MS', 'Caveat', cursive",
                color: "#39ff14",
                textShadow: "0 0 6px rgba(57,255,20,0.6)",
                transform: "rotate(-4deg)",
              }}
            >
              Map Game Screen
            </span>
            <ArrowDown
              className="mt-0.5 h-4 w-4 animate-pulse"
              style={{ color: "#39ff14", filter: "drop-shadow(0 0 4px rgba(57,255,20,0.7))" }}
            />
            <Link
              to="/map"
              aria-label="Open Map Game Screen"
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <MapIcon
                className="h-8 w-8"
                strokeWidth={2.25}
                style={{
                  color: "#f4cf6a",
                  filter:
                    "drop-shadow(0 1px 0 #8a6a16) drop-shadow(0 0 6px rgba(244,207,106,0.55))",
                }}
              />
            </Link>
          </div>
        </div>

        {!isPlus && !isDiscordActivity() && (
          <Link
            to="/plus"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80 underline"
          >
            Custom avatars unlock with <BplusIcon size={14} /> Bimyah!+
          </Link>
        )}
      </div>

      {/* Display name (locked) */}
      <div className="mt-6 flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">
          Display name (permanent)
        </label>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-2 font-display text-white/80">
          {profile?.display_name ?? "—"}
        </div>
        <div className="text-[10px] text-white/40">
          Your display name is locked once your account is created.
        </div>

        {profile?.display_name && (
          <div className="mt-3 flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-widest text-white/50">
              Your referral link
            </label>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 truncate rounded-lg border border-[var(--gold)]/30 bg-black/30 px-3 py-2 font-mono text-xs text-white/80">
                playbimyah.com/?ref={profile.display_name}
              </div>
              <button
                type="button"
                onClick={async () => {
                  const url = `https://playbimyah.com/?ref=${encodeURIComponent(profile.display_name!)}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopiedRef(true);
                    setMsg("Referral link copied");
                    setTimeout(() => setCopiedRef(false), 1500);
                  } catch {
                    setErr("Couldn't copy link");
                  }
                }}
                aria-label="Copy referral link"
                className="grid h-auto w-10 place-items-center rounded-lg border border-[var(--gold)]/40 bg-gradient-to-b from-[#f4cf6a] via-[#d9a834] to-[#8a6a16] text-[#1a1303] shadow-[0_2px_0_0_#5a4310] active:translate-y-0.5"
              >
                {copiedRef ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="text-[10px] text-white/40">
              Share this link — visits are tracked as referrals.
            </div>
          </div>
        )}
      </div>

      {/* Tabs, controlled by ?tab= (see activeTab above): push
          notifications link ?tab=friends&focus=requests so a tapped
          friend-request alert lands on the pending request. */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="mt-8 w-full"
      >
        <TabsList className="grid w-full grid-cols-5 bg-black/30">
          <TabsTrigger value="cards" className="text-[9px] uppercase tracking-wider">Cards</TabsTrigger>
          <TabsTrigger value="friends" className="text-[9px] uppercase tracking-wider">Friends</TabsTrigger>
          <TabsTrigger value="decor" className="text-[9px] uppercase tracking-wider">Decor</TabsTrigger>
          <TabsTrigger value="keys" className="text-[9px] uppercase tracking-wider">Controls</TabsTrigger>
          <TabsTrigger value="referrals" className="text-[9px] uppercase tracking-wider">Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          <CardsTab
            userId={user.id}
            isPlus={isPlus}
            activeCardBack={activeCardBack}
            setActiveCardBack={setActiveCardBack}
            setMsg={setMsg}
            setErr={setErr}
            onRequestBuyBimbucks={() => setWalletOpen(true)}
          />
        </TabsContent>

        <TabsContent value="friends" className="mt-4">
          <FriendsPanel focusRequests={search.focus === "requests"} />
        </TabsContent>

        <TabsContent value="decor" className="mt-4">
          <DecorTab />
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              Keyboard controls
            </div>
            <KeybindEditor />
          </div>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <ReferralsTab />
        </TabsContent>

      </Tabs>

      {msg && <div className="mt-3 text-center text-xs text-emerald-400">{msg}</div>}
      {err && <div className="mt-3 text-center text-xs text-[var(--player-red)]">{err}</div>}

      {/* Connections (Ronya 2026-11-10): one centered section for
          both platforms. Discord left, Yapin' right, each with its
          platform logo above its own link code field. */}
      {!isDiscordActivity() && (
        <div className="mt-10 border-t border-white/10 pt-6">
          <div className="text-center font-display text-sm uppercase tracking-widest text-white">
            Connections
          </div>
          <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-white/50">
            Link your Discord and Yapin' accounts to use the Bimyah bot on
            both platforms. Run <span className="text-white/80">/link</span>{" "}
            with the bot on either platform and it will give you a private
            code that only you can see, then paste it in that platform's
            field below. Once linked, the bot can show your profile, bank,
            and stats there, and you can shop Bmart from both platforms too.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="flex min-w-0 flex-col">
              <img
                src={iconDiscord}
                alt="Discord"
                draggable={false}
                className="mx-auto h-12 w-12 rounded-[14px] object-contain"
              />
              <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-white/60">
                Discord
              </div>
              <DiscordLinkSection />
            </div>
            <div className="flex min-w-0 flex-col">
              <img
                src={iconYapin}
                alt="Yapin'"
                draggable={false}
                className="mx-auto h-12 w-12 rounded-[14px] object-contain"
              />
              <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-white/60">
                Yapin'
              </div>
              <YapinLinkSection />
            </div>
          </div>
        </div>
      )}

      <DeleteAccountSection />

      {challengesOpen && <ChallengesDialog onClose={() => setChallengesOpen(false)} />}

      {statsOpen && <StatsDialog onClose={() => setStatsOpen(false)} />}

      {publicProfileOpen && user && (
        <PublicProfileDialog
          userId={user.id}
          selfView
          onClose={() => setPublicProfileOpen(false)}
        />
      )}

      {walletOpen && user && (
        <WalletOverlay userId={user.id} onClose={() => setWalletOpen(false)} />
      )}
    </div>
  );
}

