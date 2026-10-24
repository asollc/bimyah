import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share, BellRing, Settings, CheckCircle2 } from "lucide-react";
import {
  Push,
  canPromptInstall,
  isIOSDevice,
  isRunningStandalone,
  openNotificationSettings,
  promptInstall,
} from "@/lib/push";
import { toast } from "sonner";

export type GuideReason = "install" | "safari" | "denied" | "unsupported" | "notasked";

/* Instruction popups mirroring Creator Shout's: install walkthrough and
   notification-permission recovery, adapted for Bimyah. The install variant
   carries a real one-tap Install button whenever the browser offered an
   install prompt (Android/desktop Chrome). On iPhone no install API exists,
   so the button reveals the three-tap walkthrough instead. */
export function PushGuideDialog({
  reason,
  onClose,
}: {
  reason: GuideReason | null;
  onClose: () => void;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const [unblocked, setUnblocked] = useState(false);
  const open = reason !== null;
  const close = () => {
    setShowSteps(false);
    setUnblocked(false);
    onClose();
  };

  // While the "blocked" guide is up, keep asking the browser for the live
  // permission. The moment it reads "granted" (the user flipped it in
  // Settings and came back), this flips to the "you're unblocked" state on
  // its own. No reload. Only a real grant counts: "default" (never asked)
  // must not celebrate.
  useEffect(() => {
    if (reason !== "denied") return;
    const recheck = () => {
      if (Push.supported() && Push.permission() === "granted") setUnblocked(true);
    };
    recheck();
    const onWake = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [reason]);

  const doInstall = async () => {
    const res = await promptInstall();
    if (res === "accepted" || res === "installed") {
      toast.success("Installed! Welcome to the app 🎉");
      close();
    } else if (res === "dismissed") {
      toast("No worries, you can install anytime.");
    } else {
      setShowSteps(true);
    }
  };

  const installSteps = (
    <div className="space-y-3 text-sm text-white/80">
      <div>
        <h4 className="mb-1 font-semibold text-white">🤖 Android (Chrome)</h4>
        <p>
          1. Tap the <strong>⋮</strong> menu (top right).
          <br />
          2. Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
          <br />
          3. Tap <strong>Add</strong> / <strong>Install</strong>.
        </p>
      </div>
      <div>
        <h4 className="mb-1 font-semibold text-white">🍏 iPhone (Safari)</h4>
        <p>
          1. Tap the <strong>Share</strong> button <Share className="inline h-4 w-4" /> (square
          with an arrow).
          <br />
          2. Scroll down and tap <strong>Add to Home Screen</strong>.
          <br />
          3. Tap <strong>Add</strong>. Notifications need iOS 16.4 or later.
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg border-[var(--mint)]/30 bg-black/95 text-white">
        {reason === "install" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                Install Bimyah!
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-white/80">
              Get the full-screen app on your home screen, with game invites and announcements
              as push notifications. One tap on Android, three taps on iPhone.
            </p>
            {canPromptInstall() && !showSteps ? (
              <Button
                onClick={() => void doInstall()}
                className="btn-glow-blue w-full font-display uppercase tracking-wider"
              >
                <Download className="h-4 w-4" /> Install Bimyah!
              </Button>
            ) : (
              <>
                {installSteps}
                <Button variant="outline" className="w-full" onClick={close}>
                  Got it
                </Button>
              </>
            )}
          </>
        )}

        {reason === "safari" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                One quick step first
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-white/80">
              iPhone only shows the notification question inside the installed Bimyah! app,
              never in a browser tab. Install the app, open it from your Home Screen, tap the
              bell, then tap <strong>Enable notifications</strong>.
            </p>
            {installSteps}
            <Button variant="outline" className="w-full" onClick={close}>
              Got it
            </Button>
          </>
        )}

        {reason === "denied" && unblocked && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                You are unblocked 🎉
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-white/80">
              <CheckCircle2 className="mr-1 inline h-4 w-4 text-[var(--mint)]" />
              The checker can see notifications are allowed again. One last step: close this,
              tap the bell, then tap <strong>Enable notifications</strong> once more so this
              device finishes signing up for pushes.
            </p>
            <Button variant="outline" className="w-full" onClick={close}>
              Got it
            </Button>
          </>
        )}

        {reason === "denied" && !unblocked && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                Notifications are blocked
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-white/80">
              <p>
                {isRunningStandalone()
                  ? "In the installed app there is one switch that matters: the app's own notification setting. The app cannot ask again in a popup, so flip it there, then come back here: this page checks itself, no reload needed."
                  : "Your browser told Bimyah! \"no\" before, so the app is not allowed to ask again. There are two separate switches that can block it, and the fix lives in a different place for each. Flip the right one, then come back here: this page checks itself, no reload needed."}
              </p>
              <p className="text-xs text-white/50">
                Checker sees: permission is denied • you are in{" "}
                {isRunningStandalone() ? "the installed app" : "a browser tab"}.
              </p>
              {!isIOSDevice() && isRunningStandalone() && (
                <div>
                  <h4 className="mb-1 font-semibold text-white">
                    🤖 In the installed app: the app switch
                  </h4>
                  <p>
                    1. Go to your Home Screen and{" "}
                    <strong>long-press the Bimyah! icon</strong>.
                    <br />
                    2. Tap <strong>App info → Notifications</strong>.
                    <br />
                    3. Switch notifications <strong>on</strong>, then come back here.
                    <br />
                    4. Already on? The app can hold the old answer while it sits in recents:{" "}
                    <strong>swipe Bimyah! away and reopen it</strong>, then check the bell
                    again.
                  </p>
                </div>
              )}
              {!isIOSDevice() && !isRunningStandalone() && (
                <>
                  <div>
                    <h4 className="mb-1 font-semibold text-white">
                      🤖 Switch 1: this site, inside Chrome (usually the blocker)
                    </h4>
                    <p>
                      Tap the <strong>lock icon</strong> in the address bar →{" "}
                      <strong>Site settings</strong> (or <strong>Permissions</strong>) →{" "}
                      <strong>Notifications</strong> → <strong>Allow</strong>. Done. Come back
                      here and this page updates itself.
                    </p>
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-white">
                      Switch 2: your browser app, in phone Settings
                    </h4>
                    <p>
                      If switch 1 already says Allow, your browser's own notifications may be
                      off at the system level. This button opens that page:
                    </p>
                  </div>
                  <Button
                    className="btn-glow-blue w-full font-display uppercase tracking-wider"
                    onClick={() => {
                      if (!openNotificationSettings()) setShowSteps(true);
                    }}
                  >
                    <Settings className="h-4 w-4" /> Open notification settings
                  </Button>
                </>
              )}
              {isIOSDevice() && (
                <>
                  <Button
                    className="btn-glow-blue w-full font-display uppercase tracking-wider"
                    onClick={() => setShowSteps((s) => !s)}
                  >
                    <Settings className="h-4 w-4" /> Show me the steps
                  </Button>
                  {showSteps && (
                    <div>
                      <h4 className="mb-1 font-semibold text-white">🍏 iPhone</h4>
                      <p>
                        1. Open the <strong>Settings</strong> app.
                        <br />
                        2. Tap <strong>Notifications</strong>, scroll down to{" "}
                        <strong>Bimyah!</strong> and tap it.
                        <br />
                        3. Switch on <strong>Allow Notifications</strong>.
                        <br />
                        4. Come back here. This page checks itself, then tap{" "}
                        <strong>Enable notifications</strong> in the bell to finish.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-white/50">
                    iPhone does not let any website open Settings for you, so this one is a
                    short manual trip.
                  </p>
                </>
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={close}>
              Close
            </Button>
          </>
        )}

        {reason === "unsupported" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                Not supported here
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-white/80">
              This browser cannot do push notifications. Open Bimyah! in Chrome on Android, or
              install it to your Home Screen on iPhone (iOS 16.4 or later), then tap Enable
              notifications again.
            </p>
            <Button variant="outline" className="w-full" onClick={close}>
              Got it
            </Button>
          </>
        )}

        {reason === "notasked" && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-[var(--mint)]">
                The question did not appear
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-white/80">
              <p>
                <BellRing className="mr-1 inline h-4 w-4" />
                The permission prompt did not show. On iPhone, open the installed Bimyah! app
                from your Home Screen (not Safari) and tap Enable notifications again, then tap{" "}
                <strong>Allow</strong> when asked.{" "}
                {isRunningStandalone()
                  ? "On Android, make sure notifications are switched on for the Bimyah! app itself: long-press the icon → App info → Notifications."
                  : "On Android, check that Chrome is allowed to show notifications for this site."}
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={close}>
              Got it
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
