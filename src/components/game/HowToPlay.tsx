import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        <div className="space-y-4 text-sm leading-relaxed text-white/85">
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
        </div>
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
