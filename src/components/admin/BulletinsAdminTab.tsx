import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Image as ImageIcon, Code, Trash2, Pencil, Plus } from "lucide-react";
import {
  adminListBulletins,
  adminCreateBulletin,
  adminUpdateBulletin,
  adminDeleteBulletin,
  adminUploadBulletinMedia,
} from "@/lib/rpc/bulletins.functions";

const FONTS = [
  "Inter, sans-serif",
  "Georgia, serif",
  "'Courier New', monospace",
  "Impact, sans-serif",
  "'Comic Sans MS', cursive",
  "'Times New Roman', serif",
];
const SIZES = ["1", "2", "3", "4", "5", "6", "7"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type Row = {
  id: string;
  title: string;
  content_html: string;
  media_url: string | null;
  created_at: string;
};

export function BulletinsAdminTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await adminListBulletins();
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
        <h2 className="text-lg font-semibold">Bulletins</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowEditor(true);
          }}
        >
          <Plus className="h-4 w-4" /> New bulletin
        </Button>
      </div>

      {showEditor && (
        <BulletinEditor
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
          <div className="p-6 text-sm text-muted-foreground">No bulletins yet.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
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
                      if (!confirm(`Delete "${r.title}"? This removes it for all users.`)) return;
                      await adminDeleteBulletin({ data: { id: r.id } });
                      toast.success("Bulletin deleted");
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

function BulletinEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [mediaUrl, setMediaUrl] = useState<string | null>(initial?.media_url ?? null);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlText, setHtmlText] = useState(initial?.content_html ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inlineImgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current && !showHtml) {
      editorRef.current.innerHTML = htmlText;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHtml]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    if (editorRef.current) setHtmlText(editorRef.current.innerHTML);
  };

  const onInput = () => {
    if (editorRef.current) setHtmlText(editorRef.current.innerHTML);
  };

  const handleUpload = async (file: File, asInline: boolean) => {
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const b64 = await fileToBase64(file);
      const r = await adminUploadBulletinMedia({
        data: { filename: safe, content_base64: b64, content_type: file.type || "application/octet-stream" },
      });
      if (asInline) {
        exec("insertImage", r.url);
      } else {
        setMediaUrl(r.url);
      }
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const finalHtml = showHtml ? htmlText : (editorRef.current?.innerHTML ?? "");
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    if (!finalHtml.trim()) {
      toast.error("Message required");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), content_html: finalHtml, media_url: mediaUrl };
      if (initial) {
        await adminUpdateBulletin({ data: { ...payload, id: initial.id } });
        toast.success("Bulletin updated");
      } else {
        await adminCreateBulletin({ data: payload });
        toast.success("Bulletin posted");
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
      <Input
        placeholder="Subject / title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded border bg-muted/30 p-1">
        <ToolBtn onClick={() => exec("bold")} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic"><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline"><Underline className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn
          onClick={() => {
            const url = prompt("Link URL");
            if (url) exec("createLink", url);
          }}
          title="Link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <select
          className="h-7 rounded border bg-background px-1 text-xs"
          onChange={(e) => {
            if (e.target.value) exec("fontName", e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
        >
          <option value="" disabled>Font</option>
          {FONTS.map((f) => <option key={f} value={f}>{f.split(",")[0].replace(/['"]/g, "")}</option>)}
        </select>
        <select
          className="h-7 rounded border bg-background px-1 text-xs"
          onChange={(e) => {
            if (e.target.value) exec("fontSize", e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <span>A</span>
          <input
            type="color"
            className="h-6 w-6 cursor-pointer rounded border bg-background"
            onChange={(e) => exec("foreColor", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span>BG</span>
          <input
            type="color"
            className="h-6 w-6 cursor-pointer rounded border bg-background"
            onChange={(e) => exec("hiliteColor", e.target.value)}
          />
        </label>
        <ToolBtn
          onClick={() => inlineImgRef.current?.click()}
          title="Insert inline image"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <input
          ref={inlineImgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f, true);
            e.target.value = "";
          }}
        />
        <ToolBtn
          onClick={() => {
            if (!showHtml && editorRef.current) setHtmlText(editorRef.current.innerHTML);
            setShowHtml((s) => !s);
          }}
          title="Toggle HTML source"
          active={showHtml}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Editor / HTML source */}
      {showHtml ? (
        <textarea
          value={htmlText}
          onChange={(e) => setHtmlText(e.target.value)}
          className="min-h-[240px] w-full rounded border bg-background p-2 font-mono text-xs"
          placeholder="<p>Raw HTML…</p>"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          onInput={onInput}
          className="bulletin-content min-h-[240px] w-full rounded border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          suppressContentEditableWarning
          style={{ wordBreak: "break-word" }}
        />
      )}

      {/* Header media */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : mediaUrl ? "Change header media" : "Attach header media"}
        </Button>
        {mediaUrl && (
          <>
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="truncate text-xs underline">
              {mediaUrl.split("/").pop()}
            </a>
            <Button size="sm" variant="ghost" onClick={() => setMediaUrl(null)}>Remove</Button>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f, false);
            e.target.value = "";
          }}
        />
      </div>
      {mediaUrl && (
        <img src={mediaUrl} alt="" className="max-h-48 rounded border object-contain" />
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Post bulletin"}
        </Button>
      </div>
    </Card>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded transition ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
