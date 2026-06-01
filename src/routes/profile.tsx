import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, LogOut, Upload, Lock, X } from "lucide-react";
import { setMyAvatar } from "@/server/cosmetics.functions";
import { getMyEntitlement } from "@/server/bplus.functions";
import { BplusIcon } from "@/components/BplusIcon";
import { KeybindEditor } from "@/components/game/KeybindEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FriendsPanel } from "@/components/FriendsPanel";
import { CardsTab } from "@/components/profile/CardsTab";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-10 text-center">
      <div className="font-display text-sm uppercase tracking-widest text-white/70">{label}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">Coming soon</div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Bimyah!" },
      { name: "description", content: "Manage your Bimyah! profile, avatar, and card backs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [activeCardBack, setActiveCardBack] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

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
        <Link to="/" className="text-white/60 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button
          onClick={async () => {
            await signOut();
            void navigate({ to: "/" });
          }}
          className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <h1 className="mt-4 text-center font-display text-2xl uppercase tracking-widest text-[var(--gold)]">
        Profile
      </h1>

      {/* Avatar */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full border-2 border-[var(--gold)]/40 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--mint)]/20 font-display text-3xl text-[var(--mint)]">
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
        {!isPlus && (
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cards" className="mt-8 w-full">
        <TabsList className="grid w-full grid-cols-5 bg-black/30">
          <TabsTrigger value="cards" className="text-[9px] uppercase tracking-wider">Cards</TabsTrigger>
          <TabsTrigger value="friends" className="text-[9px] uppercase tracking-wider">Friends</TabsTrigger>
          <TabsTrigger value="titles" className="text-[9px] uppercase tracking-wider">Titles</TabsTrigger>
          <TabsTrigger value="keys" className="text-[9px] uppercase tracking-wider">Controls</TabsTrigger>
          <TabsTrigger value="stats" className="text-[9px] uppercase tracking-wider">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          <CardsTab
            userId={user.id}
            isPlus={isPlus}
            activeCardBack={activeCardBack}
            setActiveCardBack={setActiveCardBack}
            setMsg={setMsg}
            setErr={setErr}
          />
        </TabsContent>

        <TabsContent value="friends" className="mt-4">
          <FriendsPanel />
        </TabsContent>

        <TabsContent value="titles" className="mt-4">
          <ComingSoon label="Titles & Badges" />
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              Keyboard controls
            </div>
            <KeybindEditor />
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <ComingSoon label="Stats" />
        </TabsContent>
      </Tabs>

      {msg && <div className="mt-3 text-center text-xs text-[var(--mint)]">{msg}</div>}
      {err && <div className="mt-3 text-center text-xs text-[var(--player-red)]">{err}</div>}
    </div>
  );
}

