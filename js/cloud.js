// Login (Supabase Auth, email + password) dan sinkronisasi data ke cloud.
//
// Model sinkron: satu dokumen JSON per user di tabel public.user_data.
// - Perubahan lokal ditandai "dirty" lalu di-upload (debounce).
// - Saat app dibuka / online lagi / tab aktif lagi: ambil versi cloud.
//   Kalau cloud lebih baru dan lokal tidak punya perubahan -> pakai cloud.
//   Kalau dua-duanya berubah -> user ditanya mau pakai yang mana.
import { store } from "./store.js";

export const SUPABASE_URL = "https://ujdxslztjcufidhqpmcd.supabase.co";
// Anon key memang publik; keamanan data dijaga oleh RLS di database.
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHhzbHp0amN1ZmlkaHFwbWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNjAzNjksImV4cCI6MjEwOTkzNjM2OX0.L14cm7bGefoezyhIy0Dbuk2yoF789XnWauEKLgkSlUI";

const META_KEY = "racikin:sync";
const PUSH_DELAY = 1500;

let client = null;
let pushTimer = null;
let pulling = false;
const listeners = new Set();

/** Status yang ditampilkan di UI. */
export const cloud = {
  available: false, // library Supabase termuat?
  user: null, // { id, email }
  status: "off", // off | syncing | synced | offline | error
  error: "",
  recovery: false, // sedang reset password (dari link email)
  quota: null, // { used_today, limit_day } dari panggilan AI terakhir
};

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {};
  } catch {
    return {};
  }
}
function writeMeta(patch) {
  const meta = { ...readMeta(), ...patch };
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage penuh / diblokir */
  }
  return meta;
}

function emit() {
  listeners.forEach((fn) => fn(cloud));
}
function setStatus(status, error = "") {
  cloud.status = status;
  cloud.error = error;
  emit();
}

export const onCloudChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const sb = () => client;

export async function accessToken() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

const hasBusinessData = (d) =>
  !!(d && (d.profile || d.idea || d.rab || d.brand || d.calendar || (d.transactions && d.transactions.length)));

// ---------- Sinkronisasi ----------
async function push() {
  clearTimeout(pushTimer);
  if (!cloud.user) return;
  if (!navigator.onLine) return setStatus("offline");
  setStatus("syncing");
  const { data, error } = await client
    .from("user_data")
    .upsert({ user_id: cloud.user.id, data: store.cloudData(), updated_at: new Date().toISOString() })
    .select("updated_at")
    .single();
  if (error) {
    console.error("Upload gagal", error);
    return setStatus("error", "Gagal menyimpan ke cloud. Nanti dicoba lagi.");
  }
  writeMeta({ userId: cloud.user.id, dirty: false, syncedAt: data.updated_at });
  setStatus("synced");
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, PUSH_DELAY);
}

const fmtTime = (iso) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ambil versi cloud dan rekonsiliasi dengan data lokal. */
export async function pull() {
  if (!cloud.user || pulling) return;
  if (!navigator.onLine) return setStatus("offline");
  pulling = true;
  setStatus("syncing");
  try {
    const { data: row, error } = await client.from("user_data").select("data, updated_at").eq("user_id", cloud.user.id).maybeSingle();
    if (error) throw error;
    const meta = readMeta();
    const local = store.cloudData();
    const sameUser = meta.userId === cloud.user.id;

    if (!row) {
      // Belum ada data di cloud: upload data lokal (kalau ada).
      if (hasBusinessData(local)) await push();
      else setStatus("synced");
      return;
    }

    const localDirty = !sameUser ? hasBusinessData(local) : !!meta.dirty;
    const cloudNewer = !sameUser || !meta.syncedAt || new Date(row.updated_at) > new Date(meta.syncedAt);

    if (cloudNewer && localDirty && hasBusinessData(row.data)) {
      const useCloud = confirm(
        `Data kamu di cloud (terakhir disimpan ${fmtTime(row.updated_at)}) beda dengan data di perangkat ini.\n\n` +
          `OK = pakai data CLOUD\nBatal = pakai data di PERANGKAT INI (cloud ditimpa)`,
      );
      if (useCloud) {
        store.applyCloud(row.data);
        writeMeta({ userId: cloud.user.id, dirty: false, syncedAt: row.updated_at });
        setStatus("synced");
      } else {
        await push();
      }
    } else if (cloudNewer) {
      store.applyCloud(row.data);
      writeMeta({ userId: cloud.user.id, dirty: false, syncedAt: row.updated_at });
      setStatus("synced");
    } else if (localDirty) {
      await push();
    } else {
      setStatus("synced");
    }
  } catch (err) {
    console.error("Sinkron gagal", err);
    setStatus("error", "Gagal sinkron dengan cloud.");
  } finally {
    pulling = false;
  }
}

export const syncNow = () => pull();

// ---------- Auth ----------
const redirectUrl = () => location.origin + location.pathname;

function translateError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Email atau password salah.";
  if (m.includes("email not confirmed")) return "Email belum dikonfirmasi. Cek inbox (dan folder spam) ya.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Email ini sudah terdaftar. Coba masuk.";
  if (m.includes("password should be")) return "Password minimal 6 karakter.";
  if (m.includes("rate limit") || m.includes("too many")) return "Terlalu banyak percobaan. Tunggu beberapa menit ya.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Nggak ada koneksi internet.";
  return error?.message || "Terjadi kesalahan.";
}

function need() {
  if (!client) throw new Error("Fitur akun belum siap (library gagal dimuat). Cek koneksi lalu muat ulang.");
}

export async function signUp(email, password) {
  need();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(translateError(error));
  // Supabase tidak membocorkan email yang sudah terdaftar: identities kosong = sudah ada.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error("Email ini sudah terdaftar. Coba masuk.");
  }
  return { needsConfirm: !data.session };
}

export async function signIn(email, password) {
  need();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateError(error));
}

export async function sendReset(email) {
  need();
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw new Error(translateError(error));
}

export async function setNewPassword(password) {
  need();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error(translateError(error));
  cloud.recovery = false;
  emit();
}

export async function signOut({ clearLocal = false } = {}) {
  need();
  if (readMeta().dirty) await push(); // jangan sampai perubahan terakhir hilang
  await client.auth.signOut();
  writeMeta({ userId: null, dirty: false, syncedAt: null });
  if (clearLocal) store.clearLocal();
}

// ---------- Init ----------
export function initCloud() {
  if (!window.supabase?.createClient) {
    console.warn("Supabase library tidak termuat; fitur akun nonaktif.");
    return;
  }
  cloud.available = true;
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  client.auth.onAuthStateChange((event, session) => {
    const prev = cloud.user?.id;
    cloud.user = session?.user ? { id: session.user.id, email: session.user.email } : null;
    if (event === "PASSWORD_RECOVERY") {
      cloud.recovery = true;
      location.hash = "#/akun";
    }
    if (!cloud.user) {
      clearTimeout(pushTimer);
      setStatus("off");
    } else if (cloud.user.id !== prev) {
      // Jangan panggil API Supabase langsung di dalam callback ini (bisa deadlock).
      setTimeout(pull, 0);
    }
    emit();
    // Bersihkan ?code=... dari URL setelah login lewat link email.
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  });

  // Tandai perubahan lokal & jadwalkan upload.
  store.subscribe((_state, source) => {
    if (source !== "local" || !cloud.user) return;
    writeMeta({ userId: cloud.user.id, dirty: true });
    schedulePush();
  });

  window.addEventListener("online", () => cloud.user && pull());
  window.addEventListener("offline", () => cloud.user && setStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (!cloud.user) return;
    if (document.visibilityState === "visible") pull();
    else if (readMeta().dirty) push(); // simpan sebelum app ditutup / pindah tab
  });
}
