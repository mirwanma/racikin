// Multi-cabang (paket Max): tiap cabang = data usaha terpisah (Kasir, stok, Kas, tim sendiri) di akun pemilik yang sama.
// Murni (tanpa I/O): bikin dokumen cabang baru dari cabang yang lagi dibuka, kirim menu ke cabang lain (stok cabang
// tujuan tetap), dan ringkasan gabungan semua cabang. Data server & pindah cabang: js/cloud.js (cabang_*).
import { uid } from "./store.js";
import { addDays } from "./ui.js";
import { labaRugi } from "./laporan.js";

export const MAKS_CABANG = 10;

// Bagian yang bisa dikirim ke cabang lain.
export const BAGIAN = [
  { id: "menu", nama: "Menu, resep & varian", ket: "Harga jual, resep, varian/topping. Bahan baru ikut ditambahkan, stok cabang tujuan nggak berubah", keys: ["resep", "opsi"] },
  { id: "online", nama: "Harga ojol", ket: "Markup & harga GoFood / GrabFood / ShopeeFood", keys: ["online"] },
  { id: "promo", nama: "Promo & voucher", ket: "Happy hour, voucher, diskon", keys: ["promo"] },
  { id: "loyalty", nama: "Program kartu stempel", ket: "Aturan stempel & hadiah (pelanggan tiap cabang tetap sendiri)", keys: ["loyalty"] },
];

const salin = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/** Bahan dari cabang sumber digabung ke cabang tujuan: stok & riwayat tujuan tetap, info bahan (nama, satuan, harga) ikut sumber. */
export function gabungBahan(tujuan = [], sumber = []) {
  const ada = new Map(tujuan.map((b) => [b.id, b]));
  const out = tujuan.map((b) => {
    const s = sumber.find((x) => x.id === b.id);
    if (!s) return b;
    const { stok, min, ...info } = s;
    return { ...b, ...salin(info), stok: b.stok, ...(b.min != null ? { min: b.min } : min != null ? { min } : {}) };
  });
  for (const s of sumber) if (!ada.has(s.id)) out.push({ ...salin(s), stok: 0 });
  return out;
}

/**
 * Dokumen awal cabang baru, disalin dari cabang sumber: profil & brand, menu (resep, varian), bahan (stok 0),
 * harga ojol, promo, program stempel, supplier, setelan kasir & posisi karyawan. Transaksi, order, pelanggan,
 * karyawan & stok mulai kosong.
 */
export function docCabangBaru(src, nama, today) {
  const s = src || {};
  const doc = {
    profile: { ...(salin(s.profile) || {}), cabang: String(nama || "").trim(), tahap: s.profile?.tahap || "jalan" },
    brand: salin(s.brand) || null,
    resep: salin(s.resep) || [],
    opsi: salin(s.opsi) || [],
    bahan: gabungBahan([], s.bahan || []),
    online: salin(s.online) || null,
    promo: salin(s.promo) || [],
    loyalty: salin(s.loyalty) || null,
    supplier: salin(s.supplier) || [],
    posSetting: salin(s.posSetting) || null,
    studio: salin(s.studio) || null,
    wa: s.wa ? { ...salin(s.wa) } : null,
    stokLog: [],
    transactions: [],
    kasAwal: { tanggal: today, nominal: 0 },
    cabangDari: { tanggal: today },
  };
  if (s.absenSetting) doc.absenSetting = { ...salin(s.absenSetting), aktif: false };
  if (s.jadwal?.shift) doc.jadwal = { shift: salin(s.jadwal.shift), hari: {}, akun: {} };
  // Meja QR: token harus unik per cabang (pesan meja lewat token), jadi dibuat baru.
  if (Array.isArray(s.meja) && s.meja.length) doc.meja = s.meja.map((m) => ({ id: uid() + "m", nama: m.nama, token: (uid() + uid() + "racikin").slice(0, 24) }));
  return doc;
}

/** Kirim bagian menu dari cabang sumber ke dokumen cabang tujuan. Return dokumen tujuan yang baru. */
export function kirimMenu(tujuan, sumber, bagian = ["menu"]) {
  const t = { ...(tujuan || {}) };
  for (const b of BAGIAN.filter((x) => bagian.includes(x.id))) {
    for (const k of b.keys) t[k] = salin(sumber?.[k]) ?? (Array.isArray(tujuan?.[k]) ? [] : null);
    if (b.id === "menu") t.bahan = gabungBahan(tujuan?.bahan || [], sumber?.bahan || []);
  }
  return t;
}

const jumlahHari = (ph, dari, sampai) => {
  let omzet = 0;
  let order = 0;
  for (const [t, r] of Object.entries(ph || {})) {
    if (t < dari || t > sampai) continue;
    omzet += Number(r?.omzet) || 0;
    order += Number(r?.order) || 0;
  }
  return { omzet: Math.round(omzet), order };
};

/** Ringkasan per cabang + total dari hasil cabang_ringkasan: hari ini, 7 & 30 hari, laba rugi bulan ini. */
export function ringkasCabang(rows, today) {
  const ym = today.slice(0, 7);
  const sampaiHari = Number(today.slice(8));
  const list = (rows || []).map((c) => {
    const d = c.data || {};
    const lr = c.data ? labaRugi({ transactions: [], posHarian: {}, resep: [], bahan: [], opsi: [], kasbon: [], ...d }, ym, undefined, sampaiHari) : null;
    return {
      id: c.id,
      nama: c.nama || d.profile?.cabang || d.profile?.nama || "Cabang",
      utama: !!c.utama,
      kosong: !c.data,
      hari: jumlahHari(d.posHarian, today, today),
      minggu: jumlahHari(d.posHarian, addDays(today, -6), today),
      bulan30: jumlahHari(d.posHarian, addDays(today, -29), today),
      laba: lr ? Math.round(lr.labaBersih) : 0,
      pendapatan: lr ? Math.round(lr.pendapatan) : 0,
    };
  });
  const tot = (f) => list.reduce((a, x) => a + f(x), 0);
  const total = {
    hari: { omzet: tot((x) => x.hari.omzet), order: tot((x) => x.hari.order) },
    minggu: { omzet: tot((x) => x.minggu.omzet), order: tot((x) => x.minggu.order) },
    bulan30: { omzet: tot((x) => x.bulan30.omzet), order: tot((x) => x.bulan30.order) },
    laba: tot((x) => x.laba),
    pendapatan: tot((x) => x.pendapatan),
  };
  const terbaik = [...list].sort((a, b) => b.bulan30.omzet - a.bulan30.omzet)[0] || null;
  return { list, total, terbaik: list.length > 1 && terbaik?.bulan30.omzet ? terbaik : null };
}

/** Tanggal awal data ringkasan: 30 hari terakhir atau awal bulan (mana yang lebih dulu). */
export const dariRingkasan = (today) => {
  const a = addDays(today, -29);
  const b = `${today.slice(0, 7)}-01`;
  return a < b ? a : b;
};

/** Nama tampilan cabang. */
export const namaCabang = (c) => c?.nama || (c?.utama ? "Cabang utama" : "Cabang");
