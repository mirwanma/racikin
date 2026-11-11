// Data dummy lengkap TAHGUY: 15 menu + resep, 25 bahan, penjualan kasir 60 hari terakhir
// (toko & order online), belanja bahan, biaya operasional, pelanggan & stempel, plus RAB, brand,
// aktivasi & kalender konten. Dipakai untuk demo / uji coba. Hasilnya acak tapi konsisten
// (seed tetap), dan semua angka saling cocok: Kas = rekap kasir, stok = belanja - pemakaian.
import { uid } from "./store.js";
import { todayISO, addDays } from "./ui.js";
import { kebutuhan } from "./stok-utils.js";
import { reconcile, SIMPAN_HARI } from "./pos.js";
import { hargaDi, komisiRp } from "./online.js";
import { newToken } from "./loyalty.js";
import { demo } from "./demo.js";

export const HARI = 60;

/** PRNG kecil dengan seed (mulberry32) supaya data selalu sama tiap dibuat. */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFILE = {
  owner: "Raka",
  ide: "Tahu guyur kuah kaldu pedas dengan topping custom, porsi pas buat mahasiswa, jualan sore sampai malam",
  nama: "TAHGUY",
  jenis: "Jajanan / snack",
  konsep: "Gerobak / booth",
  menu: "Tahu guyur original, pedas level 1-5, topping telur, bakso & keju, plus es teh & es jeruk",
  kota: "Cimahi",
  area: "Kampus Unjani",
  target: ["Mahasiswa", "Pekerja kantoran"],
  modal: 8_000_000,
  harga: 12_000,
  waktu: "Full-time",
  skill: ["Masak", "Sosmed / konten"],
};

// [kode, nama, satuan, harga per satuan, kemasan?, ukuran belanja]
const BAHAN = [
  ["tahu", "Tahu putih", "pcs", 600, false, 400],
  ["kaldu", "Kaldu sapi bubuk", "gram", 120, false, 1000],
  ["bput", "Bawang putih", "gram", 40, false, 1000],
  ["bmer", "Bawang merah", "gram", 45, false, 1000],
  ["cabai", "Cabai rawit", "gram", 80, false, 1000],
  ["kecap", "Kecap manis", "ml", 25, false, 2000],
  ["dbawang", "Daun bawang", "ikat", 3000, false, 10],
  ["bgoreng", "Bawang goreng", "gram", 120, false, 1000],
  ["telur", "Telur ayam", "butir", 2200, false, 90],
  ["bakso", "Bakso sapi", "pcs", 1200, false, 200],
  ["keju", "Keju cheddar", "gram", 110, false, 1000],
  ["tapioka", "Tepung tapioka (aci)", "gram", 14, false, 5000],
  ["minyak", "Minyak goreng", "ml", 18, false, 5000],
  ["ayam", "Ayam suwir bumbu", "gram", 90, false, 1000],
  ["teh", "Teh celup", "pcs", 250, false, 100],
  ["gula", "Gula pasir", "gram", 16, false, 5000],
  ["jeruk", "Jeruk peras", "pcs", 1500, false, 60],
  ["skm", "Susu kental manis", "ml", 35, false, 1500],
  ["aren", "Gula aren cair", "ml", 45, false, 1000],
  ["es", "Es batu", "gram", 2, false, 20000],
  ["air", "Air mineral 600 ml", "pcs", 2500, false, 48],
  ["mangkok", "Mangkok kertas", "pcs", 900, true, 300],
  ["sendok", "Sendok plastik", "pcs", 150, true, 500],
  ["cup", "Cup plastik + tutup", "pcs", 600, true, 300],
  ["kresek", "Kantong plastik", "pcs", 100, true, 500],
];

const KUAH = [["tahu", 3], ["kaldu", 5], ["bput", 3], ["bmer", 3], ["cabai", 3], ["kecap", 10], ["dbawang", 0.05], ["bgoreng", 3], ["mangkok", 1], ["sendok", 1]];
const TEH = [["teh", 1], ["gula", 20], ["es", 150], ["cup", 1]];
const plus = (base, extra) => {
  const m = new Map(base.map(([k, q]) => [k, q]));
  for (const [k, q] of extra) m.set(k, (m.get(k) || 0) + q);
  return [...m.entries()];
};

// [kode, nama, harga, komposisi, bobot laku, minuman?, mulai dijual (hari ke-, 0 = sejak awal)]
const MENU = [
  ["ori", "Tahu Guyur Original", 12000, KUAH, 18],
  ["pedas", "Tahu Guyur Pedas Level", 13000, plus(KUAH, [["cabai", 8]]), 15],
  ["telur", "Tahu Guyur Telur", 15000, plus(KUAH, [["telur", 1]]), 12],
  ["baksotg", "Tahu Guyur Bakso", 16000, plus(KUAH, [["bakso", 3]]), 9],
  ["komplit", "Tahu Guyur Komplit", 19000, plus(KUAH, [["telur", 1], ["bakso", 3]]), 8],
  ["keju", "Tahu Guyur Keju", 17000, plus(KUAH, [["keju", 15]]), 7, false, 30],
  ["crispy", "Tahu Crispy Sambal Matah", 14000, [["tahu", 3], ["tapioka", 30], ["minyak", 40], ["cabai", 8], ["bmer", 10], ["mangkok", 1]], 6],
  ["walik", "Tahu Walik Aci", 10000, [["tahu", 3], ["tapioka", 40], ["bput", 2], ["minyak", 40], ["dbawang", 0.03], ["mangkok", 1]], 5],
  ["cireng", "Cireng Isi Ayam Suwir", 10000, [["tapioka", 60], ["ayam", 25], ["minyak", 40], ["bput", 2], ["mangkok", 1]], 5, false, 30],
  ["baksotahu", "Bakso Tahu Kuah", 15000, [["tahu", 2], ["bakso", 4], ["kaldu", 6], ["bgoreng", 3], ["dbawang", 0.05], ["mangkok", 1], ["sendok", 1]], 4],
  ["paket", "Paket Hemat Mahasiswa", 15000, plus(KUAH, TEH), 8],
  ["esteh", "Es Teh Manis", 4000, TEH, 40, true],
  ["esjeruk", "Es Jeruk Peras", 7000, [["jeruk", 2], ["gula", 20], ["es", 150], ["cup", 1]], 15, true],
  ["tehaaren", "Es Teh Susu Gula Aren", 9000, [["teh", 1], ["skm", 25], ["aren", 20], ["es", 150], ["cup", 1]], 25, true, 15],
  ["air", "Air Mineral", 4000, [["air", 1]], 20, true],
];

const NAMA = [
  "Dimas Pratama", "Sinta Ayu", "Rizky Maulana", "Nadia Putri", "Fajar Nugroho", "Alya Rahma", "Bagas Saputra", "Citra Lestari",
  "Galih Ramadhan", "Intan Permata", "Yoga Aditya", "Salsa Nabila", "Reza Firmansyah", "Tiara Anggraini", "Ilham Hidayat", "Putri Amelia",
  "Arif Setiawan", "Dewi Kartika", "Hendra Wijaya", "Laras Wulandari", "Bima Prakoso", "Nisa Fauziah", "Farhan Akbar", "Mega Safitri",
  "Rendi Kurniawan", "Anisa Zahra", "Kevin Gunawan", "Vina Oktaviani", "Agus Santoso", "Rani Puspita", "Doni Saputra", "Ayu Lestari",
  "Wahyu Hidayat", "Fitri Handayani", "Rangga Mahendra", "Indah Sari", "Taufik Rahman", "Lia Marlina", "Andre Setiadi", "Zahra Aulia",
];

/**
 * Bikin state lengkap. today = tanggal hari ini (YYYY-MM-DD), settings = setelan perangkat (dipertahankan).
 */
export function buatDataDummy({ today = todayISO(), settings } = {}) {
  const r = rng(20261111);
  const chance = (p) => r() < p;
  const between = (a, b) => a + Math.floor(r() * (b - a + 1));
  const weighted = (list, w) => {
    const total = list.reduce((a, x) => a + w(x), 0);
    let x = r() * total;
    for (const it of list) if ((x -= w(it)) < 0) return it;
    return list[list.length - 1];
  };
  const start = addDays(today, -(HARI - 1));

  // ---------- Bahan & resep ----------
  const idB = Object.fromEntries(BAHAN.map(([k]) => [k, uid() + k]));
  const bahan = BAHAN.map(([k, nama, satuan, harga]) => ({ id: idB[k], nama, satuan, harga, stok: 0, min: 0, estimasi: false, tracked: true }));
  const resep = MENU.map(([k, nama, harga, items]) => ({
    id: uid() + k,
    nama,
    harga,
    hasil: 1,
    items: items.map(([b, qty]) => ({ bahanId: idB[b], qty })),
  }));
  const menu = MENU.map(([k, , , , bobot, minum = false, mulai = 0], i) => ({ k, bobot, minum, mulai, resep: resep[i] }));
  const makanan = menu.filter((m) => !m.minum);
  const minuman = menu.filter((m) => m.minum);

  // ---------- Program stempel & pelanggan ----------
  const loyalty = { nama: "Kartu Setia TAHGUY", target: 6, hadiah: "1 porsi Tahu Guyur Original gratis", minBelanja: 12000, pesanAjak: "" };
  const pelanggan = NAMA.map((nama, i) => ({
    id: uid() + "p" + i,
    nama,
    wa: i % 4 === 3 ? "" : `0812000${String(10000 + i * 137).slice(-5)}`, // nomor dummy
    stempel: 0,
    kunjungan: 0,
    hadiahDiambil: 0,
    terakhir: null,
    dibuat: null,
    token: newToken(),
    // bobot kunjungan; 8 pelanggan terakhir hanya aktif di bulan pertama (jadi "perlu diajak balik")
    _w: i < 8 ? 6 : i < 24 ? 3 : 1,
    _sampai: i >= 32 ? 28 : HARI,
  }));
  const stempelLog = [];

  // ---------- Harga online ----------
  const online = {
    channels: {
      gofood: { aktif: true, komisi: 20, markup: 25, bulat: 500 },
      grabfood: { aktif: true, komisi: 20, markup: 25, bulat: 500 },
      shopeefood: { aktif: true, komisi: 20, markup: 25, bulat: 500 },
    },
    harga: {},
  };
  const sOnline = { online };

  // ---------- Simulasi penjualan ----------
  const orders = [];
  const pakaiHarian = {}; // tanggal -> { bahanId: qty }
  const hujan = new Set([addDays(start, 17), addDays(start, 41)]);
  for (let d = 0; d < HARI; d++) {
    const tanggal = addDays(start, d);
    const dow = new Date(tanggal + "T00:00:00").getDay();
    const base = dow === 0 || dow === 6 ? 44 : dow === 5 ? 38 : 32;
    const tren = 0.8 + (0.35 * d) / (HARI - 1); // usaha makin rame
    let n = Math.round(base * tren * (0.85 + r() * 0.3) * (hujan.has(tanggal) ? 0.5 : 1));
    const jamList = Array.from({ length: n }, () => {
      const jam = weighted([15, 16, 17, 18, 19, 20, 21], (h) => ({ 15: 2, 16: 4, 17: 7, 18: 8, 19: 7, 20: 4, 21: 2 })[h]);
      return `${String(jam).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`;
    }).sort();
    const tersedia = (list) => list.filter((m) => d >= m.mulai);
    pakaiHarian[tanggal] = {};
    jamList.forEach((jam, i) => {
      const channel = weighted(["toko", "gofood", "grabfood", "shopeefood"], (c) => ({ toko: 78, gofood: 11, grabfood: 8, shopeefood: 3 })[c]);
      const cart = new Map();
      const add = (m, q = 1) => cart.set(m.k, { m, qty: (cart.get(m.k)?.qty || 0) + q });
      const nMakan = weighted([1, 2, 3], (x) => ({ 1: 62, 2: 28, 3: 10 })[x]);
      for (let j = 0; j < nMakan; j++) add(weighted(tersedia(makanan), (m) => m.bobot), chance(0.12) ? 2 : 1);
      if (chance(channel === "toko" ? 0.55 : 0.4)) for (let j = 0; j < nMakan && chance(0.75); j++) add(weighted(tersedia(minuman), (m) => m.bobot));
      const items = [...cart.values()].map(({ m, qty }) => ({ resepId: m.resep.id, nama: m.resep.nama, harga: hargaDi(sOnline, m.resep, channel), qty }));
      const sub = items.reduce((a, it) => a + it.harga * it.qty, 0);
      const diskon = channel === "toko" && chance(0.04) ? 2000 : 0;
      const total = sub - diskon;
      const metode = channel !== "toko" ? channel : weighted(["tunai", "qris", "transfer"], (m) => ({ tunai: 55, qris: 40, transfer: 5 })[m]);
      const bayar = metode === "tunai" ? weighted([total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, Math.max(50000, Math.ceil(total / 50000) * 50000)], (v) => (v === total ? 3 : 2)) : total;
      const order = {
        id: uid(),
        no: i + 1,
        tanggal,
        waktu: `${tanggal}T${jam}`,
        items,
        subtotal: sub,
        diskon,
        total,
        channel,
        komisi: komisiRp(sOnline, channel, total),
        metode,
        bayar,
        kembali: metode === "tunai" ? bayar - total : 0,
        pelangganId: null,
        stempel: 0,
        status: "selesai",
      };
      // Pelanggan setia (hanya di toko)
      if (channel === "toko" && chance(0.22)) {
        const aktif = pelanggan.filter((p) => d < p._sampai);
        const p = weighted(aktif, (x) => x._w);
        order.pelangganId = p.id;
        p.dibuat ??= tanggal;
        p.kunjungan += 1;
        p.terakhir = tanggal;
        if (p.stempel >= loyalty.target && chance(0.75)) {
          p.stempel -= loyalty.target;
          p.hadiahDiambil += 1;
          stempelLog.push({ id: uid(), tanggal, pelangganId: p.id, delta: -loyalty.target, alasan: "tukar", catatan: loyalty.hadiah });
        }
        if (total >= loyalty.minBelanja) {
          p.stempel += 1;
          order.stempel = 1;
          stempelLog.push({ id: uid(), tanggal, pelangganId: p.id, delta: 1, alasan: "beli", catatan: `Kasir #${order.no}` });
        }
      }
      // Sesekali order dibatalkan (salah input)
      if (chance(0.006)) {
        order.status = "batal";
        if (order.stempel) {
          const p = pelanggan.find((x) => x.id === order.pelangganId);
          p.stempel -= 1;
          stempelLog.push({ id: uid(), tanggal, pelangganId: p.id, delta: -1, alasan: "koreksi", catatan: `Batal kasir #${order.no}` });
        }
      } else {
        for (const it of items) {
          const rr = resep.find((x) => x.id === it.resepId);
          for (const k of kebutuhan(rr, it.qty)) pakaiHarian[tanggal][k.bahanId] = (pakaiHarian[tanggal][k.bahanId] || 0) + k.qty;
        }
      }
      orders.push(order);
    });
  }

  // ---------- Stok: stok awal, belanja, pemakaian ----------
  const rata = {};
  for (const b of bahan) rata[b.id] = Object.values(pakaiHarian).reduce((a, h) => a + (h[b.id] || 0), 0) / HARI;
  const stokLog = [];
  const transactions = [];
  const kurangDiBelanja = new Set([idB.keju, idB.aren]); // dibiarkan menipis di akhir (biar ada pengingat stok)
  const stok = {};
  const round2 = (n) => Math.round(n * 100) / 100;
  for (const b of bahan) {
    const pack = BAHAN.find(([k]) => idB[k] === b.id)[5];
    b.min = Math.max(1, Math.ceil(rata[b.id] * 1.5));
    stok[b.id] = Math.max(pack, Math.ceil(rata[b.id] * 3));
    stokLog.push({ id: uid(), tanggal: start, bahanId: b.id, delta: stok[b.id], alasan: "opname", catatan: "Stok awal (hitung fisik)" });
  }
  for (let d = 0; d < HARI; d++) {
    const tanggal = addDays(start, d);
    const belanja = { food: [], kemasan: [] };
    for (const b of bahan) {
      const [, , , , kemasan, pack] = BAHAN.find(([k]) => idB[k] === b.id);
      const akhir = d >= HARI - 3 && kurangDiBelanja.has(b.id);
      if (!akhir && stok[b.id] < rata[b.id] * 2.2) {
        const butuh = rata[b.id] * 4 - stok[b.id];
        const qty = Math.max(pack, Math.ceil(butuh / pack) * pack);
        stok[b.id] += qty;
        stokLog.push({ id: uid(), tanggal, bahanId: b.id, delta: qty, alasan: "beli", catatan: kemasan ? "Toko grosir kemasan" : "Pasar Atas Cimahi" });
        (kemasan ? belanja.kemasan : belanja.food).push({ nama: b.nama, total: qty * b.harga });
      }
      const pakai = pakaiHarian[tanggal][b.id] || 0;
      if (pakai) {
        stok[b.id] -= pakai;
        stokLog.push({ id: `pos-${tanggal}-${b.id}`, tanggal, bahanId: b.id, delta: -round2(pakai), alasan: "jual", catatan: "Kasir (gabungan harian)" });
      }
    }
    for (const [jenis, kategori] of [["food", "Bahan Baku"], ["kemasan", "Kemasan"]]) {
      const list = belanja[jenis];
      if (!list.length) continue;
      transactions.push({
        id: uid(),
        tanggal,
        jenis: "keluar",
        kategori,
        nominal: Math.round(list.reduce((a, x) => a + x.total, 0) / 500) * 500,
        catatan: `Belanja: ${list.slice(0, 4).map((x) => x.nama.toLowerCase()).join(", ")}${list.length > 4 ? ` +${list.length - 4} lainnya` : ""}`,
      });
    }
  }
  // Bahan yang sengaja menipis: hitung fisik hari ini = setengah batas minimum.
  for (const id of kurangDiBelanja) {
    const target = Math.round(bahan.find((b) => b.id === id).min * 0.5);
    stokLog.push({ id: uid(), tanggal: today, bahanId: id, delta: round2(target - stok[id]), alasan: "opname", catatan: "Hitung ulang stok" });
    stok[id] = target;
  }
  for (const b of bahan) b.stok = round2(Math.max(0, stok[b.id]));

  // ---------- Biaya rutin & pemasukan lain ----------
  const tx = (tanggal, jenis, kategori, nominal, catatan) => transactions.push({ id: uid(), tanggal, jenis, kategori, nominal, catatan });
  for (let d = 0; d < HARI; d++) {
    const tanggal = addDays(start, d);
    const dow = new Date(tanggal + "T00:00:00").getDay();
    const tgl = Number(tanggal.slice(8));
    if (tgl === 1) tx(tanggal, "keluar", "Operasional", 750000, "Sewa lapak depan kampus (bulanan)");
    if (tgl === 5) tx(tanggal, "keluar", "Operasional", 185000, "Listrik & air lapak");
    if (d % 2 === 0) tx(tanggal, "keluar", "Operasional", 22000, "Isi ulang gas LPG 3 kg");
    if (dow === 6) tx(tanggal, "keluar", "Gaji", 450000, "Gaji mingguan helper (Ujang)");
    if (dow === 1) tx(tanggal, "keluar", "Marketing", 75000, "Iklan Instagram & TikTok lokal");
    if (dow === 3) tx(tanggal, "keluar", "Lainnya", 15000, "Retribusi kebersihan");
  }
  tx(addDays(start, 9), "keluar", "Peralatan", 185000, "Panci kuah tambahan 30 cm");
  tx(addDays(start, 21), "keluar", "Marketing", 300000, "Endorse food vlogger Cimahi");
  tx(addDays(start, 24), "keluar", "Marketing", 150000, "Cetak brosur & stiker menu baru");
  tx(addDays(start, 29), "keluar", "Peralatan", 250000, "Termos es 20 liter");
  tx(addDays(start, 33), "masuk", "Katering/pesanan", 720000, "Pesanan 60 porsi acara BEM kampus");
  tx(addDays(start, 47), "masuk", "Katering/pesanan", 520000, "Pesanan 40 porsi arisan RT 05");
  tx(addDays(start, 52), "keluar", "Operasional", 95000, "Servis gerobak (las roda)");

  // ---------- Perencanaan (dari generator Mode Demo) ----------
  const p = PROFILE;
  const idea = demo.analyze_idea(p, {}, {});
  const rabRaw = demo.generate_rab(p, { mode: "normal" }, {});
  const rab = {
    ...rabRaw,
    mode: "normal",
    items: rabRaw.items.map((it, i) => ({ ...it, id: uid(), realisasi: it.prioritas === "opsional" && i % 2 ? 0 : Math.round((it.qty * it.harga * (0.85 + ((i * 37) % 30) / 100)) / 1000) * 1000 })),
  };
  const brandRaw = demo.generate_brand(p, {}, {});
  const brand = { ...brandRaw, terpilih: { nama: "TAHGUY", tagline: brandRaw.tagline[0] } };
  const actRaw = demo.activation_plan(p, {}, {});
  const checked = {};
  actRaw.channels?.forEach((c) => c.langkah.forEach((_, i) => (checked[`${c.channel}#${i}`] = i < c.langkah.length - 1 || c.prioritas === "tinggi")));
  const activation = { ...actRaw, checked };
  const calStart = addDays(today, -4); // hari ini = hari ke-5 (ada jadwal posting)
  const calRaw = demo.content_calendar(p, { hari: 14, tanggal_mulai: calStart }, { profile: p, brand });
  const calendar = {
    start: calStart,
    pilar: calRaw.pilar,
    jadwal: calRaw.jadwal.map((j) => ({ ...j, done: addDays(calStart, j.hari_ke - 1) < today && j.hari_ke !== 3 })),
  };
  const hppOri = resep[0].items.reduce((a, it) => a + it.qty * bahan.find((b) => b.id === it.bahanId).harga, 0);

  // ---------- Rakit & hitung ulang Kas / rekap dari order ----------
  let state = {
    profile: p,
    idea,
    rab,
    bep: { harga: 12000, hpp: Math.round(hppOri), tetap: 3_200_000, porsi: 45, hari: 30 },
    brand,
    activation,
    calendar,
    transactions,
    insight: null,
    chat: [],
    bahan,
    resep,
    stokLog,
    online,
    orders,
    posHarian: {},
    studio: null,
    loyalty,
    pelanggan: pelanggan
      .filter((x) => x.kunjungan > 0)
      .map(({ _w, _sampai, ...x }) => x),
    stempelLog,
    settings: settings || { aiMode: "demo", endpoint: "", anonKey: "" },
  };
  state = reconcile(state, { kas: true });
  // Detail order disimpan 30 hari (sama seperti kasir); rekap harian & Kas tetap 60 hari.
  const batas = addDays(today, -SIMPAN_HARI);
  state.orders = state.orders.filter((o) => o.tanggal >= batas);
  state.transactions = [...state.transactions].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return state;
}
