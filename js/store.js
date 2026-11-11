// Penyimpanan lokal (offline-first). Semua data user ada di satu objek.
const KEY = "racikin:v1";

const DEFAULT = {
  profile: null,          // Profil Bisnis
  idea: null,             // hasil analyze_idea
  rab: null,              // { ringkasan, items:[...+realisasi], biaya_bulanan, tips_hemat, mode }
  bep: null,              // input kalkulator BEP
  brand: null,            // hasil generate_brand + pilihan
  activation: null,       // hasil activation_plan + checked
  calendar: null,         // { start, pilar, jadwal:[...+done] }
  transactions: [],       // { id, tanggal, jenis, kategori, nominal, catatan }
  insight: null,
  chat: [],               // { role, content }
  bahan: [],              // { id, nama, satuan, harga (per satuan), stok, min, estimasi }
  resep: [],              // { id, nama, harga (jual), hasil (porsi), items:[{ bahanId, qty }] }
  stokLog: [],            // { id, tanggal, bahanId, delta, alasan: beli|jual|opname, catatan }
  settings: { aiMode: "demo", endpoint: "", anonKey: "" },
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch (e) {
    console.warn("Gagal baca data lokal", e);
  }
  return structuredClone(DEFAULT);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Gagal simpan data lokal", e);
  }
}

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    save();
    listeners.forEach((fn) => fn(state, "local"));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  exportJSON: () => JSON.stringify(state, null, 2),
  /** Data yang disinkron ke cloud: semua kecuali setelan per-perangkat. */
  cloudData() {
    const { settings: _settings, ...rest } = state;
    return rest;
  },
  /** Ganti data dengan versi cloud (setelan perangkat tetap). Tidak memicu upload ulang. */
  applyCloud(data) {
    const { settings: _ignored, ...rest } = data || {};
    state = { ...structuredClone(DEFAULT), ...rest, settings: state.settings };
    save();
    listeners.forEach((fn) => fn(state, "cloud"));
  },
  /** Hapus data bisnis di perangkat ini (setelan tetap). */
  clearLocal() {
    state = { ...structuredClone(DEFAULT), settings: state.settings };
    save();
    listeners.forEach((fn) => fn(state, "cloud"));
  },
  importJSON(text) {
    const data = JSON.parse(text);
    if (typeof data !== "object" || data === null) throw new Error("Format tidak valid");
    state = { ...structuredClone(DEFAULT), ...data };
    save();
    listeners.forEach((fn) => fn(state, "local"));
  },
  reset() {
    state = structuredClone(DEFAULT);
    save();
    listeners.forEach((fn) => fn(state, "local"));
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
