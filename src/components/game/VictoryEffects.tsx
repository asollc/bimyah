import type { FC } from "react";

/**
 * Library of full-viewport animated victory effects. Each component renders
 * a `pointer-events-none fixed inset-0 z-50` overlay using CSS keyframes
 * (declared in src/styles.css). They are intentionally dependency-free so
 * admins can add new presets by appending to `VICTORY_EFFECTS` below.
 */

type EffectProps = Record<string, never>;

const overlay = "pointer-events-none fixed inset-0 z-50 overflow-hidden";

/* ---------- helpers ---------- */
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/* ---------- Confetti ---------- */
export const ConfettiEffect: FC<EffectProps> = () => {
  const pieces = Array.from({ length: 90 });
  const colors = ["#2dd4a8", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa", "#34d399"];
  return (
    <div className={overlay}>
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.2;
        const dur = 2 + Math.random() * 2;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 8;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -20,
              width: size,
              height: size * 0.5,
              background: color,
              borderRadius: 2,
              animation: `confetti-fall ${dur}s linear ${delay}s forwards`,
            }}
          />
        );
      })}
    </div>
  );
};

/* ---------- Falling Stars ---------- */
export const FallingStarsEffect: FC<EffectProps> = () => {
  const stars = Array.from({ length: 50 });
  return (
    <div className={overlay}>
      {stars.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const dur = 2.5 + Math.random() * 2.5;
        const size = 12 + Math.random() * 22;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -40,
              fontSize: size,
              color: "#fde047",
              textShadow: "0 0 10px #fbbf24, 0 0 20px #fde047",
              animation: `vfx-fall-spin ${dur}s linear ${delay}s forwards`,
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
};

/* ---------- Falling Roses ---------- */
export const FallingRosesEffect: FC<EffectProps> = () => {
  const roses = Array.from({ length: 40 });
  return (
    <div className={overlay}>
      {roses.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 2;
        const dur = 3 + Math.random() * 3;
        const size = 18 + Math.random() * 18;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: -40,
              fontSize: size,
              animation: `vfx-fall-sway ${dur}s linear ${delay}s forwards`,
            }}
          >
            🌹
          </span>
        );
      })}
    </div>
  );
};

/* ---------- Fireworks ---------- */
export const FireworksEffect: FC<EffectProps> = () => {
  const bursts = Array.from({ length: 8 });
  const colors = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];
  return (
    <div className={overlay}>
      {bursts.map((_, b) => {
        const cx = rand(10, 90);
        const cy = rand(15, 60);
        const delay = b * 0.35 + Math.random() * 0.3;
        const color = colors[b % colors.length];
        const particles = 22;
        return (
          <div
            key={b}
            style={{
              position: "absolute",
              left: `${cx}%`,
              top: `${cy}%`,
              width: 0,
              height: 0,
            }}
          >
            {Array.from({ length: particles }).map((__, p) => {
              const angle = (p / particles) * Math.PI * 2;
              const dist = 80 + Math.random() * 60;
              const dx = Math.cos(angle) * dist;
              const dy = Math.sin(angle) * dist;
              return (
                <span
                  key={p}
                  style={
                    {
                      position: "absolute",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
                      ["--dx" as string]: `${dx}px`,
                      ["--dy" as string]: `${dy}px`,
                      animation: `vfx-burst 1.4s ease-out ${delay}s forwards`,
                      opacity: 0,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/* ---------- Snow ---------- */
export const SnowEffect: FC<EffectProps> = () => {
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
};

/* ---------- Hearts ---------- */
export const HeartsEffect: FC<EffectProps> = () => {
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
};

/* ---------- Coins ---------- */
export const CoinsEffect: FC<EffectProps> = () => {
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
};

/* ---------- Bubbles ---------- */
export const BubblesEffect: FC<EffectProps> = () => {
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
};

/* ---------- Sparkles ---------- */
export const SparklesEffect: FC<EffectProps> = () => {
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
};

/* ---------- Lightning ---------- */
export const LightningEffect: FC<EffectProps> = () => {
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
};

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

export const VICTORY_EFFECTS: Record<VictoryEffectKey, FC<EffectProps>> = {
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
