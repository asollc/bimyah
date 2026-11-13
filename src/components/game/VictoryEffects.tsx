import { memo, useEffect, useRef, type ComponentType, type FC } from "react";
import roseStemA from "@/assets/vfx/rose-stem-a.png";
import roseStemB from "@/assets/vfx/rose-stem-b.png";

/**
 * Library of full-viewport animated victory effects. Each component renders
 * a `pointer-events-none fixed inset-0 z-50` overlay using CSS keyframes
 * (declared in src/styles.css). They are intentionally dependency-free so
 * admins can add new presets by appending to `VICTORY_EFFECTS` below.
 */

type EffectProps = Record<string, unknown>;

const overlay = "pointer-events-none fixed inset-0 z-[200] overflow-hidden";

/* ---------- helpers ---------- */
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/* ---------- Confetti Cannon (canvas) ---------- */
// Two side cannons and a center fountain fire paper pieces with
// flip shading and flutter physics, then a slow streamer rain keeps
// the celebration drifting for about six seconds. Canvas based: the
// old DOM version was 90 flat rectangles on a linear fall.
type ConfettiPiece = {
  x: number; y: number; vx: number; vy: number; spawn: number;
  kind: 'rect' | 'circle' | 'streamer'; w: number;
  cf: string; cb: string;
  angle: number; va: number; flip: number; flipSpeed: number;
  swayPhase: number; swayFreq: number; swayAmp: number;
  term: number; dragK: number;
};
const CONFETTI_COLORS: Array<[string, string]> = [
  ['#ffd94d', '#d9a40f'], // metallic gold
  ['#f3c96b', '#bd8f35'], // soft gold
  ['#e33244', '#8f1220'], // Bimyah red
  ['#ff5a4e', '#a11d14'], // bright red
  ['#f7e8c3', '#cdb27f'], // cream
  ['#8b5cf6', '#5b21b6'], // violet accent
  ['#2dd4a8', '#0f766e'], // emerald accent
];
const CONFETTI_WEIGHTS = [3, 2, 4, 2, 2, 1, 1];
function confettiColor(): [string, string] {
  let sum = 0; for (const w of CONFETTI_WEIGHTS) sum += w;
  let r = Math.random() * sum;
  for (let i = 0; i < CONFETTI_COLORS.length; i++) { r -= CONFETTI_WEIGHTS[i]; if (r <= 0) return CONFETTI_COLORS[i]; }
  return CONFETTI_COLORS[0];
}
function buildConfetti(W: number, H: number): ConfettiPiece[] {
  const S = H / 800;
  const pieces: ConfettiPiece[] = [];
  const make = (init: Partial<ConfettiPiece>): ConfettiPiece => {
    const kindR = Math.random();
    const [cf, cb] = confettiColor();
    return {
      x: 0, y: 0, vx: 0, vy: 0, spawn: 0,
      kind: kindR < 0.62 ? 'rect' : kindR < 0.82 ? 'circle' : 'streamer',
      w: 6 + Math.random() * 7, cf, cb,
      angle: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 14,
      flip: Math.random() * Math.PI * 2, flipSpeed: 3 + Math.random() * 7,
      swayPhase: Math.random() * Math.PI * 2, swayFreq: 1.6 + Math.random() * 2.4,
      swayAmp: 30 + Math.random() * 60,
      term: 140 + Math.random() * 150, dragK: 0.5 + Math.random() * 0.5,
      ...init,
    } as ConfettiPiece;
  };
  const cannon = (x0: number, dirSign: number, count: number, t0: number, t1: number) => {
    for (let i = 0; i < count; i++) {
      const speed = (950 + Math.random() * 620) * S;
      const ang = Math.PI / 2.35 + (Math.random() - 0.5) * 0.5;
      pieces.push(make({
        x: x0, y: H + 12,
        vx: Math.cos(ang) * speed * dirSign,
        vy: -Math.sin(ang) * speed,
        spawn: t0 + Math.random() * (t1 - t0),
      }));
    }
  };
  cannon(W * 0.04, 1, 95, 0, 340);
  cannon(W * 0.96, -1, 95, 60, 400);
  for (let i = 0; i < 75; i++) {
    const speed = (1050 + Math.random() * 520) * S;
    const ang = (Math.random() - 0.5) * 0.62;
    pieces.push(make({
      x: W * (0.5 + (Math.random() - 0.5) * 0.1), y: H + 12,
      vx: Math.sin(ang) * speed, vy: -Math.cos(ang) * speed,
      spawn: 280 + Math.random() * 320,
    }));
  }
  for (let i = 0; i < 70; i++) {
    pieces.push(make({
      x: Math.random() * W, y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 60,
      spawn: 700 + Math.random() * 700,
    }));
  }
  for (let i = 0; i < 55; i++) {
    pieces.push(make({
      x: Math.random() * W, y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 60,
      spawn: 2100 + Math.random() * 1300,
    }));
  }
  return pieces;
}
export const ConfettiEffect: ComponentType<EffectProps> = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = 0; let H = 0; let raf = 0;
    let pieces: ConfettiPiece[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setup = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pieces = buildConfetti(W, H);
    };
    setup();
    const DT = 1 / 120;
    const stepPiece = (p: ConfettiPiece, t: number) => {
      const S = H / 800;
      const g = 1180 * S;
      p.vy += g * DT * (p.vy < 0 ? 1 : 0.12);
      if (p.vy > 0) p.vy += (p.term * S - p.vy) * 3.4 * DT;
      p.vx *= Math.exp(-p.dragK * DT);
      const sway = p.vy > 40 ? Math.sin(t * p.swayFreq + p.swayPhase) * p.swayAmp : 0;
      p.x += (p.vx + sway) * DT;
      p.y += p.vy * DT;
      p.angle += p.va * DT;
      p.flip += p.flipSpeed * DT;
    };
    const drawPiece = (p: ConfettiPiece) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      const fade = p.y > H - 90 ? Math.max(0, (H + 24 - p.y) / 114) : 1;
      ctx.globalAlpha = Math.min(1, fade + 0.15);
      const flipC = Math.cos(p.flip);
      ctx.fillStyle = flipC >= 0 ? p.cf : p.cb;
      if (p.kind === 'circle') {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w * 0.42, Math.max(0.8, p.w * 0.42 * Math.abs(flipC)), p.angle, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'streamer') {
        ctx.rotate(p.angle * 0.4);
        ctx.strokeStyle = flipC >= 0 ? p.cf : p.cb;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const len = p.w * 3.4;
        for (let k = 0; k <= 4; k++) {
          const yy = -len / 2 + (len * k) / 4;
          const xx = Math.sin(p.flip + k * 1.1) * 3.2;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      } else {
        ctx.rotate(p.angle);
        const h = Math.max(0.7, p.w * 0.62 * Math.abs(flipC));
        ctx.fillRect(-p.w / 2, -h / 2, p.w, h);
      }
      ctx.restore();
    };
    const start = performance.now();
    let last = start; let acc = 0;
    const frame = (now: number) => {
      const elapsed = now - start;
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      while (acc >= DT) {
        for (const p of pieces) if (elapsed >= p.spawn && p.y < H + 40) stepPiece(p, elapsed / 1000);
        acc -= DT;
      }
      ctx.clearRect(0, 0, W, H);
      let alive = 0; let pending = false;
      for (const p of pieces) {
        if (elapsed < p.spawn) { pending = true; continue; }
        if (p.y < H + 30) { drawPiece(p); alive++; }
      }
      if (alive > 0 || pending) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => setup();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <div className={overlay}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

/* ---------- Falling Stars (canvas) ---------- */
// Glowing gold stars flutter down with a twinkle, and three shooting
// stars streak through. Sprite based: the star is pre-rendered once
// with its glow, then drawn with the confetti paper physics.
type StarPiece = {
  x: number; y: number; vx: number; vy: number; spawn: number;
  size: number; rot: number; vr: number;
  swayPhase: number; swayFreq: number; swayAmp: number; term: number;
  tw: number; twFreq: number;
};
type Meteor = { x: number; y: number; vx: number; vy: number; spawn: number; life: number };
function starPath2(c: CanvasRenderingContext2D, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
}
function makeStarSprite(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.translate(64, 64);
  c.shadowColor = 'rgba(255,190,40,0.95)';
  c.shadowBlur = 16;
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 44);
  g.addColorStop(0, '#fff6c9');
  g.addColorStop(0.55, '#ffd94d');
  g.addColorStop(1, '#f0a500');
  c.fillStyle = g;
  starPath2(c, 40);
  c.fill(); c.fill();
  return cv;
}
export const FallingStarsEffect: ComponentType<EffectProps> = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sprite = makeStarSprite();
    let W = 0; let H = 0; let raf = 0;
    let stars: StarPiece[] = [];
    let meteors: Meteor[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setup = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: 78 }, (_, i) => ({
        x: Math.random() * W, y: -30 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 36, vy: 26 + Math.random() * 50,
        spawn: i < 46 ? Math.random() * 1200 : 1200 + Math.random() * 3300,
        size: 15 + Math.random() * 34,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 1.6,
        swayPhase: Math.random() * Math.PI * 2, swayFreq: 1.4 + Math.random() * 2,
        swayAmp: 22 + Math.random() * 46, term: 150 + Math.random() * 170,
        tw: Math.random() * Math.PI * 2, twFreq: 2 + Math.random() * 3.4,
      }));
      meteors = Array.from({ length: 3 }, (_, i) => ({
        x: W * (0.15 + Math.random() * 0.6), y: -24,
        vx: 430 + Math.random() * 160, vy: 300 + Math.random() * 120,
        spawn: 350 + i * 1250 + Math.random() * 300, life: 0.85,
      }));
    };
    setup();
    const DT = 1 / 120;
    const start = performance.now();
    let last = start; let acc = 0;
    const frame = (now: number) => {
      const elapsed = now - start;
      const t = elapsed / 1000;
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      const S = H / 800;
      while (acc >= DT) {
        for (const p of stars) {
          if (elapsed < p.spawn || p.y >= H + 46) continue;
          p.vy += 1180 * S * DT * (p.vy < 0 ? 1 : 0.12);
          if (p.vy > 0) p.vy += (p.term * S - p.vy) * 3.4 * DT;
          p.vx *= Math.exp(-0.6 * DT);
          const sway = p.vy > 40 ? Math.sin(t * p.swayFreq + p.swayPhase) * p.swayAmp : 0;
          p.x += (p.vx + sway) * DT;
          p.y += p.vy * DT;
          p.rot += p.vr * DT;
        }
        acc -= DT;
      }
      ctx.clearRect(0, 0, W, H);
      let alive = 0; let pending = false;
      for (const m of meteors) {
        const age = t - m.spawn / 1000;
        if (age < 0) { pending = true; continue; }
        if (age > m.life) continue;
        alive++;
        const mx = m.x + m.vx * S * age, my = m.y + m.vy * S * age;
        const tail = 0.16;
        const grad = ctx.createLinearGradient(mx - m.vx * S * tail, my - m.vy * S * tail, mx, my);
        grad.addColorStop(0, 'rgba(255,220,120,0)');
        grad.addColorStop(1, 'rgba(255,240,190,0.95)');
        ctx.strokeStyle = grad; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx - m.vx * S * tail, my - m.vy * S * tail); ctx.lineTo(mx, my); ctx.stroke();
        ctx.drawImage(sprite, mx - 13, my - 13, 26, 26);
      }
      for (const p of stars) {
        if (elapsed < p.spawn) { pending = true; continue; }
        if (p.y > H + 40) continue;
        alive++;
        const tw = 0.78 + 0.22 * Math.sin(t * p.twFreq + p.tw);
        const sz = p.size * tw;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.y > H - 90 ? Math.max(0, (H + 24 - p.y) / 114) : 1;
        ctx.drawImage(sprite, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (alive > 0 || pending) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => setup();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <div className={overlay}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

/* ---------- Falling Roses (canvas) ---------- */
// Whole glossy 3D roses with stems, tumbling down. Two pre-rendered
// rose sprites (bright and deep red), mirrored for variety.
type RosePiece = {
  x: number; y: number; vx: number; vy: number; spawn: number;
  size: number; rot: number; vr: number; spr: number; mirror: boolean;
  swayPhase: number; swayFreq: number; swayAmp: number; term: number;
};
export const FallingRosesEffect: ComponentType<EffectProps> = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgs = [roseStemA, roseStemB].map((s) => {
      const im = new Image();
      im.src = s;
      return im;
    });
    let W = 0; let H = 0; let raf = 0; let cancelled = false;
    let pieces: RosePiece[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setup = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pieces = Array.from({ length: 34 }, () => ({
        x: Math.random() * W, y: -180 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 26, vy: 22 + Math.random() * 34,
        spawn: Math.random() * 4200,
        size: 100 + Math.random() * 58,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 2.2,
        spr: Math.floor(Math.random() * 2), mirror: Math.random() < 0.5,
        swayPhase: Math.random() * Math.PI * 2, swayFreq: 1.0 + Math.random() * 1.4,
        swayAmp: 24 + Math.random() * 30, term: 118 + Math.random() * 82,
      }));
    };
    setup();
    const DT = 1 / 120;
    let start = performance.now(); let last = start; let acc = 0;
    const frame = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const t = elapsed / 1000;
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      const S = H / 800;
      while (acc >= DT) {
        for (const p of pieces) {
          if (elapsed < p.spawn || p.y >= H + 200) continue;
          p.vy += 1180 * S * DT * (p.vy < 0 ? 1 : 0.12);
          if (p.vy > 0) p.vy += (p.term * S - p.vy) * 3.4 * DT;
          p.vx *= Math.exp(-0.55 * DT);
          const sway = p.vy > 40 ? Math.sin(t * p.swayFreq + p.swayPhase) * p.swayAmp : 0;
          p.x += (p.vx + sway) * DT;
          p.y += p.vy * DT;
          p.rot += p.vr * DT;
        }
        acc -= DT;
      }
      ctx.clearRect(0, 0, W, H);
      let alive = 0; let pending = false;
      for (const p of pieces) {
        if (elapsed < p.spawn) { pending = true; continue; }
        if (p.y > H + 200) continue;
        const img = imgs[p.spr];
        if (!img.complete || !img.naturalWidth) continue;
        alive++;
        const wid = p.size * (img.naturalWidth / img.naturalHeight);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(p.mirror ? -1 : 1, 1);
        ctx.globalAlpha = p.y > H - 90 ? Math.max(0, (H + 24 - p.y) / 114) : 1;
        ctx.drawImage(img, -wid / 2, -p.size / 2, wid, p.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (alive > 0 || pending) raf = requestAnimationFrame(frame);
    };
    Promise.all(imgs.map((im) => im.decode().catch(() => undefined))).then(() => {
      if (cancelled) return;
      start = performance.now(); last = start;
      raf = requestAnimationFrame(frame);
    });
    const onResize = () => setup();
    window.addEventListener('resize', onResize);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <div className={overlay}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

/* ---------- Fireworks (canvas) ---------- */
// Rockets rise and burst into big sphere, ring, and willow shells
// with additive glow, motion streaks, and a flash at each burst.
// Two rockets fire together for the finale.
type FwRocket = {
  x: number; y: number; vx: number; vy: number; launch: number;
  fam: string[]; type: 'sphere' | 'ring' | 'willow'; burst: boolean;
};
type FwSpark = {
  x: number; y: number; vx: number; vy: number; age: number; life: number;
  col: string; tw: number; willow: boolean;
};
type FwFlash = { x: number; y: number; age: number };
const FW_FAMILIES: string[][] = [
  ['#ffd94d', '#f3c96b', '#fff3c4'],
  ['#ff5a4e', '#e33244', '#ffb3ab'],
  ['#c4b5fd', '#8b5cf6', '#e9d5ff'],
  ['#6ee7b7', '#2dd4a8', '#ccfbf1'],
  ['#f7e8c3', '#ffd94d', '#ffffff'],
];
export const FireworksEffect: ComponentType<EffectProps> = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = 0; let H = 0; let raf = 0;
    let rockets: FwRocket[] = [];
    let sparks: FwSpark[] = [];
    let flashes: FwFlash[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const setup = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = H / 800;
      const types: FwRocket['type'][] = ['sphere', 'ring', 'willow', 'sphere', 'ring', 'sphere', 'willow', 'sphere', 'ring'];
      rockets = types.map((type, i) => {
        const rise = (0.58 + Math.random() * 0.22) * H;
        return {
          x: W * (0.16 + Math.random() * 0.68), y: H + 8,
          vx: (Math.random() - 0.5) * 30 * S,
          vy: -Math.sqrt(2 * 640 * S * rise),
          launch: (i === 8 ? 7 * 380 : i * 380) + Math.random() * 160,
          fam: FW_FAMILIES[i % FW_FAMILIES.length], type, burst: false,
        };
      });
      sparks = []; flashes = [];
    };
    setup();
    const burst = (r: FwRocket) => {
      const S = H / 800;
      flashes.push({ x: r.x, y: r.y, age: 0 });
      const n = r.type === 'willow' ? 84 : r.type === 'ring' ? 128 : 176;
      for (let i = 0; i < n; i++) {
        let ang: number; let spd: number;
        if (r.type === 'ring') { ang = (i / n) * Math.PI * 2; spd = 560 * S; }
        else {
          ang = Math.random() * Math.PI * 2;
          spd = (r.type === 'willow' ? 200 + Math.random() * 380 : 190 + Math.random() * 880) * S;
        }
        sparks.push({
          x: r.x, y: r.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, age: 0,
          life: r.type === 'willow' ? 2.1 + Math.random() * 1.2 : 1.25 + Math.random() * 1.1,
          col: r.fam[i % r.fam.length], tw: Math.random() * Math.PI * 2, willow: r.type === 'willow',
        });
      }
    };
    const DT = 1 / 120;
    const start = performance.now();
    let last = start; let acc = 0;
    const frame = (now: number) => {
      const elapsed = now - start;
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      const S = H / 800;
      while (acc >= DT) {
        for (const r of rockets) {
          if (r.burst || elapsed < r.launch) continue;
          r.vy += 640 * S * DT;
          r.x += r.vx * DT; r.y += r.vy * DT;
          if (r.vy >= -110 * S) { r.burst = true; burst(r); }
        }
        for (const s of sparks) {
          s.age += DT;
          s.vy += (s.willow ? 430 : 300) * S * DT;
          const drag = Math.exp(-(s.willow ? 0.7 : 1.0) * DT);
          s.vx *= drag; s.vy *= drag;
          s.x += s.vx * DT; s.y += s.vy * DT;
        }
        sparks = sparks.filter((s) => s.age < s.life);
        for (const f of flashes) f.age += DT;
        flashes = flashes.filter((f) => f.age < 0.3);
        acc -= DT;
      }
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flashes) {
        const a = 0.55 * (1 - f.age / 0.3);
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 190 * S);
        g.addColorStop(0, `rgba(255,240,200,${a})`);
        g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, 190 * S, 0, Math.PI * 2); ctx.fill();
      }
      for (const r of rockets) {
        if (r.burst || elapsed < r.launch) continue;
        const grad = ctx.createLinearGradient(r.x, r.y + 30 * S, r.x, r.y);
        grad.addColorStop(0, 'rgba(255,180,60,0)');
        grad.addColorStop(1, 'rgba(255,210,110,0.85)');
        ctx.strokeStyle = grad; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(r.x - r.vx * 0.03, r.y + 30 * S); ctx.lineTo(r.x, r.y); ctx.stroke();
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      for (const s of sparks) {
        const fade = 1 - s.age / s.life;
        const twinkle = s.willow ? 0.75 + 0.25 * Math.sin(s.age * 22 + s.tw) : 1;
        ctx.globalAlpha = Math.max(0, fade) * twinkle;
        ctx.strokeStyle = s.col;
        ctx.lineWidth = s.willow ? 3 : 3.4;
        ctx.beginPath(); ctx.moveTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      const pending = rockets.some((r) => !r.burst);
      if (pending || sparks.length > 0 || flashes.length > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => setup();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <div className={overlay}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
});

/* ---------- Snow ---------- */
export const SnowEffect: ComponentType<EffectProps> = memo(() => {
  const flakes = Array.from({ length: 70 });
  return (
    <div className={overlay}>
      {flakes.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 3;
        const dur = 5 + Math.random() * 5;
        const size = 8 + Math.random() * 14;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -20,
              fontSize: size,
              color: "white",
              textShadow: "0 0 6px rgba(255,255,255,0.8)",
              animation: `vfx-fall-sway ${dur}s linear ${delay}s forwards`,
            }}
          >
            ❄
          </span>
        );
      })}
    </div>
  );
});

/* ---------- Hearts ---------- */
export const HeartsEffect: ComponentType<EffectProps> = memo(() => {
  const hearts = Array.from({ length: 40 });
  return (
    <div className={overlay}>
      {hearts.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const dur = 3 + Math.random() * 2;
        const size = 16 + Math.random() * 20;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              bottom: -40,
              fontSize: size,
              animation: `vfx-float-up ${dur}s ease-in ${delay}s forwards`,
            }}
          >
            ❤️
          </span>
        );
      })}
    </div>
  );
});

/* ---------- Coins ---------- */
export const CoinsEffect: ComponentType<EffectProps> = memo(() => {
  const coins = Array.from({ length: 50 });
  return (
    <div className={overlay}>
      {coins.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.5;
        const dur = 2.2 + Math.random() * 1.8;
        const size = 18 + Math.random() * 14;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -40,
              fontSize: size,
              animation: `vfx-fall-spin ${dur}s linear ${delay}s forwards`,
            }}
          >
            🪙
          </span>
        );
      })}
    </div>
  );
});

/* ---------- Bubbles ---------- */
export const BubblesEffect: ComponentType<EffectProps> = memo(() => {
  const bubbles = Array.from({ length: 45 });
  return (
    <div className={overlay}>
      {bubbles.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const dur = 4 + Math.random() * 3;
        const size = 14 + Math.random() * 36;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              bottom: -60,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(120,200,255,0.25) 60%, rgba(80,150,220,0.1))",
              boxShadow: "inset 0 0 8px rgba(255,255,255,0.6)",
              animation: `vfx-float-up ${dur}s ease-in ${delay}s forwards`,
            }}
          />
        );
      })}
    </div>
  );
});

/* ---------- Sparkles ---------- */
export const SparklesEffect: ComponentType<EffectProps> = memo(() => {
  const sparkles = Array.from({ length: 80 });
  return (
    <div className={overlay}>
      {sparkles.map((_, i) => {
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const delay = Math.random() * 2.5;
        const dur = 1.2 + Math.random() * 1.4;
        const size = 6 + Math.random() * 10;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: "white",
              borderRadius: "50%",
              boxShadow: "0 0 8px #fff, 0 0 16px #fde047",
              animation: `vfx-twinkle ${dur}s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
});

/* ---------- Lightning ---------- */
export const LightningEffect: ComponentType<EffectProps> = memo(() => {
  const bolts = Array.from({ length: 6 });
  return (
    <div className={overlay}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "white",
          opacity: 0,
          animation: "vfx-flash 0.6s ease-out 0s 3",
        }}
      />
      {bolts.map((_, i) => {
        const left = rand(10, 90);
        const delay = i * 0.4 + Math.random() * 0.2;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: 0,
              fontSize: 80,
              color: "#fde047",
              textShadow: "0 0 16px #fbbf24, 0 0 32px #fde047",
              opacity: 0,
              animation: `vfx-twinkle 0.5s ease-out ${delay}s 2`,
            }}
          >
            ⚡
          </span>
        );
      })}
    </div>
  );
});

/* ---------- Registry ---------- */

export const VICTORY_EFFECT_KEYS = [
  "confetti",
  "fireworks",
  "falling_stars",
  "falling_roses",
  "snow",
  "hearts",
  "coins",
  "bubbles",
  "sparkles",
  "lightning",
] as const;

export type VictoryEffectKey = (typeof VICTORY_EFFECT_KEYS)[number];

export const VICTORY_EFFECTS: Record<VictoryEffectKey, ComponentType<EffectProps>> = {
  confetti: ConfettiEffect,
  fireworks: FireworksEffect,
  falling_stars: FallingStarsEffect,
  falling_roses: FallingRosesEffect,
  snow: SnowEffect,
  hearts: HeartsEffect,
  coins: CoinsEffect,
  bubbles: BubblesEffect,
  sparkles: SparklesEffect,
  lightning: LightningEffect,
};

export const VICTORY_EFFECT_LABELS: Record<VictoryEffectKey, string> = {
  confetti: "Confetti Cannon",
  fireworks: "Fireworks",
  falling_stars: "Falling Stars",
  falling_roses: "Falling Roses",
  snow: "Snow",
  hearts: "Floating Hearts",
  coins: "Coin Shower",
  bubbles: "Bubbles",
  sparkles: "Sparkles",
  lightning: "Lightning",
};

export function isVictoryEffectKey(v: unknown): v is VictoryEffectKey {
  return typeof v === "string" && (VICTORY_EFFECT_KEYS as readonly string[]).includes(v);
}
