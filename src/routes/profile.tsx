import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, LogOut, Upload, Lock, X } from "lucide-react";
import {
  setMyAvatar,
  setMyActiveCardBack,
  clearMyActiveCardBack,
} from "@/server/cosmetics.functions";
import { getMyEntitlement } from "@/server/bplus.functions";
import { BplusIcon } from "@/components/BplusIcon";

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
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [activeCardBack, setActiveCardBack] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name);
  }, [profile]);

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

  async function save() {
    if (!user) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const name = displayName.trim().slice(0, 14);
      if (!name) throw new Error("Name cannot be empty.");
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("id", user.id);
      if (error) throw error;
      try {
        localStorage.setItem("bimyah_last_name", name);
      } catch {
        /* ignore */
      }
      await refreshProfile();
      setMsg("Saved.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

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

  async function uploadCardBack(file: File) {
    if (!user) return;
    setErr(null);
    setMsg(null);
    setUploadingBack(true);
    try {
      if (!isPlus) throw new Error("Bimyah!+ is required to set a custom card back.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("card-backs")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("card-backs").getPublicUrl(path);
      const url = pub.publicUrl;
      await setMyActiveCardBack({ data: { imageUrl: url } });
      setActiveCardBack(url);
      setMsg("Card back updated.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingBack(false);
    }
  }

  async function clearCardBack() {
    setErr(null);
    setMsg(null);
    try {
      await clearMyActiveCardBack();
      setActiveCardBack(null);
      setMsg("Card back cleared.");
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

      {/* Display name */}
      <div className="mt-6 flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">Display name</label>
        <input
          value={displayName}
          maxLength={14}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white"
        />
        <button
          onClick={save}
          disabled={saving}
          className="btn-3d btn-3d-mint mt-2 w-full text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Card back */}
      <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Custom card back
          </div>
          {activeCardBack && (
            <button
              type="button"
              onClick={clearCardBack}
              className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="overflow-hidden rounded-lg border border-white/15 bg-black/40"
            style={{ width: 60, height: 84 }}
          >
            {activeCardBack ? (
              <img
                src={activeCardBack}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-white/30">
                default
              </div>
            )}
          </div>
          <label
            className={`btn-3d ${isPlus ? "btn-3d-gold" : "btn-3d-dark"} inline-flex cursor-pointer items-center gap-1.5 text-[11px] ${
              !isPlus ? "opacity-70" : ""
            }`}
          >
            {isPlus ? <Upload className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {uploadingBack ? "Uploading…" : "Upload (5:7 image)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={!isPlus || uploadingBack}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadCardBack(f);
              }}
            />
          </label>
        </div>
        {!isPlus && (
          <Link
            to="/plus"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80 underline"
          >
            Custom card backs unlock with <BplusIcon size={14} /> Bimyah!+
          </Link>
        )}
      </div>

      {msg && <div className="mt-3 text-center text-xs text-[var(--mint)]">{msg}</div>}
      {err && <div className="mt-3 text-center text-xs text-[var(--player-red)]">{err}</div>}
    </div>
  );
}
