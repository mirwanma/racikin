// Pengingat lewat Web Push: daftar/berhenti di perangkat ini, simpan preferensi, kirim tes.
import { SUPABASE_URL, SUPABASE_ANON_KEY, sb, cloud, accessToken } from "./cloud.js";

const FN = `${SUPABASE_URL}/functions/v1/racikin-push`;
export const DEFAULT_PREFS = { konten: true, stok: true, ajak: true, rekap: true, pagi: 8, malam: 21 };

const ua = () => navigator.userAgent || "";
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (ua().includes("Mac") && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

/** Status dukungan browser: ok | ios-install | unsupported */
export function support() {
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-install"; // iPhone: push hanya untuk app yang di-"Add to Home Screen"
  return ok ? "ok" : "unsupported";
}
export const permission = () => (typeof Notification === "undefined" ? "default" : Notification.permission);

async function call(action, extra = {}, auth = false) {
  const headers = { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY };
  if (auth) {
    const t = await accessToken();
    if (!t) throw new Error("Login dulu ya.");
    headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(FN, { method: "POST", headers, body: JSON.stringify({ action, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Gagal menghubungi server pengingat.");
  return data;
}

const toKey = (b64) => {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("./sw.js"));
  await navigator.serviceWorker.ready;
  return reg;
}

/** Langganan push di perangkat ini (null kalau belum). */
export async function currentSub() {
  if (support() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Baris langganan perangkat ini di server (prefs), null kalau belum terdaftar. */
export async function serverRow(sub) {
  if (!sub || !cloud.user) return null;
  const { data, error } = await sb().from("push_subscriptions").select("prefs, tz, updated_at").eq("endpoint", sub.endpoint).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function save(sub, prefs) {
  const j = sub.toJSON();
  const { error } = await sb().rpc("push_subscribe", {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh || b64(sub.getKey("p256dh")),
    p_auth: j.keys?.auth || b64(sub.getKey("auth")),
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
    p_prefs: prefs,
  });
  if (error) throw new Error(error.message);
}

/** Nyalakan pengingat di perangkat ini. */
export async function enable(prefs = DEFAULT_PREFS) {
  if (!cloud.user) throw new Error("Login dulu supaya pengingat bisa dikirim ke HP ini.");
  if (support() === "ios-install") throw new Error("Di iPhone, tambahkan Racikin ke Layar Utama dulu (Share > Add to Home Screen), lalu buka dari ikon itu.");
  if (support() !== "ok") throw new Error("Browser ini belum mendukung notifikasi. Coba Chrome / Firefox / Safari terbaru.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Izin notifikasi ditolak. Buka setelan situs di browser untuk mengizinkan.");
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await call("key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  }
  await save(sub, prefs);
  return sub;
}

/** Simpan preferensi (perangkat harus sudah terdaftar). */
export async function updatePrefs(prefs) {
  const sub = await currentSub();
  if (!sub) throw new Error("Pengingat belum aktif di perangkat ini.");
  await save(sub, prefs);
}

/** Matikan pengingat di perangkat ini. */
export async function disable() {
  const sub = await currentSub();
  if (!sub) return;
  if (cloud.user) await sb().rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function sendTest() {
  const sub = await currentSub();
  return call("test", { endpoint: sub?.endpoint }, true);
}
