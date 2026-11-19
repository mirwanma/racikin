// Pajak UMKM: PPh Final 0,5% dari omzet (peredaran bruto). Murni (tanpa UI).
// Ringkasan aturan (terakhir dicek DICEK, sumber: PP 55/2022 jo. PP 20/2026, PMK 81/2024, DJP):
// - Orang pribadi (OP) & PT perorangan / koperasi beromzet <= Rp4,8 miliar/tahun boleh pakai tarif 0,5% (OP & PT perorangan
//   tanpa batas waktu sejak PP 20/2026). CV / firma / PT biasa: tarif umum (di luar fitur ini).
// - OP: omzet Rp500 juta pertama dalam 1 tahun pajak tidak kena pajak. Badan (PT perorangan / koperasi): semua omzet kena.
// - Disetor sendiri per bulan paling lambat tanggal 15 bulan berikutnya, kode billing KAP 411128 KJS 420 (Coretax).
//   Bukti setor (NTPN) dianggap sudah lapor masa; omzet per bulan dilaporkan lagi di SPT Tahunan.
//
// state.pajak = { bentuk: "op" | "ptp" | "koperasi" | "lain", catatKas: true,
//                 bayar: { "YYYY-MM": { tanggal, nominal, ntpn } } }
export const DICEK = "November 2026";
export const TARIF = 0.005;
export const BEBAS_OP = 500_000_000;
export const BATAS_OMZET = 4_800_000_000;
export const KAP = "411128";
export const KJS = "420";
export const BENTUK = {
  op: { nama: "Orang pribadi (usaha atas nama sendiri)", bebas: true },
  ptp: { nama: "PT perorangan", bebas: false },
  koperasi: { nama: "Koperasi", bebas: false },
  lain: { nama: "CV / firma / PT biasa", bebas: false, umum: true },
};
// Kategori pemasukan Kas yang dihitung sebagai omzet usaha.
export const KAT_OMZET = ["Penjualan", "Pre-order", "Katering/pesanan"];
export const KAT_PAJAK = "Pajak";

export const bentukDari = (s) => (BENTUK[s.pajak?.bentuk] ? s.pajak.bentuk : "op");

/** Omzet per bulan untuk tahun tsb (dari Kas): { "YYYY-MM": rupiah } untuk 12 bulan. */
export function omzetBulanan(s, tahun) {
  const out = {};
  for (let m = 1; m <= 12; m++) out[`${tahun}-${String(m).padStart(2, "0")}`] = 0;
  for (const t of s.transactions || []) {
    if (t.jenis !== "masuk" || !KAT_OMZET.includes(t.kategori)) continue;
    const ym = String(t.tanggal).slice(0, 7);
    if (ym in out) out[ym] += Number(t.nominal) || 0;
  }
  return out;
}

/** Jatuh tempo setor masa: tanggal 15 bulan berikutnya. */
export function jatuhTempo(ym) {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-15`;
}

/**
 * Hitung PPh Final per bulan dalam setahun.
 * Return { bentuk, tahun, bulan: [{ ym, omzet, kumulatif, dpp, pph, tempo, status: kosong|nol|lunas|belum|telat|nanti, bayar }],
 *          omzet, pph, sisaBebas, lewatBatas, total: { lunas, belum } }
 */
export function hitungPajak(s, tahun, today) {
  const bentuk = bentukDari(s);
  const b = BENTUK[bentuk];
  const omzet = omzetBulanan(s, tahun);
  const bayar = s.pajak?.bayar || {};
  let kum = 0;
  const bulan = Object.entries(omzet).map(([ym, o]) => {
    const sebelum = kum;
    kum += o;
    // OP: hanya bagian omzet yang melewati Rp500 juta (kumulatif setahun) yang kena pajak.
    const dpp = b.umum ? 0 : b.bebas ? Math.max(0, kum - Math.max(sebelum, BEBAS_OP)) : o;
    const pph = Math.floor(dpp * TARIF);
    const tempo = jatuhTempo(ym);
    const lunas = bayar[ym];
    const lewat = today.slice(0, 7) > ym; // bulan sudah selesai
    let status;
    if (!lewat && ym === today.slice(0, 7)) status = "berjalan";
    else if (!lewat) status = "nanti";
    else if (!o) status = "kosong";
    else if (!pph) status = "nol";
    else if (lunas) status = "lunas";
    else status = today > tempo ? "telat" : "belum";
    return { ym, omzet: o, kumulatif: kum, dpp, pph, tempo, status, bayar: lunas || null };
  });
  const pph = bulan.reduce((a, x) => a + x.pph, 0);
  return {
    bentuk,
    tahun,
    bulan,
    omzet: kum,
    pph,
    umum: !!b.umum,
    sisaBebas: b.bebas ? Math.max(0, BEBAS_OP - kum) : 0,
    lewatBatas: kum > BATAS_OMZET,
    total: {
      lunas: bulan.filter((x) => x.status === "lunas").reduce((a, x) => a + (Number(x.bayar?.nominal) || x.pph), 0),
      belum: bulan.filter((x) => x.status === "belum" || x.status === "telat").reduce((a, x) => a + x.pph, 0),
    },
  };
}

/** Tagihan yang perlu diingatkan (bulan lalu belum dibayar). Return { ym, pph, tempo, telat } | null */
export function tagihanPajak(s, today) {
  const tahun = Number(today.slice(0, 4));
  const list = [...hitungPajak(s, tahun, today).bulan, ...(today.slice(5, 7) === "01" ? hitungPajak(s, tahun - 1, today).bulan : [])];
  const x = list.filter((b) => b.status === "belum" || b.status === "telat").sort((a, b) => a.ym.localeCompare(b.ym))[0];
  return x ? { ym: x.ym, pph: x.pph, tempo: x.tempo, telat: x.status === "telat" } : null;
}

/** Catat pembayaran (opsional sekalian jadi pengeluaran Kas kategori Pajak). */
export function catatBayar(s, ym, { tanggal, nominal, ntpn = "", catatKas = true }) {
  const n = Math.round(Number(nominal) || 0);
  if (n <= 0) throw new Error("Isi jumlah yang dibayar");
  const pajak = { ...(s.pajak || {}), bayar: { ...(s.pajak?.bayar || {}), [ym]: { tanggal, nominal: n, ntpn: String(ntpn || "").trim().slice(0, 30) } } };
  const txId = `pajak-${ym}`;
  let transactions = (s.transactions || []).filter((t) => t.id !== txId);
  if (catatKas) transactions = [...transactions, { id: txId, tanggal, jenis: "keluar", kategori: KAT_PAJAK, nominal: n, catatan: `PPh Final UMKM masa ${ym}`, ref: "pajak" }];
  return { pajak, transactions };
}

/** Batalkan catatan bayar (Kas ikut dihapus). */
export function batalBayar(s, ym) {
  const bayar = { ...(s.pajak?.bayar || {}) };
  delete bayar[ym];
  return { pajak: { ...(s.pajak || {}), bayar }, transactions: (s.transactions || []).filter((t) => t.id !== `pajak-${ym}`) };
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const namaBulan = (ym) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Teks rekap omzet per bulan untuk SPT Tahunan (disalin). */
export function teksSpt(h, rp) {
  return [
    `Rekap omzet ${h.tahun} (PPh Final 0,5%)`,
    ...h.bulan.filter((x) => x.omzet).map((x) => `${namaBulan(x.ym)}: omzet ${rp(x.omzet)} · PPh ${rp(x.pph)}${x.bayar?.ntpn ? ` · NTPN ${x.bayar.ntpn}` : ""}`),
    `Total omzet: ${rp(h.omzet)} · Total PPh: ${rp(h.pph)}`,
  ].join("\n");
}
