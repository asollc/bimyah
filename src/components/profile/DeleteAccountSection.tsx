import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteMyAccount } from "@/lib/rpc/account.functions";

/**
 * Bottom-of-profile danger zone: a Delete Account button (homepage button
 * style) that opens a confirmation dialog. The delete only arms once the
 * user types DELETE, and the server then wipes the account completely.
 */
export function DeleteAccountSection() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const armed = typed === "DELETE";

  async function confirmDelete() {
    if (!armed || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteMyAccount();
      await signOut();
      setOpen(false);
      void navigate({ to: "/" });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 border-t border-white/10 pt-6">
      <div className="text-[10px] uppercase tracking-widest text-[var(--player-red)]/80">
        Danger zone
      </div>
      <p className="mt-2 text-xs text-white/50">
        Deleting your account is permanent. Your profile, bank balances, cards,
        cosmetics, friends, referrals, and game history are wiped completely
        and cannot be restored.
      </p>
      <LiquidMetalButton
        type="button"
        onClick={() => {
          setTyped("");
          setErr(null);
          setOpen(true);
        }}
        className="btn-3d btn-3d-red mt-3 inline-flex w-full items-center justify-center gap-2 text-sm"
      >
        <Trash2 className="h-4 w-4" /> Delete Account
      </LiquidMetalButton>

      {open && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o && !busy) setOpen(false);
          }}
        >
          <DialogContent className="max-w-md border-[var(--player-red)]/40 bg-black/95 text-white">
            <DialogHeader>
              <DialogTitle className="font-display uppercase tracking-widest text-[var(--player-red)]">
                Delete your account?
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-sm text-white/80">
              <p>
                This permanently deletes your Bimyah! account and everything
                tied to it: profile, bank balances (Bimbucks and Bimbits),
                cards and cosmetics, friends, referrals, challenge progress,
                and match history.
              </p>
              <p className="font-semibold text-white">
                This cannot be undone.
              </p>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-white/50">
                  Type DELETE to confirm
                </span>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  autoCapitalize="characters"
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
                />
              </label>
              {err && (
                <div className="text-xs text-[var(--player-red)]">{err}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="btn-3d btn-3d-dark flex-1 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <LiquidMetalButton
                  type="button"
                  disabled={!armed || busy}
                  onClick={() => void confirmDelete()}
                  className="btn-3d btn-3d-red flex-1 text-sm disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete My Account"}
                </LiquidMetalButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
