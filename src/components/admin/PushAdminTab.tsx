import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { uploadPushImageFile } from "@/components/admin/pushImage";
import {
  adminListPushSubscribers,
  adminListPushTemplates,
  adminSavePushTemplate,
  adminSendPush,
  type PushTemplate,
} from "@/lib/rpc/push.functions";
import { MemberPicker, type MemberOption } from "@/components/admin/MemberPicker";

/* Push section mirroring Creator Shout's admin Push panel:
   - Compose tab: To (subscriber picker, blank = every subscribed device),
     Subject, Message, Link, optional big image, live preview, two-tap send.
   - Alerts tab: editable copy for the automatic pushes the site sends on
     its own (push_templates). Clearing both text fields restores the
     built-in wording. */

function alertGroup(key: string): string {
  if (key.startsWith("admin.")) return "Admin alerts";
  if (key.startsWith("system.")) return "System alerts";
  return "Member alerts";
}

export function PushAdminTab() {
  const listSubs = useServerFn(adminListPushSubscribers);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const j = await listSubs();
        setDeviceCount(j.count);
      } catch {
        /* header count just stays blank */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Push notifications</h2>
        <span className="text-sm text-muted-foreground">
          {deviceCount === null
            ? ""
            : `${deviceCount} device${deviceCount === 1 ? "" : "s"} subscribed`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Broadcast to every device with notifications enabled.
      </p>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4">
          <ComposeTab />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <AlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComposeTab() {
  const listSubs = useServerFn(adminListPushSubscribers);
  const sendPushFn = useServerFn(adminSendPush);
  const [subscribers, setSubscribers] = useState<MemberOption[]>([]);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageHint, setImageHint] = useState(
    "Shown large on the right of the notification. The Bimyah! logo on the left stays.",
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [confirmUntil, setConfirmUntil] = useState(0);
  const [confirmLabel, setConfirmLabel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const j = await listSubs();
        setSubscribers(j.subscribers as MemberOption[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load subscribers");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetLabel = recipientIds.length
    ? recipientIds.length === 1
      ? "1 person"
      : `${recipientIds.length} people`
    : "all devices";

  const onImagePick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setImageHint("Uploading…");
    try {
      const publicUrl = await uploadPushImageFile(file);
      setImageUrl(publicUrl);
      setImageHint("Image attached. It shows on the right side of the notification.");
    } catch (e) {
      setImageHint(
        "Shown large on the right of the notification. The Bimyah! logo on the left stays.",
      );
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    setError("");
    if (!message.trim()) {
      setError("Type a message first.");
      return;
    }
    // Two-tap confirm: pushes reach real phones.
    if (Date.now() > confirmUntil) {
      setConfirmUntil(Date.now() + 6000);
      setConfirmLabel(`Tap again to send to ${targetLabel}`);
      setTimeout(() => setConfirmLabel(null), 6000);
      return;
    }
    setConfirmUntil(0);
    setConfirmLabel(null);
    setSending(true);
    try {
      const j = await sendPushFn({
        data: {
          title: subject.trim() || "Bimyah!",
          body: message.trim(),
          url: url.trim() || undefined,
          image: imageUrl || undefined,
          user_ids: recipientIds.length ? recipientIds : undefined,
        },
      });
      toast.success(`Push sent to ${j.sent} of ${j.total} devices`);
      setSubject("");
      setMessage("");
      setUrl("");
      setRecipientIds([]);
      setImageUrl("");
      setImageHint(
        "Shown large on the right of the notification. The Bimyah! logo on the left stays.",
      );
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">To</label>
        <MemberPicker
          members={subscribers}
          selected={recipientIds}
          onChange={setRecipientIds}
          placeholder="Everyone, or type a name…"
          emptyHint="Nobody by that name has notifications enabled."
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Subject (bold, on top)</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Big news from Bimyah!"
          maxLength={120}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message…"
          maxLength={240}
          rows={3}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Link (opens when tapped)</label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          maxLength={500}
          inputMode="url"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Tapping the notification opens this link. Leave blank to open the home page.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Big image (right side, optional)</label>
        <Input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => void onImagePick(e.target.files?.[0])}
        />
        <p className="mt-1 text-xs text-muted-foreground">{imageHint}</p>
      </div>

      {/* Notification preview */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          Preview
        </div>
        <div className="flex items-start gap-3 rounded-lg bg-background p-3 shadow-sm">
          <img src="/favicon-512.png" alt="" className="h-9 w-9 rounded" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{subject.trim() || "Bimyah!"}</div>
            <div className="text-sm text-muted-foreground">
              {message.trim() || "Your message appears here."}
            </div>
          </div>
          {imageUrl && (
            <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This is how it looks on a phone. The Bimyah! logo shows automatically on every push.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={() => void handleSend()} disabled={sending || uploading} className="w-full">
        <BellRing className="h-4 w-4" />
        {sending ? "Sending…" : (confirmLabel ?? "Send push notification")}
      </Button>
    </Card>
  );
}

function AlertsTab() {
  const listTemplates = useServerFn(adminListPushTemplates);
  const [templates, setTemplates] = useState<PushTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const j = await listTemplates();
        setTemplates(j.templates);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load alert templates");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Automatic alerts the site sends on its own. Edit the text, attach a big image, then
        save. Clearing both the title and the message restores the built-in wording.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((t) => (
          <AlertCard
            key={t.key}
            template={t}
            onSaved={(saved) =>
              setTemplates((prev) => prev.map((x) => (x.key === saved.key ? saved : x)))
            }
          />
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  template,
  onSaved,
}: {
  template: PushTemplate;
  onSaved: (saved: PushTemplate) => void;
}) {
  const saveFn = useServerFn(adminSavePushTemplate);
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [imageUrl, setImageUrl] = useState(template.image_url ?? "");
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the form in step if the saved row changes under us.
  useEffect(() => {
    setTitle(template.title);
    setBody(template.body);
    setImageUrl(template.image_url ?? "");
  }, [template]);

  const onImagePick = async (file: File | undefined) => {
    if (!file) return;
    setStatusIsError(false);
    setStatus("Uploading image…");
    try {
      const publicUrl = await uploadPushImageFile(file);
      setImageUrl(publicUrl);
      setStatus("Image attached. Save to keep it.");
    } catch (e) {
      setStatusIsError(true);
      setStatus(e instanceof Error ? e.message : "Upload failed.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusIsError(false);
    setStatus("");
    try {
      const j = await saveFn({
        data: {
          key: template.key,
          title: title.trim(),
          body: body.trim(),
          image_url: imageUrl || null,
        },
      });
      onSaved(j.saved);
      setStatus(
        !title.trim() && !body.trim()
          ? "Saved. Built-in wording restored."
          : "Saved.",
      );
    } catch (e) {
      setStatusIsError(true);
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{template.name}</h3>
          <div className="text-xs text-muted-foreground">{template.key}</div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {alertGroup(template.key)}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Title (bold, on top)</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={240}
          rows={2}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Big image (optional)</label>
        <div className="flex items-center gap-2">
          {imageUrl && (
            <img src={imageUrl} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
          )}
          <Input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="min-w-0 flex-1"
            onChange={(e) => {
              void onImagePick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {imageUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setImageUrl("");
                setStatus("Image removed. Save to keep it.");
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        You can use: {template.variables || "no variables"}. Clearing both fields restores
        the built-in wording.
      </p>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {status && (
          <span className={`text-xs ${statusIsError ? "text-destructive" : "text-muted-foreground"}`}>
            {status}
          </span>
        )}
      </div>
    </Card>
  );
}
