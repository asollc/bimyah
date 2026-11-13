import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listHowToVideos,
  adminCreateHowToVideo,
  adminUpdateHowToVideo,
  adminDeleteHowToVideo,
} from "@/lib/rpc/howToVideos.functions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  sort_order: number;
  created_at: string;
};

export function VideosAdminTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listHowToVideos();
      setRows(r.rows as Row[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">How-to Videos</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowEditor(true);
          }}
        >
          <Plus className="h-4 w-4" /> New video
        </Button>
      </div>

      {showEditor && (
        <VideoEditor
          initial={editing}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            void refresh();
          }}
        />
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No videos yet.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <a
                    href={r.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-muted-foreground underline"
                  >
                    {r.youtube_url}
                  </a>
                  {r.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {r.description}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(r);
                      setShowEditor(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm(`Delete "${r.title}"?`)) return;
                      await adminDeleteHowToVideo({ data: { id: r.id } });
                      toast.success("Video deleted");
                      void refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function VideoEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.youtube_url ?? "");
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (!url.trim()) return toast.error("YouTube URL required");
    try {
      new URL(url.trim());
    } catch {
      return toast.error("Invalid URL");
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        youtube_url: url.trim(),
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      };
      if (initial) {
        await adminUpdateHowToVideo({ data: { ...payload, id: initial.id } });
        toast.success("Video updated");
      } else {
        await adminCreateHowToVideo({ data: payload });
        toast.success("Video posted");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="How to play standard mode"
          maxLength={200}
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Description (optional)
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short summary shown under the video title"
          maxLength={2000}
          rows={3}
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          YouTube URL
        </label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground">
          Sort order (lower shows first)
        </label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Post video"}
        </Button>
      </div>
    </Card>
  );
}
