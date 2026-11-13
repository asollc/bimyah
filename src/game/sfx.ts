// Tiny Web Audio sound library — no external assets.
let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
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
