// Tiny Web Audio sound library — no external assets.
let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      /* iOS (16.4+): Web Audio defaults to the "ambient" audio session,
       * which the silent switch mutes entirely, so an iPhone with the
       * ringer off plays no game sound at all while Android (no such
       * switch) is fine. Ask for the "playback" session instead, the
       * same category media players use, so sound behaves like every
       * other app's audio. Older iOS has no audioSession API and just
       * skips this. */
      const nav = navigator as unknown as {
        audioSession?: { type: string };
      };
      if (nav.audioSession) {
        try {
          nav.audioSession.type = "playback";
        } catch {
          /* noop */
        }
      }
    } catch {
      return null;
    }
  }
  return ctx;
}

/* iOS unlock (Ronya 2026-11-27: no sound at all in the guided tutorial
 * on iPhone): Safari only lets an AudioContext start or resume inside
 * a real user-gesture handler, and a context created by an effect
 * starts suspended and stays that way, so every tone and every
 * narration clip scheduled on it is silent. The tutorial tried to
 * resume from its own effect and pointerdown retry, but the resume
 * still raced the gesture. This runs synchronously inside the gesture
 * listeners below: create the context if needed, resume it, and push
 * a one-frame silent buffer through it, which is the sequence Safari
 * treats as a fully unlocked context. The listeners stay installed
 * for the life of the page because iOS also drops the context into
 * "interrupted" after calls and notifications; the next tap after an
 * interruption re-unlocks it the same way. */
let unlockInstalled = false;
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "running") return;
  try {
    void c.resume();
  } catch {
    /* noop */
  }
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* noop */
  }
}

function installUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const onGesture = () => unlockAudio();
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("touchend", onGesture, true);
  window.addEventListener("click", onGesture, true);
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state !== "running") unlockAudio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

/* The one shared AudioContext behind every game sound. The tutorial
 * narration plays through this same context (see TutorialOverlay):
 * when the voice ran through a separate <audio> element instead,
 * every Web Audio tone fired by a card tap garbled the narration
 * stream on Android (two output paths fighting). One context, one
 * output, no fight. */
export function sharedAudioContext(): AudioContext | null {
  return getCtx();
}

export const sfx = {
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem("bimyah_muted", m ? "1" : "0");
    } catch {
      /* noop */
    }
  },
  isMuted() {
    return muted;
  },
  init() {
    try {
      muted = localStorage.getItem("bimyah_muted") === "1";
    } catch {
      /* noop */
    }
    installUnlock();
  },
  flip() {
    tone(420, 0.08, "triangle", 0.12);
  },
  swap() {
    tone(620, 0.06, "square", 0.08);
    setTimeout(() => tone(880, 0.08, "triangle", 0.1), 60);
  },
  set() {
    tone(660, 0.1, "sine", 0.18);
    setTimeout(() => tone(990, 0.18, "sine", 0.18), 90);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.18), i * 100));
  },
  tick() {
    tone(880, 0.05, "square", 0.06);
  },
  go() {
    tone(523, 0.18, "sine", 0.2);
    setTimeout(() => tone(1047, 0.25, "triangle", 0.2), 120);
  },
};

export type WinRecord = { name: string; at: number };
const HIST_KEY = "bimyah_history";

export function recordWin(name: string) {
  try {
    const arr: WinRecord[] = JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]");
    arr.unshift({ name, at: Date.now() });
    localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(0, 30)));
  } catch {
    /* noop */
  }
}

export function getHistory(): WinRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getWinCounts(): Array<{ name: string; wins: number }> {
  const counts = new Map<string, number>();
  for (const r of getHistory()) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins);
}
