// Open bill: pesan dulu (boleh nambah berkali-kali), bayar belakangan. Murni (tanpa UI). Opsional: posSetting.openBill.
//
// state.bills = [{
//   id, nama, meja: { id, nama } | null, dibuka: "YYYY-MM-DDTHH:MM", oleh: { id, nama } | null,
//   status: "buka" | "batal",
//   ronde: [{ id, waktu, tanggal, oleh, items: [{ id, resepId, nama, harga, qty, opsi? }], meja?: { id, kode } }],
//   hapus: [{ id, waktu, oleh, rondeId, item, alasan, stokKembali }],   // item yang dibatalkan setelah dikirim (item.qty = yang dibatalkan)
//   dibayar: [{ orderId, waktu, total, n }],                           // pembayaran sebagian (split bill)
//   kode?, wa?,                                                         // voucher dari pesan meja (dipakai saat bayar)
//   batal?: { waktu, oleh, alasan, stokKembali },
// }]
// Aturan:
// - Tiap "ronde" (tambahan pesanan) langsung memotong stok & dikirim ke dapur (kalau mode dapur aktif).
// - Uang masuk Kas & rekap HANYA saat bill dibayar (jadi 1 order biasa, order.bill = { id, nama, ronde }).
// - Item yang sudah dikirim hanya bisa dibatalkan pemilik/manajer + alasan (stok bisa dikembalikan), boleh sebagian jumlah.
// - Bayar sebagian (split bill): pilih item & jumlah -> jadi 1 order; sisanya tetap di bill sampai lunas.
// - Gabung bill / pindah meja: semua ronde dipindah ke bill tujuan.
import { uid } from "./store.js";
import { stokPatch, subtotal } from "./pos.js";
import { kunciItem } from "./varian.js";

export const billAktif = (s) => !!s.posSetting?.openBill;
export const billTerbuka = (s) => (s.bills || []).filter((b) => b.status !== "batal");
export const cariBill = (s, id) => (s.bills || []).find((b) => b.id === id) || null;
/** Bill yang masih buka untuk meja tertentu (pesan lewat QR). */
export const billMeja = (s, mejaId) => billTerbuka(s).find((b) => b.meja?.id === mejaId) || null;

const sekarang = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Semua item bill (gabungan semua ronde). */
export const itemBill = (b) => (b?.ronde || []).flatMap((r) => r.items || []);
export const totalBill = (b) => subtotal(itemBill(b));
export const jumlahItem = (b) => itemBill(b).reduce((a, i) => a + (Number(i.qty) || 0), 0);

/** Isi bill untuk keranjang Kasir saat dibayar (item sama + pilihan sama digabung). */
export function keranjangBill(b) {
  const m = new Map();
  for (const it of itemBill(b)) {
    const key = it.resepId ? kunciItem(it.resepId, it.opsi) : "x-" + it.nama + "|" + it.harga;
    const cur = m.get(key);
    if (cur) cur.qty += it.qty;
    else m.set(key, { key, resepId: it.resepId || null, nama: it.nama, harga: it.harga, qty: it.qty, ...(it.opsi?.length ? { opsi: it.opsi } : {}) });
  }
  return [...m.values()];
}

/** Lama bill dibuka, cth "1 jam 20 mnt". */
export function lamaBuka(b, waktu = sekarang()) {
  const menit = Math.max(0, Math.round((new Date(waktu) - new Date(b.dibuka)) / 60000));
  if (menit < 60) return `${menit} mnt`;
  return `${Math.floor(menit / 60)} jam${menit % 60 ? ` ${menit % 60} mnt` : ""}`;
}

/** Bill baru (belum ada ronde). */
export function bukaBill(s, { nama, meja = null, oleh = null, waktu = sekarang() }) {
  const n = String(nama || meja?.nama || "").trim().slice(0, 40);
  if (!n) throw new Error("Isi nama bill dulu (cth: Meja 3 / Budi)");
  const bill = { id: uid(), nama: n, meja, dibuka: waktu, oleh, status: "buka", ronde: [], hapus: [] };
  return { patch: { bills: [...(s.bills || []), bill] }, bill };
}

/**
 * Tambah ronde pesanan ke bill: potong stok sekarang. cart = item keranjang Kasir.
 * Return { patch: { bills, bahan?, stokLog? }, ronde }.
 */
export function tambahRonde(s, billId, cart, { oleh = null, waktu = sekarang(), meja = null } = {}) {
  const b = cariBill(s, billId);
  if (!b || b.status === "batal") throw new Error("Bill sudah ditutup / dibatalkan");
  const items = (cart || [])
    .filter((i) => Number(i.qty) > 0)
    .map((i) => ({ id: uid(), resepId: i.resepId || null, nama: i.nama, harga: Number(i.harga) || 0, qty: Number(i.qty), ...(i.opsi?.length ? { opsi: i.opsi.map((o) => ({ g: o.g, id: o.id, nama: o.nama, harga: Number(o.harga) || 0 })) } : {}) }));
  if (!items.length) throw new Error("Pesanan kosong");
  const tanggal = waktu.slice(0, 10);
  const ronde = { id: uid(), waktu, tanggal, oleh, items, ...(meja ? { meja } : {}) };
  const stok = stokPatch(s, items, tanggal, -1);
  const bills = (s.bills || []).map((x) => (x.id === billId ? { ...x, ronde: [...(x.ronde || []), ronde] } : x));
  return { patch: { bills, ...stok }, ronde };
}

/** Kurangi qty item di ronde (qty 0 -> item hilang, ronde kosong -> ronde hilang). kurang = { itemId: qty } */
function kurangiItem(ronde, kurang) {
  return ronde
    .map((r) => ({
      ...r,
      items: r.items.map((it) => (kurang[it.id] ? { ...it, qty: it.qty - Math.min(it.qty, kurang[it.id]) } : it)).filter((it) => it.qty > 0),
    }))
    .filter((r) => r.items.length);
}

/** Batalkan item yang sudah dikirim (pemilik/manajer). qty = jumlah yang dibatalkan (default semua). */
export function hapusItem(s, billId, rondeId, itemId, { alasan, oleh = null, stokKembali = true, waktu = sekarang(), qty = null }) {
  if (!String(alasan || "").trim()) throw new Error("Tulis alasan dulu");
  const b = cariBill(s, billId);
  const r = b?.ronde.find((x) => x.id === rondeId);
  const it = r?.items.find((x) => x.id === itemId);
  if (!it) throw new Error("Item nggak ditemukan");
  const n = qty === null ? it.qty : Math.round(Number(qty));
  if (!(n >= 1 && n <= it.qty)) throw new Error(`Jumlah batal 1 sampai ${it.qty}`);
  const batal = { ...it, qty: n };
  const stok = stokKembali ? stokPatch(s, [batal], waktu.slice(0, 10), +1) : {};
  const bills = s.bills.map((x) =>
    x.id !== billId
      ? x
      : {
          ...x,
          ronde: kurangiItem(x.ronde, { [itemId]: n }),
          hapus: [...(x.hapus || []), { id: uid(), waktu, oleh, rondeId, item: batal, alasan: String(alasan).trim().slice(0, 120), stokKembali: !!stokKembali }],
        },
  );
  return { bills, ...stok };
}

/** Rapikan pilihan bayar sebagian: { itemId: qty } dibatasi qty yang ada di bill. */
export function rapikanPilih(b, pilih) {
  const out = {};
  for (const it of itemBill(b)) {
    const q = Math.min(it.qty, Math.max(0, Math.round(Number(pilih?.[it.id]) || 0)));
    if (q) out[it.id] = q;
  }
  return out;
}

/** Item yang dipilih untuk dibayar sekarang, siap jadi keranjang Kasir. */
export function keranjangPilih(b, pilih) {
  const p = rapikanPilih(b, pilih);
  return keranjangBill({ ronde: (b.ronde || []).map((r) => ({ ...r, items: r.items.filter((it) => p[it.id]).map((it) => ({ ...it, qty: p[it.id] })) })) });
}

/** Total item yang dipilih. */
export const totalPilih = (b, pilih) => subtotal(keranjangPilih(b, pilih));

/** Apakah pilihan = seluruh isi bill (jadi bayar penuh). */
export const semuaDipilih = (b, pilih) => {
  const p = rapikanPilih(b, pilih);
  return itemBill(b).every((it) => p[it.id] === it.qty);
};

/**
 * Setelah bayar sebagian: kurangi item yang sudah dibayar & catat pembayaran. Kalau habis, bill ditutup.
 * Return { bills, lunas }.
 */
export function bayarSebagian(s, billId, pilih, { orderId, total, waktu = sekarang() }) {
  const b = cariBill(s, billId);
  if (!b) throw new Error("Bill nggak ditemukan");
  const p = rapikanPilih(b, pilih);
  const ronde = kurangiItem(b.ronde || [], p);
  if (!ronde.length) return { ...tutupBill(s, billId), lunas: true };
  const n = Object.values(p).reduce((a, x) => a + x, 0);
  const bills = s.bills.map((x) => (x.id === billId ? { ...x, ronde, dibayar: [...(x.dibayar || []), { orderId, waktu, total, n }] } : x));
  return { bills, lunas: false };
}

/** Gabung bill: semua ronde (dan riwayat batal/bayar) dari bill asal pindah ke bill tujuan; bill asal hilang. */
export function gabungBill(s, dariId, keId) {
  if (dariId === keId) throw new Error("Pilih bill lain");
  const dari = cariBill(s, dariId);
  const ke = cariBill(s, keId);
  if (!dari || !ke || dari.status === "batal" || ke.status === "batal") throw new Error("Bill nggak ditemukan");
  const gabung = {
    ...ke,
    ronde: [...(ke.ronde || []), ...(dari.ronde || [])].sort((a, b) => String(a.waktu).localeCompare(String(b.waktu))),
    hapus: [...(ke.hapus || []), ...(dari.hapus || [])],
    ...((ke.dibayar || dari.dibayar) ? { dibayar: [...(ke.dibayar || []), ...(dari.dibayar || [])] } : {}),
    dibuka: String(dari.dibuka) < String(ke.dibuka) ? dari.dibuka : ke.dibuka,
    ...(!ke.kode && dari.kode ? { kode: dari.kode, ...(dari.wa ? { wa: dari.wa } : {}) } : {}),
  };
  return { bills: s.bills.filter((x) => x.id !== dariId).map((x) => (x.id === keId ? gabung : x)) };
}

/** Pindah bill ke meja lain. Kalau meja tujuan sudah punya bill buka -> digabung ke sana. */
export function pindahMeja(s, billId, meja) {
  const b = cariBill(s, billId);
  if (!b) throw new Error("Bill nggak ditemukan");
  const ada = billMeja(s, meja.id);
  if (ada && ada.id !== billId) return { ...gabungBill(s, billId, ada.id), digabung: ada.id };
  const namaLama = b.meja?.nama;
  const nama = !namaLama || b.nama === namaLama ? meja.nama : b.nama.replace(namaLama, meja.nama);
  return { bills: s.bills.map((x) => (x.id === billId ? { ...x, meja: { id: meja.id, nama: meja.nama }, nama: String(nama).slice(0, 40) } : x)), digabung: null };
}

/** Batalkan seluruh bill (pemilik/manajer). Bill tetap disimpan sebagai riwayat (status batal). */
export function batalBill(s, billId, { alasan, oleh = null, stokKembali = true, waktu = sekarang() }) {
  if (!String(alasan || "").trim()) throw new Error("Tulis alasan dulu");
  const b = cariBill(s, billId);
  if (!b || b.status === "batal") throw new Error("Bill nggak ditemukan");
  const stok = stokKembali && itemBill(b).length ? stokPatch(s, itemBill(b), waktu.slice(0, 10), +1) : {};
  const bills = s.bills.map((x) => (x.id === billId ? { ...x, status: "batal", batal: { waktu, oleh, alasan: String(alasan).trim().slice(0, 120), stokKembali: !!stokKembali } } : x));
  return { bills: pruneBills(bills, waktu.slice(0, 10)), ...stok };
}

/** Ganti nama / pindah meja. */
export function ubahBill(s, billId, { nama }) {
  const n = String(nama || "").trim().slice(0, 40);
  if (!n) throw new Error("Nama bill nggak boleh kosong");
  return { bills: s.bills.map((x) => (x.id === billId ? { ...x, nama: n } : x)) };
}

/** Bill dibayar: dihapus dari daftar (datanya sudah jadi order). */
export const tutupBill = (s, billId) => ({ bills: (s.bills || []).filter((x) => x.id !== billId) });

/** Simpan voucher dari pesan meja di bill (dipakai saat bayar). */
export const voucherBill = (s, billId, { kode, wa }) => ({ bills: s.bills.map((x) => (x.id === billId ? { ...x, ...(kode ? { kode } : {}), ...(wa ? { wa } : {}) } : x)) });

/** Riwayat bill batal disimpan 30 hari. */
function pruneBills(bills, today) {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() - 30);
  const batas = d.toISOString().slice(0, 10);
  return bills.filter((b) => b.status !== "batal" || String(b.batal?.waktu || b.dibuka).slice(0, 10) >= batas);
}
