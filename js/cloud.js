// Login (Supabase Auth, email + password), sinkronisasi data ke cloud, dan mode tim.
//
// Model sinkron: satu dokumen JSON per USAHA (milik pemilik) di tabel public.user_data,
// dibaca/ditulis lewat fungsi doc_get / doc_save yang memeriksa peran (pemilik/manajer/kasir).
// - Tiap dokumen punya nomor versi (rev). Perangkat menyimpan salinan versi terakhir yang
//   disinkron (base). Saat sinkron: data lokal + cloud digabung otomatis (3-way merge),
//   lalu disimpan dengan syarat rev belum berubah. Kalau keduluan perangkat lain -> gabung ulang.
// - Jadi beberapa HP (pemilik + kasir) bisa jualan bersamaan tanpa saling menimpa.
import { store } from "./store.js";
import { cardData } from "./loyalty.js";
import { mergeDocs, omit, norm, same } from "./merge.js";
import { reconcile } from "./pos.js";

export const SUPABASE_URL = "https://ujdxslztjcufidhqpmcd.supabase.co";
// Anon key memang publik; keamanan data dijaga oleh RLS di database.
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHhzbHp0amN1ZmlkaHFwbWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNjAzNjksImV4cCI6MjEwOTkzNjM2OX0.L14cm7bGefoezyhIy0Dbuk2yoF789XnWauEKLgkSlUI";

const META_KEY = "racikin:sync";
const BASE_KEY = "racikin:base";
const PUSH_DELAY = 1500;
const POLL_MS = 30000; // tarik data tiap 30 detik kalau ada tim (biar stok & order antar HP selalu baru)
// Bagian dokumen yang tidak dikirim server ke kasir (sama dengan doc_kasir_hidden di database).
export const KASIR_HIDDEN = ["transactions", "insight", "idea", "rab", "bep", "activation", "calendar", "chat"];

let client = null;
let pushTimer = null;
let syncing = null; // Promise sinkron yang sedang jalan
let again = false; // ada permintaan sinkron baru saat sinkron berjalan
let teamLoadedAt = 0;
const listeners = new Set();

/** Status yang ditampilkan di UI. */
export const cloud = {
  available: false, // library Supabase termuat?
  user: null, // { id, email }
  status: "off", // off | syncing | synced | offline | error
  error: "",
  recovery: false, // sedang reset password (dari link email)
  quota: null, // { used_today, limit_day } dari panggilan AI terakhir
  team: null, // { ownerId, role: owner|manajer|kasir, nama, bisnis, anggota }
};

/** Peran user di perangkat ini. Belum login = pemilik (pakai sendiri). */
export const role = () => cloud.team?.role || "owner";
export const isKasir = () => role() === "kasir";
export const isMember = () => role() !== "owner";
/** Ada orang lain yang ikut memakai data usaha ini? */
export const teamActive = () => !!cloud.team && (cloud.team.role !== "owner" || cloud.team.anggota > 0);
/** Siapa yang mencatat (untuk order kasir). */
export const pelaku = () =>
  cloud.user && cloud.team ? { id: cloud.user.id, nama: cloud.team.role === "owner" ? "Pemilik" : cloud.team.nama } : null;

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, val) {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    try {
      localStorage.removeItem(key); // penuh: lebih baik tanpa base daripada base basi
    } catch {
      /* abaikan */
    }
    return false;
  }
}
const readMeta = () => readJSON(META_KEY, {});
const writeMeta = (patch) => writeJSON(META_KEY, { ...readMeta(), ...patch });
const readBase = () => readJSON(BASE_KEY, null);
const writeBase = (doc) => writeJSON(BASE_KEY, doc);

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
  !!(d && (d.profile || d.idea || d.rab || d.brand || d.calendar || (d.transactions && d.transactions.length) || (d.orders && d.orders.length)));

async function rpc(fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

// ---------- Tim ----------
export async function loadTeam() {
  if (!cloud.user) return (cloud.team = null);
  const t = await rpc("my_team");
  cloud.team = { ownerId: t.owner_id, role: t.role, nama: t.nama || "", bisnis: t.bisnis || "", anggota: Number(t.anggota) || 0 };
  teamLoadedAt = Date.now();
  emit();
  return cloud.team;
}

/** Ganti dokumen yang dipakai perangkat ini (gabung/keluar tim): data lokal dikosongkan dulu. */
function resetDoc() {
  store.clearLocal();
  writeBase(null);
  writeMeta({ docOwner: null, rev: 0, dirty: false, syncedAt: null });
}

export async function createInvite(peran, nama) {
  return rpc("create_invite", { p_role: peran, p_nama: nama });
}
export async function listTeam() {
  return rpc("team_list");
}
export async function listInvites() {
  const { data, error } = await client.from("team_invites").select("code, role, nama, expires_at").gt("expires_at", new Date().toISOString()).order("created_at");
  if (error) throw new Error(error.message);
  return data;
}
export async function cancelInvite(code) {
  const { error } = await client.from("team_invites").delete().eq("code", code);
  if (error) throw new Error(error.message);
}
export async function removeMember(memberId) {
  const { error } = await client.from("team_members").delete().eq("owner_id", cloud.user.id).eq("member_id", memberId);
  if (error) throw new Error(error.message);
  await loadTeam();
}
export async function setMemberRole(memberId, peran) {
  const { error } = await client.from("team_members").update({ role: peran }).eq("owner_id", cloud.user.id).eq("member_id", memberId);
  if (error) throw new Error(error.message);
}

/** Gabung ke tim pakai kode. Data usaha sendiri tetap aman di cloud (akun sendiri). */
export async function joinTeam(code) {
  need();
  if (readMeta().dirty) await sync(); // simpan dulu perubahan data usaha sendiri
  const t = await rpc("join_team", { p_code: code });
  cloud.team = { ownerId: t.owner_id, role: t.role, nama: t.nama || "", bisnis: t.bisnis || "", anggota: 0 };
  teamLoadedAt = Date.now();
  resetDoc();
  emit();
  await sync();
  return cloud.team;
}

/** Keluar dari tim: perangkat kembali memakai data usaha milik akun sendiri. */
export async function leaveTeam() {
  need();
  if (readMeta().dirty) await sync();
  const { error } = await client.from("team_members").delete().eq("member_id", cloud.user.id);
  if (error) throw new Error(error.message);
  resetDoc();
  await loadTeam();
  await sync();
}

// ---------- Sinkronisasi ----------
const fmtTime = (iso) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Satu putaran sinkron: tarik, gabung, simpan. Return true kalau selesai. */
async function syncOnce() {
  if (!cloud.team || Date.now() - teamLoadedAt > 120000) await loadTeam();
  const owner = cloud.team.ownerId;
  const kasir = cloud.team.role === "kasir";
  let meta = readMeta();

  // Perangkat ini sebelumnya memegang data usaha lain (mis. dikeluarkan dari tim) -> kosongkan.
  if (meta.docOwner && meta.docOwner !== owner) {
    resetDoc();
    meta = readMeta();
  }

  let remote;
  try {
    remote = await rpc("doc_get", { p_owner: owner });
  } catch (err) {
    if (err.code === "42501") {
      // Akses dicabut / peran berubah: muat ulang info tim lalu ulangi.
      await loadTeam();
      return false;
    }
    throw err;
  }
  // Data lokal dibaca SETELAH data cloud diterima; dari sini sampai applyCloud tidak ada `await`,
  // jadi perubahan lokal tidak mungkin terselip di antaranya.
  const fullLocal = store.cloudData();
  const local = kasir ? omit(fullLocal, KASIR_HIDDEN) : fullLocal;
  const remoteData = remote?.data || null;
  const remoteRev = remote?.rev ?? 0;

  let base = meta.docOwner === owner ? readBase() : null;
  let merged;
  if (!remoteData) {
    if (kasir || cloud.team.role !== "owner") return true; // dokumen pemilik belum ada; tunggu
    if (!hasBusinessData(local)) return true; // belum ada data usaha: tidak perlu bikin dokumen kosong
    merged = local;
  } else if (!base) {
    const sameDoc = meta.docOwner === owner || (!meta.docOwner && meta.userId === cloud.user.id && cloud.team.role === "owner");
    if (sameDoc) {
      base = remoteData; // perangkat ini memang sudah memegang dokumen ini (data lama): perubahan lokal dipertahankan
    } else if (cloud.team.role === "owner" && hasBusinessData(local) && hasBusinessData(remoteData)) {
      const useCloud = confirm(
        `Data kamu di cloud (terakhir disimpan ${fmtTime(remote.updated_at)}) beda dengan data di perangkat ini.\n\n` +
          `OK = pakai data CLOUD\nBatal = pakai data di PERANGKAT INI (cloud ditimpa)`,
      );
      base = remoteData;
      if (useCloud) merged = remoteData;
    } else if (cloud.team.role === "owner" && hasBusinessData(local)) {
      base = remoteData; // cloud kosong: data lokal yang dipakai
    } else {
      merged = remoteData;
    }
    merged = merged || mergeDocs(base, local, remoteData);
  } else if (remoteRev === meta.rev) {
    merged = local; // cloud tidak berubah sejak sinkron terakhir
  } else {
    merged = mergeDocs(base, local, remoteData);
  }

  // Total kasir & Kas selalu dihitung ulang dari daftar order hasil gabungan.
  merged = norm(reconcile(merged, { kas: !kasir }));

  // Terapkan ke perangkat ini (tanpa memicu upload ulang).
  if (!same(merged, norm(local))) {
    store.applyCloud(kasir ? { ...fullLocal, ...merged } : merged);
  }
  const applied = store.get();
  if (remoteData) {
    // merged sudah memuat isi cloud versi ini -> base = versi cloud ini.
    writeBase(remoteData);
    writeMeta({ userId: cloud.user.id, docOwner: owner, rev: remoteRev });
  }

  if (!remoteData || !same(merged, remoteData)) {
    const res = await rpc("doc_save", { p_owner: owner, p_data: merged, p_base_rev: remoteRev });
    if (!res.ok) return false; // keduluan perangkat lain: gabung ulang
    writeBase(merged);
    writeMeta({ userId: cloud.user.id, docOwner: owner, rev: res.rev, syncedAt: res.updated_at });
  } else {
    writeMeta({ syncedAt: remote.updated_at });
  }
  if (store.get() === applied) writeMeta({ dirty: false });
  return true;
}

/** Sinkron sekarang (tarik + gabung + simpan). Aman dipanggil berkali-kali. */
export function sync() {
  clearTimeout(pushTimer);
  if (!cloud.user || !client) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    if (!navigator.onLine) return setStatus("offline");
    setStatus("syncing");
    try {
      let done = false;
      for (let i = 0; i < 5 && !done; i++) done = await syncOnce();
      if (!done) throw new Error("Data berubah terus, dicoba lagi sebentar lagi");
      setStatus("synced");
    } catch (err) {
      console.error("Sinkron gagal", err);
      setStatus("error", "Gagal sinkron dengan cloud. Nanti dicoba lagi.");
      schedulePush(15000);
    } finally {
      syncing = null;
      if (again) {
        again = false;
        schedulePush(300);
      } else if (readMeta().dirty) {
        schedulePush();
      }
    }
  })();
  return syncing;
}

function schedulePush(ms = PUSH_DELAY) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(sync, ms);
}

export const pull = () => sync();
export const syncNow = () => sync();

// ---------- Kartu stempel publik ----------
// Salinan kartu tiap pelanggan di tabel stamp_cards supaya bisa dibuka pelanggan lewat link.
const CARDS_KEY = "racikin:cards";
let cardTimer = null;

function readCards() {
  try {
    return JSON.parse(localStorage.getItem(CARDS_KEY)) || { dirty: [], hapus: [] };
  } catch {
    return { dirty: [], hapus: [] };
  }
}
function writeCards(c) {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(c));
  } catch {
    /* abaikan */
  }
}

/** Tandai kartu pelanggan perlu di-upload (ids) dan/atau dihapus (tokens). */
export function markCards({ ids = [], hapus = [] } = {}) {
  const c = readCards();
  c.dirty = [...new Set([...c.dirty, ...ids])];
  c.hapus = [...new Set([...c.hapus, ...hapus])];
  writeCards(c);
  clearTimeout(cardTimer);
  cardTimer = setTimeout(flushCards, 800);
}

/** Upload kartu yang ditandai. Return true kalau semua beres. */
export async function flushCards() {
  clearTimeout(cardTimer);
  const c = readCards();
  if (!cloud.user || !navigator.onLine || (!c.dirty.length && !c.hapus.length)) return !c.dirty.length && !c.hapus.length;
  const s = store.get();
  const rows = s.pelanggan
    .filter((p) => c.dirty.includes(p.id) && p.token)
    .map((p) => ({ token: p.token, owner_id: cloud.team?.ownerId || cloud.user.id, data: cardData(s, p), updated_at: new Date().toISOString() }));
  try {
    if (rows.length) {
      const { error } = await client.from("stamp_cards").upsert(rows);
      if (error) throw error;
    }
    if (c.hapus.length) {
      const { error } = await client.from("stamp_cards").delete().in("token", c.hapus);
      if (error) throw error;
    }
    writeCards({ dirty: [], hapus: [] });
    return true;
  } catch (err) {
    console.error("Upload kartu gagal", err);
    return false;
  }
}

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
  if (readMeta().dirty) await sync(); // jangan sampai perubahan terakhir hilang
  const member = isMember();
  await client.auth.signOut();
  // Data usaha milik orang lain (anggota tim) tidak ditinggal di perangkat.
  if (clearLocal || member) {
    store.clearLocal();
    writeBase(null);
    writeMeta({ userId: null, docOwner: null, rev: 0, dirty: false, syncedAt: null });
  } else {
    // Data tetap di perangkat; info versi disimpan supaya saat masuk lagi bisa digabung otomatis.
    writeMeta({ dirty: false });
  }
  cloud.team = null;
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
      cloud.team = null;
      setStatus("off");
    } else if (cloud.user.id !== prev) {
      cloud.team = null;
      // Jangan panggil API Supabase langsung di dalam callback ini (bisa deadlock).
      setTimeout(async () => {
        await sync();
        const kode = sessionStorage.getItem("racikin:gabung");
        if (kode) {
          sessionStorage.removeItem("racikin:gabung");
          location.hash = "#/gabung?kode=" + encodeURIComponent(kode);
        }
        // Pastikan semua kartu pelanggan ada di cloud untuk akun ini.
        markCards({ ids: store.get().pelanggan.map((p) => p.id) });
      }, 0);
    }
    emit();
    // Bersihkan ?code=... dari URL setelah login lewat link email.
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  });

  // Tandai perubahan lokal & jadwalkan upload.
  store.subscribe((_state, source) => {
    if (source !== "local" || !cloud.user) return;
    writeMeta({ dirty: true });
    schedulePush();
  });

  window.addEventListener("online", () => cloud.user && (sync(), flushCards()));
  // Ada tim: tarik data berkala supaya order/stok dari HP lain cepat kelihatan.
  setInterval(() => {
    if (cloud.user && teamActive() && document.visibilityState === "visible" && navigator.onLine) sync();
  }, POLL_MS);
  window.addEventListener("offline", () => cloud.user && setStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (!cloud.user) return;
    if (document.visibilityState === "visible") sync();
    else if (readMeta().dirty) sync(); // simpan sebelum app ditutup / pindah tab
  });
}
