/**
 * ChatPanel — match + spectator chat with two tabs.
 *
 * - Both players and spectators see both tabs.
 * - Only seated players may post to the Match tab.
 * - Spectators (and players) may post to the Spectator tab.
 * - Authors display with their player color + avatar; spectators show a
 *   neutral viewer chip.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import type { ChatChannel, ChatMessage, GameState } from "@/game/types";
import { PLAYER_COLOR_HEX } from "./GameTable";

export function ChatPanel({
  state,
  meId,
  isSpectator,
  onClose,
  onSend,
}: {
  state: GameState;
  meId: string;
  isSpectator: boolean;
  onClose: () => void;
  onSend: (channel: ChatChannel, text: string) => void;
}) {
  const me = state.players.find((p) => p.id === meId);
  const meSpec = (state.spectators ?? []).find((s) => s.id === meId);
  const myName = me?.name ?? meSpec?.name ?? "Player";
  const myAvatar = me?.avatarUrl ?? meSpec?.avatarUrl ?? null;
  const myColor = me?.color ?? null;

  // Default to "match" for players, "spectator" for spectators.
  const [tab, setTab] = useState<ChatChannel>(isSpectator ? "spectator" : "match");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = state.chat ?? [];
  const messages = useMemo(() => all.filter((m) => m.channel === tab), [all, tab]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, tab]);

  const canPostInTab = tab === "match" ? !isSpectator && !!me : true;

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    if (!canPostInTab) return;
    const msg: ChatMessage = {
      id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      channel: tab,
      authorId: meId,
      authorName: myName,
      avatarUrl: myAvatar,
      color: myColor,
      isSpectator,
      text: t,
      ts: Date.now(),
    };
    onSend(tab, t);
    // The intent travels via onSend; we don't need msg here besides shape.
    void msg;
    setDraft("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 p-3 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="flex h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/20 bg-[oklch(0.18_0.04_165)] text-white shadow-[var(--shadow-glow-mint)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-[var(--mint)]">
            <MessageCircle className="h-4 w-4" /> Chat
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 active:scale-90"
            aria-label="Close chat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 bg-black/30 p-1">
          <TabButton active={tab === "match"} onClick={() => setTab("match")} label="Match" />
          <TabButton
            active={tab === "spectator"}
            onClick={() => setTab("spectator")}
            label="Spectator"
          />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-xs text-white/40">
              {tab === "match"
                ? "No match messages yet. Say hi!"
                : "No spectator chatter yet."}
            </div>
          ) : (
            messages.map((m) => <ChatRow key={m.id} m={m} mine={m.authorId === meId} />)
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/10 bg-black/30 p-2">
          {!canPostInTab ? (
            <div className="px-2 py-1 text-center text-[10px] uppercase tracking-widest text-white/40">
              Only players can post in match chat
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Message ${tab === "match" ? "the table" : "spectators"}…`}
                maxLength={500}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--mint)]/50 focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={!draft.trim()}
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--mint)] text-[oklch(0.18_0.04_165)] disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors " +
        (active
          ? "bg-[var(--mint)] text-[oklch(0.18_0.04_165)]"
          : "text-white/60 hover:text-white/90")
      }
    >
      {label}
    </button>
  );
}

function ChatRow({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const color = m.color ? PLAYER_COLOR_HEX[m.color] : "#94a3b8";
  return (
    <div className={"flex items-start gap-2 " + (mine ? "flex-row-reverse" : "")}>
      <div
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full ring-2"
        style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}` } as React.CSSProperties}
      >
        {m.avatarUrl ? (
          <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="text-[10px] font-bold uppercase text-white"
            style={{ backgroundColor: color, width: "100%", height: "100%", display: "grid", placeItems: "center" }}
          >
            {m.authorName.slice(0, 1)}
          </span>
        )}
      </div>
      <div className={"flex max-w-[78%] flex-col " + (mine ? "items-end" : "items-start")}>
        <div className="flex items-baseline gap-1.5 text-[10px] uppercase tracking-wider">
          <span className="font-bold" style={{ color }}>
            {m.authorName}
          </span>
          {m.isSpectator && (
            <span className="rounded-sm bg-white/10 px-1 py-px text-[8px] tracking-widest text-white/60">
              VIEWER
            </span>
          )}
        </div>
        <div
          className="mt-0.5 break-words rounded-2xl px-3 py-1.5 text-sm"
          style={{
            backgroundColor: mine ? "var(--mint)" : "rgba(255,255,255,0.08)",
            color: mine ? "oklch(0.18 0.04 165)" : "white",
          }}
        >
          {m.text}
        </div>
      </div>
    </div>
  );
}
