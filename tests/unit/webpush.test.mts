import crypto from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { encryptPayload, generateVapid, vapidAuth, b64url, unb64url } from "../../supabase/functions/racikin-push/webpush.ts";
const require = createRequire(import.meta.url);
const ece = require("http_ece");

// "Browser": kunci penerima
const ua = crypto.createECDH("prime256v1");
ua.generateKeys();
const authSecret = crypto.randomBytes(16);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64url(ua.getPublicKey()), auth: b64url(authSecret) };

for (const msg of ["halo", JSON.stringify({ title: "Stok menipis", body: "Tahu, Kecap & 3 lainnya — cek sekarang ya ✓", url: "#/stok" }), "x".repeat(3000)]) {
  const body = await encryptPayload(sub, new TextEncoder().encode(msg));
  const out = ece.decrypt(Buffer.from(body), { version: "aes128gcm", privateKey: ua, authSecret });
  assert.equal(out.toString("utf8"), msg);
}
console.log("payload decrypt OK (http_ece)");

// VAPID: tanda tangan valid dengan kunci publik
const v = await generateVapid();
assert.equal(unb64url(v.publicKey).length, 65);
const h = await vapidAuth(sub.endpoint, { ...v, subject: "https://racikin.vercel.app" });
const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
const pub = await crypto.webcrypto.subtle.importKey("raw", unb64url(m[4]), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
const ok = await crypto.webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
assert.ok(ok);
const claims = JSON.parse(Buffer.from(unb64url(m[2])).toString());
assert.equal(claims.aud, "https://fcm.googleapis.com");
assert.ok(claims.exp > Date.now() / 1000);
console.log("vapid OK", claims);
