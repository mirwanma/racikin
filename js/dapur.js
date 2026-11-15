// Mode dapur (Kitchen Display): tiket pesanan dari Kasir ke layar dapur lewat tabel kitchen_tickets
// + Supabase Realtime. Tiket berisi item & catatan saja (tanpa harga).
//
// Status: baru -> dimasak -> siap -> diambil (selesai) | batal
import { sb, cloud, onCloudChange } from "./cloud.js";
import { labelOpsi } from "./varian.js";

export const STATUS = {
  baru: { nama: "Baru", next: "dimasak", aksi: "Mulai masak" },
  dimasak: { nama: "Dimasak", next: "siap", aksi: "Siap" },
  siap: { nama: "Siap diambil", next: "diambil", aksi: "Sudah diambil" },
};
const QUEUE_KEY = "racikin:dapur-antre";

export const dapurAktif = (s) => !!s.posSetting?.dapur;
export const bisaDapur = () => !!(cloud.user && cloud.team);

/** Cache tiket hari ini + pendengar perubahan. */
const tiket = new Map();
const listeners = new Set();
let channel = null;
let channelOwner = null;
let pollTimer = null;
let loadedAt = 0;

const emit = (evt) => listeners.forEach((fn) => fn(evt));
export const daftarTiket = () => [...tiket.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));

function bacaAntre() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}
function tulisAntre(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* abaikan */
  }
}

/** Isi tiket dari order kasir. */
export function tiketDari(order, { nama = "", catatan = "" } = {}) {
  return {
    id: order.id,
    no: order.no,
    data: {
      items: order.items.map((i) => (i.opsi?.length ? { nama: i.nama, qty: i.qty, opsi: labelOpsi(i) } : { nama: i.nama, qty: i.qty })),
      nama: String(nama || "").trim().slice(0, 40),
      catatan: String(catatan || "").trim().slice(0, 200),
      channel: order.channel || "toko",
      kasir: order.kasir?.nama || "",
      waktu: order.waktu,
    },
  };
}

/** Kirim tiket ke dapur. Gagal (offline) -> disimpan di antrean, dikirim ulang nanti. */
export async function kirimTiket(t) {
  if (!bisaDapur()) return false;
  const row = { ...t, owner_id: cloud.team.ownerId, status: "baru" };
  const { error } = await sb().from("kitchen_tickets").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.warn("Tiket dapur gagal dikirim, masuk antrean", error.message);
    tulisAntre([...bacaAntre().filter((x) => x.id !== t.id), row]);
    return false;
  }
  return true;
}

/** Kirim ulang tiket yang tertunda. */
export async function kirimAntre() {
  const list = bacaAntre();
  if (!list.length || !bisaDapur() || !navigator.onLine) return;
  const { error } = await sb().from("kitchen_tickets").upsert(list, { onConflict: "id", ignoreDuplicates: true });
  if (!error) tulisAntre([]);
}
export const jumlahAntre = () => bacaAntre().length;

export async function ubahStatus(id, status, extra = {}) {
  const cur = tiket.get(id);
  if (cur) {
    tiket.set(id, { ...cur, status, ...extra }); // langsung tampil (optimistis)
    emit({ type: "local", id });
  }
  const { error } = await sb().from("kitchen_tickets").update({ status, ...extra }).eq("id", id);
  if (error) {
    if (cur) tiket.set(id, cur);
    emit({ type: "local", id });
    throw new Error("Gagal mengubah status: " + error.message);
  }
}

export async function toggleItem(id, idx) {
  const cur = tiket.get(id);
  if (!cur) return;
  const done = new Set(cur.done || []);
  done.has(idx) ? done.delete(idx) : done.add(idx);
  return ubahStatus(id, cur.status, { done: [...done].sort((a, b) => a - b) });
}

/** Ambil tiket 18 jam terakhir (cukup untuk satu hari jualan). */
export async function muatTiket() {
  if (!bisaDapur()) return [];
  const sejak = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  const { data, error } = await sb()
    .from("kitchen_tickets")
    .select("id,no,data,status,done,created_at,updated_at")
    .eq("owner_id", cloud.team.ownerId)
    .gte("created_at", sejak)
    .order("created_at");
  if (error) throw new Error(error.message);
  tiket.clear();
  for (const t of data) tiket.set(t.id, t);
  loadedAt = Date.now();
  emit({ type: "load" });
  return data;
}

/**
 * Dengarkan perubahan tiket (realtime + cadangan polling 20 detik).
 * fn({ type: "insert"|"update"|"load"|"local", id, lama, baru })
 */
export function dengar(fn) {
  listeners.add(fn);
  mulai();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) berhenti();
  };
}

function mulai() {
  if (!bisaDapur()) return;
  const owner = cloud.team.ownerId;
  if (channel && channelOwner === owner) return;
  berhenti();
  channelOwner = owner;
  if (Date.now() - loadedAt > 5000) muatTiket().catch(() => {});
  kirimAntre();
  channel = sb()
    .channel(`dapur-${owner}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_tickets", filter: `owner_id=eq.${owner}` }, (p) => {
      if (p.eventType === "DELETE") {
        tiket.delete(p.old?.id);
        return emit({ type: "delete", id: p.old?.id });
      }
      const lama = tiket.get(p.new.id);
      tiket.set(p.new.id, p.new);
      emit({ type: p.eventType === "INSERT" ? "insert" : "update", id: p.new.id, lama, baru: p.new });
    })
    .subscribe();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      kirimAntre();
      muatTiket().catch(() => {});
    }
  }, 20000);
}

// Halaman dibuka sebelum info akun/tim siap -> sambungkan begitu siap (atau setelah ganti akun).
onCloudChange(() => {
  if (!listeners.size) return;
  if (!bisaDapur()) return berhenti();
  if (!channel || channelOwner !== cloud.team.ownerId) mulai();
});

function berhenti() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (channel) sb()?.removeChannel(channel);
  channel = null;
  channelOwner = null;
}

/** Menit sejak tiket masuk. */
export const menitSejak = (iso, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));

/** Bunyi pendek (tanpa file audio). */
let audioCtx = null;
export function bunyi(kali = 2) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < kali; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      const t0 = audioCtx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.2);
    }
  } catch {
    /* browser tanpa audio */
  }
}
