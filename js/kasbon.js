// Kasbon pelanggan (piutang): makan dulu, bayar nanti. Murni (tanpa UI).
//
// - Di Kasir, metode bayar "kasbon" (wajib pilih pelanggan). Order tetap penjualan (stok dipotong, rekap/omzet naik:
//   akrual), tapi bagian kasbon BELUM masuk Kas. Bisa dikombinasikan dengan DP tunai (pembayaran campuran).
// - Uang masuk Kas saat pelunasan (boleh dicicil): transaksi Kas digabung per hari per metode,
//   id "kasbon-<tgl>-<metode>", kategori "Pelunasan kasbon", ref "kasbon" (dihitung ulang dari daftar kasbon,
//   jadi pelunasan yang dicatat akun kasir tetap masuk Kas setelah sinkron, lewat reconcile di pos.js).
// - Batas kasbon per pelanggan (default dari setelan) supaya kasir nggak bisa kasih utang berlebihan.
//
// state.kasbon = [{ id, jenis: "utang" | "bayar", pelangganId, tanggal, waktu, nominal,
//                   orderId?, no?            (utang dari order kasir, id "o-<orderId>")
//                   metode?, oleh?, shiftId?, catatan? (bayar) }]
// state.posSetting.kasbon = true | false, posSetting.kasbonBatas = rupiah (default BATAS_DEFAULT)
// pelanggan.batasKasbon = rupiah (opsional, menimpa default)
import { uid } from "./store.js";

export const BATAS_DEFAULT = 200_000;
export const KAT_KASBON = "Pelunasan kasbon";
export const METODE_BAYAR = [
  { id: "tunai", nama: "Tunai" },
  { id: "qris", nama: "QRIS" },
  { id: "transfer", nama: "Transfer" },
];
export const UMUR_TAGIH = 14; // kasbon dianggap perlu ditagih setelah sekian hari

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const hari = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

export const kasbonAktif = (s) => !!s.posSetting?.kasbon;
export const entri = (s, pelangganId) => (s.kasbon || []).filter((k) => k.pelangganId === pelangganId);

/** Batas kasbon pelanggan (rupiah). */
export function batasKasbon(s, p) {
  const pribadi = p && p.batasKasbon != null && p.batasKasbon !== "" ? Number(p.batasKasbon) : null;
  if (pribadi != null && Number.isFinite(pribadi)) return Math.max(0, pribadi);
  const d = s.posSetting?.kasbonBatas;
  return d != null && d !== "" && Number.isFinite(Number(d)) ? Math.max(0, Number(d)) : BATAS_DEFAULT;
}

/** Sisa kasbon pelanggan (negatif = lebih bayar, mis. order dibatalkan setelah lunas). */
export const saldoKasbon = (s, pelangganId) => sum(entri(s, pelangganId), (k) => (k.jenis === "utang" ? 1 : -1) * (Number(k.nominal) || 0));

/**
 * Tanggal kasbon tertua yang belum lunas (FIFO: pelunasan menutup utang paling lama dulu).
 * Return null kalau sudah lunas.
 */
export function sejakKasbon(s, pelangganId) {
  const list = entri(s, pelangganId);
  let bayar = sum(list.filter((k) => k.jenis === "bayar"), (k) => Number(k.nominal) || 0);
  const utang = list.filter((k) => k.jenis === "utang").sort((a, b) => String(a.waktu || a.tanggal).localeCompare(String(b.waktu || b.tanggal)));
  for (const u of utang) {
    const n = Number(u.nominal) || 0;
    if (bayar >= n) bayar -= n;
    else return u.tanggal;
  }
  return null;
}

/** Cek boleh kasbon sebesar `jumlah` untuk pelanggan. Return pesan error atau "" kalau boleh. */
export function cekKasbon(s, pelangganId, jumlah) {
  if (!pelangganId) return "Pilih pelanggan yang kasbon dulu";
  const p = (s.pelanggan || []).find((x) => x.id === pelangganId);
  if (!p) return "Pelanggan nggak ketemu";
  const n = Math.round(Number(jumlah) || 0);
  if (n <= 0) return "";
  const batas = batasKasbon(s, p);
  const saldo = Math.max(0, saldoKasbon(s, pelangganId));
  if (saldo + n > batas) {
    const sisa = Math.max(0, batas - saldo);
    return `Lewat batas kasbon ${p.nama} (Rp${batas.toLocaleString("id-ID")}). ${sisa ? `Maksimal kasbon lagi Rp${sisa.toLocaleString("id-ID")}` : "Lunasi dulu kasbon sebelumnya"}.`;
  }
  return "";
}

/** Bagian kasbon dari sebuah order (pembayaran campuran: sisa setelah DP tunai). */
export const porsiKasbon = (o) =>
  Array.isArray(o.pembayaran) && o.pembayaran.length ? sum(o.pembayaran.filter((x) => x.metode === "kasbon"), (x) => Number(x.jumlah) || 0) : o.metode === "kasbon" ? Number(o.total) || 0 : 0;

/** Entri utang dari order kasir (dipanggil buatOrder). */
export function utangDariOrder(o) {
  const n = porsiKasbon(o);
  if (!n || !o.pelangganId) return null;
  return { id: `o-${o.id}`, jenis: "utang", pelangganId: o.pelangganId, tanggal: o.tanggal, waktu: o.waktu, nominal: n, orderId: o.id, no: o.no };
}

/** Order dibatalkan: kasbonnya ikut dihapus. */
export const hapusUtangOrder = (kasbon, orderId) => (kasbon || []).filter((k) => k.id !== `o-${orderId}`);

/** Transaksi Kas pelunasan kasbon untuk satu tanggal (digabung per metode). */
export function kasbonKas(transactions, kasbon, tanggal) {
  const tx = (transactions || []).filter((t) => !(t.ref === "kasbon" && t.tanggal === tanggal));
  const bayar = (kasbon || []).filter((k) => k.jenis === "bayar" && k.tanggal === tanggal);
  for (const m of METODE_BAYAR) {
    const list = bayar.filter((k) => (k.metode || "tunai") === m.id);
    if (!list.length) continue;
    tx.push({
      id: `kasbon-${tanggal}-${m.id}`,
      tanggal,
      jenis: "masuk",
      kategori: KAT_KASBON,
      nominal: Math.round(sum(list, (k) => Number(k.nominal) || 0)),
      catatan: `Pelunasan kasbon · ${m.nama} · ${list.length}×`,
      ref: "kasbon",
    });
  }
  return tx;
}

/** Hitung ulang semua transaksi Kas pelunasan kasbon (setelah sinkron / hapus). */
export function kasbonKasSemua(transactions, kasbon) {
  const tgl = new Set([...(transactions || []).filter((t) => t.ref === "kasbon").map((t) => t.tanggal), ...(kasbon || []).filter((k) => k.jenis === "bayar").map((k) => k.tanggal)]);
  let tx = transactions || [];
  for (const t of tgl) tx = kasbonKas(tx, kasbon, t);
  return tx;
}

/**
 * Terima pembayaran kasbon (boleh dicicil, tidak boleh lebih dari sisa).
 * Return { kasbon, transactions, entri }.
 */
export function bayarKasbon(s, pelangganId, { nominal, metode = "tunai", tanggal, waktu, oleh = null, shiftId = null, catatan = "" }) {
  const n = Math.round(Number(nominal) || 0);
  const sisa = saldoKasbon(s, pelangganId);
  if (n <= 0) throw new Error("Isi jumlah yang dibayar");
  if (n > sisa) throw new Error(`Maksimal Rp${Math.max(0, sisa).toLocaleString("id-ID")} (sisa kasbon)`);
  if (!METODE_BAYAR.some((m) => m.id === metode)) throw new Error("Metode bayar nggak dikenal");
  const e = { id: uid(), jenis: "bayar", pelangganId, tanggal, waktu: waktu || `${tanggal}T00:00`, nominal: n, metode };
  if (oleh) e.oleh = oleh;
  if (shiftId) e.shiftId = shiftId;
  if (String(catatan || "").trim()) e.catatan = String(catatan).trim().slice(0, 100);
  const kasbon = [...(s.kasbon || []), e];
  return { kasbon, transactions: kasbonKas(s.transactions, kasbon, tanggal), entri: e };
}

/** Hapus catatan pelunasan (salah catat). Kas ikut dihitung ulang. */
export function hapusBayar(s, id) {
  const e = (s.kasbon || []).find((k) => k.id === id && k.jenis === "bayar");
  if (!e) return null;
  const kasbon = s.kasbon.filter((k) => k.id !== id);
  return { kasbon, transactions: kasbonKas(s.transactions, kasbon, e.tanggal) };
}

/** Daftar pelanggan yang masih punya kasbon, urut dari yang paling lama. */
export function daftarKasbon(s, today) {
  const ids = [...new Set((s.kasbon || []).map((k) => k.pelangganId))];
  return ids
    .map((id) => {
      const p = (s.pelanggan || []).find((x) => x.id === id) || { id, nama: "(pelanggan dihapus)" };
      const saldo = saldoKasbon(s, id);
      const sejak = sejakKasbon(s, id);
      return { p, saldo, sejak, umur: sejak ? hari(sejak, today) : 0, batas: batasKasbon(s, p) };
    })
    .filter((x) => x.saldo > 0)
    .sort((a, b) => b.umur - a.umur || b.saldo - a.saldo);
}

/** Ringkasan untuk Beranda / modul. */
export function ringkasKasbon(s, today) {
  const list = daftarKasbon(s, today);
  const lama = list.filter((x) => x.umur >= UMUR_TAGIH);
  return { n: list.length, total: sum(list, (x) => x.saldo), lama: lama.length, totalLama: sum(lama, (x) => x.saldo) };
}

/** Riwayat kasbon satu pelanggan (terbaru dulu). */
export const riwayatKasbon = (s, pelangganId) => [...entri(s, pelangganId)].sort((a, b) => String(b.waktu || b.tanggal).localeCompare(String(a.waktu || a.tanggal)));

/** Pelunasan tunai yang diterima di laci shift tertentu. */
export const tunaiShift = (s, shiftId) => sum((s.kasbon || []).filter((k) => k.jenis === "bayar" && k.shiftId === shiftId && (k.metode || "tunai") === "tunai"), (k) => Number(k.nominal) || 0);

/** Pesan tagihan sopan untuk WhatsApp. */
export function teksTagih(s, p, bisnis, rp) {
  const saldo = saldoKasbon(s, p.id);
  const utang = riwayatKasbon(s, p.id)
    .filter((k) => k.jenis === "utang")
    .slice(0, 5)
    .reverse();
  return [
    `Halo kak ${p.nama}, ini dari ${bisnis}.`,
    `Mau ngingetin catatan kasbonnya ya: *${rp(saldo)}*.`,
    utang.length ? "" : null,
    ...utang.map((k) => `- ${k.tanggal}${k.no ? ` (order #${k.no})` : ""}: ${rp(k.nominal)}`),
    "",
    "Bisa dibayar pas mampir atau transfer/QRIS. Makasih banyak kak!",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
