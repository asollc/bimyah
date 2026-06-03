import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PowLogo } from "@/components/game/Visuals";
import { CardBack } from "@/components/game/Card";
import { HowToPlayButton } from "@/components/game/HowToPlay";
import { BplusIcon } from "@/components/BplusIcon";
import { BulletinBell } from "@/components/BulletinBell";
import foundingMemberCard from "@/assets/founding-member-card.jpg";
import socialYoutube from "@/assets/social-youtube.png";
import socialDiscord from "@/assets/social-discord.png";
import socialTiktok from "@/assets/social-tiktok.png";
import socialFacebook from "@/assets/social-facebook.png";
import socialEmail from "@/assets/social-email.png";
import { sfx } from "@/game/sfx";
import { Bot, Users, Plus, Trophy, Swords, LogIn, Share2, Twitter, Facebook, Linkedin, MessageCircle, Send, Mail, Link as LinkIcon, GraduationCap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { createInitialGame } from "@/game/engine";
import { hostGame } from "@/game/peer";
import { registerSession } from "@/game/sessionStore";
import { saveIdentity } from "@/game/persistence";
import { saveReentryCode } from "@/game/reentry";
import { useAuth } from "@/auth/AuthProvider";
import { getGuestName } from "@/game/guest";
import { GuestNamePrompt } from "@/components/GuestNamePrompt";
import { getMyCosmetics } from "@/lib/rpc/cosmetics.functions";
import { getActiveCardSlotImages, applyDecorOverrides } from "@/game/cosmetics";
import { getMyEntitlement } from "@/lib/rpc/bplus.functions";
import { getMyAdminStatus, recordShareEvent } from "@/lib/rpc/admin.functions";
import { createPublicMatch } from "@/lib/rpc/publicMatches.functions";
import type { GameMode } from "@/game/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => {
    const title = "Bimyah! — A fast-paced card race with NO TURNS!";
    const description =
      "Bimyah! is a fast-paced card race with no turns. Play free online with friends, family, or bots. Easy to learn, impossible to put down.";
    const image = "https://qorqfqwjmkyosplldovh.supabase.co/storage/v1/object/public/public-assets/og-bimyah.jpg";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:url", content: "https://playbimyah.com/" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: "https://playbimyah.com/" }],
    };
  },
  component: HomePage,
});

function HomePage() {
  useEffect(() => {
    sfx.init();
  }, []);
  const [showSolo, setShowSolo] = useState(false);
  const [showHost, setShowHost] = useState(false);
  const [forcedMode, setForcedMode] = useState<GameMode | null>(null);
  const [hosting, setHosting] = useState(false);
  const [hostErr, setHostErr] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ run: () => void } | null>(null);
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const isAuthed = !!user;

  // Allow either a signed-in user or a guest (with stored name) to proceed.
  // If neither, prompt for a guest display name first.
  function requireIdentity(action: () => void) {
    if (isAuthed || getGuestName()) {
      action();
      return;
    }
    setPendingAction({ run: action });
  }


  async function hostMultiplayer(rawName: string, mode: GameMode, pointLimit: number | null, maxSeats: number, isPublic: boolean) {
    setHosting(true);
    setHostErr(null);
    try {
      const myName = (rawName || "").trim().slice(0, 14) || "Host";
      try {
        localStorage.setItem("bimyah_last_name", myName);
      } catch {
        /* ignore */
      }
      const hostId = `host_${Math.random().toString(36).slice(2, 8)}`;
      let cosmetics: Awaited<ReturnType<typeof getMyCosmetics>> = {
        avatarUrl: null,
        cardBackUrl: null,
        titleUrl: null,
        badgeUrl: null,
        victoryUrl: null,
        backgroundUrl: null,
        tabletopUrl: null,
        tableArtUrl: null,
      };
      try {
        cosmetics = await getMyCosmetics();
      } catch {
        /* not signed in or no cosmetics */
      }
      cosmetics = applyDecorOverrides(user?.id ?? null, cosmetics);
      const cardBackUrls = getActiveCardSlotImages(user?.id ?? null, cosmetics.cardBackUrl);
      const initial = createInitialGame(
        "temp",
        [
          {
            id: hostId,
            name: myName,
            isBot: false,
            ...cosmetics,
            cardBackUrls,
          },
        ],
        { mode, pointLimit, maxSeats },
      );
      const session = await hostGame(initial, hostId);
      const hostPlayer = session.getState()?.players.find((p) => p.id === hostId);
      if (hostPlayer?.reentryCode) {
        saveReentryCode(session.code, hostPlayer.reentryCode);
      }
      const { saveLastRoom } = await import("@/game/reentry");
      saveLastRoom(session.code);
      registerSession(session);
      sessionStorage.setItem(`bimyah_me_${session.code}`, hostId);
      sessionStorage.setItem(`bimyah_name_${session.code}`, myName);
      saveIdentity(session.code, { meId: hostId, name: myName, role: "host" });
      if (isPublic && isAuthed) {
        try {
          await createPublicMatch({
            data: {
              game_id: session.code,
              host_name: myName,
              mode,
              max_seats: maxSeats,
              seats_taken: 1,
            },
          });
          sessionStorage.setItem(`bimyah_public_${session.code}`, "1");
        } catch {
          /* non-fatal */
        }
      }
      void navigate({ to: "/game/$gameId", params: { gameId: session.code } });
    } catch (e) {
      console.error(e);
      setHostErr("Could not start host session. Try again.");
      setHosting(false);
    }
  }

  const initial = (profile?.display_name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!isAuthed) {
      setIsAdmin(false);
      return;
    }
    void getMyAdminStatus()
      .then((r) => setIsAdmin(r.is_admin))
      .catch(() => setIsAdmin(false));
  }, [isAuthed]);

  return (
    <div className="relative flex h-[calc(100dvh-50px)] min-h-[560px] w-screen flex-col items-center overflow-x-hidden px-4 pt-2 pb-2 lg:h-auto lg:min-h-[calc(100dvh-50px)] lg:pt-3 lg:pb-3">
      <FloatingCards />

      <div className="relative z-10 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          {authLoading ? (
            <div className="h-9 w-9" />
          ) : isAuthed ? (
            <Link
              to="/profile"
              aria-label="Open profile"
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--mint)]/20 font-display text-sm font-black text-[var(--mint)] ring-2 ring-[var(--mint)]/40 transition hover:scale-105"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                initial
              )}
            </Link>
          ) : (
            <Link
              to="/auth"
              aria-label="Sign in"
              className="flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 font-display text-[10px] font-black uppercase tracking-widest text-[var(--mint)] ring-1 ring-[var(--mint)]/40 transition hover:scale-105"
            >
              <LogIn className="h-3 w-3" /> Sign In
            </Link>
          )}
          <SharePopover userId={user?.id ?? null} />
          <BulletinBell userId={user?.id ?? null} />

        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              aria-label="Admin"
              className="flex h-9 items-center gap-1 rounded-full bg-black/40 px-3 font-display text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/30 transition hover:scale-105"
            >
              Admin
            </Link>
          )}
          <HowToPlayButton variant="lime" />
        </div>
      </div>

      <div className="relative z-10 mt-2 flex flex-col items-center gap-2 sm:gap-3">
        <div className="relative">
          <PowLogo size={207} />
          <span
            aria-label="beta"
            className="absolute -bottom-2 -right-4 rotate-[-8deg] text-2xl sm:text-3xl font-black uppercase tracking-wider"
            style={{
              fontFamily: "'Arial Black', 'Helvetica', sans-serif",
              color: "#fde047",
              textShadow: "0 0 6px rgba(253,224,71,0.6), 1px 1px 0 rgba(0,0,0,0.4)",
            }}
          >
            beta
          </span>
        </div>
        <div
          className="text-3d-yellow font-display text-center text-xs font-black uppercase leading-tight sm:text-sm md:text-base"
          style={{ letterSpacing: "0.08em" }}
        >
          A Fast-Paced Card Race
          <br />
          With No Turns!
        </div>
        {!isAuthed && !authLoading && (
          <div className="text-center text-[10px] uppercase tracking-widest border-stone-950 border-0 bg-transparent text-slate-50 font-sans">
            Play as guest or <Link to="/auth" className="text-[var(--mint)] underline">sign up free</Link>
          </div>
        )}
      </div>

      <div className="relative z-10 mt-6 flex w-full max-w-xs flex-col gap-2 sm:gap-3">
        {!showSolo && !showHost && (
          <>
            <button
              onClick={() => requireIdentity(() => { setForcedMode(null); setShowHost(true); })}
              disabled={hosting}
              className="btn-3d btn-3d-gold w-full text-base disabled:opacity-60"
            >
              <Plus className="mr-2 h-5 w-5" />
              <span className="flex flex-col items-center leading-tight">
                <span>Create Game</span>
                <span className="text-[10px] font-normal opacity-80 normal-case">
                  Play with bots, humans, or both
                </span>
              </span>
            </button>
            <button
              onClick={() => requireIdentity(() => void navigate({ to: "/public" }))}
              className="btn-3d btn-3d-dark w-full text-base"
            >
              <Users className="mr-2 h-5 w-5" />
              <span className="flex flex-col items-center leading-tight">
                <span>Join Game</span>
                <span className="text-[10px] font-normal opacity-80 normal-case">
                  or rejoin a game
                </span>
              </span>
            </button>
            <button
              onClick={() => requireIdentity(() => { setForcedMode("training"); setShowHost(true); })}
              disabled={hosting}
              className="btn-3d btn-3d-mint w-full text-base disabled:opacity-60"
            >
              <GraduationCap className="mr-2 h-5 w-5" />
              <span className="flex flex-col items-center leading-tight">
                <span>Training</span>
                <span className="text-[10px] font-normal opacity-80 normal-case">
                  All cards viewable
                </span>
              </span>
            </button>
            <Link
              to="/plus"
              className="btn-3d btn-3d-red w-full text-base text-white"
            >
              <span className="flex flex-col items-center leading-tight">
                <span>Upgrade to BIMYAH!+</span>
                <span className="text-[10px] font-normal opacity-80 normal-case">
                  Gain exclusive perks for your support
                </span>
              </span>
            </Link>
            {hostErr && (
              <div className="text-center text-xs text-[var(--player-red)]">{hostErr}</div>
            )}
            <SocialIcons />
          </>
        )}


        {showSolo && (
          <SoloFlow
            onCancel={() => setShowSolo(false)}
            profileName={profile?.display_name ?? null}
            userEmail={user?.email ?? null}
          />
        )}
        {showHost && (
          <HostFlow
            hosting={hosting}
            error={hostErr}
            forcedMode={forcedMode}
            profileName={profile?.display_name ?? null}
            userEmail={user?.email ?? null}
            canHostPublic={isAuthed}
            onCancel={() => {
              setShowHost(false);
              setHostErr(null);
              setForcedMode(null);
            }}
            onStart={(name, mode, limit, seats, isPublic) => {
              void hostMultiplayer(name, mode, limit, seats, isPublic);
            }}
          />
        )}
      </div>

      {pendingAction && (
        <GuestNamePrompt
          onCancel={() => setPendingAction(null)}
          onSubmit={() => {
            const a = pendingAction.run;
            setPendingAction(null);
            a();
          }}
        />
      )}
    </div>
  );
}

const SOCIAL_LINKS = [
  { src: socialYoutube, alt: "YouTube", href: "https://www.youtube.com/@playbimyah?sub_confirmation=1" },
  { src: socialDiscord, alt: "Discord", href: "https://discord.gg/5xs5pWFrxp" },
  { src: socialTiktok, alt: "TikTok", href: "https://www.tiktok.com/@playbimyah" },
  { src: socialFacebook, alt: "Facebook", href: "https://www.facebook.com/share/1EeyG6PVAp/" },
  { src: socialEmail, alt: "Email", href: "mailto:info@ronyaross.top" },
];

function SocialIcons() {
  return (
    <div className="mt-2 flex w-full items-center justify-center gap-3">
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.alt}
          href={s.href}
          target={s.href.startsWith("mailto:") ? undefined : "_blank"}
          rel={s.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
          aria-label={s.alt}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <img
            src={s.src}
            alt={s.alt}
            className="h-11 w-11 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
            draggable={false}
          />
        </a>
      ))}
    </div>
  );
}

const SHARE_TEXT = "I found a fun fast-paced card game called Bimyah! You should try it.";
const SHARE_URL = "https://playbimyah.com";
const SHARE_IMAGE = "https://qorqfqwjmkyosplldovh.supabase.co/storage/v1/object/public/public-assets/og-bimyah.jpg";

type ShareTarget = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  build?: () => string;
  onClick?: () => void | Promise<void>;
};

function SharePopover({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);

  function track(method: string) {
    void recordShareEvent({
      data: {
        method: method === "clipboard" ? "clipboard" : "web_share",
        source: `home:${method}`,
        user_id: userId,
      },
    }).catch(() => {});
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${SHARE_URL}`);
      toast.success("Link copied! Paste it into Instagram, TikTok, or anywhere.");
      track("clipboard");
    } catch {
      toast.error("Couldn't copy link");
    }
    setOpen(false);
  }

  function openIntent(url: string, key: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    track(key);
    setOpen(false);
  }

  const encodedText = encodeURIComponent(SHARE_TEXT);
  const encodedUrl = encodeURIComponent(SHARE_URL);
  const encodedTextWithUrl = encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`);

  const targets: ShareTarget[] = [
    {
      key: "twitter",
      label: "X / Twitter",
      icon: Twitter,
      color: "text-sky-400",
      build: () => `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: Facebook,
      color: "text-blue-500",
      build: () => `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: "text-green-400",
      build: () => `https://api.whatsapp.com/send?text=${encodedTextWithUrl}`,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: Send,
      color: "text-sky-300",
      build: () => `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      icon: Linkedin,
      color: "text-blue-400",
      build: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      key: "reddit",
      label: "Reddit",
      icon: Share2,
      color: "text-orange-400",
      build: () =>
        `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent("Bimyah! — a fast-paced no-turns card game")}`,
    },
    {
      key: "email",
      label: "Email",
      icon: Mail,
      color: "text-amber-300",
      build: () =>
        `mailto:?subject=${encodeURIComponent("You should try Bimyah!")}&body=${encodedTextWithUrl}`,
    },
    {
      key: "copy",
      label: "Copy link",
      icon: LinkIcon,
      color: "text-[var(--mint)]",
      onClick: handleCopy,
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Share Bimyah!"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-[var(--mint)] ring-1 ring-[var(--mint)]/40 transition hover:scale-105"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-72 border-[var(--mint)]/30 bg-black/95 p-3 text-white"
      >
        <div className="mb-3 overflow-hidden rounded-lg border border-[var(--mint)]/20 bg-black/60">
          <img
            src={SHARE_IMAGE}
            alt="Bimyah! card game preview"
            loading="lazy"
            className="aspect-[1.91/1] w-full object-cover"
          />
          <div className="px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-widest text-white/50">
              playbimyah.com
            </div>
            <div className="truncate text-[11px] font-medium text-white/90">
              {SHARE_TEXT}
            </div>
          </div>
        </div>
        <div className="mb-2 font-display text-[10px] font-black uppercase tracking-widest text-[var(--mint)]">
          Share Bimyah!
        </div>
        <div className="grid grid-cols-4 gap-2">
          {targets.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  if (t.onClick) void t.onClick();
                  else if (t.build) openIntent(t.build(), t.key);
                }}
                aria-label={`Share to ${t.label}`}
                title={t.label}
                className="flex flex-col items-center gap-1 rounded-lg p-2 transition hover:bg-white/10"
              >
                <Icon className={`h-5 w-5 ${t.color}`} />
                <span className="text-[9px] leading-tight text-white/80">{t.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-snug text-white/50">
          Tap a platform to open a pre-filled post. For Instagram, TikTok, or Snapchat use Copy link.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function FloatingCards() {
  const cards = [
    { top: "8%", left: "6%", size: 38, rot: -14, dx: 12, dy: -10, dur: 9 },
    { top: "18%", left: "82%", size: 44, rot: 18, dx: -14, dy: 12, dur: 11, imageUrl: foundingMemberCard },
    { top: "42%", left: "3%", size: 34, rot: 8, dx: 10, dy: 14, dur: 10 },
    { top: "55%", left: "90%", size: 40, rot: -22, dx: -10, dy: -12, dur: 12 },
    { top: "72%", left: "10%", size: 36, rot: 14, dx: 14, dy: -8, dur: 9.5 },
    { top: "80%", left: "78%", size: 42, rot: -10, dx: -12, dy: 10, dur: 10.5 },
    { top: "92%", left: "4%", size: 32, rot: 20, dx: 10, dy: -10, dur: 11 },
    { top: "92%", left: "88%", size: 34, rot: -18, dx: -10, dy: -8, dur: 10 },
    { top: "30%", left: "94%", size: 30, rot: 12, dx: -8, dy: 10, dur: 12.5 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-80">
      {cards.map((c, i) => (
        <div
          key={i}
          className="animate-float-card absolute"
          style={
            {
              top: c.top,
              left: c.left,
              "--rot": `${c.rot}deg`,
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              "--dur": `${c.dur}s`,
              animationDelay: `${i * 0.4}s`,
            } as React.CSSProperties
          }
        >
          <CardBack width={c.size} imageUrl={c.imageUrl} />
        </div>
      ))}
    </div>
  );
}

/* ============================ Shared step UIs ============================ */

function ModeStep({
  onPick,
  onCancel,
}: {
  onPick: (mode: GameMode) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Choose mode
      </div>
      <button onClick={() => onPick("standard")} className="btn-3d btn-3d-mint w-full text-sm">
        <Swords className="mr-2 h-4 w-4" /> Standard
      </button>
      <button onClick={() => onPick("tournament")} className="btn-3d btn-3d-gold w-full text-sm">
        <Trophy className="mr-2 h-4 w-4" /> Tournament
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

function NameStep({
  initial,
  accent,
  ctaLabel,
  ctaClass,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: string;
  accent: "mint" | "gold";
  ctaLabel: string;
  ctaClass: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  const canGo = trimmed.length >= 1 && !busy;
  const borderClr = accent === "gold" ? "var(--gold)" : "var(--mint)";
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Your name
      </div>
      <input
        autoFocus
        value={name}
        maxLength={14}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canGo) onSubmit(trimmed);
        }}
        placeholder="Enter your name"
        className="rounded-lg border bg-black/40 px-4 py-3 text-center font-display text-xl tracking-wider text-white placeholder:text-white/30"
        style={{ borderColor: `${borderClr}80` }}
      />
      <button
        onClick={() => onSubmit(trimmed)}
        disabled={!canGo}
        className={`btn-3d ${ctaClass} w-full text-sm disabled:opacity-40`}
      >
        {busy ? "Starting…" : ctaLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

function PointLimitStep({
  initial,
  onSubmit,
  onCancel,
  ctaClass,
  ctaLabel,
  busy,
}: {
  initial: string;
  onSubmit: (limit: number) => void;
  onCancel: () => void;
  ctaClass: string;
  ctaLabel: string;
  busy?: boolean;
}) {
  const [val, setVal] = useState(initial);
  const num = parseInt(val, 10);
  const valid = Number.isFinite(num) && num >= 1 && num <= 1000 && !busy;
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Point limit
      </div>
      <input
        autoFocus
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onSubmit(num);
        }}
        placeholder="e.g. 100"
        className="rounded-lg border border-[var(--gold)]/50 bg-black/40 px-4 py-3 text-center font-display text-2xl tracking-wider text-white placeholder:text-white/30"
      />
      <div className="text-center text-[10px] text-white/50">1 – 1000 points</div>
      <button
        onClick={() => onSubmit(num)}
        disabled={!valid}
        className={`btn-3d ${ctaClass} w-full text-sm disabled:opacity-40`}
      >
        {busy ? "Starting…" : ctaLabel}
      </button>
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

/* ============================ Solo flow ============================ */

type SoloStep = "mode" | "points" | "bots";

function deriveDisplayName(
  profileName: string | null,
  userEmail: string | null,
  fallback: string,
): string {
  const fromProfile = (profileName ?? "").trim();
  if (fromProfile) return fromProfile.slice(0, 14);
  const fromEmail = (userEmail ?? "").split("@")[0]?.trim() ?? "";
  if (fromEmail) return fromEmail.slice(0, 14);
  try {
    const stored = localStorage.getItem("bimyah_last_name")?.trim();
    if (stored) return stored.slice(0, 14);
  } catch {
    /* ignore */
  }
  return fallback;
}

function SoloFlow({
  onCancel,
  profileName,
  userEmail,
}: {
  onCancel: () => void;
  profileName: string | null;
  userEmail: string | null;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<SoloStep>("mode");
  const [mode, setMode] = useState<GameMode>("standard");
  const [pointLimit, setPointLimit] = useState<number | null>(null);
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ent = await getMyEntitlement();
        if (!cancelled) setIsPlus(!!ent?.is_plus);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function start(botCount: number) {
    const myId = "me";
    const finalName = deriveDisplayName(profileName, userEmail, "You");
    try {
      localStorage.setItem("bimyah_last_name", finalName);
    } catch {
      /* ignore */
    }
    const players = [
      { id: myId, name: finalName, isBot: false },
      ...Array.from({ length: botCount }, (_, i) => ({
        id: `bot_${i}`,
        name: `Bot ${i + 1}`,
        isBot: true,
      })),
    ];
    sessionStorage.setItem(
      "bimyah_solo_setup",
      JSON.stringify({ players, mode, pointLimit }),
    );
    void navigate({ to: "/solo" });
  }

  if (step === "mode") {
    return (
      <ModeStep
        onPick={(m) => {
          setMode(m);
          setStep(m === "tournament" ? "points" : "bots");
        }}
        onCancel={onCancel}
      />
    );
  }
  if (step === "points") {
    return (
      <PointLimitStep
        initial=""
        ctaLabel="Next"
        ctaClass="btn-3d-gold"
        onSubmit={(n) => {
          setPointLimit(n);
          setStep("bots");
        }}
        onCancel={onCancel}
      />
    );
  }
  // bots
  const freeOptions: Array<{ count: number; label: string }> = [
    { count: 1, label: "1 Bot (2P)" },
    { count: 2, label: "2 Bots (3P)" },
    { count: 3, label: "3 Bots (4P)" },
  ];
  const plusOptions: Array<{ count: number; label: string }> = [
    { count: 4, label: "4 Bots (5P)" },
    { count: 5, label: "5 Bots (6P)" },
    { count: 6, label: "6 Bots (7P)" },
    { count: 7, label: "7 Bots (8P)" },
  ];
  return (
    <>
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Choose opponents
      </div>
      {freeOptions.map((o) => (
        <button
          key={o.count}
          onClick={() => start(o.count)}
          className="btn-3d btn-3d-mint w-full text-sm"
        >
          {o.label}
        </button>
      ))}
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
        <span className="h-px flex-1 bg-[var(--gold)]/30" />
        <BplusIcon size={16} />
        Bimyah!+
        <span className="h-px flex-1 bg-[var(--gold)]/30" />
      </div>
      {plusOptions.map((o) =>
        isPlus ? (
          <button
            key={o.count}
            onClick={() => start(o.count)}
            className="btn-3d btn-3d-gold w-full text-sm"
          >
            {o.label}
          </button>
        ) : (
          <Link
            key={o.count}
            to="/plus"
            className="btn-3d btn-3d-dark w-full text-sm opacity-80"
          >
            🔒 {o.label}
          </Link>
        ),
      )}
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}

/* ============================ Host flow ============================ */

type HostStep = "mode" | "points" | "seats";

function HostFlow({
  hosting,
  error,
  onCancel,
  onStart,
  profileName,
  userEmail,
  forcedMode,
  canHostPublic = true,
}: {
  hosting: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (
    name: string,
    mode: GameMode,
    pointLimit: number | null,
    maxSeats: number,
    isPublic: boolean,
  ) => void;
  profileName: string | null;
  userEmail: string | null;
  forcedMode?: GameMode | null;
  canHostPublic?: boolean;
}) {
  const [step, setStep] = useState<HostStep>(forcedMode ? "seats" : "mode");
  const [mode, setMode] = useState<GameMode>(forcedMode ?? "standard");
  const name = deriveDisplayName(profileName, userEmail, "Host");
  const [pointLimit, setPointLimit] = useState<number | null>(null);
  const [isPlus, setIsPlus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ent = await getMyEntitlement();
        if (!cancelled) setIsPlus(!!ent?.is_plus);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (step === "mode") {
    return (
      <ModeStep
        onPick={(m) => {
          setMode(m);
          setStep(m === "tournament" ? "points" : "seats");
        }}
        onCancel={onCancel}
      />
    );
  }
  if (step === "points") {
    return (
      <>
        <PointLimitStep
          initial=""
          ctaLabel="Next"
          ctaClass="btn-3d-gold"
          busy={false}
          onSubmit={(limit) => {
            setPointLimit(limit);
            setStep("seats");
          }}
          onCancel={onCancel}
        />
        {error && (
          <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
        )}
      </>
    );
  }
  // seats — host picks additional seats (2-7), total players = additional + 1
  return (
    <SeatsStep
      isPlus={isPlus}
      hosting={hosting}
      error={error}
      allowPublic={mode !== "training" && canHostPublic}
      onCancel={onCancel}
      onStart={(additional, isPublic) => onStart(name, mode, pointLimit, additional + 1, isPublic)}
    />
  );
}

function SeatsStep({
  isPlus,
  hosting,
  error,
  allowPublic,
  onCancel,
  onStart,
}: {
  isPlus: boolean;
  hosting: boolean;
  error: string | null;
  allowPublic: boolean;
  onCancel: () => void;
  onStart: (additionalSeats: number, isPublic: boolean) => void;
}) {
  const navigate = useNavigate();
  const [additional, setAdditional] = useState<number>(2);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const isPlusTier = additional >= 4; // 4 additional = 5 players total
  const locked = isPlusTier && !isPlus;
  const totalPlayers = additional + 1;
  return (
    <>
      {allowPublic && (
        <>
          <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
            Visibility
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-widest transition ${
                isPublic
                  ? "border-[var(--mint)] bg-[var(--mint)]/15 text-[var(--mint)]"
                  : "border-white/20 bg-black/40 text-white/60"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                className="sr-only"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
              />
              Public
            </label>
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-widest transition ${
                !isPublic
                  ? "border-[var(--mint)] bg-[var(--mint)]/15 text-[var(--mint)]"
                  : "border-white/20 bg-black/40 text-white/60"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                className="sr-only"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
              />
              Private
            </label>
          </div>
        </>
      )}
      <div className="text-center font-display text-xs uppercase tracking-widest text-white/60">
        Opponent count
      </div>
      <Select
        value={String(additional)}
        onValueChange={(v) => setAdditional(parseInt(v, 10))}
      >
        <SelectTrigger className="h-12 w-full rounded-lg border border-[var(--gold)]/50 bg-black/40 text-center font-display text-base text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-[var(--gold)]/40 bg-[oklch(0.18_0.04_165)] text-white">
          {[2, 3, 4, 5, 6, 7].map((n) => {
            const plus = n >= 4;
            return (
              <SelectItem
                key={n}
                value={String(n)}
                className={
                  plus
                    ? "text-[var(--gold)] focus:bg-[var(--gold)]/10 focus:text-[var(--gold)]"
                    : "text-white focus:bg-white/10"
                }
              >
                <span className="flex items-center gap-2">
                  {n} opponents ({n + 1}P)
                  {plus && (
                    <span className="inline-flex items-center rounded bg-[var(--gold)]/20 px-1 py-0.5 ring-1 ring-[var(--gold)]/40">
                      <BplusIcon size={14} />
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <div
        className={
          isPlusTier
            ? "text-center font-display text-[10px] uppercase tracking-widest text-[var(--gold)]"
            : "text-center text-[10px] uppercase tracking-widest text-white/50"
        }
      >
        {totalPlayers} players total
        {isPlusTier && (
          <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-[var(--gold)]/20 px-1.5 py-0.5 text-[9px] font-black text-[var(--gold)] ring-1 ring-[var(--gold)]/40">
            <BplusIcon size={12} />
            Bimyah!+
          </span>
        )}
      </div>
      {locked ? (
        <button
          onClick={() => void navigate({ to: "/plus" })}
          className="btn-3d btn-3d-dark inline-flex w-full items-center justify-center gap-2 text-sm"
        >
          🔒 Unlock with <BplusIcon size={18} /> Bimyah!+
        </button>
      ) : (
        <button
          onClick={() => onStart(additional, allowPublic ? isPublic : false)}
          disabled={hosting}
          className={`btn-3d ${isPlusTier ? "btn-3d-gold" : "btn-3d-mint"} w-full text-sm disabled:opacity-50`}
        >
          {hosting ? "Starting…" : "Create Lobby"}
        </button>
      )}
      {hosting && (
        <div className="text-center text-xs text-white/60">Starting…</div>
      )}
      {error && (
        <div className="text-center text-xs text-[var(--player-red)]">{error}</div>
      )}
      <button onClick={onCancel} className="text-xs text-white/50">Cancel</button>
    </>
  );
}
