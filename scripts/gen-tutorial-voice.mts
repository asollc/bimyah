/**
 * Generates the Guided Tutorial's voice clips (Gigi's voice, Aria)
 * into public/tutorial-voice/, one MP3 per unique card text, named by
 * the FNV-1a hash of the text's spoken form (see src/game/tutorialVoice.ts).
 * Idempotent: clips that already exist are skipped, so re-run after
 * editing any tutorial text and only the changed cards regenerate.
 *
 * Run from the repo root: ./node_modules/.bin/tsx scripts/gen-tutorial-voice.mts
 */
import { register } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";

register("./asset-hooks.mjs", import.meta.url);
const overlay = await import("../src/components/game/TutorialOverlay.tsx");
const voice = await import("../src/game/tutorialVoice.ts");

const VOICE_ID = "avocado_v2:MAI_01"; // Aria, Gigi's voice (Ronya's pick)
const OUT_DIR = path.resolve("public/tutorial-voice");
mkdirSync(OUT_DIR, { recursive: true });

const rawTexts = new Set<string>();
for (const t of overlay.INTRO_STEPS) rawTexts.add(t);
rawTexts.add(overlay.ALLDONE_TEXT);
for (let n = 0; n <= 5; n++) rawTexts.add(overlay.topicsLine(n));
const mediaVariants = [
  { hasTouch: true, hasKeyboard: true },
  { hasTouch: true, hasKeyboard: false },
  { hasTouch: false, hasKeyboard: true },
  { hasTouch: false, hasKeyboard: false },
];
for (const topic of overlay.TUT_TOPICS) {
  for (const m of mediaVariants) {
    for (const s of overlay.buildSteps(topic.id, m)) rawTexts.add(s.body);
  }
}

const byHash = new Map<string, string>();
for (const raw of rawTexts) {
  const spoken = voice.tutSpokenText(raw);
  const hash = voice.tutVoiceHash(spoken);
  if (byHash.has(hash) && byHash.get(hash) !== spoken) {
    throw new Error(`hash collision on ${hash}`);
  }
  byHash.set(hash, spoken);
}
console.log(`unique clips: ${byHash.size}`);

let made = 0;
let skipped = 0;
for (const [hash, spoken] of byHash) {
  const out = path.join(OUT_DIR, `${hash}.mp3`);
  if (existsSync(out)) {
    skipped++;
    continue;
  }
  const res = execFileSync(
    "/opt/hatch/bin/tts",
    ["speak", "--voice", VOICE_ID, "--output", out, "--text-stdin"],
    { input: spoken, encoding: "utf8" },
  );
  const parsed = JSON.parse(res) as { ok?: boolean; voice?: string; bytes?: number };
  if (!parsed.ok) throw new Error(`tts failed for ${hash}: ${res}`);
  console.log(`made ${hash}.mp3 voice=${parsed.voice} bytes=${parsed.bytes} :: ${spoken.slice(0, 60)}...`);
  made++;
}
/* Prune clips no current card text points at (e.g. after a text edit
 * changed a hash), so stale audio never ships. */
let pruned = 0;
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith(".mp3") && !byHash.has(f.replace(/\.mp3$/, ""))) {
    unlinkSync(path.join(OUT_DIR, f));
    pruned++;
  }
}
console.log(`done: ${made} generated, ${skipped} already present, ${pruned} orphans pruned`);
