// Saldo pelanggan (uang titipan / deposit): pelanggan nyimpen uang di toko (isi saldo, atau kembalian nggak diambil),
// lalu dipakai buat bayar nanti. Murni (tanpa UI). Opsional: posSetting.saldo (default mati).
//
// Pembukuan (saldo = uang titipan, BUKAN omzet):
// - Isi saldo / simpan kembalian: uang masuk Kas kategori "Titipan saldo pelanggan" (ref "saldo", digabung per hari
//   per metode, id "saldo-<tgl>-<metode>"; dihitung ulang dari daftar saldo, jadi yang dicatat akun kasir tetap masuk
//   Kas setelah sinkron, lewat reconcile di pos.js). Nggak dihitung pendapatan / pajak.
// - Bayar pakai saldo: order tetap penjualan biasa (Kas "Penjualan" metode saldo, jadi omzet & pajak tercatat waktu
//   jual), plus Kas keluar "Titipan saldo pelanggan" senilai yang sama (titipannya berkurang). Uang tunai nggak berubah.
// - Tarik saldo (uang dikembalikan): Kas keluar "Titipan saldo pelanggan" (id "saldo-<tgl>-tarik-<metode>").
// - Order dibatalkan: pemakaian saldonya ikut dihapus (saldo balik). Kembalian yang disimpan tetap (uangnya memang ada).
//
// state.saldoPelanggan = [{ id, jenis: "isi" | "pakai" | "tarik", pelangganId, tanggal, waktu, nominal,
//   metode? (isi / tarik), sumber?: "kembalian" (isi dari kembalian order), orderId?, no?, oleh?, shiftId?, catatan? }]
//   id pemakaian dari order = "o-<orderId>", simpan kembalian = "k-<orderId>".
import { uid } from "./store.js";

export const KAT_SALDO = "Titipan saldo pelanggan";
export const METODE_SALDO = [
  { id: "tunai", nama: "Tunai" },
  { id: "qris", nama: "QRIS" },
  { id: "transfer", nama: "Transfer" },
];
export const MAKS_SALDO = 5_000_000; // batas wajar sekali isi (salah ketik nol)

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const tanda = { isi: 1, pakai: -1, tarik: -1 };

export const saldoAktif = (s) => !!s.posSetting?.saldo;
export const entriSaldo = (s, pelangganId) => (s.saldoPelanggan || []).filter((k) => k.pelangganId === pelangganId);

/** Saldo pelanggan sekarang (rupiah). */
export const saldoOf = (s, pelangganId) => Math.round(sum(entriSaldo(s, pelangganId), (k) => (tanda[k.jenis] || 0) * (Number(k.nominal) || 0)));

/** Bagian order yang dibayar pakai saldo. */
export const porsiSaldo = (o) =>
  Array.isArray(o.pembayaran) && o.pembayaran.length ? sum(o.pembayaran.filter((x) => x.metode === "saldo"), (x) => Number(x.jumlah) || 0) : o.metode === "saldo" ? Number(o.total) || 0 : 0;

/** Entri saldo dari order kasir: pemakaian saldo + kembalian yang disimpan. */
export function saldoDariOrder(o) {
  const out = [];
  if (!o.pelangganId) return out;
  const pakai = porsiSaldo(o);
  if (pakai > 0) out.push({ id: `o-${o.id}`, jenis: "pakai", pelangganId: o.pelangganId, tanggal: o.tanggal, waktu: o.waktu, nominal: pakai, orderId: o.id, no: o.no });
  if (o.simpanSaldo > 0) {
    const e = { id: `k-${o.id}`, jenis: "isi", sumber: "kembalian", metode: "tunai", pelangganId: o.pelangganId, tanggal: o.tanggal, waktu: o.waktu, nominal: o.simpanSaldo, orderId: o.id, no: o.no };
    if (o.shiftId) e.shiftId = o.shiftId;
    if (o.kasir) e.oleh = o.kasir;
    out.push(e);
  }
  return out;
}

/** Order dibatalkan: pemakaian saldonya dihapus (saldo kembali). */
export const hapusPakaiOrder = (list, orderId) => (list || []).filter((k) => k.id !== `o-${orderId}`);

/** Transaksi Kas titipan saldo (isi & tarik) untuk satu tanggal, digabung per metode. */
export function saldoKas(transactions, list, tanggal) {
  const tx = (transactions || []).filter((t) => !(t.ref === "saldo" && t.tanggal === tanggal));
  const hari = (list || []).filter((k) => k.tanggal === tanggal);
  for (const m of METODE_SALDO) {
    for (const [jenis, arah] of [["isi", "masuk"], ["tarik", "keluar"]]) {
      const l = hari.filter((k) => k.jenis === jenis && (k.metode || "tunai") === m.id);
      if (!l.length) continue;
      tx.push({
        id: `saldo-${tanggal}-${jenis === "isi" ? "" : "tarik-"}${m.id}`,
        tanggal,
        jenis: arah,
        kategori: KAT_SALDO,
        nominal: Math.round(sum(l, (k) => Number(k.nominal) || 0)),
        catatan: `${jenis === "isi" ? "Isi saldo pelanggan" : "Saldo pelanggan ditarik"} · ${m.nama} · ${l.length}×`,
        ref: "saldo",
      });
    }
  }
  return tx;
}

/** Hitung ulang semua transaksi Kas titipan saldo (setelah sinkron / hapus). */
export function saldoKasSemua(transactions, list) {
  const tgl = new Set([...(transactions || []).filter((t) => t.ref === "saldo").map((t) => t.tanggal), ...(list || []).filter((k) => k.jenis !== "pakai").map((k) => k.tanggal)]);
  let tx = transactions || [];
  for (const t of tgl) tx = saldoKas(tx, list, t);
  return tx;
}

function entriBaru(s, pelangganId, jenis, { nominal, metode = "tunai", tanggal, waktu, oleh = null, shiftId = null, catatan = "" }) {
  if (!(s.pelanggan || []).some((p) => p.id === pelangganId)) throw new Error("Pelanggan nggak ketemu");
  const n = Math.round(Number(nominal) || 0);
  if (n <= 0) throw new Error("Isi jumlahnya dulu");
  if (!METODE_SALDO.some((m) => m.id === metode)) throw new Error("Metode nggak dikenal");
  const e = { id: uid(), jenis, pelangganId, tanggal, waktu: waktu || `${tanggal}T00:00`, nominal: n, metode };
  if (oleh) e.oleh = oleh;
  if (shiftId) e.shiftId = shiftId;
  if (String(catatan || "").trim()) e.catatan = String(catatan).trim().slice(0, 100);
  return e;
}

/** Isi saldo (pelanggan setor uang). Return { saldoPelanggan, transactions, entri }. */
export function isiSaldo(s, pelangganId, opt) {
  const e = entriBaru(s, pelangganId, "isi", opt);
  if (e.nominal > MAKS_SALDO) throw new Error(`Maksimal Rp${MAKS_SALDO.toLocaleString("id-ID")} sekali isi`);
  const list = [...(s.saldoPelanggan || []), e];
  return { saldoPelanggan: list, transactions: saldoKas(s.transactions, list, e.tanggal), entri: e };
}

/** Tarik saldo (uang titipan dikembalikan ke pelanggan), maksimal sebesar saldo. */
export function tarikSaldo(s, pelangganId, opt) {
  const e = entriBaru(s, pelangganId, "tarik", opt);
  const ada = saldoOf(s, pelangganId);
  if (e.nominal > ada) throw new Error(`Maksimal Rp${Math.max(0, ada).toLocaleString("id-ID")} (saldo sekarang)`);
  const list = [...(s.saldoPelanggan || []), e];
  return { saldoPelanggan: list, transactions: saldoKas(s.transactions, list, e.tanggal), entri: e };
}

/** Hapus catatan isi / tarik manual (salah catat). Nggak boleh bikin saldo minus. */
export function hapusSaldo(s, id) {
  const e = (s.saldoPelanggan || []).find((k) => k.id === id);
  if (!e || e.jenis === "pakai" || e.sumber === "kembalian") return null;
  const list = s.saldoPelanggan.filter((k) => k.id !== id);
  if (saldoOf({ saldoPelanggan: list }, e.pelangganId) < 0) throw new Error("Saldonya sudah terpakai, nggak bisa dihapus");
  return { saldoPelanggan: list, transactions: saldoKas(s.transactions, list, e.tanggal) };
}

/** Cek order: pakai saldo tidak boleh lebih dari saldo; simpan kembalian tidak boleh lebih dari kembalian. "" = boleh. */
export function cekSaldo(s, pelangganId, pakai) {
  if (!pelangganId) return "Pilih pelanggan dulu";
  const p = (s.pelanggan || []).find((x) => x.id === pelangganId);
  if (!p) return "Pelanggan nggak ketemu";
  const ada = saldoOf(s, pelangganId);
  if (ada <= 0) return `Saldo ${p.nama} kosong`;
  if (Math.round(Number(pakai) || 0) > ada) return `Saldo ${p.nama} cuma Rp${ada.toLocaleString("id-ID")}`;
  return "";
}

/** Daftar pelanggan yang punya saldo, terbesar dulu. */
export function daftarSaldo(s) {
  const ids = [...new Set((s.saldoPelanggan || []).map((k) => k.pelangganId))];
  return ids
    .map((id) => ({ p: (s.pelanggan || []).find((x) => x.id === id) || { id, nama: "(pelanggan dihapus)" }, saldo: saldoOf(s, id), terakhir: entriSaldo(s, id).reduce((a, k) => (String(k.waktu || k.tanggal) > a ? String(k.waktu || k.tanggal) : a), "") }))
    .filter((x) => x.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo || a.p.nama.localeCompare(b.p.nama, "id"));
}

/** Total titipan yang masih dipegang toko (kewajiban ke pelanggan). */
export function ringkasSaldo(s) {
  const list = daftarSaldo(s);
  return { n: list.length, total: sum(list, (x) => x.saldo) };
}

/** Riwayat saldo satu pelanggan (terbaru dulu). */
export const riwayatSaldo = (s, pelangganId) => [...entriSaldo(s, pelangganId)].sort((a, b) => String(b.waktu || b.tanggal).localeCompare(String(a.waktu || a.tanggal)));

/** Uang tunai saldo yang lewat laci shift: isi (termasuk kembalian disimpan) − tarik. */
export const tunaiSaldoShift = (s, shiftId) =>
  sum((s.saldoPelanggan || []).filter((k) => k.shiftId === shiftId && k.jenis !== "pakai" && (k.metode || "tunai") === "tunai"), (k) => (tanda[k.jenis] || 0) * (Number(k.nominal) || 0));

/** Label riwayat. */
export function labelSaldo(k) {
  if (k.jenis === "pakai") return `Bayar order${k.no ? ` #${k.no}` : ""}`;
  if (k.sumber === "kembalian") return `Kembalian disimpan${k.no ? ` (order #${k.no})` : ""}`;
  return k.jenis === "isi" ? "Isi saldo" : "Tarik saldo";
}
