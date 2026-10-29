import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, CheckCheck, X, BellRing, BellOff, Plus, Megaphone, ImagePlus } from "lucide-react";
import iconBell from "@/assets/icons3d/bell-gold.webp";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { MemberPicker, type MemberOption } from "@/components/admin/MemberPicker";
import { uploadPushImageFile } from "@/components/admin/pushImage";
import { Push, getPushStatus, isIOSDevice, isIOSInstalledApp, isRunningStandalone, type PushStatus } from "@/lib/push";
import { PushGuideDialog, type GuideReason } from "@/components/PushGuides";
import {
  adminListMembers,
  adminListPushSubscribers,
  adminSendBulletinPush,
  adminSendPush,
  deletePushSubscription,
  sendTestPush,
  syncPushSubscription,
} from "@/lib/rpc/push.functions";

/* Plain text from the bell's quick composer becomes simple, safe HTML:
   escaped, blank lines split paragraphs, single newlines become breaks. */
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Bulletin = {
  id: string;
  title: string;
  content_html: string;
  media_url: string | null;
  created_at: string;
  recipient_user_ids: string[] | null;
  read: boolean;
};

export function BulletinBell({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Bulletin[]>([]);
  const [unread, setUnread] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushPerm, setPushPerm] = useState<NotificationPermission>("default");
  const [pushBusy, setPushBusy] = useState(false);
  const [guide, setGuide] = useState<GuideReason | null>(null);
  const syncSubFn = useServerFn(syncPushSubscription);
  const deleteSubFn = useServerFn(deletePushSubscription);
  const testPushFn = useServerFn(sendTestPush);
  const syncingRef = useRef(false);
  const syncedRef = useRef<string | null>(null);

  /* Creator Shout mirror: saving this device's subscription is all
     that happens here. The browser hands over its subscription (the
     one it already holds, or a fresh creation) and the server stores
     it. No verdicts, no re-registration, no pending markers: the
     state machine those powered is what churned endpoints all day.
     The confirmation test is sendTestPush, fired only by the Enable
     button after the save, mirroring CS's self-test. */
  const saveSubscription = useCallback(async (): Promise<void> => {
    const payload = await Push.subscribeBrowser();
    await syncSubFn({ data: payload });
  }, [syncSubFn]);

  /* Admin tools (bell edition): Ronya is the only admin, recognized by
     email directly, the same check the home page uses for its Admin
     button. Admins get quick actions right in the bell: post a bulletin
     and send a push, without the trip to the admin page. The server
     functions behind them re-check admin rights on every call. */
  const { user } = useAuth();
  const isAdmin = !!userId && user?.email === "virtualboy38@yahoo.com";
  const listMembersFn = useServerFn(adminListMembers);
  const listSubsFn = useServerFn(adminListPushSubscribers);
  const adminSendPushFn = useServerFn(adminSendPush);
  const bulletinPushFn = useServerFn(adminSendBulletinPush);
  const [adminTool, setAdminTool] = useState<"none" | "bulletin" | "push">("none");
  // New bulletin form
  const [bTitle, setBTitle] = useState("");
  const [bBody, setBBody] = useState("");
  const [bMediaUrl, setBMediaUrl] = useState<string | null>(null);
  const [bRecipients, setBRecipients] = useState<string[]>([]);
  const [bMembers, setBMembers] = useState<MemberOption[]>([]);
  const [bMembersLoaded, setBMembersLoaded] = useState(false);
  const [bUploading, setBUploading] = useState(false);
  const [bPosting, setBPosting] = useState(false);
  const [bConfirmUntil, setBConfirmUntil] = useState(0);
  const [bConfirmLabel, setBConfirmLabel] = useState<string | null>(null);
  const bFileRef = useRef<HTMLInputElement>(null);
  // Send push form
  const [pSubject, setPSubject] = useState("");
  const [pMessage, setPMessage] = useState("");
  const [pUrl, setPUrl] = useState("");
  const [pImageUrl, setPImageUrl] = useState("");
  const [pRecipients, setPRecipients] = useState<string[]>([]);
  const [pSubscribers, setPSubscribers] = useState<MemberOption[]>([]);
  const [pSubsLoaded, setPSubsLoaded] = useState(false);
  const [pUploading, setPUploading] = useState(false);
  const [pSending, setPSending] = useState(false);
  const [pConfirmUntil, setPConfirmUntil] = useState(0);
  const [pConfirmLabel, setPConfirmLabel] = useState<string | null>(null);
  const pFileRef = useRef<HTMLInputElement>(null);

  // Lazy-load the picker directories the first time each tool opens.
  useEffect(() => {
    if (!isAdmin) return;
    if (adminTool === "bulletin" && !bMembersLoaded) {
      void (async () => {
        try {
          const j = await listMembersFn();
          setBMembers(j.members as MemberOption[]);
        } catch {
          /* picker stays empty; blank still means everyone */
        } finally {
          setBMembersLoaded(true);
        }
      })();
    }
    if (adminTool === "push" && !pSubsLoaded) {
      void (async () => {
        try {
          const j = await listSubsFn();
          setPSubscribers(j.subscribers as MemberOption[]);
        } catch {
          /* picker stays empty; blank still means everyone */
        } finally {
          setPSubsLoaded(true);
        }
      })();
    }
  }, [adminTool, isAdmin, bMembersLoaded, pSubsLoaded, listMembersFn, listSubsFn]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setUnread(0);
      return;
    }
    const uid = userId;
    try {
      // Client-side; RLS lets signed-in users read bulletins and their own reads/hides.
      const [bulletinsRes, readsRes, hidesRes] = await Promise.all([
        supabase
          .from("bulletins")
          .select("id, title, content_html, media_url, created_at, recipient_user_ids")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("bulletin_reads").select("bulletin_id").eq("user_id", uid),
        supabase.from("bulletin_hides").select("bulletin_id").eq("user_id", uid),
      ]);
      const reads = new Set((readsRes.data ?? []).map((r) => r.bulletin_id));
      const hides = new Set((hidesRes.data ?? []).map((r) => r.bulletin_id));
      const rows = ((bulletinsRes.data ?? []) as Omit<Bulletin, "read">[])
        .filter((b) => !hides.has(b.id))
        .map((b) => ({ ...b, read: reads.has(b.id) }));
      setRows(rows);
      setUnread(rows.filter((r) => !r.read).length);
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

  // Push status comes ONLY from the live checker (permission + real
  // subscription), never from what a button click hopes happened. Re-run
  // on open, on focus, and whenever the tab becomes visible again, so a
  // permission flipped manually in phone Settings shows up the moment the
  // user comes back. No reload needed.
  // The check also keeps the server-side save current, CS-style: when
  // this device has notification permission and holds (or opted into) a
  // subscription, its row is upserted quietly. No sends, no verdicts,
  // no re-registering from here: sends happen only through explicit
  // actions (the Enable button's test, admin sends, bulletin posts).
  const checkPush = useCallback(async () => {
    const status = await getPushStatus();
    setPushStatus(status);
    setPushPerm(Push.supported() ? Push.permission() : "denied");
    if (!userId) return;
    if (!Push.supported() || Push.permission() !== "granted") return;
    // Claim the heal BEFORE awaiting anything else: setting this flag
    // after awaits is what let two heals run concurrently and sync two
    // different addresses seconds apart.
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      // Respect deliberate opt-outs: only save for a device that either
      // still holds a browser subscription or carries the opt-in flag
      // from its Enable tap. A device the user disabled has neither,
      // and must stay off (permission alone stays "granted" after a
      // disable).
      const existingEndpoint = await Push.currentEndpoint();
      let optedIn = false;
      try {
        optedIn = localStorage.getItem("bimyah_push") === "1";
      } catch {
        /* ignore */
      }
      if (!existingEndpoint && !optedIn) return;
      // One save per address per session is enough (the save is an
      // idempotent upsert); if the address rotates, the new value gets
      // saved on the next check.
      if (existingEndpoint && syncedRef.current === existingEndpoint) return;
      await saveSubscription();
      syncedRef.current = await Push.currentEndpoint();
    } catch {
      /* A failed save retries on the next open/focus, silently: the
         status line above already tells the truth about this device,
         and a background save must never nag. */
    } finally {
      syncingRef.current = false;
    }
  }, [userId, saveSubscription]);

  useEffect(() => {
    if (open) void checkPush();
  }, [open, checkPush]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") void checkPush();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [checkPush]);

  // Deep link from a bulletin push: /?bulletin=<id> opens the bell on it.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("bulletin");
      if (id) {
        setOpen(true);
        setExpanded(id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Open a guide popup. The bell closes first: two stacked modal dialogs
  // can leave the guide invisible under the bell's layer, which reads as
  // "the button does nothing".
  const showGuide = (reason: GuideReason) => {
    setOpen(false);
    setTimeout(() => setGuide(reason), 60);
  };

  // The Creator Shout enable flow: permission prompt, subscribe, test push.
  // iPhone only asks inside the installed app, so Safari users get the
  // install guide instead of burning their one permission prompt.
  const handleEnablePush = async () => {
    if (!userId) return;
    if (!Push.supported()) {
      showGuide("unsupported");
      return;
    }
    let perm = Push.permission();
    if (perm === "denied") {
      showGuide("denied");
      return;
    }
    if (perm === "default" && isIOSDevice() && !isIOSInstalledApp()) {
      showGuide("safari");
      return;
    }
    setPushBusy(true);
    try {
      if (perm === "default") {
        try {
          perm = await Notification.requestPermission();
        } catch {
          perm = "denied";
        }
      }
      if (perm !== "granted") {
        await checkPush();
        showGuide(perm === "denied" ? "denied" : "notasked");
        return;
      }
      // CS flow: save the subscription, then fire the test push at the
      // saved row (Creator Shout's self-test does exactly this). The
      // result is reported honestly, but it never triggers
      // re-registration or any other churn.
      syncingRef.current = true;
      try {
        await saveSubscription();
      } finally {
        syncingRef.current = false;
      }
      syncedRef.current = await Push.currentEndpoint();
      let testSent = false;
      try {
        const t = await testPushFn();
        testSent = t.sent > 0;
      } catch {
        testSent = false;
      }
      // Do not declare victory from the click: ask the checker what the
      // real state is now and report exactly that.
      const now = await getPushStatus();
      setPushStatus(now);
      setPushPerm(Push.permission());
      if (now !== "on") {
        toast.error("Still not on. The checker says notifications are not live yet.");
        return;
      }
      if (testSent) {
        toast.success("Notifications enabled 🎉 Check your tray.");
      } else {
        toast.error(
          "Notifications are on here, but the test push was not accepted. The failure is on the server log.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable notifications.");
      void checkPush();
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      const endpoint = await Push.currentEndpoint();
      if (endpoint && userId) {
        try {
          await deleteSubFn({ data: { endpoint } });
        } catch {
          /* browser unsubscribe below still turns this device off */
        }
      }
      await Push.unsubscribeBrowser();
      syncedRef.current = null;
      await checkPush();
      toast.success("Notifications off");
    } finally {
      setPushBusy(false);
    }
  };

  /* ----- Admin: quick-post a bulletin from the bell -----
     Same write path as the admin page's bulletin editor (client insert,
     RLS admin policies), then the bulletin.posted template push to the
     same recipients. Plain-text body; the rich editor stays on the
     admin page. */
  const handleBellMedia = async (file: File | undefined) => {
    if (!file || !userId) return;
    setBUploading(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
      const path = `${userId}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("bulletin-media")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("bulletin-media").getPublicUrl(path);
      setBMediaUrl(pub.publicUrl);
      toast.success("Media attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBUploading(false);
    }
  };

  const handlePostBulletin = async () => {
    if (!userId) return;
    if (!bTitle.trim()) {
      toast.error("Title required");
      return;
    }
    if (!bBody.trim()) {
      toast.error("Message required");
      return;
    }
    // Two-tap confirm: bulletins land in every recipient's bell and fire
    // a push, same as posting from the admin page.
    if (Date.now() > bConfirmUntil) {
      setBConfirmUntil(Date.now() + 6000);
      setBConfirmLabel(
        `Tap again to post to ${bRecipients.length ? `${bRecipients.length} ${bRecipients.length === 1 ? "person" : "people"}` : "everyone"}`,
      );
      setTimeout(() => setBConfirmLabel(null), 6000);
      return;
    }
    setBConfirmUntil(0);
    setBConfirmLabel(null);
    setBPosting(true);
    try {
      const { data: created, error } = await supabase
        .from("bulletins")
        .insert({
          title: bTitle.trim(),
          content_html: textToHtml(bBody.trim()),
          media_url: bMediaUrl,
          recipient_user_ids: bRecipients,
          author_id: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      let pushNote = "";
      try {
        if (!created?.id) throw new Error("No bulletin id");
        await bulletinPushFn({
          data: {
            bulletin_id: created.id,
            subject: bTitle.trim(),
            user_ids: bRecipients.length ? bRecipients : undefined,
          },
        });
        pushNote = " Notification sent.";
      } catch {
        pushNote = " (Notification failed.)";
      }
      toast.success(
        `Bulletin posted to ${bRecipients.length ? `${bRecipients.length} people` : "everyone"}.${pushNote}`,
      );
      setBTitle("");
      setBBody("");
      setBMediaUrl(null);
      setBRecipients([]);
      setAdminTool("none");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Post failed");
    } finally {
      setBPosting(false);
    }
  };

  /* ----- Admin: quick-send a push from the bell -----
     Same server function as the admin Push tab, big image included. */
  const handleBellPushImage = async (file: File | undefined) => {
    if (!file) return;
    setPUploading(true);
    try {
      setPImageUrl(await uploadPushImageFile(file));
      toast.success("Image attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPUploading(false);
    }
  };

  const handleSendBellPush = async () => {
    if (!pMessage.trim()) {
      toast.error("Type a message first.");
      return;
    }
    if (Date.now() > pConfirmUntil) {
      setPConfirmUntil(Date.now() + 6000);
      setPConfirmLabel(
        `Tap again to send to ${pRecipients.length ? `${pRecipients.length} ${pRecipients.length === 1 ? "person" : "people"}` : "all devices"}`,
      );
      setTimeout(() => setPConfirmLabel(null), 6000);
      return;
    }
    setPConfirmUntil(0);
    setPConfirmLabel(null);
    setPSending(true);
    try {
      const j = await adminSendPushFn({
        data: {
          title: pSubject.trim() || "Bimyah!",
          body: pMessage.trim(),
          url: pUrl.trim() || undefined,
          image: pImageUrl || undefined,
          user_ids: pRecipients.length ? pRecipients : undefined,
        },
      });
      toast.success(`Push sent to ${j.sent} of ${j.total} devices`);
      setPSubject("");
      setPMessage("");
      setPUrl("");
      setPImageUrl("");
      setPRecipients([]);
      setAdminTool("none");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setPSending(false);
    }
  };

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
      if (userId) {
        try {
          await supabase
            .from("bulletin_reads")
            .upsert({ user_id: userId, bulletin_id: b.id }, { onConflict: "user_id,bulletin_id" });
        } catch {
          /* ignore */
        }
      }
    }
  };

  const handleMarkAll = async () => {
    setRows((rs) => rs.map((r) => ({ ...r, read: true })));
    setUnread(0);
    if (!userId) return;
    try {
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await supabase
          .from("bulletin_reads")
          .upsert(
            ids.map((id) => ({ user_id: userId, bulletin_id: id })),
            { onConflict: "user_id,bulletin_id" }
          );
      }
      toast.success("All marked as read");
    } catch {
      toast.error("Couldn't mark all as read");
    }
  };

  const handleDelete = async (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    if (!userId) return;
    try {
      await supabase
        .from("bulletin_hides")
        .upsert({ user_id: userId, bulletin_id: id }, { onConflict: "user_id,bulletin_id" });
    } catch {
      void refresh();
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size || !userId) return;
    const ids = Array.from(selected);
    setRows((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setSelecting(false);
    try {
      await supabase
        .from("bulletin_hides")
        .upsert(
          ids.map((id) => ({ user_id: userId, bulletin_id: id })),
          { onConflict: "user_id,bulletin_id" }
        );
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
        className="relative flex items-center justify-center transition hover:scale-105"
      >
        <img
          src={iconBell}
          alt=""
          className="h-10 w-10 object-contain"
          style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.6))" }}
          draggable={false}
        />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-black/60">
            {badge}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto border-[var(--mint)]/30 bg-black/95 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-[var(--mint)]">
              Bulletin {unread > 0 && <span className="text-xs text-white/60">({unread} unread)</span>}
            </DialogTitle>
          </DialogHeader>

          {/* Push notifications: enable/disable lives in the bell (Creator
              Shout parity). Works even with the app closed. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">
                {isRunningStandalone() ? "App notifications" : "Push notifications"}
              </div>
              <div className="text-xs text-white/60">
                {!userId
                  ? "Sign in to get game invites and announcements as push notifications."
                  : pushStatus === null
                    ? "Checking…"
                    : pushStatus === "unsupported"
                      ? "Not supported on this browser."
                      : pushStatus === "on"
                        ? "On, verified on this device. You will get pushes even with the app closed."
                        : pushStatus === "blocked"
                        ? isRunningStandalone()
                          ? "Blocked. Long-press the Bimyah! icon → App info → Notifications → switch on. Already on? Swipe the app away and reopen it so it re-reads the switch. Tap Unblock for the walkthrough."
                          : "Blocked. Your browser said no, so the app cannot ask again. Tap Unblock for the fix."
                          : pushPerm === "granted"
                            ? "Allowed in your settings, but not finished here. Tap Enable to complete it on this device."
                            : "Off. Turn on to get game invites and announcements."}
              </div>
            </div>
            {userId && pushStatus !== "unsupported" && (
              <Button
                size="sm"
                variant={pushStatus === "on" ? "outline" : "default"}
                className={
                  pushStatus === "on"
                    ? "border-white/30 bg-transparent text-white hover:bg-white/10"
                    : "bg-[var(--mint)] font-semibold text-black hover:bg-[var(--mint)]/90"
                }
                disabled={pushBusy || pushStatus === null}
                onClick={() =>
                  void (
                    pushStatus === "on"
                      ? handleDisablePush()
                      : pushStatus === "blocked"
                        ? showGuide("denied")
                        : handleEnablePush()
                  )
                }
              >
                {pushStatus === "on" ? (
                  <BellOff className="h-3.5 w-3.5" />
                ) : (
                  <BellRing className="h-3.5 w-3.5" />
                )}
                {pushBusy
                  ? "Working…"
                  : pushStatus === "on"
                    ? "Disable notifications"
                    : pushStatus === "blocked"
                      ? "Unblock notifications"
                      : "Enable notifications"}
              </Button>
            )}
          </div>

          {/* Admin tools: quick-post a bulletin and quick-send a push
              without leaving the bell. Admins only; the server functions
              behind the forms re-check admin rights on every call. */}
          {isAdmin && (
            <div className="border-b border-white/10 pb-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                Admin tools
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    adminTool === "bulletin"
                      ? "border-[var(--mint)]/60 bg-[var(--mint)]/10 text-[var(--mint)] hover:bg-[var(--mint)]/20 hover:text-[var(--mint)]"
                      : "border-white/30 bg-transparent text-white hover:bg-white/10"
                  }
                  onClick={() => setAdminTool((t) => (t === "bulletin" ? "none" : "bulletin"))}
                >
                  <Megaphone className="h-3.5 w-3.5" /> New bulletin
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    adminTool === "push"
                      ? "border-[var(--mint)]/60 bg-[var(--mint)]/10 text-[var(--mint)] hover:bg-[var(--mint)]/20 hover:text-[var(--mint)]"
                      : "border-white/30 bg-transparent text-white hover:bg-white/10"
                  }
                  onClick={() => setAdminTool((t) => (t === "push" ? "none" : "push"))}
                >
                  <BellRing className="h-3.5 w-3.5" /> Send push
                </Button>
              </div>

              {adminTool === "bulletin" && (
                <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <Input
                    value={bTitle}
                    onChange={(e) => setBTitle(e.target.value)}
                    placeholder="Subject / title"
                    maxLength={200}
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  />
                  <div className="[&_input]:border-white/15 [&_input]:bg-white/5 [&_input]:text-white [&_input]:placeholder:text-white/35 [&_p]:text-white/50">
                    <MemberPicker
                      members={bMembers}
                      selected={bRecipients}
                      onChange={setBRecipients}
                      placeholder="Everyone, or type a name…"
                      emptyHint="No members match that search."
                    />
                  </div>
                  <textarea
                    value={bBody}
                    onChange={(e) => setBBody(e.target.value)}
                    placeholder="Message (plain text; blank lines make new paragraphs)"
                    rows={4}
                    className="w-full rounded-md border border-white/15 bg-white/5 p-2 text-sm text-white placeholder:text-white/35"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/30 bg-transparent text-white hover:bg-white/10"
                      onClick={() => bFileRef.current?.click()}
                      disabled={bUploading}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {bUploading ? "Uploading…" : bMediaUrl ? "Change header media" : "Attach header media"}
                    </Button>
                    {bMediaUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-white/70 hover:bg-white/10 hover:text-white"
                        onClick={() => setBMediaUrl(null)}
                      >
                        Remove
                      </Button>
                    )}
                    <input
                      ref={bFileRef}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        void handleBellMedia(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {bMediaUrl && (
                    <img src={bMediaUrl} alt="" className="max-h-32 rounded border border-white/10 object-contain" />
                  )}
                  <Button
                    onClick={() => void handlePostBulletin()}
                    disabled={bPosting || bUploading}
                    className="w-full bg-[var(--mint)] font-semibold text-black hover:bg-[var(--mint)]/90"
                  >
                    <Plus className="h-4 w-4" />
                    {bPosting ? "Posting…" : (bConfirmLabel ?? "Post bulletin")}
                  </Button>
                  <p className="text-xs text-white/40">
                    Posts to the bell and fires the bulletin push, same as the admin page.
                    For rich text and fonts, use Admin → Bulletins.
                  </p>
                </div>
              )}

              {adminTool === "push" && (
                <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="[&_input]:border-white/15 [&_input]:bg-white/5 [&_input]:text-white [&_input]:placeholder:text-white/35 [&_p]:text-white/50">
                    <MemberPicker
                      members={pSubscribers}
                      selected={pRecipients}
                      onChange={setPRecipients}
                      placeholder="Everyone, or type a name…"
                      emptyHint="Nobody by that name has notifications enabled."
                    />
                  </div>
                  <Input
                    value={pSubject}
                    onChange={(e) => setPSubject(e.target.value)}
                    placeholder="Subject (bold, on top)"
                    maxLength={120}
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  />
                  <textarea
                    value={pMessage}
                    onChange={(e) => setPMessage(e.target.value)}
                    placeholder="Type your message…"
                    maxLength={240}
                    rows={3}
                    className="w-full rounded-md border border-white/15 bg-white/5 p-2 text-sm text-white placeholder:text-white/35"
                  />
                  <Input
                    value={pUrl}
                    onChange={(e) => setPUrl(e.target.value)}
                    placeholder="Link (opens when tapped, optional)"
                    maxLength={500}
                    inputMode="url"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  />
                  <div>
                    <Input
                      ref={pFileRef}
                      type="file"
                      accept="image/*"
                      disabled={pUploading}
                      onChange={(e) => {
                        void handleBellPushImage(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      className="border-white/15 bg-white/5 text-white/70"
                    />
                    <p className="mt-1 text-xs text-white/40">
                      Big image (optional). Shown large on the right of the notification; the
                      Bimyah! logo stays on the left.
                    </p>
                    {pImageUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={pImageUrl} alt="" className="h-11 w-11 rounded object-cover" />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-white/70 hover:bg-white/10 hover:text-white"
                          onClick={() => setPImageUrl("")}
                        >
                          Remove image
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => void handleSendBellPush()}
                    disabled={pSending || pUploading}
                    className="w-full bg-[var(--mint)] font-semibold text-black hover:bg-[var(--mint)]/90"
                  >
                    <BellRing className="h-4 w-4" />
                    {pSending ? "Sending…" : (pConfirmLabel ?? "Send push notification")}
                  </Button>
                </div>
              )}
            </div>
          )}

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
                            {b.recipient_user_ids && b.recipient_user_ids.length > 0 && (
                              <span className="shrink-0 rounded-full bg-[var(--mint)]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--mint)]">
                                For you
                              </span>
                            )}
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

      <PushGuideDialog reason={guide} onClose={() => setGuide(null)} />
    </>
  );
}
