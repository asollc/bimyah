/**
 * Tutorial voice clips (Ronya 2026-11-18): every tutorial card text is
 * pre-rendered to an MP3 named by the FNV-1a hash of its exact text and
 * served from /tutorial-voice/. The generator script
 * (scripts/gen-tutorial-voice.mts) uses this same hash, so editing a
 * card's text produces a new clip name and orphans the old clip.
 */
export function tutVoiceHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The spoken form of a card text: paragraph breaks and bullet markers
 * are layout, not speech. The clip for a card is generated from (and
 * named by) this normalized form.
 */
export function tutSpokenText(raw: string): string {
  return raw
    .replace(/\n+/g, " ")
    .replace(/•\s*/g, "")
    /* Pronunciation (Ronya 2026-11-18): the voice reads the plain
     * spelling as "Bimeyah", but says BIM-yah when the name carries
     * its plus, so the spoken form respells it "Bim-yah" (verified by
     * transcription in every card context). The product name keeps
     * its plus as a spoken word: "Bim-yah!+" rendered with the symbol
     * swallows the plus entirely, so it is spelled out. */
    .replace(/bimyah!\+/gi, "Bim-yah plus")
    .replace(/bimyah\+/gi, "Bim-yah plus")
    .replace(/bimyah/gi, "Bim-yah")
    .replace(/\s+/g, " ")
    .trim();
}

export function tutVoiceUrl(text: string): string {
  return `/tutorial-voice/${tutVoiceHash(tutSpokenText(text))}.mp3`;
}
