// Dashboard admin platform (#/admin). Murni (tanpa UI): status merchant, ringkasan platform, filter, CSV.
// Data dari RPC admin_merchants() / admin_merchant_detail() (hanya untuk akun di platform_admins).

export const FITUR = [
  ["kasir", "Kasir"],
  ["tim", "Tim"],
  ["shift", "Shift"],
  ["stempel", "Kartu stempel"],
  ["online", "Harga online"],
  ["varian", "Varian"],
  ["promo", "Promo"],
  ["wa", "WhatsApp"],
  ["meja", "Pesan meja"],
  ["dapur", "Dapur"],
  ["foto", "Foto menu"],
  ["impor", "Impor data"],
];

export const STATUS = {
  aktif: { nama: "Aktif", cls: "pos" },
  berisiko: { nama: "Berisiko berhenti", cls: "neg" },
  baru: { nama: "Baru", cls: "info" },
  tidur: { nama: "Belum jualan", cls: "muted" },
};

const hariAntara = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(String(a).slice(0, 10) + "T00:00:00")) / 864e5);
export const isTes = (m) => /@racikin\.test$/i.test(m.email || "");

/** Status & angka turunan satu merchant. today = "YYYY-MM-DD". */
export function statusMerchant(m, today) {
  const umur = hariAntara(m.daftar, today);
  const sepi = m.jualan_terakhir ? hariAntara(m.jualan_terakhir, today) : null;
  const ubah = m.diubah ? hariAntara(m.diubah, today) : null;
  const pernah = (m.order30 || 0) + (m.order_prev30 || 0) > 0 || !!m.jualan_terakhir;
  let status;
  if (pernah && sepi !== null && sepi <= 7) status = "aktif";
  else if (pernah && sepi !== null && sepi > 14) status = "berisiko";
  else if (umur <= 14) status = "baru";
  else if (pernah) status = "aktif";
  else status = "tidur";
  const tren = m.order_prev30 ? ((m.order30 - m.order_prev30) / m.order_prev30) * 100 : m.order30 ? null : 0;
  const fitur = FITUR.filter(([k]) => m.fitur?.[k]).map(([k]) => k);
  // Skor aktivitas 0-100: rutin jualan (50) + fitur dipakai (30) + tren (20)
  const skor = Math.round(Math.min(1, (m.hari_jualan30 || 0) / 26) * 50 + Math.min(1, fitur.length / 8) * 30 + (tren === null ? 15 : tren >= 0 ? 20 : tren >= -20 ? 10 : 0));
  return { status, umur, sepi, ubah, tren, fitur, skor, aktif7: (sepi !== null && sepi <= 7) || (ubah !== null && ubah <= 7), aktif30: (sepi !== null && sepi <= 30) || (ubah !== null && ubah <= 30) };
}

const hitung = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x) || "-";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const awalMinggu = (iso) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Senin
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Ringkasan platform. list = hasil admin_merchants (+ status). */
export function ringkasPlatform(list, today) {
  const x = list.map((m) => ({ m, st: statusMerchant(m, today) }));
  const sum = (f) => x.reduce((a, r) => a + (Number(f(r)) || 0), 0);
  // Pendaftar per minggu, 8 minggu terakhir
  const minggu = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(awalMinggu(today) + "T00:00:00");
    d.setDate(d.getDate() - i * 7);
    minggu.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const daftarMinggu = minggu.map((w) => ({ minggu: w, n: x.filter((r) => awalMinggu(r.m.daftar) === w).length }));
  return {
    total: list.length,
    aktif7: x.filter((r) => r.st.aktif7).length,
    aktif30: x.filter((r) => r.st.aktif30).length,
    baru30: x.filter((r) => r.st.umur <= 30).length,
    berisiko: x.filter((r) => r.st.status === "berisiko").length,
    status: Object.keys(STATUS).map((k) => [k, x.filter((r) => r.st.status === k).length]),
    tahap: { ide: x.filter((r) => r.m.tahap !== "jalan").length, jalan: x.filter((r) => r.m.tahap === "jalan").length },
    order30: sum((r) => r.m.order30),
    omzet30: sum((r) => r.m.omzet30),
    orderPrev30: sum((r) => r.m.order_prev30),
    omzetPrev30: sum((r) => r.m.omzet_prev30),
    ai30: sum((r) => r.m.ai30),
    meja30: sum((r) => r.m.meja_order30),
    fitur: FITUR.map(([k, nama]) => ({ k, nama, n: x.filter((r) => r.m.fitur?.[k]).length })),
    kota: hitung(list, (m) => (m.kota || "").trim()).slice(0, 6),
    jenis: hitung(list, (m) => m.jenis).slice(0, 6),
    daftarMinggu,
  };
}

export const URUT = [
  ["aktif", "Terakhir aktif"],
  ["omzet30", "Omzet 30 hari"],
  ["order30", "Order 30 hari"],
  ["daftar", "Terbaru daftar"],
  ["skor", "Skor aktivitas"],
  ["nama", "Nama A-Z"],
];

/** Filter & urutkan daftar merchant. f = { q, status, tahap, urut, tes } */
export function saringMerchant(list, f, today) {
  const q = String(f.q || "").trim().toLowerCase();
  const rows = list
    .filter((m) => f.tes || !isTes(m))
    .map((m) => ({ ...m, st: statusMerchant(m, today) }))
    .filter((m) => !f.status || m.st.status === f.status)
    .filter((m) => !f.tahap || (f.tahap === "jalan" ? m.tahap === "jalan" : m.tahap !== "jalan"))
    .filter((m) => !q || [m.nama, m.email, m.kota, m.pemilik, m.jenis].some((v) => String(v || "").toLowerCase().includes(q)));
  const by = {
    aktif: (a, b) => String(b.jualan_terakhir || b.diubah || "").localeCompare(String(a.jualan_terakhir || a.diubah || "")),
    omzet30: (a, b) => (b.omzet30 || 0) - (a.omzet30 || 0),
    order30: (a, b) => (b.order30 || 0) - (a.order30 || 0),
    daftar: (a, b) => String(b.daftar).localeCompare(String(a.daftar)),
    skor: (a, b) => b.st.skor - a.st.skor,
    nama: (a, b) => String(a.nama).localeCompare(String(b.nama), "id"),
  };
  return rows.sort(by[f.urut] || by.aktif);
}

const sel = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV daftar merchant (untuk dibuka di Excel / Sheets). */
export function toCSV(rows) {
  const head = ["nama", "pemilik", "email", "kota", "jenis", "tahap", "status", "skor", "daftar", "jualan_terakhir", "order7", "omzet7", "order30", "omzet30", "order_prev30", "omzet_prev30", "tren_order_persen", "hari_jualan30", "menu", "pelanggan", "tim", "ai30", "pesan_meja30", "fitur"];
  const lines = rows.map((m) =>
    [m.nama, m.pemilik, m.email, m.kota, m.jenis, m.tahap, STATUS[m.st.status].nama, m.st.skor, String(m.daftar).slice(0, 10), m.jualan_terakhir, m.order7, m.omzet7, m.order30, m.omzet30, m.order_prev30, m.omzet_prev30, m.st.tren === null ? "" : Math.round(m.st.tren), m.hari_jualan30, m.menu, m.pelanggan, m.tim, m.ai30, m.meja_order30, m.st.fitur.join(" ")]
      .map(sel)
      .join(","),
  );
  return "﻿" + [head.join(","), ...lines].join("\n");
}

// ---------- Desain dashboard (periode 7 / 30 / 90 hari) ----------
export const PERIODE = [7, 30, 90];
const jumlah = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);

/**
 * Ringkas deret harian platform (hasil admin_harian, urut lama -> baru, 2 x n hari).
 * Return periode sekarang (n hari terakhir) vs n hari sebelumnya.
 */
export function ringkasHarian(harian, n) {
  const list = Array.isArray(harian) ? harian : [];
  const kini = list.slice(-n);
  const lalu = list.slice(-2 * n, -n);
  const r = (arr) => ({ order: jumlah(arr, "order"), omzet: jumlah(arr, "omzet"), daftar: jumlah(arr, "daftar"), ai: jumlah(arr, "ai") });
  const a = r(kini);
  const b = r(lalu);
  const hariAda = kini.filter((x) => (Number(x.order) || 0) > 0).length;
  return {
    seri: kini,
    ...a,
    prev: b,
    rata: a.order ? a.omzet / a.order : 0,
    jualanRata: kini.length ? jumlah(kini, "jualan") / kini.length : 0,
    hariAda,
    adaPrev: lalu.length === n,
  };
}

/** Persentase perubahan (null kalau periode lalu kosong). */
export const persen = (kini, lalu) => (lalu ? ((kini - lalu) / lalu) * 100 : null);

/** Order & omzet merchant untuk periode (7 / 30 / 90). */
export function angkaPeriode(m, n) {
  if (n === 7) return { order: m.order7 || 0, omzet: m.omzet7 || 0 };
  if (n === 90) return { order: m.order90 ?? m.order30 ?? 0, omzet: m.omzet90 ?? m.omzet30 ?? 0 };
  return { order: m.order30 || 0, omzet: m.omzet30 || 0 };
}

/**
 * Daftar "Perlu disapa": merchant berisiko berhenti, pendaftar baru yang belum isi menu,
 * dan merchant aktif yang ordernya turun tajam. Urut paling penting dulu.
 */
export function perluDisapa(list, today) {
  const out = [];
  for (const m of list) {
    const st = statusMerchant(m, today);
    if (st.status === "berisiko") out.push({ m, st, jenis: "berisiko", teks: `Berhenti jualan ${st.sepi} hari`, bobot: 3 + (m.omzet_prev30 || 0) / 1e9 });
    else if (st.umur <= 14 && !m.menu) out.push({ m, st, jenis: "setup", teks: `Daftar ${st.umur} hari lalu, menu masih kosong`, bobot: 2 });
    else if (st.status === "aktif" && st.tren !== null && st.tren <= -30 && (m.order_prev30 || 0) >= 20) out.push({ m, st, jenis: "turun", teks: `Order turun ${Math.abs(Math.round(st.tren))}% dari bulan lalu`, bobot: 1 + Math.abs(st.tren) / 1000 });
  }
  return out.sort((a, b) => b.bobot - a.bobot);
}

// ---------- Paket & langganan (monetisasi) ----------
export const PAKET_NAMA = { bayar: "Pro", coba: "Coba", transisi: "Transisi", gratis: "Gratis" };
/** Jenis paket merchant: bayar | coba | transisi | gratis. */
export const jenisPaket = (p) => (p?.paket === "pro" ? p.sumber || "bayar" : "gratis");

/** Ringkasan langganan platform. paket = { [id]: paket_info }, harga = { harga_bulan, harga_tahun }. */
export function ringkasPaket(list, paket, harga = {}) {
  const hb = Number(harga.harga_bulan ?? 49000);
  const ht = Number(harga.harga_tahun ?? 490000);
  const out = { bayar: 0, coba: 0, transisi: 0, gratis: 0, mrr: 0, tahunan: 0 };
  for (const m of list) {
    const p = paket?.[m.id];
    const j = jenisPaket(p);
    out[j] += 1;
    if (j === "bayar") {
      if (p.periode === "tahun") {
        out.tahunan += 1;
        out.mrr += ht / 12;
      } else out.mrr += hb;
    }
  }
  out.mrr = Math.round(out.mrr);
  out.konversi = out.bayar + out.gratis ? Math.round((out.bayar / (out.bayar + out.gratis)) * 100) : null;
  return out;
}

/** Tanggal perpanjangan: dari sisa Pro berbayar (kalau masih aktif) atau dari hari ini. */
export function perpanjang(p, periode, now = new Date()) {
  const dasar = p?.paket === "pro" && p.sumber === "bayar" && new Date(p.sampai) > now ? new Date(p.sampai) : now;
  const d = new Date(dasar);
  if (periode === "tahun") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
