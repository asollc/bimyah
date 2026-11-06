/* Web Push sender for Cloudflare Workers (WebCrypto only, no Node deps).
   Implements VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
   Verified against the RFC 8291 section 5 example vector. */

export type PushSubscriptionKeys = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const te = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", salt as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ikm as BufferSource));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", prk as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let off = 0;
  let counter = 1;
  while (off < length) {
    prev = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, concat(prev, info, new Uint8Array([counter])) as BufferSource),
    );
    out.set(prev.subarray(0, Math.min(prev.length, length - off)), off);
    off += prev.length;
    counter++;
  }
  return out;
}

/** Encrypt a payload for one subscription per RFC 8291 (aes128gcm). */
export async function encryptPayload(
  sub: PushSubscriptionKeys,
  plaintext: string,
  opts?: { salt?: Uint8Array; localKeyPair?: CryptoKeyPair; localPublic?: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.keys.p256dh);
  const authSecret = b64urlToBytes(sub.keys.auth);

  const localKeyPair =
    opts?.localKeyPair ??
    (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const localPublic =
    opts?.localPublic ??
    new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, localKeyPair.privateKey, 256),
  );

  const salt = opts?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 section 3.4 key derivation.
  const prkKey = await hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, localPublic);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, te.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  // Single record: payload bytes + 0x02 (final record delimiter).
  const padded = concat(te.encode(plaintext), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, padded as BufferSource),
  );

  // Header: salt(16) || rs(4, big-endian 4096) || idlen(1) || keyid (sender pub).
  const header = concat(
    salt,
    new Uint8Array([0, 0, 0x10, 0x00]),
    new Uint8Array([localPublic.length]),
    localPublic,
  );
  return concat(header, ciphertext);
}

async function vapidJwt(endpoint: string, subject: string, privateJwk: JsonWebKey): Promise<{ jwt: string; publicKey: string }> {
  const aud = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const enc = (o: unknown) => bytesToB64url(te.encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(claims)}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    te.encode(signingInput) as BufferSource,
  );
  const pubBytes = concat(
    new Uint8Array([0x04]),
    b64urlToBytes(String(privateJwk.x)),
    b64urlToBytes(String(privateJwk.y)),
  );
  return { jwt: `${signingInput}.${bytesToB64url(sig)}`, publicKey: bytesToB64url(pubBytes) };
}

export type SendResult = "sent" | "expired" | "failed";
export type SendOutcome = { outcome: SendResult; status: number | null };

/** Send one push. 404/410 from the push service means the subscription is
    gone. The HTTP status rides along: when a send fails, the status is the
    difference between guessing and knowing (403 = key trouble, 404/410 =
    the registration is gone). */
export async function sendPush(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: { privateJwk: JsonWebKey; subject: string },
): Promise<SendOutcome> {
  try {
    const body = await encryptPayload(sub, payload);
    const { jwt, publicKey } = await vapidJwt(sub.endpoint, vapid.subject, vapid.privateJwk);
    const resp = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        // High urgency: FCM wakes a dozing phone for high-priority web
        // pushes. "normal" messages are deferred by Android Doze and
        // only flush when the device wakes or the app is opened, which
        // made every alert look like it only arrived in-app (Ronya,
        // 2026-10-21). All Bimyah alerts are time-sensitive (game
        // invites expire with the lobby), so high is correct here.
        Urgency: "high",
      },
      body: body as BodyInit,
    });
    if (resp.status === 404 || resp.status === 410) return { outcome: "expired", status: resp.status };
    if (resp.status >= 200 && resp.status < 300) return { outcome: "sent", status: resp.status };
    return { outcome: "failed", status: resp.status };
  } catch {
    return { outcome: "failed", status: null };
  }
}
