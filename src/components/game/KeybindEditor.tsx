import { useEffect, useRef, useState } from "react";
import {
  ACTION_GROUPS,
  DEFAULT_KEYBINDS,
  type ActionId,
  type Keybinds,
  clearCloud,
  displayKey,
  loadCloud,
  loadLocal,
  normalizeKey,
  resetLocal,
  saveCloud,
  saveLocal,
} from "@/game/keybinds";
import { useAuth } from "@/auth/AuthProvider";
import { Save, RotateCcw, Cloud } from "lucide-react";

/**
 * Inline keybind editor. Drop into any container.
 *  - Click a row's key chip to capture a new key.
 *  - Reset to defaults clears local + cloud overrides.
 *  - Save persists to cloud (when signed in).
 *
 * Local changes apply immediately. Cloud save is explicit so users can
 * experiment without persisting across devices.
 */
export function KeybindEditor() {
  const { user } = useAuth();
  const [bindings, setBindings] = useState<Keybinds>(() => loadLocal());
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingCloud, setSavingCloud] = useState(false);
  const cloudLoaded = useRef(false);

  // Pull cloud bindings once at mount when signed in.
  useEffect(() => {
    if (!user || cloudLoaded.current) return;
    cloudLoaded.current = true;
    void (async () => {
      const cloud = await loadCloud(user.id);
      if (cloud) {
        setBindings(cloud);
        saveLocal(cloud);
      }
    })();
  }, [user]);

  // Capture next keypress.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const k = normalizeKey(e);
      setBindings((prev) => {
        const next = { ...prev };
        // If key is used elsewhere, swap.
        const conflict = (Object.entries(next) as [ActionId, string][])
          .find(([id, val]) => id !== capturing && val === k);
        if (conflict) next[conflict[0]] = prev[capturing] ?? "";
        next[capturing] = k;
        saveLocal(next);
        return next;
      });
      setCapturing(null);
      setStatus(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  const reset = async () => {
    const def = resetLocal();
    setBindings(def);
    if (user) await clearCloud(user.id);
    setStatus("Reset to defaults.");
  };

  const save = async () => {
    if (!user) {
      setStatus("Sign in to save across devices.");
      return;
    }
    setSavingCloud(true);
    await saveCloud(user.id, bindings);
    setSavingCloud(false);
    setStatus("Saved.");
  };

  return (
    <div className="space-y-3 text-white/85">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={savingCloud}
          className="btn-3d btn-3d-mint inline-flex items-center gap-1 text-[11px] disabled:opacity-50"
        >
          {savingCloud ? <Cloud className="h-3 w-3 animate-pulse" /> : <Save className="h-3 w-3" />}
          {savingCloud ? "Saving…" : "Save"}
        </button>
        <button
          onClick={reset}
          className="btn-3d btn-3d-dark inline-flex items-center gap-1 text-[11px]"
        >
          <RotateCcw className="h-3 w-3" /> Reset to defaults
        </button>
        {status && <div className="text-[11px] text-[var(--mint)]">{status}</div>}
      </div>
      <p className="text-[11px] text-white/50">
        Tap a key to rebind. Press <b>Esc</b> to cancel capture. Changes apply
        immediately on this device. {user ? "Tap Save to sync to your account." : "Sign in to sync across devices."}
      </p>

      <div className="space-y-3">
        {ACTION_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">
              {group.title}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group.actions.map((a) => {
                const isCapturing = capturing === a.id;
                const key = bindings[a.id] ?? DEFAULT_KEYBINDS[a.id];
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-2 py-1"
                  >
                    <span className="truncate text-[12px]">{a.label}</span>
                    <button
                      onClick={() => setCapturing(a.id)}
                      className={`min-w-[3.5rem] rounded border px-2 py-0.5 text-center font-mono text-[11px] ${
                        isCapturing
                          ? "animate-pulse border-[var(--mint)] bg-[var(--mint)]/20 text-[var(--mint)]"
                          : "border-white/20 bg-black/40 text-white/90 hover:border-[var(--mint)]/60"
                      }`}
                    >
                      {isCapturing ? "Press…" : displayKey(key)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
