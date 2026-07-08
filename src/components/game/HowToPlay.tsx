import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BplusIcon } from "@/components/BplusIcon";
import { KeybindEditor } from "./KeybindEditor";
import { listHowToVideos } from "@/lib/rpc/howToVideos.functions";
import { Maximize2 } from "lucide-react";

function BPlus() {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <BplusIcon size={14} />
      <b>Bimyah!+</b>
    </span>
  );
}

export function HowToPlayButton({
  floating = true,
  variant = "default",
  autoOpenTab = null,
}: {
  floating?: boolean;
  variant?: "default" | "lime";
  /** When set to a tab id (e.g. "videos"), opens the dialog on that tab on mount, once. */
  autoOpenTab?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(autoOpenTab ?? "standard");
  const autoOpenedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (autoOpenTab && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setActiveTab(autoOpenTab);
      setOpen(true);
    }
  }, [autoOpenTab]);
  const className =
    variant === "lime"
      ? "flex h-9 items-center gap-1 rounded-full bg-lime-400 px-3 font-display text-[10px] font-black uppercase tracking-widest text-black ring-1 ring-lime-300 transition hover:scale-105"
      : "inline-flex items-center rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur transition active:scale-90";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={className} aria-label="How to play">
          How to Play
        </button>
      </DialogTrigger>
      <DialogContent
        ref={scrollRef as unknown as React.Ref<HTMLDivElement>}
        className="top-[calc(50%+25px)] max-h-[calc(88vh-50px)] max-w-md overflow-y-auto border-[var(--mint)]/30 bg-[oklch(0.18_0.04_165)] p-0 text-white"
      >
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
            // Scroll the dialog body to the top whenever a new tab is selected.
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
            });
          }}
          className="w-full"
        >
          <div className="sticky top-0 z-10 bg-[oklch(0.18_0.04_165)] px-6 pb-3 pt-6 shadow-[0_4px_8px_-4px_rgba(0,0,0,0.6)]">
            <DialogHeader>
              <DialogTitle className="mb-3 font-display text-2xl text-[var(--mint)]">
                How to Play BIMYAH!
              </DialogTitle>
            </DialogHeader>
            <TabsList className="grid w-full grid-cols-5 bg-black/40">
              <TabsTrigger value="standard" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
                Standard
              </TabsTrigger>
              <TabsTrigger value="controls" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
                Controls
              </TabsTrigger>
              <TabsTrigger value="tournament" className="text-xs data-[state=active]:bg-[var(--gold)] data-[state=active]:text-black">
                Tournament
              </TabsTrigger>
              <TabsTrigger value="multiplayer" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
                Multiplayer
              </TabsTrigger>
              <TabsTrigger value="videos" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
                Videos
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="px-6 pb-6 pt-2">

          <TabsContent value="standard" className="space-y-4 text-sm leading-relaxed text-white/85">
            <Section title="Objective">
              Be the first to have <b>four-of-a-kind</b> in <b>all</b> your face-down piles.
            </Section>
            <Section title="Setup">
              <ul className="list-disc space-y-1 pl-5">
                <li>2–4 players standard. Up to <b>8 players</b> with <BPlus />.</li>
                <li>Mix humans and bots however you like.</li>
                <li>Standard 52-card deck (no Jokers). Dealt entirely into face-down piles of 4.</li>
                <li>Pile counts auto-adjust to the player count, with 4 leftover cards face-up in the middle.</li>
                <li>A free account is required to play.</li>
              </ul>
            </Section>
            <Section title="Gameplay">
              <ol className="list-decimal space-y-1 pl-5">
                <li><b>Start:</b> all players tap Ready, then a 3-second countdown begins.</li>
                <li><b>No turns</b> — everyone plays at once.</li>
                <li>Tap your own pile to view its cards in your hand.</li>
                <li>Tap a center card to <b>hold</b> it (your color outlines the empty slot). You have 5 seconds to swap one of your hand cards for it. Otherwise it returns.</li>
              </ol>
            </Section>
            <Section title="Limitations">
              <ul className="list-disc space-y-1 pl-5">
                <li>Only one card swap at a time.</li>
                <li>Only one open pile at a time — return it before opening another.</li>
                <li>The center always has 4 cards.</li>
                <li>Hand may never exceed 5 cards.</li>
              </ul>
            </Section>
            <Section title="Winning">
              When all 4 cards in your hand are the same rank, tap <b>SET</b> to lock that pile. When all your piles are SET, tap the red <b>BIMYAH!</b> button to declare victory.
            </Section>
          </TabsContent>

          <TabsContent value="controls" className="space-y-4 text-sm leading-relaxed text-white/85">
            <Section title="Repositioning Seats">
              <ul className="list-disc space-y-1 pl-5">
                <li>Every opponent's <b>name tag</b> doubles as a drag handle — press and drag it to move that seat anywhere on the table.</li>
                <li>Your own seat (bottom) stays fixed so your hand and piles never get pushed off-screen.</li>
                <li>Layouts are saved per game mode and player count, so your arrangement persists across matches.</li>
              </ul>
            </Section>
            <Section title="Resizing In-Game Elements">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Pinch to zoom</b> the center table (table, center cards, and BIMYAH! button scale together) on touch devices.</li>
                <li>On a keyboard, use <b>← / →</b> to shrink/grow the center table and <b>↑ / ↓</b> to grow/shrink your hand, piles, and SET/SORT buttons.</li>
                <li>Sizes are remembered locally per mode and player count.</li>
              </ul>
            </Section>
            <Section title="Emblems">
              <ul className="list-disc space-y-1 pl-5">
                <li>Equip emblems from the <b>Decor → Emblems</b> tab in your Profile. Equipped emblems appear on either side of your seat.</li>
                <li>Emblems are visible in the <b>lobby</b> before a match so you can pre-arrange them.</li>
                <li><b>Drag</b> your own emblems anywhere on screen with one finger (or mouse) — they move independently of your hand and seat.</li>
                <li><b>Pinch to resize:</b> InShot-style — keep one finger on the emblem and place a second finger anywhere on the screen; move them apart/together to grow/shrink it.</li>
                <li><b>Tap another player's emblem</b> to hide it from your screen. Hidden emblems stay hidden across sessions on this device.</li>
                <li>Position and size are remembered locally per emblem.</li>
              </ul>
            </Section>
            <Section title="Default Center Cards">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>1 – 4</b>: top row of center cards (left → right). With 4 or fewer center cards, these are the only row.</li>
                <li><b>5 – 8</b>: bottom row of center cards (left → right), when the center has 8 cards.</li>
                <li><b>Q W E R</b>: alternative for the first 4 center cards (top row).</li>
                <li><b>A S D F</b>: alternative for the bottom 4 center cards.</li>
              </ul>
            </Section>
            <Section title="Default Piles & Hand">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>U I O P</b>: open / interact with pile 1 – 4 (left → right).</li>
                <li><b>J K L ;</b>: select hand cards 1 – 4 (left → right) inside the opened pile.</li>
              </ul>
            </Section>
            <Section title="Default Action Keys">
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Spacebar</b>: tap the <b>SET</b> button.</li>
                <li><b>Shift</b>: tap the <b>SORT</b> button.</li>
                <li><b>Enter</b>: tap the <b>BIMYAH!</b> button.</li>
              </ul>
            </Section>
            <Section title="Customize your keybinds">
              <p className="mb-2">Rebind any action below. Changes apply instantly on this device. Sign in and tap <b>Save</b> to sync across devices, or <b>Reset to defaults</b> to undo all customizations.</p>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <KeybindEditor />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="tournament" className="space-y-4 text-sm leading-relaxed text-white/85">
            <Section title="Tournament Objective">
              Be the first player to reach the <b>point limit</b> set by the host across multiple matches.
            </Section>
            <Section title="Setup">
              <ul className="list-disc space-y-1 pl-5">
                <li>The host picks a <b>point limit</b> (e.g. 50, 100, 200) when creating the tournament.</li>
                <li>All standard BIMYAH rules apply within each match.</li>
                <li>Only the <b>winner</b> of each match earns points. Everyone else gets 0 for that match.</li>
              </ul>
            </Section>
            <Section title="Point System">
              <p className="mb-2">Points are awarded based on the ranks in the winner's locked piles:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><b>Ace</b> = 1 point</li>
                <li><b>2 – 10</b> = face value (2 = 2 points, etc.)</li>
                <li><b>Jack</b> = 11 points</li>
                <li><b>Queen</b> = 12 points</li>
                <li><b>King</b> = 13 points</li>
              </ul>
              <p className="mt-2">One rank value is awarded per locked set. Higher cards = bigger payouts.</p>
            </Section>
            <Section title="Scoreboard">
              <ul className="list-disc space-y-1 pl-5">
                <li>Tap the gold <b>Scoreboard</b> button at the top of the table any time to view it.</li>
                <li>Each row is a match; each column is a player.</li>
                <li>Cumulative totals appear in the sticky header.</li>
                <li>The current leader's column is highlighted in their player color.</li>
                <li>Once someone hits the limit, a 3D crown marks the <b>Champion</b>.</li>
              </ul>
            </Section>
            <Section title="Between Matches">
              <ul className="list-disc space-y-1 pl-5">
                <li>After each match, tap <b>Next Match?</b> — players ready up again to begin.</li>
                <li>Scores carry over until someone reaches the limit.</li>
                <li>When a champion is crowned, the host can tap <b>New Tournament?</b> to reset scores and choose a new point limit.</li>
              </ul>
            </Section>
          </TabsContent>

          <TabsContent value="multiplayer" className="space-y-4 text-sm leading-relaxed text-white/85">
            <Section title="Hosting a Game">
              <ol className="list-decimal space-y-1 pl-5">
                <li>From the home screen, tap <b>Create Game</b>.</li>
                <li>Choose <b>Standard</b> or <b>Tournament</b> mode.</li>
                <li>Enter your player name. For tournaments, set the point limit.</li>
                <li>Pick the number of opponents (2–3 free, up to 7 with <BPlus />).</li>
                <li>You'll receive a <b>4-digit room code</b> — share it with friends.</li>
                <li>Wait in the lobby until everyone joins. When all players have tapped <b>Ready</b>, the match begins.</li>
              </ol>
            </Section>
            <Section title="Joining a Game">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open the link the host shared, or tap <b>Join with Code</b> and enter the 4-digit room code.</li>
                <li>Enter your player name.</li>
                <li>You'll be placed in the lobby. Tap <b>Ready</b> when you're set to play.</li>
              </ol>
            </Section>
            <Section title="Reentry Codes">
              <ul className="list-disc space-y-1 pl-5">
                <li>Each seat has a private <b>4-digit reentry code</b> shown when you join.</li>
                <li>If you lose connection or close the tab, tap <b>Join with Code</b>, enter the room code, then tap <b>Use Reentry Code</b> to take back your seat — hand, piles, and score intact.</li>
                <li>Your most recent reentry code for a room is remembered on this device.</li>
              </ul>
            </Section>
            <Section title="Lobby Tips">
              <ul className="list-disc space-y-1 pl-5">
                <li>Up to 4 players free, up to 8 with <BPlus />.</li>
                <li>The match starts only when all connected players are Ready.</li>
                <li>The host's mode and point limit apply to everyone in the lobby.</li>
              </ul>
            </Section>
            <Section title="Connection">
              <ul className="list-disc space-y-1 pl-5">
                <li>Multiplayer uses a peer connection — keep the tab open during play.</li>
                <li>If you do drop, use your reentry code to rejoin without losing progress.</li>
                <li>Tap the <b>Home</b> button to leave a match (you'll be asked to confirm).</li>
              </ul>
            </Section>
          </TabsContent>

          <TabsContent value="videos" className="space-y-4 text-sm leading-relaxed text-white/85">
            <VideosTab />
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-display text-base font-bold text-[var(--gold)]">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
};

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
}

function VideosTab() {
  const [rows, setRows] = useState<VideoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listHowToVideos()
      .then((r) => {
        if (alive) setRows(r.rows as VideoRow[]);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load videos");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!rows) return <p className="text-sm text-white/60">Loading videos…</p>;
  if (rows.length === 0)
    return (
      <p className="text-sm text-white/60">
        No videos yet — check back soon for gameplay walkthroughs.
      </p>
    );

  return (
    <div className="space-y-5">
      {rows.map((v) => {
        const id = extractYouTubeId(v.youtube_url);
        return (
          <div key={v.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-[var(--gold)]">{v.title}</h3>
                {v.description && (
                  <p className="mt-1 text-xs text-white/75">{v.description}</p>
                )}
              </div>
              {id && (
                <button
                  type="button"
                  onClick={() => setExpanded(v.id)}
                  className="shrink-0 rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20"
                  aria-label="Expand video"
                  title="Expand video"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {id ? (
              <div className="aspect-video w-full overflow-hidden rounded-md border border-white/10 bg-black">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${id}`}
                  title={v.title}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
            ) : (
              <a
                href={v.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--mint)] underline"
              >
                Watch on YouTube
              </a>
            )}
          </div>
        );
      })}

      {expanded && (
        <ExpandedVideo
          row={rows.find((r) => r.id === expanded) ?? null}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}

function ExpandedVideo({ row, onClose }: { row: VideoRow | null; onClose: () => void }) {
  if (!row) return null;
  const id = extractYouTubeId(row.youtube_url);
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between text-white">
          <h3 className="font-display text-lg font-bold text-[var(--gold)]">{row.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wider hover:bg-white/20"
          >
            Close
          </button>
        </div>
        {id && (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/15 bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
              title={row.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

