import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameTable } from "@/components/game/GameTable";
import {
  TUT_TOPICS,
  TutorialOverlay,
  type TutGate,
  type TutIntroDemo,
  type TutPermit,
  type TutTopicId,
} from "@/components/game/TutorialOverlay";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { getGuestName } from "@/game/guest";
import {
  buildDemoRoomState,
  buildIntroAllSetState,
  buildIntroSetState,
  buildStandardTutorialState,
  buildTournamentTutorialState,
  TUT_BOT_ID,
} from "@/game/tutorialState";
import { markReconnected } from "@/game/engine";
import type { GameState } from "@/game/types";

export const Route = createFileRoute("/tutorial")({
  head: () => ({
    meta: [
      { title: "Guided Tutorial — Bimyah!" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TutorialPage,
});

const TUTORIAL_CSS = `
/* The :where() wrapper is load-bearing: it keeps the block rule's
   specificity BELOW the exception rules under it. Without it, the two
   :not() arguments push the block rule to (0,4,0), above the cog and
   settings-overlay exceptions at (0,3,x), and the settings cog takes
   no taps at all (Ronya 2026-11-18). */
.tutorial-stage[data-gate="locked"] :where(*:not(.tutorial-ui):not(.tutorial-ui *)),
.tutorial-stage[data-gate="cog"] :where(*:not(.tutorial-ui):not(.tutorial-ui *)),
.tutorial-stage[data-gate="settings"] :where(*:not(.tutorial-ui):not(.tutorial-ui *)),
.tutorial-stage[data-gate="scoreboard"] :where(*:not(.tutorial-ui):not(.tutorial-ui *)) {
  pointer-events: none !important;
}
.tutorial-stage[data-gate="cog"] button[aria-label="Settings"] {
  pointer-events: auto !important;
}
.tutorial-stage[data-gate="settings"] [data-settings-overlay],
.tutorial-stage[data-gate="settings"] [data-settings-overlay] * {
  pointer-events: auto !important;
}
.tutorial-stage[data-gate="scoreboard"] [data-scoreboard="1"],
.tutorial-stage[data-gate="scoreboard"] [data-scoreboard="1"] *,
.tutorial-stage[data-gate="scoreboard"] [data-scoreboard-overlay],
.tutorial-stage[data-gate="scoreboard"] [data-scoreboard-overlay] * {
  pointer-events: auto !important;
}
/* Layout gestures and panels are not game moves (Ronya 2026-11-27):
   on a crowded phone screen players must be able to rearrange the
   screen and open or close Settings from the very first card, not
   only in the chapters that teach those things. So under EVERY gate:
   Movable HUD elements keep their drag and pinch (their whole subtree
   stays live, which also keeps the Settings cog tappable), the
   Settings and Scoreboard panels open and close normally, and the
   seat / table gesture surfaces stay live. The seat and table ROOTS
   are exempt without their children on purpose: the window-level
   drag and pinch handlers only need the touch to land on the root,
   while the cards and the BIMYAH! button inside keep the gate's
   block, so no game move slips through. */
.tutorial-stage[data-gate="locked"] [data-movable-root],
.tutorial-stage[data-gate="cog"] [data-movable-root],
.tutorial-stage[data-gate="settings"] [data-movable-root],
.tutorial-stage[data-gate="scoreboard"] [data-movable-root],
.tutorial-stage[data-gate="locked"] [data-movable-root] *,
.tutorial-stage[data-gate="cog"] [data-movable-root] *,
.tutorial-stage[data-gate="settings"] [data-movable-root] *,
.tutorial-stage[data-gate="scoreboard"] [data-movable-root] *,
.tutorial-stage[data-gate="locked"] [data-settings-overlay],
.tutorial-stage[data-gate="cog"] [data-settings-overlay],
.tutorial-stage[data-gate="scoreboard"] [data-settings-overlay],
.tutorial-stage[data-gate="locked"] [data-settings-overlay] *,
.tutorial-stage[data-gate="cog"] [data-settings-overlay] *,
.tutorial-stage[data-gate="scoreboard"] [data-settings-overlay] *,
.tutorial-stage[data-gate="locked"] [data-scoreboard-overlay],
.tutorial-stage[data-gate="cog"] [data-scoreboard-overlay],
.tutorial-stage[data-gate="settings"] [data-scoreboard-overlay],
.tutorial-stage[data-gate="locked"] [data-scoreboard-overlay] *,
.tutorial-stage[data-gate="cog"] [data-scoreboard-overlay] *,
.tutorial-stage[data-gate="settings"] [data-scoreboard-overlay] *,
.tutorial-stage[data-gate="locked"] [data-seat-id],
.tutorial-stage[data-gate="cog"] [data-seat-id],
.tutorial-stage[data-gate="settings"] [data-seat-id],
.tutorial-stage[data-gate="scoreboard"] [data-seat-id],
.tutorial-stage[data-gate="locked"] [data-center-table="1"],
.tutorial-stage[data-gate="cog"] [data-center-table="1"],
.tutorial-stage[data-gate="settings"] [data-center-table="1"],
.tutorial-stage[data-gate="scoreboard"] [data-center-table="1"],
.tutorial-stage[data-gate="locked"] [data-seat-drag-handle="1"],
.tutorial-stage[data-gate="cog"] [data-seat-drag-handle="1"],
.tutorial-stage[data-gate="settings"] [data-seat-drag-handle="1"],
.tutorial-stage[data-gate="scoreboard"] [data-seat-drag-handle="1"] {
  pointer-events: auto !important;
}
.tut-hl {
  outline: 3px solid #22c55e !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.25), 0 0 18px rgba(34, 197, 94, 0.55) !important;
  animation: tut-pulse 1.1s ease-in-out infinite;
}
/* Measured highlight box for the piles: the piles container
 * reserves empty height under the cards, so the box is drawn from
 * the pile cards' own bounds instead (Ronya 2026-11-18). */
.tut-hl-box {
  position: fixed;
  border: 3px solid #22c55e;
  border-radius: 8px;
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.25), 0 0 18px rgba(34, 197, 94, 0.55);
  animation: tut-pulse 1.1s ease-in-out infinite;
  pointer-events: none;
  z-index: 25;
}
@keyframes tut-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
}
/* The play/next icon's "voice is done, ready when you are" glow.
 * drop-shadow follows the transparent icon's own shape. */
.tut-next-glow {
  animation: tut-next-glow 1.2s ease-in-out infinite;
}
@keyframes tut-next-glow {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.55)); }
  50% { filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.95)) brightness(1.12); }
}
.tut-wiggle {
  animation: tut-wiggle 0.5s ease-in-out !important;
}
@keyframes tut-wiggle {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.tut-zone {
  position: fixed;
  z-index: 390;
  border: 3px dashed #22c55e;
  border-radius: 16px;
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  pointer-events: none;
}
`;

/**
 * Tutorial-only layout seeds (Ronya 2026-11-17): the table sits closer
 * to the opponent's piles and the player's own seat is raised a little,
 * so the text box at the bottom never covers the player's hand or the
 * Free Cards. Auto-sort starts OFF in the tutorial. All seeds are
 * written over the snapshot and rolled back on exit, so the player's
 * real saved layouts are never touched outside the tutorial.
 */
function seedTutorialLayout() {
  try {
    localStorage.setItem("bimyah_auto_sort", "0");
    localStorage.setItem(
      "bimyah_center_offset_standard_2",
      JSON.stringify({ dx: 0, dy: -155 }),
    );
    localStorage.setItem(
      "bimyah_center_offset_tournament_4",
      JSON.stringify({ dx: 0, dy: -155 }),
    );
    localStorage.setItem(
      "bimyah_seat_offsets_standard_2",
      JSON.stringify({ "0": { dx: 0, dy: -230 } }),
    );
    localStorage.setItem(
      "bimyah_seat_offsets_tournament_4",
      JSON.stringify({
        "0": { dx: 0, dy: -230 },
        "2": { dx: 0, dy: -110 },
        "3": { dx: 0, dy: -110 },
      }),
    );
    // The game's Scoreboard pill sits at the top right, exactly
    // where the tutorial's Back / Next / Captions row lives, and
    // buttons must never overlap (Ronya 2026-11-18). In the
    // tutorial's tournament room the pill is dropped below that
    // row for good; real tournament games keep it where it is.
    localStorage.setItem(
      "bimyah_movables_tournament_4",
      JSON.stringify({ "scoreboard-btn": { dx: 0, dy: 60, s: 1 } }),
    );
    // Setup demo rooms run at 3 to 8 seats; give every seat count
    // the same raised table and seat so the demos frame like the
    // scripted rooms instead of the game's defaults.
    for (let n = 3; n <= 8; n++) {
      localStorage.setItem(
        `bimyah_center_offset_standard_${n}`,
        JSON.stringify({ dx: 0, dy: -155 }),
      );
      // Clock positions around the raised table (Ronya 2026-11-18,
      // from his 5-player photo): the tutorial raises the table and
      // the local seat, which left the side seats sitting in the
      // local player's row, overlapping it. The side seats rise
      // partway with the table so they sit at 3 and 9 o'clock,
      // clear of the table disc above and the player's row below.
      // The local seat (index 0) never moves from its spot. At 3
      // players both other seats are side seats (indices 1 and 2);
      // from 4 up, index 1 is the top seat and 2 and 3 are the sides.
      const side =
        n === 3
          ? { "1": { dx: 0, dy: -110 }, "2": { dx: 0, dy: -110 } }
          : { "2": { dx: 0, dy: -110 }, "3": { dx: 0, dy: -110 } };
      localStorage.setItem(
        `bimyah_seat_offsets_standard_${n}`,
        JSON.stringify({ "0": { dx: 0, dy: -230 }, ...side }),
      );
    }
  } catch {
    // ignore
  }
}

/** The gameplay slices the guided-move guard compares. */
function gameplaySignature(s: GameState): string {
  return JSON.stringify({
    status: s.status,
    championId: s.championId ?? null,
    players: s.players.map((p) => ({
      piles: p.piles.map((pile) => pile.map((c) => c.id)),
      hand: p.hand.map((c) => c.id),
      open: p.openPileIndex,
      locked: p.pileLocked,
      free: !!p.freeCards,
    })),
    center: s.center.map((sl) => sl.card?.id ?? null),
  });
}

function TutorialPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [accessChecked, setAccessChecked] = useState(false);
  const [stage, setStage] = useState<"standard" | "tournament">("standard");
  const [standard, setStandard] = useState<GameState | null>(null);
  const [tournament, setTournament] = useState<GameState | null>(null);
  const [botsFrozen, setBotsFrozen] = useState(true);
  const [viewEpoch, setViewEpoch] = useState(0);
  const [gate, setGate] = useState<TutGate>("cog");
  const [completed, setCompleted] = useState<TutTopicId[]>([]);
  const [guardNotice, setGuardNotice] = useState<string | null>(null);
  const guardSpecRef = useRef<{ active: boolean; permit: TutPermit | null }>({
    active: false,
    permit: null,
  });
  const wiggleRef = useRef<(() => void) | null>(null);
  const snapshotRef = useRef<Map<string, string> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guestName = getGuestName()?.replace(/^_+/, "") ?? null;
  const playerName = profile?.display_name ?? guestName ?? "You";
  // Progress check marks persist per account, or per device for guests.
  const progressKey = user
    ? `bimyah_tutorial_done_${user.id}`
    : "bimyah_tutorial_done_guest";

  // Snapshot every localStorage key so tutorial layout changes can be
  // rolled back exactly; then seed the tutorial's own layout.
  useEffect(() => {
    const snap = new Map<string, string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) snap.set(k, localStorage.getItem(k) ?? "");
    }
    snapshotRef.current = snap;
    seedTutorialLayout();
    return () => {
      restoreSnapshot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreSnapshot = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    // Tutorial progress keys are exempt: check marks must survive the
    // layout rollback and leaving the tutorial.
    const keep = (k: string) => k.startsWith("bimyah_tutorial_done_");
    const now: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) now.push(k);
    }
    for (const k of now) if (!snap.has(k) && !keep(k)) localStorage.removeItem(k);
    snap.forEach((v, k) => {
      if (!keep(k)) localStorage.setItem(k, v);
    });
  }, []);

  // Access: the tutorial is open to everyone (Ronya 2026-11-18; it
  // was admin-only while he tested it). Anyone who can open the
  // Training menu already has an identity, a signed-in account or a
  // stored guest name; anyone else goes home, where they can sign in
  // or pick a guest name.
  useEffect(() => {
    if (loading) return;
    if (user || getGuestName()) setAccessChecked(true);
    else navigate({ to: "/" });
  }, [loading, user, navigate]);

  // Build the scripted rooms once the player name is known.
  useEffect(() => {
    if (!accessChecked) return;
    setStandard((cur) => cur ?? buildStandardTutorialState(playerName));
    setTournament((cur) => cur ?? buildTournamentTutorialState(playerName));
  }, [accessChecked, playerName]);

  // Completed-topic check marks persist per account on this device
  // (per device for guests).
  useEffect(() => {
    if (!accessChecked) return;
    try {
      const raw = localStorage.getItem(progressKey);
      if (raw) setCompleted(JSON.parse(raw) as TutTopicId[]);
    } catch {
      // ignore
    }
  }, [accessChecked, progressKey]);

  const handleTopicComplete = useCallback(
    (t: TutTopicId) => {
      setCompleted((cur) => {
        if (cur.includes(t)) return cur;
        const next = [...cur, t];
        try {
          localStorage.setItem(progressKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [progressKey],
  );

  const handleGate = useCallback((g: TutGate) => {
    setGate(g);
  }, []);

  // Complete Tutorial challenge (Ronya 2026-11-18): once every topic
  // is complete, report it for the signed-in player. The server
  // records it exactly once and pays the reward; its response drives
  // the normal challenge popup, the same toast match completions use.
  // Nothing in the tutorial mentions the reward (Ronya's call); the
  // popup is the only sign. Guests have no account to credit.
  const tutorialReportedRef = useRef(false);
  useEffect(() => {
    if (!user || completed.length < TUT_TOPICS.length) return;
    if (tutorialReportedRef.current) return;
    tutorialReportedRef.current = true;
    void (async () => {
      try {
        const { reportTutorialCompletion } = await import(
          "@/lib/rpc/challenges.functions"
        );
        const res = await reportTutorialCompletion();
        for (const c of res.completed) {
          toast.success(
            `Challenge complete: ${c.name} (+${c.reward} Bimbit${c.reward === 1 ? "" : "s"})`,
          );
        }
      } catch {
        /* non-fatal: challenges never block the tutorial */
      }
    })();
  }, [user, completed]);

  const flashGuardNotice = useCallback(() => {
    setGuardNotice(
      "That move is not part of this step, so it was undone. Follow the green outline.",
    );
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setGuardNotice(null), 6000);
  }, []);

  // Guarded state setter shared by both rooms: Free Cards timers can
  // never be armed in the tutorial, and while the guided Gameplay steps
  // are active, any state change the current step does not permit is
  // reverted (with a wiggle on the element the player should use).
  const makeSetter =
    (setter: React.Dispatch<React.SetStateAction<GameState | null>>) =>
    (mutator: (s: GameState) => GameState) => {
      setter((prev) => {
        if (!prev) return prev;
        const next = mutator(prev);
        const out = next.inactivityDisabled
          ? next
          : { ...next, inactivityDisabled: true };
        const spec = guardSpecRef.current;
        if (spec.active) {
          const allowed = spec.permit
            ? spec.permit(out)
            : gameplaySignature(out) === gameplaySignature(prev);
          if (!allowed) {
            flashGuardNotice();
            wiggleRef.current?.();
            return prev;
          }
        }
        return out;
      });
    };

  const setStandardGuarded = useRef(makeSetter(setStandard)).current;
  const setTournamentGuarded = useRef(makeSetter(setTournament)).current;

  const handleForceFreeCards = useCallback(() => {
    setStandard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map((p) =>
          p.id === TUT_BOT_ID
            ? {
                ...p,
                freeCards: true,
                disconnectedAt: Date.now() - 61_000,
                lastActiveAt: Date.now() - 61_000,
                freePileHolds: p.piles.map(() => null),
                hand: [],
                openPileIndex: null,
              }
            : p,
        ),
      };
    });
  }, []);

  // Free Play wake: a proper return for any seat that went to Free
  // Cards. Runs the engine's own markReconnected, the same function a
  // real match applies when a player comes back, so the seat's piles
  // return face down at the seat, holds are released, and the
  // free-cards layout disappears (Ronya 2026-11-18).
  const handleWakeBots = useCallback(() => {
    const wake = (s: GameState): GameState =>
      s.players.reduce(
        (acc, p) =>
          p.freeCards || p.disconnectedAt ? markReconnected(acc, p.id) : acc,
        s,
      );
    setStandard((prev) => (prev ? wake(prev) : prev));
    setTournament((prev) => (prev ? wake(prev) : prev));
  }, []);

  // Full reset to the tutorial's original state (Ronya 2026-11-18):
  // called at every topic boundary. Rebuilding both rooms and
  // remounting GameTable closes anything the previous topic left
  // open, most importantly the Settings panel: if a player wandered
  // to another topic with Settings up, its close button was gated
  // off there and the panel could never be closed. The remount
  // drops it, and the room comes back pristine.
  const handleResetView = useCallback(() => {
    restoreSnapshot();
    seedTutorialLayout();
    setStandard(buildStandardTutorialState(playerName));
    setTournament(buildTournamentTutorialState(playerName));
    setBotsFrozen(true);
    setStage("standard");
    setViewEpoch((e) => e + 1);
  }, [restoreSnapshot, playerName]);

  // Intro staging (Ronya 2026-11-18): while the intro cards explain
  // the objective, the standard room shows the matching example
  // (four of a kind open in hand, or every pile SET). A null demo
  // restores the pristine scripted room. Raw setter on purpose: the
  // guided-move guard must never veto a staging change.
  const handleIntroDemo = useCallback(
    (demo: TutIntroDemo | null) => {
      setStandard(
        demo === "set4"
          ? buildIntroSetState(playerName)
          : demo === "allSet"
            ? buildIntroAllSetState(playerName)
            : buildStandardTutorialState(playerName),
      );
      setBotsFrozen(true);
    },
    [playerName],
  );

  // Setup demo rooms (Ronya 2026-11-18): while a Setup card gives
  // the pile counts for a table size, the standard room rebuilds at
  // that size with a real engine deal. A null seat count restores
  // the pristine scripted room. Raw setter, same reason as the
  // intro staging: the guard must never veto a staging change.
  const handleDemoRoom = useCallback(
    (seats: number | null) => {
      setStandard(
        seats
          ? buildDemoRoomState(playerName, seats)
          : buildStandardTutorialState(playerName),
      );
      setBotsFrozen(true);
    },
    [playerName],
  );

  const handleGuardSpec = useCallback(
    (active: boolean, permit: TutPermit | null) => {
      guardSpecRef.current = { active, permit };
    },
    [],
  );

  const registerWiggle = useCallback((fn: (() => void) | null) => {
    wiggleRef.current = fn;
  }, []);

  if (!accessChecked || !standard || !tournament) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[oklch(0.16_0.03_20)] text-white/60">
        Loading…
      </div>
    );
  }

  const activeState = stage === "standard" ? standard : tournament;
  const activeSetter =
    stage === "standard" ? setStandardGuarded : setTournamentGuarded;

  return (
    <div className="tutorial-stage" data-gate={gate}>
      <style>{TUTORIAL_CSS}</style>
      <GameTable
        key={`${stage}-${viewEpoch}`}
        state={activeState}
        setState={activeSetter}
        meId="tut_me"
        botsFrozen={botsFrozen}
        suppressReports
        timerOff
        disableNextMatch
        hideHowToPlay
        onEndMatch={() => navigate({ to: "/" })}
      />
      <TutorialOverlay
        state={activeState}
        stage={stage}
        completed={completed}
        guardNotice={guardNotice}
        onGate={handleGate}
        onForceFreeCards={handleForceFreeCards}
        onWakeBots={handleWakeBots}
        onBotsFrozen={setBotsFrozen}
        onEnterTournament={() => setStage("tournament")}
        onEnterStandard={() => setStage("standard")}
        onIntroDemo={handleIntroDemo}
        onDemoRoom={handleDemoRoom}
        onResetView={handleResetView}
        onTopicComplete={handleTopicComplete}
        onGuardSpec={handleGuardSpec}
        registerWiggle={registerWiggle}
        onExit={() => navigate({ to: "/" })}
      />
    </div>
  );
}
