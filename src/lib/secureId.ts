// Cryptographically-secure ID helpers. Use these instead of Math.random()
// for any value that gates access (game/session/player IDs, reentry codes).

function getRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  // crypto.getRandomValues is available in modern browsers and the Worker SSR runtime.
  crypto.getRandomValues(buf);
  return buf;
}

/** Random base36 string of `length` chars. */
export function secureShortId(length = 8): string {
  // Generate extra bytes then slice — base36 ≈ 5.17 bits/char, so byte→base36
  // produces ~1.5 chars per byte on average. Use 2× length to be safe.
  const bytes = getRandomBytes(length * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    out += bytes[i].toString(36);
  }
  return out.slice(0, length);
}

/** Random numeric code of `digits` length (e.g. 4-digit game / reentry codes). */
export function secureNumericCode(digits = 4): string {
  // Rejection-sample bytes to avoid modulo bias when mapping to 0..9.
  const out: string[] = [];
  while (out.length < digits) {
    const buf = getRandomBytes(digits * 2);
    for (let i = 0; i < buf.length && out.length < digits; i++) {
      const v = buf[i];
      if (v < 250) out.push(String(v % 10)); // 250 is a multiple of 10
    }
  }
  return out.join("");
}
