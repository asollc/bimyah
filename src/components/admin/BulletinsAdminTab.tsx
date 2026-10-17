import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Image as ImageIcon, Code, Trash2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const FONTS = [
  "Inter, sans-serif",
  "Georgia, serif",
  "'Courier New', monospace",
  "Impact, sans-serif",
  "'Comic Sans MS', cursive",
  "'Times New Roman', serif",
];
const SIZES = ["1", "2", "3", "4", "5", "6", "7"];


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
      // Client-side; RLS "Admins can view all" policy allows admin reads.
      const { data, error } = await supabase
        .from("bulletins")
        .select("id, title, content_html, media_url, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      setRows((data ?? []) as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bulletins");
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
                      try {
                        // Client-side; RLS admin policies allow these deletes.
                        await supabase.from("bulletin_reads").delete().eq("bulletin_id", r.id);
                        await supabase.from("bulletin_hides").delete().eq("bulletin_id", r.id);
                        const { error } = await supabase.from("bulletins").delete().eq("id", r.id);
                        if (error) throw new Error(error.message);
                        toast.success("Bulletin deleted");
                        void refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Delete failed");
                      }
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
      if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");
      // Client-side upload; storage RLS "Admins upload bulletin media" allows admin writes.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("bulletin-media")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("bulletin-media").getPublicUrl(path);
      const url = pub.publicUrl;
      if (asInline) {
        exec("insertImage", url);
      } else {
        setMediaUrl(url);
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
      // Client-side; RLS admin policies allow these writes.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      if (initial) {
        const { error } = await supabase
          .from("bulletins")
          .update({
            title: payload.title,
            content_html: payload.content_html,
            media_url: payload.media_url ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", initial.id);
        if (error) throw new Error(error.message);
        toast.success("Bulletin updated");
      } else {
        const { error } = await supabase.from("bulletins").insert({
          title: payload.title,
          content_html: payload.content_html,
          media_url: payload.media_url ?? null,
          author_id: user.id,
        });
        if (error) throw new Error(error.message);
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
