import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, LogOut } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile — BIMYAH!" }],
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

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name);
  }, [profile]);

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

  if (loading || !user) return null;

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

      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--mint)]/20 font-display text-3xl text-[var(--mint)]">
          {(profile?.display_name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="text-xs text-white/50">{user.email}</div>
        <div className="text-[10px] uppercase tracking-widest text-white/30">
          Custom avatars unlock with Bimyah!+
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">Display name</label>
        <input
          value={displayName}
          maxLength={14}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white"
        />
        {msg && <div className="text-xs text-[var(--mint)]">{msg}</div>}
        {err && <div className="text-xs text-[var(--player-red)]">{err}</div>}
        <button
          onClick={save}
          disabled={saving}
          className="btn-3d btn-3d-mint mt-2 w-full text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
