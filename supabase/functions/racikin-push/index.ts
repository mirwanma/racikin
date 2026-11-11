// Supabase Edge Function: racikin-push (pengingat via Web Push)
//
// POST { action: "key" }            -> { publicKey }        kunci VAPID publik (dibuat otomatis sekali)
// POST { action: "test", endpoint? } -> { sent }            kirim notifikasi tes ke perangkat user (wajib login)
// POST { action: "run" }            -> ringkasan             dipanggil pg_cron tiap 15 menit (header x-cron-token)
//
// Deploy dengan verify_jwt = false (pg_cron tidak membawa JWT user); akses dicek manual di sini.
import { sendPush, generateVapid, type Vapid, type PushSub } from "./webpush.ts";
import { dueNotifs, type Notif } from "./notif.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("RACIKIN_ALLOWED_ORIGIN") ?? "*";
const SUBJECT = "https://racikin.vercel.app";
const PUSH_HOST = /(^fcm\.googleapis\.com$|^jmt[0-9]+\.google\.com$|^android\.googleapis\.com$|\.push\.services\.mozilla\.com$|\.notify\.windows\.com$|^web\.push\.apple\.com$|\.push\.apple\.com$)/;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Akses database (service role) ----------
const svc = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`DB ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}
const rpc = (fn: string, args: unknown = {}) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

type Config = { vapid_public: string | null; vapid_private: JsonWebKey | null; cron_token: string };
let vapidCache: Vapid | null = null;

async function getVapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  let cfg = (await rpc("push_config_get")) as Config;
  if (!cfg.vapid_public) {
    const k = await generateVapid();
    cfg = (await rpc("push_config_set_vapid", { p_public: k.publicKey, p_private: k.privateJwk })) as Config;
  }
  vapidCache = { publicKey: cfg.vapid_public!, privateJwk: cfg.vapid_private!, subject: SUBJECT };
  return vapidCache;
}

async function userOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id && u.role === "authenticated" ? u.id : null;
}

type SubRow = PushSub & { user_id: string; tz: string; prefs: Record<string, unknown>; sent: Record<string, string> };

/** Kirim ke satu perangkat. Langganan yang sudah mati (404/410) dihapus. */
async function deliver(row: SubRow, n: Notif, vapid: Vapid): Promise<boolean> {
  if (!PUSH_HOST.test(new URL(row.endpoint).hostname)) return false;
  try {
    const status = await sendPush(row, { title: n.title, body: n.body, url: n.url, tag: n.kind }, vapid);
    if (status === 404 || status === 410) {
      await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, { method: "DELETE" });
      return false;
    }
    if (status >= 400) console.warn(JSON.stringify({ push: n.kind, status, host: new URL(row.endpoint).hostname }));
    return status < 300;
  } catch (err) {
    console.warn(JSON.stringify({ push: n.kind, error: String(err) }));
    return false;
  }
}

// ---------- Jadwal ----------
async function run() {
  const vapid = await getVapid();
  const subs = (await rest("push_subscriptions?select=endpoint,user_id,p256dh,auth,tz,prefs,sent")) as SubRow[];
  if (!subs.length) return { perangkat: 0, terkirim: 0 };

  // Dokumen usaha mana yang dipakai tiap user (pemilik sendiri, atau pemilik tempatnya bekerja).
  const users = [...new Set(subs.map((s) => s.user_id))];
  const members = (await rest(`team_members?select=owner_id,member_id,role&member_id=in.(${users.join(",")})`)) as { owner_id: string; member_id: string; role: string }[];
  const roleOf = new Map(users.map((u) => [u, { owner: u, role: "owner" }]));
  for (const m of members) roleOf.set(m.member_id, { owner: m.owner_id, role: m.role });
  const owners = [...new Set([...roleOf.values()].map((r) => r.owner))];
  const docs = (await rest(`user_data?select=user_id,data&user_id=in.(${owners.join(",")})`)) as { user_id: string; data: Record<string, unknown> }[];
  const docOf = new Map(docs.map((d) => [d.user_id, d.data]));

  const now = new Date();
  let terkirim = 0;
  for (const s of subs) {
    const r = roleOf.get(s.user_id)!;
    const doc = docOf.get(r.owner);
    if (!doc) continue;
    const due = dueNotifs(doc, { role: r.role, prefs: s.prefs, tz: s.tz, now, sent: s.sent || {} });
    if (!due.length) continue;
    const sent = { ...(s.sent || {}) };
    const tanggal = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(s.tz) }).format(now);
    for (const n of due) {
      if (await deliver(s, n, vapid)) terkirim++;
      sent[n.kind] = tanggal; // tandai walau gagal kirim, supaya tidak diulang tiap 15 menit
    }
    await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "PATCH", body: JSON.stringify({ sent }), headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  return { perangkat: subs.length, terkirim };
}

const safeTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Jakarta";
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: { action?: string; endpoint?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body harus JSON" }, 400);
  }

  try {
    if (body.action === "key") {
      return json({ publicKey: (await getVapid()).publicKey });
    }

    if (body.action === "test") {
      const uid = await userOf(req);
      if (!uid) return json({ error: "Login dulu ya." }, 401);
      let q = `push_subscriptions?select=endpoint,user_id,p256dh,auth,tz,prefs,sent&user_id=eq.${uid}`;
      if (body.endpoint) q += `&endpoint=eq.${encodeURIComponent(body.endpoint)}`;
      const rows = (await rest(q)) as SubRow[];
      if (!rows.length) return json({ error: "Perangkat ini belum terdaftar untuk pengingat." }, 404);
      // Batasi tes: maks. sekali per 30 detik per perangkat.
      const last = Date.parse(rows[0].sent?.test || "") || 0;
      if (Date.now() - last < 30_000) return json({ error: "Tunggu sebentar sebelum tes lagi ya." }, 429);
      const vapid = await getVapid();
      let sent = 0;
      for (const row of rows) {
        if (await deliver(row, { kind: "test", title: "Pengingat Racikin aktif", body: "Mantap! Nanti pengingat stok, jadwal posting & rekap kasir muncul seperti ini.", url: "#/notif" }, vapid)) sent++;
        await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, { method: "PATCH", body: JSON.stringify({ sent: { ...(row.sent || {}), test: new Date().toISOString() } }), headers: { Prefer: "return=minimal" } });
      }
      return json({ sent });
    }

    if (body.action === "run") {
      const cfg = (await rpc("push_config_get")) as Config;
      const token = req.headers.get("x-cron-token") ?? "";
      if (!cfg?.cron_token || token.length !== cfg.cron_token.length || token !== cfg.cron_token) return json({ error: "Forbidden" }, 403);
      const t0 = Date.now();
      const out = await run();
      console.log(JSON.stringify({ run: out, ms: Date.now() - t0 }));
      return json(out);
    }

    return json({ error: "Action tidak dikenal" }, 400);
  } catch (err) {
    console.error("racikin-push error", err);
    return json({ error: "Gagal memproses pengingat." }, 500);
  }
});
