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
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  exportJSON: () => JSON.stringify(state, null, 2),
  importJSON(text) {
    const data = JSON.parse(text);
    if (typeof data !== "object" || data === null) throw new Error("Format tidak valid");
    state = { ...structuredClone(DEFAULT), ...data };
    save();
    listeners.forEach((fn) => fn(state));
  },
  reset() {
    state = structuredClone(DEFAULT);
    save();
    listeners.forEach((fn) => fn(state));
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
