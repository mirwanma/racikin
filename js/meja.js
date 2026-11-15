// Pesan lewat meja (QR), opsional.
// - Pemilik/manajer: salinan menu publik (nama, harga toko, habis) + daftar meja dipublikasikan ke tabel public_menu.
// - Pelanggan (tanpa login): baca menu & pesan lewat fungsi get_table_menu / place_table_order.
// - Kasir: pesanan meja masuk lewat tabel table_orders + Realtime.
import { store, uid } from "./store.js";
import { sb, cloud, role, onCloudChange } from "./cloud.js";
import { bahanMap, bisaDibuat } from "./stok-utils.js";

export const mejaAktif = (s) => !!s.posSetting?.pesanMeja;
export const digitalAktif = (s) => s.posSetting?.mejaDigital !== false;
export const linkMeja = (token) => `${location.origin}${location.pathname}#/m/${token}`;
export const tokenBaru = () => (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()).replace(/-/g, "").slice(0, 24);

/** Data menu publik (tanpa HPP, resep, stok detail). */
export function menuPublik(s) {
  const map = bahanMap(s.bahan);
  const pal = s.brand?.palet || [];
  return {
    aktif: mejaAktif(s),
    digital: digitalAktif(s),
    bisnis: s.brand?.terpilih?.nama || s.profile?.nama || "Menu",
    lokasi: [s.profile?.area, s.profile?.kota].filter(Boolean).join(", "),
    warna: pal.length >= 2 ? { utama: pal[0].hex, aksen: pal[1].hex } : null,
    menu: (s.resep || []).map((r) => ({ id: r.id, nama: r.nama, harga: Math.round(Number(r.harga) || 0), habis: bisaDibuat(r, map).porsi === 0 })),
    meja: (s.meja || []).map((m) => ({ id: m.id, nama: m.nama, token: m.token })),
  };
}

// ---------- Publikasi menu (pemilik/manajer) ----------
const DIGEST_KEY = "racikin:menu-publik";
let pubTimer = null;
export const statusPublik = { at: null, error: "" };

export async function publikasi(force = false) {
  clearTimeout(pubTimer);
  const s = store.get();
  if (!cloud.user || !cloud.team || !["owner", "manajer"].includes(role())) return false;
  if (!(s.meja || []).length && !force) return false;
  const data = menuPublik(s);
  const digest = JSON.stringify(data);
  let lama = null;
  try {
    lama = localStorage.getItem(DIGEST_KEY + ":" + cloud.team.ownerId);
  } catch {
    /* abaikan */
  }
  if (!force && lama === digest) return true;
  const { error } = await sb().from("public_menu").upsert({ owner_id: cloud.team.ownerId, data, updated_at: new Date().toISOString() });
  if (error) {
    statusPublik.error = error.message;
    return false;
  }
  statusPublik.at = new Date();
  statusPublik.error = "";
  try {
    localStorage.setItem(DIGEST_KEY + ":" + cloud.team.ownerId, digest);
  } catch {
    /* abaikan */
  }
  return true;
}

/** Perbarui menu publik otomatis saat menu, harga, stok, atau meja berubah. */
export function initMeja() {
  const jadwal = () => {
    clearTimeout(pubTimer);
    pubTimer = setTimeout(() => publikasi().catch(() => {}), 2500);
  };
  store.subscribe(jadwal);
  onCloudChange(() => cloud.status === "synced" && jadwal());
}

// ---------- Pesanan meja untuk kasir ----------
const pesanan = new Map();
const listeners = new Set();
let channel = null;
let channelOwner = null;
let poll = null;

const emit = (e) => listeners.forEach((fn) => fn(e));
export const pesananMasuk = () => [...pesanan.values()].filter((o) => o.status === "baru").sort((a, b) => a.created_at.localeCompare(b.created_at));
export const pesananHariIni = () => [...pesanan.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

export async function muatPesanan() {
  if (!cloud.user || !cloud.team) return [];
  const sejak = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  const { data, error } = await sb()
    .from("table_orders")
    .select("id,meja_id,meja_nama,no,kode,nama,catatan,items,total,metode,bayar_status,status,alasan,pos_order_id,created_at")
    .eq("owner_id", cloud.team.ownerId)
    .gte("created_at", sejak)
    .order("created_at");
  if (error) throw new Error(error.message);
  pesanan.clear();
  for (const o of data) pesanan.set(o.id, o);
  emit({ type: "load" });
  return data;
}

export function dengarPesanan(fn) {
  listeners.add(fn);
  mulaiPesanan();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) berhenti();
  };
}

// Pendengar dipasang sebelum akun siap -> sambungkan begitu siap.
onCloudChange(() => listeners.size && mulaiPesanan());

function mulaiPesanan() {
  if (cloud.user && cloud.team && !(channel && channelOwner === cloud.team.ownerId)) {
    berhenti();
    channelOwner = cloud.team.ownerId;
    muatPesanan().catch(() => {});
    channel = sb()
      .channel(`meja-${channelOwner}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_orders", filter: `owner_id=eq.${channelOwner}` }, (p) => {
        if (p.eventType === "DELETE") return pesanan.delete(p.old?.id), emit({ type: "delete" });
        const lama = pesanan.get(p.new.id);
        const { secret: _s, owner_id: _o, ...row } = p.new;
        pesanan.set(row.id, row);
        emit({ type: p.eventType === "INSERT" ? "insert" : "update", lama, baru: row });
      })
      .subscribe();
    poll = setInterval(() => document.visibilityState === "visible" && navigator.onLine && muatPesanan().catch(() => {}), 20000);
  }
}
function berhenti() {
  clearInterval(poll);
  if (channel) sb()?.removeChannel(channel);
  channel = null;
  channelOwner = null;
}

export async function ubahPesanan(id, patch) {
  const cur = pesanan.get(id);
  if (cur) pesanan.set(id, { ...cur, ...patch });
  emit({ type: "local" });
  const { error } = await sb().from("table_orders").update(patch).eq("id", id);
  if (error) {
    if (cur) pesanan.set(id, cur);
    emit({ type: "local" });
    throw new Error(error.message);
  }
}

// ---------- API pelanggan (tanpa login) ----------
async function rpc(fn, args) {
  if (!sb()) throw new Error("Koneksi belum siap. Cek internet lalu muat ulang.");
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message?.replace(/^.*?: /, "") || "Gagal");
  return data;
}
export const ambilMenu = (token) => rpc("get_table_menu", { p_token: token });
export const kirimPesanan = (token, items, nama, catatan, metode) => rpc("place_table_order", { p_token: token, p_items: items, p_nama: nama, p_catatan: catatan, p_metode: metode });
export const cekPesanan = (id, secret) => rpc("get_table_order", { p_id: id, p_secret: secret });
export const bayarSimulasi = (id, secret) => rpc("pay_table_order_dummy", { p_id: id, p_secret: secret });

/** SVG QR code untuk teks. */
export async function qrSvg(text, cell = 6) {
  const { default: qrcode } = await import("./vendor/qrcode-1.4.4.js");
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
