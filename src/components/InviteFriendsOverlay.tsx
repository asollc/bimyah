import { useEffect, useState, useCallback } from "react";
import {
  listFriends,
  heartbeatPresence,
  type FriendshipRow,
} from "@/server/friends.functions";
import { inviteFriendsToGame } from "@/server/invites.functions";
import { X, Send, ChevronLeft, ChevronRight, Check } from "lucide-react";

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      aria-label={online ? "online" : "offline"}
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: online ? "#22c55e" : "#555",
        boxShadow: online ? "0 0 6px #22c55e" : "none",
      }}
    />
  );
}

export function InviteFriendsOverlay({
  open,
  onClose,
  gameCode,
  joinUrl,
}: {
  open: boolean;
  onClose: () => void;
  gameCode: string;
  joinUrl: string;
}) {
  const [page, setPage] = useState(1);
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(
    async (p = page) => {
      try {
        const f = await listFriends({ data: { page: p } });
        setFriends(f.friends);
        setTotal(f.total);
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [page],
  );

  useEffect(() => {
    if (!open) return;
    void heartbeatPresence();
    void refresh(page);
  }, [open, page, refresh]);

  if (!open) return null;

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected =
    friends.length > 0 && friends.every((f) => selected.has(f.user.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        friends.forEach((f) => next.delete(f.user.id));
      } else {
        friends.forEach((f) => next.add(f.user.id));
      }
      return next;
    });
  }

  async function onSend() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await inviteFriendsToGame({
        data: {
          friendUserIds: Array.from(selected),
          gameCode,
          joinUrl,
        },
      });
      const parts: string[] = [];
      if (res.sent > 0) parts.push(`${res.sent} invite${res.sent === 1 ? "" : "s"} sent`);
      if (res.failed.length > 0) parts.push(`${res.failed.length} could not be reached`);
      setMsg(parts.join(" · "));
      setSelected(new Set());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(92vw,420px)] max-h-[85vh] flex flex-col rounded-xl border border-[var(--mint)]/30 bg-[oklch(0.16_0.04_165)] p-4 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-display text-sm uppercase tracking-widest text-[var(--mint)]">
            Invite Friends
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-white/10 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAll}
              className="h-3.5 w-3.5 accent-[var(--mint)]"
            />
            Select all
          </label>
          {pageCount > 1 && (
            <div className="flex items-center gap-2 text-[10px] text-white/50">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-0.5 disabled:opacity-30 hover:bg-white/10"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
                className="rounded p-0.5 disabled:opacity-30 hover:bg-white/10"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {friends.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-white/40">
              No friends yet. Add friends from your profile.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {friends.map((row) => {
                const checked = selected.has(row.user.id);
                return (
                  <li key={row.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 hover:bg-black/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(row.user.id)}
                        className="h-4 w-4 accent-[var(--mint)]"
                      />
                      <OnlineDot online={row.user.online} />
                      <span className="flex-1 truncate text-sm text-white/90">
                        {row.user.display_name}
                      </span>
                      {checked && <Check className="h-3 w-3 text-[var(--mint)]" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {msg && <div className="pb-1 text-[11px] text-[var(--mint)]">{msg}</div>}
        {err && <div className="pb-1 text-[11px] text-[var(--player-red)]">{err}</div>}

        <button
          onClick={onSend}
          disabled={busy || selected.size === 0}
          className="btn-3d btn-3d-mint mt-2 inline-flex w-full items-center justify-center gap-2 text-xs disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
          {busy
            ? "Sending…"
            : selected.size > 0
              ? `Send invite${selected.size === 1 ? "" : "s"} (${selected.size})`
              : "Send invites"}
        </button>
      </div>
    </div>
  );
}
