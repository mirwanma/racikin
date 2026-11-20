// Utang ke supplier: belanja bahan sekarang, bayar nanti (tempo). Murni (tanpa UI).
//
// - Dicatat dari Belanja > "Sudah belanja" dengan centang "Belum dibayar": stok & harga bahan tetap ter-update
//   (catatBelanja), tapi pengeluaran Kas BELUM dicatat. Jadi satu nota utang per belanja.
// - Pembayaran (boleh dicicil) = pengeluaran Kas, kategori mengikuti isi nota (Bahan Baku / Kemasan, dibagi
//   proporsional), id "utang-<bayarId>", ref "utang". Laporan HPP "dari belanja" ikut bulan bayar (arus kas).
//
// state.utangSupplier = [{ id, supplierId, tanggal, tempo, total, rincian: [{ kategori, nominal }], catatan,
//                          bayar: [{ id, tanggal, nominal, metode }] }]
import { uid } from "./store.js";

export const TEMPO_DEFAULT = 7; // hari
export const SEBENTAR = 3; // pengingat kalau jatuh tempo tinggal sekian hari
export const METODE_BAYAR = [
  { id: "tunai", nama: "Tunai" },
  { id: "transfer", nama: "Transfer" },
  { id: "qris", nama: "QRIS" },
];

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const hari = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
export const tambahHari = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dibayar = (n) => sum(n.bayar || [], (b) => Number(b.nominal) || 0);
export const sisaNota = (n) => Math.max(0, (Number(n.total) || 0) - dibayar(n));

/** Buat nota utang dari rincian belanja (rincian = [{ kategori, nominal }]). */
export function notaUtang({ supplierId, tanggal, tempo, rincian, catatan = "" }) {
  const r = (rincian || []).filter((x) => Number(x.nominal) > 0).map((x) => ({ kategori: x.kategori, nominal: Math.round(Number(x.nominal)) }));
  const total = sum(r, (x) => x.nominal);
  if (!supplierId) throw new Error("Belanja utang harus pilih supplier");
  if (!total) throw new Error("Isi total bayar dulu biar utangnya kecatat");
  if (!tempo || tempo < tanggal) throw new Error("Jatuh tempo nggak boleh sebelum tanggal belanja");
  return { id: uid(), supplierId, tanggal, tempo, total, rincian: r, catatan: String(catatan).slice(0, 160), bayar: [] };
}

/** Status nota: lunas / telat / segera (≤ SEBENTAR hari) / belum. */
export function statusNota(n, today) {
  if (!sisaNota(n)) return "lunas";
  const d = hari(today, n.tempo);
  if (d < 0) return "telat";
  if (d <= SEBENTAR) return "segera";
  return "belum";
}

/** Transaksi Kas untuk satu pembayaran: dibagi ke kategori nota secara proporsional. */
export function kasBayar(n, b, namaSupplier = "") {
  const r = n.rincian?.length ? n.rincian : [{ kategori: "Bahan Baku", nominal: n.total }];
  const tot = sum(r, (x) => x.nominal) || 1;
  let sisa = Math.round(Number(b.nominal) || 0);
  return r
    .map((x, i) => {
      const nominal = i === r.length - 1 ? sisa : Math.round((b.nominal * x.nominal) / tot);
      sisa -= nominal;
      return {
        id: `utang-${b.id}${i ? `-${i}` : ""}`,
        tanggal: b.tanggal,
        jenis: "keluar",
        kategori: x.kategori,
        nominal,
        catatan: `Bayar utang${namaSupplier ? ` ${namaSupplier}` : ""} (belanja ${n.tanggal})`,
        ref: "utang",
      };
    })
    .filter((t) => t.nominal > 0);
}

const namaSup = (s, id) => (s.supplier || []).find((x) => x.id === id)?.nama || "";

/** Bayar nota (boleh dicicil). Return { utangSupplier, transactions }. */
export function bayarUtang(s, notaId, { nominal, tanggal, metode = "transfer" }) {
  const n = (s.utangSupplier || []).find((x) => x.id === notaId);
  if (!n) throw new Error("Nota nggak ketemu");
  const v = Math.round(Number(nominal) || 0);
  const sisa = sisaNota(n);
  if (v <= 0) throw new Error("Isi jumlah yang dibayar");
  if (v > sisa) throw new Error(`Maksimal Rp${sisa.toLocaleString("id-ID")} (sisa utang)`);
  const b = { id: uid(), tanggal, nominal: v, metode };
  const nota = { ...n, bayar: [...(n.bayar || []), b] };
  return {
    utangSupplier: s.utangSupplier.map((x) => (x.id === notaId ? nota : x)),
    transactions: [...(s.transactions || []), ...kasBayar(n, b, namaSup(s, n.supplierId))],
  };
}

/** Bayar semua utang satu supplier sekaligus (nota paling lama dulu). */
export function lunasiSupplier(s, supplierId, { tanggal, metode = "transfer" }) {
  let st = s;
  const list = (s.utangSupplier || []).filter((n) => n.supplierId === supplierId && sisaNota(n)).sort((a, b) => a.tempo.localeCompare(b.tempo));
  if (!list.length) throw new Error("Nggak ada utang ke supplier ini");
  for (const n of list) st = { ...st, ...bayarUtang(st, n.id, { nominal: sisaNota(n), tanggal, metode }) };
  return { utangSupplier: st.utangSupplier, transactions: st.transactions };
}

/** Hapus satu pembayaran (salah catat): Kas-nya ikut dihapus. */
export function hapusBayarUtang(s, notaId, bayarId) {
  return {
    utangSupplier: (s.utangSupplier || []).map((n) => (n.id === notaId ? { ...n, bayar: (n.bayar || []).filter((b) => b.id !== bayarId) } : n)),
    transactions: (s.transactions || []).filter((t) => !(t.ref === "utang" && (t.id === `utang-${bayarId}` || t.id.startsWith(`utang-${bayarId}-`)))),
  };
}

/** Hapus nota (salah catat). Hanya kalau belum ada pembayaran; stok yang sudah masuk tidak diubah. */
export function hapusNota(s, notaId) {
  const n = (s.utangSupplier || []).find((x) => x.id === notaId);
  if (!n) return null;
  if ((n.bayar || []).length) throw new Error("Hapus dulu catatan bayarnya");
  return { utangSupplier: s.utangSupplier.filter((x) => x.id !== notaId) };
}

/** Ubah jatuh tempo. */
export const ubahTempo = (s, notaId, tempo) => ({ utangSupplier: (s.utangSupplier || []).map((n) => (n.id === notaId ? { ...n, tempo } : n)) });

/** Nota yang belum lunas, urut jatuh tempo, dengan status. */
export function notaBelum(s, today) {
  return (s.utangSupplier || [])
    .filter((n) => sisaNota(n))
    .map((n) => ({ ...n, sisa: sisaNota(n), status: statusNota(n, today), hariLagi: hari(today, n.tempo) }))
    .sort((a, b) => a.tempo.localeCompare(b.tempo));
}

/** Ringkasan per supplier + total. */
export function ringkasUtang(s, today) {
  const list = notaBelum(s, today);
  const per = new Map();
  for (const n of list) {
    const x = per.get(n.supplierId) || { supplierId: n.supplierId, nama: namaSup(s, n.supplierId) || "(supplier dihapus)", sisa: 0, nota: [], telat: 0 };
    x.sisa += n.sisa;
    x.nota.push(n);
    if (n.status === "telat") x.telat += 1;
    per.set(n.supplierId, x);
  }
  return {
    total: sum(list, (n) => n.sisa),
    n: list.length,
    telat: list.filter((n) => n.status === "telat"),
    segera: list.filter((n) => n.status === "segera"),
    supplier: [...per.values()].sort((a, b) => a.nota[0].tempo.localeCompare(b.nota[0].tempo)),
  };
}

/** Pengingat Beranda: utang yang lewat atau tinggal ≤ SEBENTAR hari. */
export function pengingatUtang(s, today) {
  const r = ringkasUtang(s, today);
  const list = [...r.telat, ...r.segera];
  if (!list.length) return null;
  return { n: list.length, total: sum(list, (n) => n.sisa), telat: r.telat.length, tempo: list[0].tempo, nama: namaSup(s, list[0].supplierId) };
}

/** Riwayat (lunas juga) satu supplier, terbaru dulu. */
export const notaSupplier = (s, supplierId) => (s.utangSupplier || []).filter((n) => n.supplierId === supplierId).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
