import { useEffect, useState, useCallback } from "react";
import {

  listFriends,
  listPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  heartbeatPresence,
  type FriendshipRow,
} from "@/lib/server/friends.functions";
import { Check, X, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      aria-label={online ? "online" : "offline"}
      title={online ? "Online" : "Offline"}
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: online ? "#22c55e" : "#555",
        boxShadow: online ? "0 0 6px #22c55e" : "none",
      }}
    />
  );
}

function Avatar({ row }: { row: FriendshipRow }) {
  if (row.user.avatar_url) {
    return (
      <img
        src={row.user.avatar_url}
        alt=""
        className="h-7 w-7 rounded-full border border-white/10 object-cover"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--mint)]/20 text-xs font-display text-[var(--mint)]">
      {row.user.display_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function FriendRowItem({
  row,
  actions,
}: {
  row: FriendshipRow;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <OnlineDot online={row.user.online} />
        <Avatar row={row} />
        <span className="truncate text-sm text-white/90">{row.user.display_name}</span>
      </div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  );
}

export function FriendsPanel() {
  const [page, setPage] = useState(1);
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [incoming, setIncoming] = useState<FriendshipRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async (p = page) => {
    try {
      const [f, pend] = await Promise.all([
        listFriends({ data: { page: p } }),
        listPendingRequests(),
      ]);
      setFriends(f.friends);
      setTotal(f.total);
      setIncoming(pend.incoming);
      setOutgoing(pend.outgoing);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    void refresh(page);
  }, [page, refresh]);

  // Presence heartbeat
  useEffect(() => {
    void heartbeatPresence();
    const id = setInterval(() => {
      void heartbeatPresence();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Periodic refresh for live online indicators
  useEffect(() => {
    const id = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await sendFriendRequest({ data: { displayName: search.trim() } });
      setMsg("Friend request sent.");
      setSearch("");
      await refresh(page);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(id: string) {
    setErr(null);
    try {
      await acceptFriendRequest({ data: { friendshipId: id } });
      await refresh(page);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onRemove(id: string) {
    setErr(null);
    try {
      await removeFriendship({ data: { friendshipId: id } });
      await refresh(page);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      {/* Search / add */}
      <form onSubmit={onSend} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username…"
          className="flex-1 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--gold)]/60 focus:outline-none"
          maxLength={32}
        />
        <button
          type="submit"
          disabled={busy || !search.trim()}
          className="btn-3d btn-3d-gold inline-flex items-center gap-1.5 text-[11px] disabled:opacity-50"
        >
          <UserPlus className="h-3 w-3" />
          Add
        </button>
      </form>
      {msg && <div className="text-[11px] text-[var(--mint)]">{msg}</div>}
      {err && <div className="text-[11px] text-[var(--player-red)]">{err}</div>}

      {/* Friends list */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Friends {total > 0 && <span className="text-white/30">({total})</span>}
          </div>
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

        {friends.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/40">
            No friends yet. Search for a username above.
          </div>
        ) : (
          friends.map((row) => (
            <FriendRowItem
              key={row.id}
              row={row}
              actions={
                <button
                  onClick={() => onRemove(row.id)}
                  className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                  title="Remove friend"
                >
                  <X className="h-3 w-3" />
                </button>
              }
            />
          ))
        )}
      </div>

      {/* Pending */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-widest text-white/50">
          Pending requests
        </div>

        {incoming.length === 0 && outgoing.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-white/40">
            No pending requests.
          </div>
        ) : (
          <>
            {incoming.map((row) => (
              <FriendRowItem
                key={row.id}
                row={row}
                actions={
                  <>
                    <span className="text-[9px] uppercase tracking-widest text-white/40">
                      Received
                    </span>
                    <button
                      onClick={() => onAccept(row.id)}
                      className="rounded bg-[var(--mint)]/20 p-1 text-[var(--mint)] hover:bg-[var(--mint)]/30"
                      title="Accept"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onRemove(row.id)}
                      className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                      title="Reject"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                }
              />
            ))}
            {outgoing.map((row) => (
              <FriendRowItem
                key={row.id}
                row={row}
                actions={
                  <>
                    <span className="text-[9px] uppercase tracking-widest text-white/40">
                      Sent
                    </span>
                    <button
                      onClick={() => onRemove(row.id)}
                      className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                }
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
