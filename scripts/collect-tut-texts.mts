import { register } from "node:module";
register("./asset-hooks.mjs", import.meta.url);
const overlay = await import("../src/components/game/TutorialOverlay.tsx");
const voice = await import("../src/game/tutorialVoice.ts");
const texts = new Set<string>();
for (const t of overlay.INTRO_STEPS) texts.add(t);
texts.add(overlay.ALLDONE_TEXT);
for (let n = 0; n <= 5; n++) texts.add(overlay.topicsLine(n));
const mediaVariants = [
  { hasTouch: true, hasKeyboard: true },
  { hasTouch: true, hasKeyboard: false },
  { hasTouch: false, hasKeyboard: true },
  { hasTouch: false, hasKeyboard: false },
];
for (const topic of overlay.TUT_TOPICS) {
  for (const m of mediaVariants) {
    for (const s of overlay.buildSteps(topic.id, m)) texts.add(s.body);
  }
}
const list = [...texts];
const hashes = new Set(list.map((t) => voice.tutVoiceHash(t)));
console.log("unique texts:", list.length, "unique hashes:", hashes.size);
const odd = list.filter((t) => /[^\x20-\x7E]/.test(t));
console.log("texts with non-ascii chars:", odd.length);
for (const t of odd) console.log("  ODD:", JSON.stringify(t.slice(0, 90)));
console.log("total chars:", list.reduce((a, t) => a + t.length, 0));
