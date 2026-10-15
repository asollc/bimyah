import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { setGuestName } from "@/game/guest";

/**
 * Modal that asks an unauthenticated user for a display name before letting
 * them play. The submitted name is automatically prefixed with "_" to mark
 * the player as a guest.
 */
export function GuestNamePrompt({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (guestName: string) => void;
}) {
  const [name, setName] = useState("");
  const trimmed = name.replace(/^_+/, "").trim();
  const canGo = trimmed.length >= 1;
  const preview = canGo ? `_${trimmed.slice(0, 13)}` : "_yourname";

  function submit() {
    if (!canGo) return;
    const prefixed = setGuestName(trimmed);
    onSubmit(prefixed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xs rounded-2xl border border-[var(--mint)]/40 bg-black/85 p-5 shadow-2xl">
        <div className="text-center font-display text-sm font-black uppercase tracking-widest text-[var(--mint)]">
          Play as Guest
        </div>
        <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-white/60">
          Pick a display name
        </div>
        <input
          autoFocus
          value={name}
          maxLength={13}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Your name"
          className="mt-3 w-full rounded-lg border border-[var(--mint)]/60 bg-black/40 px-4 py-3 text-center font-display text-lg tracking-wider text-white placeholder:text-white/30"
        />
        <div className="mt-2 text-center text-[10px] text-white/50">
          You'll appear as{" "}
          <span className="font-mono text-white/80">{preview}</span> to other
          players.
        </div>
        <button
          disabled={!canGo}
          onClick={submit}
          className="btn-3d btn-3d-mint mt-3 w-full text-sm disabled:opacity-40"
        >
          Continue
        </button>
        <Link
          to="/auth"
          className="mt-2 block text-center text-[11px] uppercase tracking-widest text-[var(--gold)]/80 hover:text-[var(--gold)]"
        >
          Or sign up for a free account
        </Link>
        <button
          onClick={onCancel}
          className="mt-2 block w-full text-center text-xs text-white/50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
