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
