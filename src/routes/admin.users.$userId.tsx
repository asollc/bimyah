import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Upload, X, Crown, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  getMyAdminStatus,
  getAdminUserDetail,
  adminSetAvatar,
  adminSetDisplayName,
  adminSetCardBack,
  adminClearCardBack,
  adminUploadAsset,
} from "@/server/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/users/$userId")({
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

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Edit user</h1>

      {loading && !detail && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {detail && (
        <div className="mt-6 space-y-6">
          <Card className="p-4">
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{detail.display_name}</span>
                {detail.founding_member && <Crown className="h-4 w-4 text-amber-500" />}
                {detail.roles.map((r) => (
                  <Badge key={r} variant={r === "admin" ? "default" : "outline"}>{r}</Badge>
                ))}
                {detail.active_plan && <Badge variant="secondary">B+ {detail.active_plan}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{detail.email ?? "(no email)"}</div>
              <div className="text-xs text-muted-foreground font-mono">{detail.id}</div>
              <div className="text-xs text-muted-foreground">
                Joined {new Date(detail.created_at).toLocaleDateString()}
              </div>
            </div>
          </Card>

          {/* Avatar */}
          <Card className="p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Avatar</div>
            <div className="flex items-center gap-4">
              <div className="relative">
                {detail.avatar_url ? (
                  <img
                    src={detail.avatar_url}
                    alt=""
                    className="h-20 w-20 rounded-full border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-2xl font-semibold">
                    {(detail.display_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                {detail.avatar_url && (
                  <button
                    type="button"
                    onClick={() => void clearAvatar()}
                    className="absolute -right-1 -top-1 rounded-full bg-background border p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Remove avatar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={uploadingAvatar}>
                  <span>
                    {uploadingAvatar ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-3 w-3 mr-1" />
                    )}
                    Upload avatar
                  </span>
                </Button>
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
          </Card>

          {/* Display name */}
          <Card className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Display name</div>
            <div className="flex gap-2">
              <Input
                value={nameInput}
                maxLength={14}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name"
              />
              <Button
                onClick={() => void saveName()}
                disabled={
                  savingName ||
                  !nameInput.trim() ||
                  nameInput.trim() === detail.display_name
                }
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Up to 14 characters. Must be unique.</div>
          </Card>

          {/* Card back */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Custom card back
              </div>
              {detail.active_card_back_url && (
                <button
                  type="button"
                  onClick={() => void clearBack()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div
                className="overflow-hidden rounded-md border bg-muted"
                style={{ width: 60, height: 84 }}
              >
                {detail.active_card_back_url ? (
                  <img
                    src={detail.active_card_back_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-muted-foreground">
                    default
                  </div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <Button asChild size="sm" variant="outline" disabled={uploadingBack}>
                  <span>
                    {uploadingBack ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-3 w-3 mr-1" />
                    )}
                    Upload (5:7 image)
                  </span>
                </Button>
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
            </div>
          </Card>

          {msg && <div className="text-sm text-emerald-500">{msg}</div>}
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
      )}
    </div>
  );
}
