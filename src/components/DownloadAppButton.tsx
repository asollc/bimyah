import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { isInstalled, promptInstall } from "@/lib/push";
import { PushGuideDialog } from "@/components/PushGuides";
import { isDiscordActivity } from "@/discord/detection";

/* Download App: one-tap install where the browser offers it (Android and
   desktop Chrome), the install guide popup everywhere else (iPhone).
   Hidden once the app is installed, and inside the Discord client. */
export function DownloadAppButton() {
  const [installed, setInstalled] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  if (installed || isDiscordActivity()) return null;

  const handleClick = async () => {
    const res = await promptInstall();
    if (res === "accepted" || res === "installed") {
      toast.success("Installed! Welcome to the app 🎉");
      setInstalled(true);
    } else if (res === "dismissed") {
      toast("No worries, you can install anytime.");
    } else {
      setGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="btn-glow-blue px-4 py-2 font-display text-[10px] font-black uppercase tracking-widest"
        aria-label="Download the Bimyah app"
      >
        <Download className="h-3.5 w-3.5" /> Download App
      </button>
      <PushGuideDialog reason={guide ? "install" : null} onClose={() => setGuide(false)} />
    </>
  );
}
