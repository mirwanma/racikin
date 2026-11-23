// Data dummy lengkap TAHGUY: 15 menu + resep, 25 bahan, penjualan kasir 60 hari terakhir yang tumbuh ±3x
// (toko & order online), belanja bahan (ikut naik, sebagian tempo ke supplier), biaya operasional, pelanggan
// & stempel, karyawan (jadwal shift, absen, gaji, kasbon karyawan), plus RAB, brand, aktivasi & kalender konten.
// Dipakai untuk demo / uji coba. Hasilnya acak tapi konsisten (seed tetap), dan semua angka saling cocok:
// Kas = rekap kasir, stok = belanja - pemakaian, stempel = riwayat stempel, gaji dari absen.
import { uid } from "./store.js";
import { todayISO, addDays } from "./ui.js";
import { hargaItem, kunciItem, pakaiItem } from "./varian.js";
import { reconcile, SIMPAN_HARI } from "./pos.js";
import { komisiRp } from "./online.js";
import { newToken } from "./loyalty.js";
import { demo } from "./demo.js";
import { ringkasan } from "./shift.js";
import { pilihPromo } from "./promo.js";
import { simpanKaryawan, POSISI } from "./absen.js";
import { bayarGaji, pinjamKasbon, saldoKasbonKaryawan } from "./gaji.js";
import { sinkronAkun } from "./jadwal.js";
import { notaUtang, bayarUtang, sisaNota } from "./utang.js";

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
  // Data contoh = usaha yang sudah jalan 2 bulan (tampilan "udah jalan").
  tahap: "jalan",
  lama: "< 6 bulan",
  omzetHarian: 1_000_000,
  karyawan: 2,
  saluran: ["Jualan langsung", "GoFood", "GrabFood", "ShopeeFood"],
  masalah: ["untung", "stok"],
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

// Grup varian: [kode, nama, tipe, wajib, maks, [[kode, nama, harga, [[bahan, qty]], bobot]], menu yang memakai]
const OPSI = [
  ["level", "Level pedas", "satu", true, 0, [["l0", "Tidak pedas", 0, [], 3], ["l1", "Level 1", 0, [["cabai", 3]], 4], ["l3", "Level 3", 0, [["cabai", 8]], 5], ["l5", "Level 5", 1000, [["cabai", 15]], 3]], ["ori", "telur", "baksotg", "komplit", "keju", "paket", "baksotahu"]],
  ["topping", "Topping tambahan", "banyak", false, 3, [["tlr", "Telur", 4000, [["telur", 1]], 4], ["kj", "Keju", 3000, [["keju", 15]], 3], ["bks", "Bakso", 4000, [["bakso", 3]], 3], ["bg", "Bawang goreng ekstra", 1000, [["bgoreng", 5]], 2]], ["ori", "pedas", "telur", "baksotg", "crispy", "walik"]],
  ["ukuran", "Ukuran", "satu", true, 0, [["reg", "Reguler", 0, [], 7], ["jmb", "Jumbo", 3000, [], 3, { porsi: 1.5, tetap: ["cup"] }]], ["esteh"]],
  ["manis", "Tingkat manis", "satu", false, 0, [["nrm", "Normal", 0, [], 7], ["krg", "Kurang manis", 0, [], 3], ["tg", "Tanpa gula", 0, [], 1, { ganti: [["gula", ""], ["aren", ""]] }]], ["tehaaren", "esjeruk"]],
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
/** Kasir yang jaga per hari: Rina (kasir) hari kerja, Dodi (manajer) akhir pekan, Pemilik sesekali. */
export const TIM_CONTOH = [
  { id: "contoh-pemilik", nama: "Pemilik" },
  { id: "contoh-rina", nama: "Rina" },
  { id: "contoh-dodi", nama: "Dodi" },
  { id: "contoh-sari", nama: "Sari" }, // dapur
];
function kasirHari(tim, tanggal) {
  const dow = new Date(tanggal + "T00:00:00").getDay();
  const tgl = Number(tanggal.slice(8));
  if (tgl % 9 === 0) return tim[0]; // pemilik jaga sesekali
  return dow === 0 || dow === 6 ? tim[2] || tim[0] : tim[1] || tim[0];
}

/**
 * tim (opsional) = [{id,nama}] untuk [pemilik, kasir, manajer, dapur]; kalau tidak diisi pakai nama contoh.
 * Order & shift dicatat atas nama orang yang jaga hari itu, supaya rekap per kasir terlihat.
 * tumbuh = kelipatan ramainya usaha dari awal ke akhir 60 hari (default 3x).
 * pelangganAda = [{id,nama,wa,token}] pelanggan lama yang dipakai lagi (kartu stempel yang sudah dibagikan tetap nyambung).
 * jam = "HH:MM" jam sekarang (default jam perangkat); order hari ini hanya sampai jam ini.
 * skala = pengali jumlah order per hari (rasio tumbuh tetap); dipakai kalau data harus lebih kecil (batas dokumen 2 MB).
 */
export function buatDataDummy({ today = todayISO(), settings, tim = TIM_CONTOH, tumbuh = 3, pelangganAda = null, jam = null, skala = 1, hari: H = HARI, seed = 0, denganTim = true, saldo = true } = {}) {
  const r = rng(20261111 + seed);
  const off = HARI - H; // usaha / cabang yang lebih muda: hari ke-d setara hari ke-(d + off) usaha 60 hari (menu baru, voucher)
  const chance = (p) => r() < p;
  const between = (a, b) => a + Math.floor(r() * (b - a + 1));
  const weighted = (list, w) => {
    const total = list.reduce((a, x) => a + w(x), 0);
    let x = r() * total;
    for (const it of list) if ((x -= w(it)) < 0) return it;
    return list[list.length - 1];
  };
  const start = addDays(today, -(H - 1));
  const jamSekarang = jam || (() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

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
  // Varian & topping
  const opsi = OPSI.map(([k, nama, tipe, wajib, maks, pilihan]) => ({
    id: uid() + k,
    nama,
    tipe,
    wajib,
    ...(maks ? { maks } : {}),
    pilihan: pilihan.map(([pk, pn, harga, items, , x = {}]) => ({
      id: uid() + pk,
      nama: pn,
      harga,
      items: items.map(([b, qty]) => ({ bahanId: idB[b], qty })),
      ...(x.porsi ? { porsi: x.porsi, tetap: (x.tetap || []).map((b) => idB[b]) } : {}),
      ...(x.ganti ? { ganti: x.ganti.map(([dari, ke]) => ({ dari: idB[dari], ke: ke ? idB[ke] : "" })) } : {}),
    })),
  }));
  MENU.forEach(([k], i) => {
    const ids = OPSI.map(([, , , , , , dipakai], j) => (dipakai.includes(k) ? opsi[j].id : null)).filter(Boolean);
    if (ids.length) resep[i].opsiIds = ids;
  });
  const bobotPilihan = Object.fromEntries(OPSI.flatMap(([, , , , , pilihan], j) => pilihan.map(([, , , , w], x) => [opsi[j].pilihan[x].id, w])));
  const sOpsi = { opsi, resep };
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
    _sampai: i >= 32 ? 28 : H,
  }));
  // Pakai identitas pelanggan lama (id, WA, token kartu stempel) kalau namanya sama, supaya kartu yang sudah dibagikan tetap nyambung.
  for (const x of pelangganAda || []) {
    const p = pelanggan.find((y) => y.nama === x.nama && !y._ada);
    if (p) Object.assign(p, { id: x.id, wa: x.wa ?? p.wa, token: x.token || p.token, _ada: true });
  }
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
  const sOnline = { online, opsi, resep };

  // ---------- Promo ----------
  const resepK = (k) => resep[MENU.findIndex(([kk]) => kk === k)].id;
  const promo = [
    { id: uid() + "ph", nama: "Happy hour sore", aktif: true, jenis: "order", tipe: "persen", nilai: 10, minBelanja: 0, maks: 5000, waktu: { dari: addDays(start, 20), hari: [1, 2, 3, 4, 5], jamDari: "15:00", jamSampai: "16:00" }, saluran: ["toko"], dibuat: addDays(start, 20) },
    { id: uid() + "pb", nama: "Weekend es teh 3rb", aktif: true, jenis: "menu", tipe: "harga", nilai: 3000, resepIds: [resepK("esteh")], waktu: { hari: [0, 6] }, saluran: ["toko"], dibuat: start },
    { id: uid() + "pv", nama: "Voucher TAHGUY5", aktif: true, jenis: "order", tipe: "rp", nilai: 5000, minBelanja: 30000, waktu: { dari: addDays(start, 30), sampai: addDays(today, 10) }, saluran: ["toko"], kode: "TAHGUY5", kuota: 200, dibuat: addDays(start, 30) },
  ];
  const sPromo = { promo, posHarian: {}, resep };

  // ---------- Simulasi penjualan ----------
  const orders = [];
  const pakaiHarian = {}; // tanggal -> { bahanId: qty }
  const hujan = new Set([addDays(start, 17), addDays(start, 41)]);
  for (let d = 0; d < H; d++) {
    const tanggal = addDays(start, d);
    const dow = new Date(tanggal + "T00:00:00").getDay();
    const base = dow === 0 || dow === 6 ? 44 : dow === 5 ? 38 : 32;
    const tren = 0.52 * (1 + (tumbuh - 1) * 1.25 * (d / (H - 1))); // usaha makin rame: minggu terakhir ±tumbuh x minggu pertama
    let n = Math.round(base * skala * tren * (0.85 + r() * 0.3) * (hujan.has(tanggal) ? 0.5 : 1));
    const jamList = Array.from({ length: n }, () => {
      const jam = weighted([15, 16, 17, 18, 19, 20, 21], (h) => ({ 15: 2, 16: 4, 17: 7, 18: 8, 19: 7, 20: 4, 21: 2 })[h]);
      return `${String(jam).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`;
    })
      .sort()
      .filter((j) => tanggal < today || j <= jamSekarang); // hari ini: hanya order yang jamnya sudah lewat
    const tersedia = (list) => list.filter((m) => d + off >= m.mulai);
    pakaiHarian[tanggal] = {};
    jamList.forEach((jam, i) => {
      const channel = weighted(["toko", "gofood", "grabfood", "shopeefood"], (c) => ({ toko: 78, gofood: 11, grabfood: 8, shopeefood: 3 })[c]);
      const cart = new Map();
      // Pilihan varian acak: grup wajib selalu dipilih, topping sesekali (kadang 2).
      const acakOpsi = (m) => {
        const out = [];
        for (const g of opsi.filter((x) => (m.resep.opsiIds || []).includes(x.id))) {
          if (g.tipe === "satu") {
            if (!g.wajib && !chance(0.35)) continue;
            const p = weighted(g.pilihan, (x) => bobotPilihan[x.id]);
            out.push({ g: g.id, id: p.id, nama: p.nama, harga: p.harga });
          } else if (chance(0.3)) {
            const n = chance(0.25) ? 2 : 1;
            const dipilih = new Set();
            while (dipilih.size < n) dipilih.add(weighted(g.pilihan, (x) => bobotPilihan[x.id]));
            for (const p of g.pilihan.filter((x) => dipilih.has(x))) out.push({ g: g.id, id: p.id, nama: p.nama, harga: p.harga });
          }
        }
        return out;
      };
      const add = (m, q = 1) => {
        const o = acakOpsi(m);
        const key = kunciItem(m.k, o);
        cart.set(key, { m, opsi: o, qty: (cart.get(key)?.qty || 0) + q });
      };
      const nMakan = weighted([1, 2, 3], (x) => ({ 1: 62, 2: 28, 3: 10 })[x]);
      for (let j = 0; j < nMakan; j++) add(weighted(tersedia(makanan), (m) => m.bobot), chance(0.12) ? 2 : 1);
      if (chance(channel === "toko" ? 0.55 : 0.4)) for (let j = 0; j < nMakan && chance(0.75); j++) add(weighted(tersedia(minuman), (m) => m.bobot));
      const items = [...cart.values()].map(({ m, qty, opsi: o }) => ({ resepId: m.resep.id, nama: m.resep.nama, harga: hargaItem(sOnline, m.resep, o, channel), qty, ...(o.length ? { opsi: o } : {}) }));
      const sub = items.reduce((a, it) => a + it.harga * it.qty, 0);
      // Promo otomatis + sesekali voucher (kode dari brosur/IG)
      const kode = channel === "toko" && d + off >= 30 && chance(0.05) ? "TAHGUY5" : "";
      const pr = pilihPromo(sPromo, items, { channel, waktu: `${tanggal}T${jam}`, kode }).promo;
      const pot = pr?.potongan || 0;
      const diskon = channel === "toko" && chance(0.04) ? Math.min(2000, sub - pot) : 0;
      const total = sub - pot - diskon;
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
        ...(pot ? { promo: { id: pr.id, nama: pr.nama, potongan: pot, ...(pr.kode ? { kode: pr.kode } : {}) } } : {}),
        total,
        channel,
        komisi: komisiRp(sOnline, channel, total),
        metode,
        bayar,
        kembali: metode === "tunai" ? bayar - total : 0,
        pelangganId: null,
        stempel: 0,
        status: "selesai",
        kasir: kasirHari(tim, tanggal),
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
        for (const it of items) for (const k of pakaiItem(sOpsi, it)) pakaiHarian[tanggal][k.bahanId] = (pakaiHarian[tanggal][k.bahanId] || 0) + k.qty;
      }
      orders.push(order);
    });
  }

  // ---------- Stok: stok awal, belanja, pemakaian ----------
  // Pemakaian rata-rata di sekitar hari ke-d (usaha tumbuh, jadi belanja ikut naik & stok nggak pernah minus).
  const pakaiPada = (id, d) => pakaiHarian[addDays(start, d)]?.[id] || 0;
  const rataSekitar = (id, d, w = 3) => {
    let s = 0;
    let n = 0;
    for (let i = Math.max(0, d - w); i <= Math.min(H - 1, d + w); i++) (s += pakaiPada(id, i)), n++;
    return n ? s / n : 0;
  };
  const rata = {};
  for (const b of bahan) rata[b.id] = rataSekitar(b.id, H - 1, 6);
  const stokLog = [];
  const transactions = [];
  const utangSupplier = [];
  const kurangDiBelanja = new Set([idB.keju, idB.aren]); // dibiarkan menipis di akhir (biar ada pengingat stok)
  const stok = {};
  const round2 = (n) => Math.round(n * 100) / 100;

  // Supplier langganan & pergerakan harga (cabai naik, telur & bakso naik sedikit, minyak turun).
  const SUP = [
    ["tahu", "Pabrik Tahu Pak Darto", "081200000101", "Ambil pagi jam 6–8, bisa titip kirim"],
    ["pasar", "Bu Euis (Pasar Atas Cimahi)", "081200000102", "Sayur & bumbu, buka jam 4 pagi"],
    ["sembako", "Agen Sembako Jaya", "081200000103", "Gratis antar min. Rp 300rb"],
    ["frozen", "Prima Frozen Food", "081200000104", "Bakso, keju & ayam; order H-1"],
    ["kemasan", "Toko Kemasan Sinar", "081200000105", "Grosir mangkok, cup & plastik"],
  ];
  const supId = Object.fromEntries(SUP.map(([k]) => [k, uid() + k]));
  const supplier = SUP.map(([k, nama, wa, catatan]) => ({ id: supId[k], nama, wa: "62" + wa.slice(1), catatan }));
  const SUP_BAHAN = {
    tahu: ["tahu"],
    pasar: ["bput", "bmer", "cabai", "dbawang", "jeruk", "es"],
    sembako: ["kaldu", "kecap", "bgoreng", "telur", "tapioka", "minyak", "teh", "gula", "skm", "aren", "air"],
    frozen: ["bakso", "keju", "ayam"],
    kemasan: ["mangkok", "sendok", "cup", "kresek"],
  };
  const supOf = {};
  for (const [k, list] of Object.entries(SUP_BAHAN)) for (const kb of list) supOf[idB[kb]] = supId[k];
  const kodeOf = Object.fromEntries(Object.entries(idB).map(([k, id]) => [id, k]));
  const GERAK = { cabai: [38, 0.35], telur: [45, 0.1], bakso: [50, 0.06], minyak: [30, -0.06] }; // [mulai hari ke-, perubahan]
  const hargaPada = (b, d) => {
    const g = GERAK[kodeOf[b.id]];
    if (!g || d < g[0]) return b.harga;
    const t = Math.min(1, (d - g[0]) / Math.max(1, H - 1 - g[0]));
    return round2(b.harga * (1 + g[1] * (0.4 + 0.6 * t)));
  };
  const hargaAkhir = {};
  const supNama = Object.fromEntries(supplier.map((x) => [x.id, x.nama]));
  for (const b of bahan) {
    const pack = BAHAN.find(([k]) => idB[k] === b.id)[5];
    b.min = Math.max(1, Math.ceil(rata[b.id] * 1.5));
    stok[b.id] = Math.max(pack, Math.ceil(rataSekitar(b.id, 0) * 3));
    stokLog.push({ id: uid(), tanggal: start, bahanId: b.id, delta: stok[b.id], alasan: "opname", catatan: "Stok awal (hitung fisik)" });
  }
  for (let d = 0; d < H; d++) {
    const tanggal = addDays(start, d);
    const belanja = { food: [], kemasan: [], tempo: [] };
    for (const b of bahan) {
      const [, , , , kemasan, pack] = BAHAN.find(([k]) => idB[k] === b.id);
      const akhir = d >= H - 3 && kurangDiBelanja.has(b.id);
      const rd = rataSekitar(b.id, d);
      if (!akhir && stok[b.id] < rd * 2.2) {
        const butuh = rd * 4 - stok[b.id];
        const qty = Math.max(pack, Math.ceil(butuh / pack) * pack);
        stok[b.id] += qty;
        const harga = hargaPada(b, d);
        hargaAkhir[b.id] = harga;
        stokLog.push({ id: uid(), tanggal, bahanId: b.id, delta: qty, alasan: "beli", catatan: supNama[supOf[b.id]], harga, supplierId: supOf[b.id] });
        // 10 hari terakhir frozen food dibayar tempo 7 hari (utang supplier), sisanya bayar langsung.
        const tempo = supOf[b.id] === supId.frozen && d >= H - 10;
        (tempo ? belanja.tempo : kemasan ? belanja.kemasan : belanja.food).push({ nama: b.nama, total: qty * harga });
      }
      const pakai = pakaiHarian[tanggal][b.id] || 0;
      if (pakai) {
        stok[b.id] -= pakai;
        stokLog.push({ id: `pos-${tanggal}-${b.id}`, tanggal, bahanId: b.id, delta: -round2(pakai), alasan: "jual", catatan: "Kasir (gabungan harian)" });
      }
    }
    if (belanja.tempo.length) {
      utangSupplier.push(
        notaUtang({
          supplierId: supId.frozen,
          tanggal,
          tempo: addDays(tanggal, 7),
          rincian: [{ kategori: "Bahan Baku", nominal: Math.round(belanja.tempo.reduce((a, x) => a + x.total, 0) / 500) * 500 }],
          catatan: belanja.tempo.map((x) => x.nama.toLowerCase()).join(", "),
        }),
      );
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
  for (const b of bahan) {
    b.stok = round2(Math.max(0, stok[b.id]));
    b.harga = hargaAkhir[b.id] ?? b.harga; // harga sekarang = harga belanja terakhir
    b.supplierId = supOf[b.id] || null;
    if (BAHAN.find(([k]) => idB[k] === b.id)[4]) b.kemasan = true;
    const pack = { air: 24, telur: 30, teh: 25 }[kodeOf[b.id]]; // beli per dus / tray / kotak
    if (pack) b.pack = pack;
  }

  // ---------- Biaya rutin & pemasukan lain ----------
  const tx = (tanggal, jenis, kategori, nominal, catatan) => tanggal <= today && transactions.push({ id: uid(), tanggal, jenis, kategori, nominal, catatan });
  for (let d = 0; d < H; d++) {
    const tanggal = addDays(start, d);
    const dow = new Date(tanggal + "T00:00:00").getDay();
    const tgl = Number(tanggal.slice(8));
    if (tgl === 1) tx(tanggal, "keluar", "Operasional", 750000, "Sewa lapak depan kampus (bulanan)");
    if (tgl === 5) tx(tanggal, "keluar", "Operasional", 185000, "Listrik & air lapak");
    if (d % 2 === 0 || d >= 35) tx(tanggal, "keluar", "Operasional", 22000, "Isi ulang gas LPG 3 kg"); // makin rame, gas tiap hari
    // Gaji karyawan dicatat lewat menu Gaji (lihat tambahTim), bukan transaksi manual.
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
    kasAwal: { tanggal: start, nominal: 2_500_000 }, // uang usaha di awal data contoh
    insight: null,
    chat: [],
    bahan,
    resep,
    opsi,
    stokLog,
    online,
    promo,
    orders,
    posHarian: {},
    studio: null,
    loyalty,
    pelanggan: pelanggan
      .filter((x) => x.kunjungan > 0 || x._ada)
      .map(({ _w, _sampai, _ada, ...x }) => ({ ...x, dibuat: x.dibuat || start })),
    stempelLog,
    shifts: [],
    posSetting: { wajibShift: false, ...(saldo ? { saldo: true } : {}) },
    supplier,
    utangSupplier,
    meja: Array.from({ length: 8 }, (_, i) => ({ id: uid() + "m" + i, nama: i < 6 ? `Meja ${i + 1}` : `Teras ${i - 5}`, token: (uid() + uid() + "racikin").slice(0, 24) })),
    settings: settings || { aiMode: "demo", endpoint: "", anonKey: "" },
  };
  // Saldo pelanggan (titipan): beberapa langganan isi saldo, bayar pakai saldo, simpan kembalian.
  if (saldo) state = tambahSaldo(state, { today, H, seed, jamSekarang });
  // Shift kasir 30 hari terakhir: satu shift per hari, hari ini masih buka.
  const sr = rng(777);
  for (let d = SIMPAN_HARI - 1; d >= 0; d--) {
    const tanggal = addDays(today, -d);
    const buka = `14:${String(20 + Math.floor(sr() * 20)).padStart(2, "0")}`;
    if (d === 0 && jamSekarang < buka) continue; // hari ini belum buka
    const sh = { id: uid() + "s", kasir: kasirHari(tim, tanggal), buka: `${tanggal}T${buka}`, tutup: null, modal: 200000, laci: [], setor: null, hasil: null, catatan: "" };
    for (const o of state.orders) if (o.tanggal === tanggal) o.shiftId = sh.id;
    // Uang saldo tunai (isi & kembalian yang disimpan) lewat laci shift hari itu.
    for (const k of state.saldoPelanggan || []) if (k.tanggal === tanggal && k.jenis !== "pakai" && (k.metode || "tunai") === "tunai") k.shiftId = sh.id;
    const lewat = (w) => d > 0 || w.slice(11) <= jamSekarang;
    if (sr() < 0.35) sh.laci.push({ id: uid(), waktu: `${tanggal}T18:${String(Math.floor(sr() * 50) + 10)}`, jenis: "keluar", nominal: 20000, kategori: "Bahan Baku", catatan: "Beli es batu tambahan" });
    sh.laci = sh.laci.filter((l) => lewat(l.waktu));
    if (sr() < 0.25 && lewat(`${tanggal}T19:30`)) sh.laci.push({ id: uid(), waktu: `${tanggal}T19:30`, jenis: "ambil", nominal: 300000, kategori: "", catatan: "Setor ke Raka" });
    if (d > 0) {
      const r = ringkasan(state, sh);
      const selisih = sr() < 0.72 ? 0 : [-2000, -5000, -1000, 1000, 2000, -10000][Math.floor(sr() * 6)];
      sh.tutup = `${tanggal}T22:${String(5 + Math.floor(sr() * 40)).padStart(2, "0")}`;
      sh.setor = r.seharusnya + selisih;
      sh.hasil = { ...r, setor: sh.setor, selisih };
      if (selisih < 0) sh.catatan = "Kembalian kurang, kemungkinan salah kasih";
    }
    state.shifts.push(sh);
  }
  state = reconcile(state, { kas: true });
  // Detail order disimpan 30 hari (sama seperti kasir); rekap harian & Kas tetap 60 hari.
  const batas = addDays(today, -SIMPAN_HARI);
  state.orders = state.orders.filter((o) => o.tanggal >= batas);
  if (denganTim) state = tambahTim(state, { today, start, tim, jamSekarang });
  // Utang frozen food yang sudah jatuh tempo dibayar (transfer) di tanggal tempo; yang belum, masih utang.
  for (const n of state.utangSupplier) if (n.tempo < today) state = { ...state, ...bayarUtang(state, n.id, { nominal: sisaNota(n), tanggal: n.tempo, metode: "transfer" }) };
  state.utangSupplier = state.utangSupplier.map((n) => ({ ...n, bayar: n.bayar || [] }));
  state.transactions = [...state.transactions].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return state;
}

/**
 * Karyawan contoh: tim bertambah seiring usaha makin ramai. Jadwal shift (sampai 2 minggu ke depan), absen dari jadwal
 * (kadang telat, izin, sakit, lembur di akhir pekan yang ramai), gaji mingguan / bulanan dibayar lewat menu Gaji
 * (Kas kategori Gaji), kasbon karyawan dipotong gaji. Rina / Dodi / Sari dihubungkan ke akun tim (Jadwal saya).
 */
/**
 * Saldo pelanggan contoh (24 hari terakhir): 7 langganan isi saldo (tunai/QRIS/transfer), lalu sebagian kunjungannya
 * dibayar pakai saldo (kalau kurang, sisanya tunai), isi ulang kalau saldo menipis, pelanggan lain kadang menyimpan
 * kembalian. Order yang diubah tetap order yang sama (total, item, stok, stempel nggak berubah); Kas dihitung ulang
 * lewat reconcile, jadi Kas Penjualan = omzet & Kas titipan = total saldo.
 */
function tambahSaldo(state, { today, H, seed, jamSekarang }) {
  const r = rng(9090 + seed);
  const chance = (p) => r() < p;
  const pilih = (arr) => arr[Math.floor(r() * arr.length)];
  const dari = addDays(today, -Math.min(24, H - 1));
  const sekarang = `${today}T${jamSekarang}`;
  const toko = state.orders.filter((o) => o.tanggal >= dari && o.status !== "batal" && o.channel === "toko" && !o.pembayaran && o.waktu <= sekarang).sort((a, b) => a.waktu.localeCompare(b.waktu));
  const kunj = new Map();
  for (const o of toko) if (o.pelangganId) kunj.set(o.pelangganId, (kunj.get(o.pelangganId) || 0) + 1);
  const pool = new Set([...kunj].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([id]) => id));
  const list = [];
  const saldo = new Map();
  const jam1 = (waktu) => {
    // 1 menit sebelum order (isi saldo di kasir sebelum bayar)
    const t = new Date(waktu + ":00Z");
    t.setUTCMinutes(t.getUTCMinutes() - 1);
    return t.toISOString().slice(0, 16);
  };
  const isi = (pelangganId, waktu, nominal, metode, extra = {}) => {
    list.push({ id: uid() + "sd", jenis: "isi", pelangganId, tanggal: waktu.slice(0, 10), waktu, nominal, metode, ...extra });
    saldo.set(pelangganId, (saldo.get(pelangganId) || 0) + nominal);
  };
  for (const o of toko) {
    const pid = o.pelangganId;
    if (!pid) continue;
    if (pool.has(pid)) {
      const ada = saldo.get(pid) || 0;
      if (ada < 15000 && chance(ada ? 0.5 : 0.8)) {
        isi(pid, jam1(o.waktu), pilih([50000, 100000, 100000, 150000, 200000]), pilih(["tunai", "tunai", "qris", "transfer"]), { catatan: ada ? "Isi ulang" : "Isi saldo pertama" });
      }
      const s = saldo.get(pid) || 0;
      if (s >= o.total && chance(0.7)) {
        Object.assign(o, { metode: "saldo", bayar: o.total, kembali: 0 });
        list.push({ id: `o-${o.id}`, jenis: "pakai", pelangganId: pid, tanggal: o.tanggal, waktu: o.waktu, nominal: o.total, orderId: o.id, no: o.no });
        saldo.set(pid, s - o.total);
        continue;
      }
      if (s > 0 && s < o.total && chance(0.6)) {
        Object.assign(o, { metode: "campur", bayar: o.total, kembali: 0, pembayaran: [{ metode: "tunai", jumlah: o.total - s }, { metode: "saldo", jumlah: s }] });
        list.push({ id: `o-${o.id}`, jenis: "pakai", pelangganId: pid, tanggal: o.tanggal, waktu: o.waktu, nominal: s, orderId: o.id, no: o.no });
        saldo.set(pid, 0);
        continue;
      }
    }
    // Kembalian nggak diambil, disimpan jadi saldo
    if (o.metode === "tunai" && o.kembali > 0 && o.kembali <= 50000 && chance(pool.has(pid) ? 0.35 : 0.1)) {
      const n = o.kembali;
      Object.assign(o, { kembali: 0, simpanSaldo: n });
      isi(pid, o.waktu, n, "tunai", { sumber: "kembalian", orderId: o.id, no: o.no, ...(o.kasir ? { oleh: o.kasir } : {}) });
      list[list.length - 1].id = `k-${o.id}`;
    }
  }
  // Satu pelanggan narik sebagian saldonya (pindah kos), 3 hari lalu.
  const tarik = [...saldo].filter(([, n]) => n >= 30000).sort((a, b) => b[1] - a[1])[0];
  const tglTarik = addDays(today, -3);
  if (tarik && tglTarik >= dari) {
    const n = Math.floor(tarik[1] / 2 / 1000) * 1000;
    list.push({ id: uid() + "tr", jenis: "tarik", pelangganId: tarik[0], tanggal: tglTarik, waktu: `${tglTarik}T16:10`, nominal: n, metode: "tunai", catatan: "Pindah kos, ambil sebagian" });
    saldo.set(tarik[0], tarik[1] - n);
  }
  list.sort((a, b) => a.waktu.localeCompare(b.waktu));
  return { ...state, saldoPelanggan: list };
}

function tambahTim(state, { today, start, tim, jamSekarang }) {
  const r = rng(4242);
  const L = "libur";
  const shift = [
    { id: "prep", nama: "Persiapan", mulai: "09:00", selesai: "17:00" },
    { id: "sore", nama: "Sore", mulai: "14:00", selesai: "22:00" },
    { id: "tutup", nama: "Tutup", mulai: "15:00", selesai: "23:00" },
  ];
  // [nama, posisi, akun tim (index), gaji, mulai kerja (hari ke-, negatif = sebelum data), pola Minggu..Sabtu]
  const DATA = [
    ["Rina", "Kasir", 1, { skema: "harian", nominal: 90000, makan: 10000, periode: "mingguan", lembur: "tetap", tarifLembur: 12000 }, -40, [L, "sore", "sore", "sore", "sore", "sore", L]],
    ["Dodi", "Manajer", 2, { skema: "bulanan", nominal: 3200000, makan: 0, periode: "bulanan", potong: true, lembur: "tidak" }, -70, ["tutup", L, "prep", "prep", "prep", L, "tutup"]],
    ["Ujang", "Dapur / masak", null, { skema: "harian", nominal: 75000, makan: 10000, periode: "mingguan", lembur: "tetap", tarifLembur: 10000 }, -50, [L, "prep", "prep", "prep", "prep", "prep", "prep"]],
    ["Sari", "Dapur / masak", 3, { skema: "harian", nominal: 85000, makan: 10000, periode: "mingguan", lembur: "tetap", tarifLembur: 10000 }, 18, ["sore", L, L, "sore", "sore", "sore", "sore"]],
    ["Bagas", "Kurir", null, { skema: "harian", nominal: 70000, makan: 10000, periode: "mingguan", lembur: "tidak" }, 40, ["sore", L, "sore", L, L, "tutup", "tutup"]],
  ];
  let st = { ...state, karyawan: [], absen: {}, gajian: [], kasbonKaryawan: [], thr: [], absenSetting: { aktif: true, jamMasuk: "14:00", toleransi: 10, jamKerja: 8, posisi: POSISI } };
  const ks = [];
  for (const [nama, posisi, akun, gaji, mulai] of DATA) {
    const x = simpanKaryawan(st, { id: uid() + "k", nama, posisi, akunId: akun != null && tim[akun] ? tim[akun].id : null, gaji: { hariKerja: 26, potong: true, ...gaji }, mulai: addDays(start, mulai) });
    st = { ...st, karyawan: x.karyawan };
    ks.push(x.karyawanBaru);
  }
  const pola = Object.fromEntries(DATA.map((d, i) => [ks[i].id, d[5]]));
  const hm = (m) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
  const menit = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const sekarang = menit(jamSekarang);
  const hari = {};
  const absen = {};
  for (let t = start; t <= addDays(today, 13); t = addDays(t, 1)) {
    const dow = new Date(t + "T00:00:00").getDay();
    const d = Math.round((new Date(t + "T00:00:00") - new Date(start + "T00:00:00")) / 864e5);
    for (const k of ks) {
      if (k.mulai > t) continue;
      const v = pola[k.id][dow];
      (hari[t] ||= {})[k.id] = v;
      if (t > today) continue;
      const sh = shift.find((x) => x.id === v);
      if (!sh) {
        (absen[t] ||= {})[k.id] = { status: "libur", sumber: "manual" };
        continue;
      }
      if (t === today && sekarang < menit(sh.mulai)) continue; // hari ini: belum jamnya masuk
      const x = r();
      if (x < 0.005) (absen[t] ||= {})[k.id] = { status: "alpa", sumber: "manual" };
      else if (x < 0.025) (absen[t] ||= {})[k.id] = { status: "sakit", sumber: "manual" };
      else if (x < 0.045) (absen[t] ||= {})[k.id] = { status: "izin", sumber: "manual" };
      else {
        const telat = r() < 0.1;
        const masuk = menit(sh.mulai) + (telat ? 11 + Math.floor(r() * 25) : -15 + Math.floor(r() * 23));
        const ramai = (dow === 5 || dow === 6 || dow === 0) && d > 30 && r() < 0.4;
        const pulangM = menit(sh.selesai) + (ramai ? 60 + Math.floor(r() * 90) : -10 + Math.floor(r() * 25));
        const a = { status: "hadir", masuk: hm(masuk), sumber: "manual" };
        if (t < today || sekarang >= pulangM) a.pulang = hm(pulangM);
        (absen[t] ||= {})[k.id] = a;
      }
    }
  }
  st = { ...st, absen, jadwal: { shift, hari, akun: {} } };
  st = { ...st, ...sinkronAkun(st) };

  // Kasbon karyawan & gajian, urut tanggal.
  const [rina, dodi, ujang, sari, bagas] = ks;
  const acara = [
    { t: addDays(start, 25), f: () => pinjamKasbon(st, ujang.id, { nominal: 150000, tanggal: addDays(start, 25), catatan: "Bayar kos" }) },
    { t: addDays(start, 47), f: () => pinjamKasbon(st, sari.id, { nominal: 200000, tanggal: addDays(start, 47), catatan: "Keperluan keluarga" }) },
  ];
  for (let t = addDays(start, 1); t <= today; t = addDays(t, 1)) {
    const dow = new Date(t + "T00:00:00").getDay();
    if (dow === 1) {
      // Senin: gaji mingguan minggu lalu (Senin–Minggu)
      const dari = addDays(t, -7);
      const sampai = addDays(t, -1);
      for (const k of [rina, ujang, sari, bagas]) {
        if (k.mulai > sampai) continue;
        acara.push({ t, f: () => bayarGaji(st, k.id, { dari, sampai, bonus: sampai > addDays(start, 35) && r() < 0.3 ? 25000 : 0, potongKasbon: Math.min(50000, saldoKasbonKaryawan(st, k.id)), tanggal: t, metode: r() < 0.6 ? "tunai" : "transfer" }) });
      }
    }
    if (t.slice(8) === "01") {
      // Tanggal 1: gaji bulanan bulan lalu
      const sampai = addDays(t, -1);
      acara.push({ t, f: () => bayarGaji(st, dodi.id, { dari: `${sampai.slice(0, 7)}-01`, sampai, tanggal: t, metode: "transfer" }) });
    }
  }
  acara.sort((a, b) => a.t.localeCompare(b.t));
  for (const a of acara) {
    try {
      const x = a.f();
      st = { ...st, ...(x.gajian ? { gajian: x.gajian } : {}), kasbonKaryawan: x.kasbonKaryawan, transactions: x.transactions };
    } catch {
      // gaji Rp0 (mis. sakit seminggu penuh): dilewati
    }
  }
  return st;
}
