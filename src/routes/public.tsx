import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPublicMatches } from "@/server/publicMatches.functions";
import { useAuth } from "@/auth/AuthProvider";
import { PowLogo } from "@/components/game/Visuals";
import { Users, RefreshCw, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/public")({
  head: () => ({
    meta: [
      { title: "Public Matches — Bimyah!" },
      { name: "description", content: "Browse open Bimyah! lobbies and jump into a public match." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicMatchesPage,
});

type Listing = {
  game_id: string;
  host_name: string;
  mode: string;
  max_seats: number;
  seats_taken: number;
  status: string;
};

function PublicMatchesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fetchList = useServerFn(listPublicMatches);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/auth", search: { redirect: "/public" } as never });
      return;
    }
  }, [authLoading, user, navigate]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchList();
      setRows(r.rows);
    } catch {
      setErr("Could not load matches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[calc(100dvh-50px)] items-center justify-center text-white/60">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center px-4 py-4">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 font-display text-[10px] font-black uppercase tracking-widest text-[var(--mint)] ring-1 ring-[var(--mint)]/40"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 font-display text-[10px] font-black uppercase tracking-widest text-white/80 ring-1 ring-white/20"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="mt-3">
        <PowLogo size={140} />
      </div>
      <div className="mt-2 font-display text-base font-black uppercase tracking-widest text-[var(--mint)]">
        Public Matches
      </div>
      <div className="mt-4 flex w-full max-w-md flex-col gap-2">
        {err && (
          <div className="text-center text-xs text-[var(--player-red)]">{err}</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6 text-center text-sm text-white/60">
            No public matches right now. Create one or check back soon.
          </div>
        )}
        {rows.map((r) => {
          const full = r.seats_taken >= r.max_seats;
          return (
            <button
              key={r.game_id}
              disabled={full}
              onClick={() => void navigate({ to: "/join/$gameId", params: { gameId: r.game_id } })}
              className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--mint)]/30 bg-black/50 px-4 py-3 text-left transition hover:bg-[var(--mint)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-sm font-black uppercase tracking-wider text-white">
                  {r.host_name}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/60">
                  {r.mode} · Room {r.game_id}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-md bg-[var(--mint)]/15 px-2 py-1 font-mono text-xs text-[var(--mint)] ring-1 ring-[var(--mint)]/30">
                <Users className="h-3 w-3" />
                {r.seats_taken}/{r.max_seats}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
