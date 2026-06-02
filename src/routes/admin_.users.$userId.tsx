import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Upload, X, Crown, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  getMyAdminStatus,
  getAdminUserDetail,
  adminSetAvatar,
  adminSetDisplayName,
  adminSetCardBack,
  adminClearCardBack,
  adminUploadAsset,
} from "@/lib/rpc/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin_/users/$userId")({
  head: () => ({
    meta: [
      { title: "Edit user — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUserPage,
});

type Detail = Awaited<ReturnType<typeof getAdminUserDetail>>;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-10 text-center">
      <div className="font-display text-sm uppercase tracking-widest text-white/70">{label}</div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">Coming soon</div>
    </div>
  );
}

function UserOnly({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-10 text-center">
      <div className="font-display text-sm uppercase tracking-widest text-white/70">{label}</div>
      <div className="text-[10px] uppercase tracking-widest text-white/40">
        Visible only to the user
      </div>
    </div>
  );
}

function AdminUserPage() {
  const { userId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    void (async () => {
      try {
        const status = await getMyAdminStatus();
        if (!status.is_admin) {
          void navigate({ to: "/" });
          return;
        }
        setChecking(false);
      } catch {
        void navigate({ to: "/" });
      }
    })();
  }, [authLoading, user, navigate]);

  async function refresh() {
    setLoading(true);
    try {
      const d = await getAdminUserDetail({ data: { user_id: userId } });
      setDetail(d);
      setNameInput(d.display_name);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, userId]);

  function flash(message: string) {
    setMsg(message);
    setErr(null);
    setTimeout(() => setMsg(null), 2500);
  }

  async function uploadAvatar(file: File) {
    if (!detail) return;
    setErr(null);
    setUploadingAvatar(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2 MB.");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const filename = `avatar.${ext || "png"}`;
      const content_base64 = await fileToBase64(file);
      const { url } = await adminUploadAsset({
        data: {
          user_id: detail.id,
          bucket: "avatars",
          filename,
          content_base64,
          content_type: file.type || "image/png",
        },
      });
      const cacheBusted = `${url}?v=${Date.now()}`;
      await adminSetAvatar({ data: { user_id: detail.id, avatar_url: cacheBusted } });
      flash("Avatar updated.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function clearAvatar() {
    if (!detail) return;
    setErr(null);
    try {
      await adminSetAvatar({ data: { user_id: detail.id, avatar_url: null } });
      flash("Avatar removed.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveName() {
    if (!detail) return;
    setErr(null);
    setSavingName(true);
    try {
      await adminSetDisplayName({
        data: { user_id: detail.id, display_name: nameInput.trim() },
      });
      flash("Display name updated.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function uploadBack(file: File) {
    if (!detail) return;
    setErr(null);
    setUploadingBack(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const filename = `${Date.now()}.${ext || "png"}`;
      const content_base64 = await fileToBase64(file);
      const { url } = await adminUploadAsset({
        data: {
          user_id: detail.id,
          bucket: "card-backs",
          filename,
          content_base64,
          content_type: file.type || "image/png",
        },
      });
      await adminSetCardBack({ data: { user_id: detail.id, image_url: url } });
      flash("Card back updated.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingBack(false);
    }
  }

  async function clearBack() {
    if (!detail) return;
    setErr(null);
    try {
      await adminClearCardBack({ data: { user_id: detail.id } });
      flash("Card back cleared.");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (checking) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="mt-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) return null;

  const avatarUrl = detail.avatar_url;
  const cardBackLocked = !!detail.active_card_back_url;

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-50px)] w-full max-w-md flex-col px-4 py-4">
      {/* Top admin nav */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-white/60 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Link
          to="/admin"
          className="text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
        >
          Back to admin
        </Link>
      </div>

      <h1 className="mt-4 text-center font-display text-2xl uppercase tracking-widest text-[var(--gold)]">
        Profile
      </h1>
      <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-[var(--gold)]/60">
        Admin view
      </div>

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
              {(detail.display_name ?? detail.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          {avatarUrl && (
            <button
              type="button"
              onClick={() => void clearAvatar()}
              className="absolute -right-1 -top-1 rounded-full bg-black/80 p-1 text-white/70 hover:text-white"
              aria-label="Remove avatar"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="text-xs text-white/50">{detail.email ?? "(no email)"}</div>

        <label className="btn-3d btn-3d-gold inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
          <Upload className="h-3 w-3" />
          {uploadingAvatar ? "Uploading…" : "Upload avatar"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={uploadingAvatar}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadAvatar(f);
            }}
          />
        </label>
      </div>

      {/* Display name (admin editable) */}
      <div className="mt-6 flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={nameInput}
            maxLength={14}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Display name"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2 font-display text-white/90 focus:border-[var(--gold)]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void saveName()}
            disabled={
              savingName ||
              !nameInput.trim() ||
              nameInput.trim() === detail.display_name
            }
            className="btn-3d btn-3d-gold inline-flex items-center gap-1.5 text-[11px] disabled:opacity-50"
          >
            {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
        </div>
        <div className="text-[10px] text-white/40">
          Up to 14 characters. Must be unique.
        </div>
      </div>

      {/* Account badges */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
        {detail.founding_member && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
            <Crown className="h-3 w-3" /> Founder
          </span>
        )}
        {detail.roles.map((r) => (
          <Badge key={r} variant={r === "admin" ? "default" : "outline"}>
            {r}
          </Badge>
        ))}
        {detail.active_plan && (
          <Badge variant="secondary">B+ {detail.active_plan}</Badge>
        )}
      </div>
      <div className="mt-1 text-center text-[9px] font-mono text-white/30">{detail.id}</div>
      <div className="text-center text-[9px] uppercase tracking-widest text-white/30">
        Joined {new Date(detail.created_at).toLocaleDateString()}
      </div>

      {/* Tabs (mirror user profile) */}
      <Tabs defaultValue="cards" className="mt-8 w-full">
        <TabsList className="grid w-full grid-cols-5 bg-black/30">
          <TabsTrigger value="cards" className="text-[9px] uppercase tracking-wider">Cards</TabsTrigger>
          <TabsTrigger value="friends" className="text-[9px] uppercase tracking-wider">Friends</TabsTrigger>
          <TabsTrigger value="titles" className="text-[9px] uppercase tracking-wider">Titles</TabsTrigger>
          <TabsTrigger value="keys" className="text-[9px] uppercase tracking-wider">Controls</TabsTrigger>
          <TabsTrigger value="stats" className="text-[9px] uppercase tracking-wider">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-white/50">
                Custom card back
              </div>
              {cardBackLocked && (
                <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
                  <Lock className="h-3 w-3" /> Locked
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`relative overflow-hidden rounded-lg border bg-black/40 ${
                  cardBackLocked ? "border-[var(--gold)]/50" : "border-white/15"
                }`}
                style={{ width: 60, height: 84 }}
              >
                {detail.active_card_back_url ? (
                  <img
                    src={detail.active_card_back_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-white/30">
                    default
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="btn-3d btn-3d-gold inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
                  <Upload className="h-3 w-3" />
                  {uploadingBack ? "Uploading…" : "Upload (5:7)"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploadingBack}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void uploadBack(f);
                    }}
                  />
                </label>
                {detail.active_card_back_url && (
                  <button
                    type="button"
                    onClick={() => void clearBack()}
                    className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white/70"
                  >
                    Clear card back
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 rounded-md border border-dashed border-white/10 bg-black/20 px-3 py-2 text-[10px] text-white/40">
              Active card-slot equips are stored on the user's device and aren't
              visible to admins.
            </div>
          </section>
        </TabsContent>

        <TabsContent value="friends" className="mt-4">
          <UserOnly label="Friends" />
        </TabsContent>

        <TabsContent value="titles" className="mt-4">
          <ComingSoon label="Titles & Badges" />
        </TabsContent>

        <TabsContent value="keys" className="mt-4">
          <UserOnly label="Keyboard controls" />
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
