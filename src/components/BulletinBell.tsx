import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Trash2, CheckCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  listMyBulletins,
  markBulletinRead,
  markAllBulletinsRead,
  hideBulletin,
  hideBulletins,
} from "@/server/bulletins.functions";

type Bulletin = {
  id: string;
  title: string;
  content_html: string;
  media_url: string | null;
  created_at: string;
  read: boolean;
};

export function BulletinBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Bulletin[]>([]);
  const [unread, setUnread] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setUnread(0);
      return;
    }
    try {
      const r = await listMyBulletins();
      setRows(r.rows as Bulletin[]);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [userId, refresh]);

  const handleOpenItem = async (b: Bulletin) => {
    if (selecting) {
      const next = new Set(selected);
      if (next.has(b.id)) next.delete(b.id);
      else next.add(b.id);
      setSelected(next);
      return;
    }
    setExpanded((cur) => (cur === b.id ? null : b.id));
    if (!b.read) {
      setRows((rs) => rs.map((r) => (r.id === b.id ? { ...r, read: true } : r)));
      setUnread((n) => Math.max(0, n - 1));
      try {
        await markBulletinRead({ data: { id: b.id } });
      } catch {
        /* ignore */
      }
    }
  };

  const handleMarkAll = async () => {
    setRows((rs) => rs.map((r) => ({ ...r, read: true })));
    setUnread(0);
    try {
      await markAllBulletinsRead();
      toast.success("All marked as read");
    } catch {
      toast.error("Couldn't mark all as read");
    }
  };

  const handleDelete = async (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    try {
      await hideBulletin({ data: { id } });
    } catch {
      void refresh();
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    setRows((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setSelecting(false);
    try {
      await hideBulletins({ data: { ids } });
      toast.success(`Deleted ${ids.length} message${ids.length === 1 ? "" : "s"}`);
    } catch {
      void refresh();
    }
  };

  const badge = useMemo(() => (unread > 99 ? "99+" : String(unread)), [unread]);

  return (
    <>
      <button
        type="button"
        aria-label="Bulletin"
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-[var(--mint)] ring-1 ring-[var(--mint)]/40 transition hover:scale-105"
        style={{ filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.4))" }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%)",
          }}
        />
        <Bell
          className="h-4 w-4 relative"
          style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.6))" }}
        />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-black/60">
            {badge}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg border-[var(--mint)]/30 bg-black/95 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-[var(--mint)]">
              Bulletin {unread > 0 && <span className="text-xs text-white/60">({unread} unread)</span>}
            </DialogTitle>
          </DialogHeader>

          {!userId ? (
            <p className="py-6 text-center text-sm text-white/60">Sign in to see bulletins.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-[var(--mint)]/40 bg-transparent text-[var(--mint)] hover:bg-[var(--mint)]/10 hover:text-[var(--mint)]"
                  onClick={handleMarkAll}
                  disabled={!unread}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                  onClick={() => {
                    setSelecting((s) => !s);
                    setSelected(new Set());
                  }}
                  disabled={!rows.length}
                >
                  {selecting ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {selecting ? "Cancel" : "Select"}
                </Button>
                {selecting && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={!selected.size}
                  >
                    Delete ({selected.size})
                  </Button>
                )}
              </div>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {rows.length === 0 && (
                  <p className="py-6 text-center text-sm text-white/60">No bulletins yet.</p>
                )}
                {rows.map((b) => {
                  const isOpen = expanded === b.id;
                  const isSel = selected.has(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`group rounded-lg border px-3 py-2 transition ${
                        b.read ? "border-white/10 bg-white/5" : "border-[var(--mint)]/40 bg-[var(--mint)]/5"
                      } ${isSel ? "ring-2 ring-[var(--mint)]" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {selecting && (
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => void handleOpenItem(b)}
                            className="mt-1 h-4 w-4 accent-[var(--mint)]"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => void handleOpenItem(b)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {!b.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--mint)]" />
                            )}
                            <span className={`truncate text-sm ${b.read ? "text-white/80" : "font-semibold text-white"}`}>
                              {b.title}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-white/40">
                            {new Date(b.created_at).toLocaleString()}
                          </div>
                        </button>
                        {!selecting && (
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(b.id);
                            }}
                            className="rounded p-1 text-white/40 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isOpen && !selecting && (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          {b.media_url && (
                            <img
                              src={b.media_url}
                              alt=""
                              className="mb-3 max-h-64 w-full rounded object-contain"
                            />
                          )}
                          <div
                            className="bulletin-content text-sm text-white/90"
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: b.content_html }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
