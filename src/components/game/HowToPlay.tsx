import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HelpCircle } from "lucide-react";

export function HowToPlayButton({ floating = true }: { floating?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={
            floating
              ? "grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur transition active:scale-90"
              : "inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-xs text-white/80"
          }
          aria-label="How to play"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto border-[var(--mint)]/30 bg-[oklch(0.18_0.04_165)] text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-[var(--mint)]">
            How to Play BIMYAH!
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="standard" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-black/40">
            <TabsTrigger value="standard" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
              Standard
            </TabsTrigger>
            <TabsTrigger value="tournament" className="text-xs data-[state=active]:bg-[var(--gold)] data-[state=active]:text-black">
              Tournament
            </TabsTrigger>
            <TabsTrigger value="multiplayer" className="text-xs data-[state=active]:bg-[var(--mint)] data-[state=active]:text-black">
              Multiplayer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standard" className="space-y-4 text-sm leading-relaxed text-white/85">
            <Section title="Objective">
              Be the first to have <b>four-of-a-kind</b> in <b>all</b> your face-down piles.
            </Section>
            <Section title="Setup">
              <ul className="list-disc space-y-1 pl-5">
                <li>2–4 humans, or up to 3 bots.</li>
                <li>Standard 52-card deck (no Jokers). Dealt entirely into face-down piles of 4.</li>
                <li><b>2 players:</b> 6 piles each. Players sit opposite.</li>
                <li><b>3 players:</b> 4 piles each. Triangle around the table.</li>
                <li><b>4 players:</b> 3 piles each. Cross formation.</li>
                <li>4 leftover cards go face-up in the middle.</li>
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
                <li>From the home screen, tap <b>Play Multiplayer</b>.</li>
                <li>Choose <b>Standard</b> or <b>Tournament</b> mode.</li>
                <li>Enter your player name. For tournaments, set the point limit.</li>
                <li>You'll receive a <b>game code / link</b> — share it with friends.</li>
                <li>Wait in the lobby until everyone joins. When all players have tapped <b>Ready</b>, the match begins.</li>
              </ol>
            </Section>
            <Section title="Joining a Game">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open the link the host shared, or tap <b>Join</b> and enter the game code.</li>
                <li>Enter your player name.</li>
                <li>You'll be placed in the lobby. Tap <b>Ready</b> when you're set to play.</li>
              </ol>
            </Section>
            <Section title="Lobby Tips">
              <ul className="list-disc space-y-1 pl-5">
                <li>Up to 4 humans per game.</li>
                <li>The match starts only when all connected players are Ready.</li>
                <li>The host's mode and point limit apply to everyone in the lobby.</li>
              </ul>
            </Section>
            <Section title="Connection">
              <ul className="list-disc space-y-1 pl-5">
                <li>Multiplayer uses a peer connection — keep the tab open during play.</li>
                <li>If a player disconnects, the host can wait or proceed with remaining players.</li>
                <li>Tap the <b>Home</b> button to leave a match (you'll be asked to confirm).</li>
              </ul>
            </Section>
          </TabsContent>
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
