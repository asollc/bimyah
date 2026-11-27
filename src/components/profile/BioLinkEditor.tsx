import { useEffect, useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMyPublicProfile,
  setMyBio,
  setMyLinkInBio,
} from "@/lib/rpc/publicProfile.functions";

/* Bio + link-in-bio editor for the player's own profile page
   (Ronya 2026-11-19). The bio (100 characters max) and the link
   show at the top of the public profile. The link-in-bio is the
   player's Creator Shout page: only creatorshout.link links can
   be saved, anything else is rejected (checked here for a fast
   answer and again on the server). Tapping Add opens a prompt
   explaining that, with a Get Creator Shout link option (the CS
   home page) and Cancel. */

const CS_HOME = "https://creatorshout.link";
const BIO_MAX = 100;

function isCreatorShoutLink(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "creatorshout.link" || host.endsWith(".creatorshout.link");
  } catch {
    return false;
  }
}

export function BioLinkEditor() {
  const [bio, setBio] = useState("");
  const [savedBio, setSavedBio] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bioMsg, setBioMsg] = useState<string | null>(null);
  const [bioErr, setBioErr] = useState<string | null>(null);
  const [savingBio, setSavingBio] = useState(false);

  const [promptOpen, setPromptOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await getMyPublicProfile();
        if (cancelled || !p) return;
        setBio(p.bio ?? "");
        setSavedBio(p.bio ?? "");
        setLink(p.linkInBio);
      } catch {
        /* leave the editor empty; saving still works */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveBio = async () => {
    setSavingBio(true);
    setBioMsg(null);
    setBioErr(null);
    try {
      const res = await setMyBio({ data: { bio } });
      setSavedBio(res.bio ?? "");
      setBio(res.bio ?? "");
      setBioMsg("Bio saved");
    } catch (e) {
      setBioErr(e instanceof Error ? e.message : "Could not save your bio.");
    } finally {
      setSavingBio(false);
    }
  };

  const openPrompt = () => {
    setUrlDraft(link ?? "");
    setLinkErr(null);
    setPromptOpen(true);
  };

  const saveLink = async () => {
    const raw = urlDraft.trim();
    if (raw === "") {
      setLinkErr("Paste your Creator Shout link first.");
      return;
    }
    if (!isCreatorShoutLink(raw)) {
      setLinkErr("Only Creator Shout links (creatorshout.link) can be saved here.");
      return;
    }
    setSavingLink(true);
    setLinkErr(null);
    try {
      const res = await setMyLinkInBio({ data: { url: raw } });
      setLink(res.linkInBio);
      setPromptOpen(false);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Could not save that link.");
    } finally {
      setSavingLink(false);
    }
  };

  const removeLink = async () => {
    setSavingLink(true);
    try {
      await setMyLinkInBio({ data: { url: null } });
      setLink(null);
    } catch {
      /* keep the old link on failure */
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Bio */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          maxLength={BIO_MAX}
          rows={3}
          placeholder="Tell other players a little about yourself"
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-[#9a9a9a]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-white/40">
            Shows at the top of your public profile.
          </span>
          <span className="text-[10px] text-white/40">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        {bioErr && <div className="text-xs text-red-400">{bioErr}</div>}
        {bioMsg && <div className="text-xs text-emerald-400">{bioMsg}</div>}
        <button
          type="button"
          onClick={() => void saveBio()}
          disabled={!loaded || savingBio || bio === savedBio}
          className="btn-3d btn-3d-blue self-start px-4 py-2 text-xs disabled:opacity-40"
        >
          {savingBio ? "Saving..." : "Save bio"}
        </button>
      </div>

      {/* Link in bio */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">
          Link in bio
        </label>
        {link ? (
          <div className="flex items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg border border-[var(--gold)]/30 bg-black/30 px-3 py-2 text-xs text-[var(--gold)]"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{link.replace(/^https?:\/\//, "")}</span>
            </a>
            <button
              type="button"
              onClick={openPrompt}
              className="btn-3d btn-3d-blue px-3 py-2 text-xs"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => void removeLink()}
              disabled={savingLink}
              className="btn-3d btn-3d-red px-3 py-2 text-xs disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openPrompt}
            className="btn-3d btn-3d-gold self-start px-4 py-2 text-xs"
          >
            Add link-in-bio
          </button>
        )}
        <div className="text-[10px] text-white/40">
          Your Creator Shout page, shown under your bio on your public profile.
        </div>
      </div>

      {/* The explainer prompt */}
      <Dialog
        open={promptOpen}
        onOpenChange={(o) => {
          if (!o) setPromptOpen(false);
        }}
      >
        <DialogContent className="max-w-md border-[var(--gold)]/30 bg-black/95 text-white">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-widest text-[var(--gold)]">
              Add your link-in-bio
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-white/70">
              Your link-in-bio is your Creator Shout page. Only Creator Shout
              links (creatorshout.link) can be saved here; any other link will
              be rejected. Do not have a Creator Shout page yet? Get yours
              first, then come back and paste your link.
            </p>
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://creatorshout.link/yourname"
              inputMode="url"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-[#9a9a9a]"
            />
            {linkErr && <div className="text-xs text-red-400">{linkErr}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveLink()}
                disabled={savingLink}
                className="btn-3d btn-3d-gold px-4 py-2 text-xs disabled:opacity-40"
              >
                {savingLink ? "Saving..." : "Save link"}
              </button>
              <a
                href={CS_HOME}
                target="_blank"
                rel="noreferrer"
                className="btn-3d btn-3d-blue inline-flex items-center gap-1.5 px-4 py-2 text-xs"
              >
                Get Creator Shout link
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setPromptOpen(false)}
                className="btn-3d btn-3d-dark px-4 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
