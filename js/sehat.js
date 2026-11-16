// Cek kesehatan usaha: skor 0-100 + pemeriksaan dari data asli (30 hari terakhir). Murni, tanpa UI & tanpa AI.
// Tiap pemeriksaan: { id, judul, status: baik|waspada|bahaya|kosong|info, nilai, detail, saran, href }.
// Skor = rata-rata pemeriksaan yang punya data (baik 100, waspada 60, bahaya 20); "kosong" & "info" tidak dihitung.
import { addDays, todayISO } from "./ui.js";
import { bahanMap, hppOf, menipis, belumDiisi } from "./stok-utils.js";
import { cariPilihan, hppPilihan } from "./varian.js";
import { activeChannels, saranMarkup, isOnline } from "./online.js";
import { perluDiajak } from "./loyalty.js";

export const HARI = 30;
const NILAI = { baik: 100, waspada: 60, bahaya: 20 };
const URUT = { bahaya: 0, waspada: 1, kosong: 2, info: 3, baik: 4 };
// Masalah utama di profil -> pemeriksaan yang didahulukan
const FOKUS = { untung: ["margin", "menu", "resep"], stok: ["stok"], karyawan: ["kasir"], sepi: ["tren", "pelanggan", "jam"], online: ["online"], catat: ["kas"] };

const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const rp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const pct = (n) => `${Math.round(n)}%`;
const daftar = (arr, n = 3) => arr.slice(0, n).join(", ") + (arr.length > n ? ` +${arr.length - n} lagi` : "");

/** Rentang tanggal [dari, sampai] inklusif. */
const dalam = (t, dari, sampai) => t >= dari && t <= sampai;

/** Omzet harian dari Kasir (posHarian) + penjualan yang dicatat manual di Kas. */
function omzetHarian(s, dari, sampai) {
  const out = {};
  for (const [t, r] of Object.entries(s.posHarian || {})) if (dalam(t, dari, sampai)) out[t] = (out[t] || 0) + (Number(r.omzet) || 0);
  for (const t of s.transactions || []) {
    if (t.ref === "pos" || t.jenis !== "masuk" || t.kategori !== "Penjualan" || !dalam(t.tanggal, dari, sampai)) continue;
    out[t.tanggal] = (out[t.tanggal] || 0) + (Number(t.nominal) || 0);
  }
  return out;
}

/** Porsi terjual per menu & per pilihan varian dalam rentang (rekap kasir harian). */
function porsi(s, dari, sampai) {
  const menu = {};
  const opsi = {};
  for (const [t, r] of Object.entries(s.posHarian || {})) {
    if (!dalam(t, dari, sampai)) continue;
    for (const [nama, q] of Object.entries(r.items || {})) menu[nama] = (menu[nama] || 0) + (Number(q) || 0);
    for (const [id, q] of Object.entries(r.opsi || {})) opsi[id] = (opsi[id] || 0) + (Number(q) || 0);
  }
  return { menu, opsi };
}

export function cekKesehatan(s, today = todayISO()) {
  const p = s.profile || {};
  const dari = addDays(today, -(HARI - 1));
  const map = bahanMap(s.bahan);
  const cek = [];
  const add = (c) => cek.push(c);

  // ---------- 1-3. Untung kotor, menu rugi, kelengkapan resep ----------
  const { menu: qMenu, opsi: qOpsi } = porsi(s, dari, today);
  const resepNama = new Map((s.resep || []).map((r) => [r.nama, r]));
  const adaResep = (r) => (r.items || []).length > 0;
  let omzetMenu = 0;
  let hppMenu = 0;
  let qLengkap = 0;
  let qTotal = 0;
  const tanpaResep = [];
  for (const [nama, q] of Object.entries(qMenu)) {
    const r = resepNama.get(nama);
    qTotal += q;
    if (!r || !adaResep(r)) {
      if (r) tanpaResep.push({ nama, q });
      continue;
    }
    qLengkap += q;
    omzetMenu += q * (Number(r.harga) || 0);
    hppMenu += q * hppOf(r, map).hpp;
  }
  for (const [id, q] of Object.entries(qOpsi)) {
    const f = cariPilihan(s, id);
    if (!f) continue;
    omzetMenu += q * (Number(f.p.harga) || 0);
    hppMenu += q * hppPilihan(f.p, map);
  }
  if (omzetMenu > 0 && qLengkap >= 20) {
    const hppPct = (hppMenu / omzetMenu) * 100;
    add({
      id: "margin",
      judul: "Untung kotor per porsi",
      status: hppPct <= 50 ? "baik" : hppPct <= 65 ? "waspada" : "bahaya",
      nilai: `HPP ${pct(hppPct)} dari harga`,
      detail: `Dari tiap Rp 10.000 penjualan, ±${rp(hppPct * 100)} habis buat bahan & kemasan (menu yang resepnya lengkap, ${HARI} hari).`,
      saran: hppPct <= 50 ? "Pertahankan. Cek harga bahan tiap belanja biar HPP nggak diam-diam naik." : "Usahakan HPP (bahan + kemasan) di bawah 50% harga jual. Naikin harga menu terlaris sedikit, atau kurangi bahan termahal / cari supplier lebih murah.",
      href: "#/laporan",
    });
  } else {
    add({ id: "margin", judul: "Untung kotor per porsi", status: "kosong", nilai: "Belum kebaca", detail: "Butuh penjualan lewat Kasir + resep yang ada bahannya.", saran: "Jualan pakai Kasir & lengkapi resep menu terlaris.", href: "#/stok" });
  }

  const lengkap = (s.resep || []).filter(adaResep);
  if (lengkap.length) {
    const nilai = lengkap.map((r) => ({ r, h: hppOf(r, map), q: qMenu[r.nama] || 0 }));
    const rugi = nilai.filter((x) => x.h.untung <= 0);
    const tipis = nilai.filter((x) => x.h.untung > 0 && x.h.margin < 30).sort((a, b) => b.q - a.q);
    add({
      id: "menu",
      judul: "Menu rugi / untung tipis",
      status: rugi.length ? "bahaya" : tipis.length ? "waspada" : "baik",
      nilai: rugi.length ? `${rugi.length} menu rugi` : tipis.length ? `${tipis.length} menu tipis` : "Semua aman",
      detail: rugi.length
        ? `Rugi tiap porsi: ${daftar(rugi.map((x) => x.r.nama))}.`
        : tipis.length
          ? `Margin di bawah 30%: ${daftar(tipis.map((x) => `${x.r.nama} (${pct(x.h.margin)})`))}.`
          : `Semua ${lengkap.length} menu marginnya ≥ 30%.`,
      saran: rugi.length || tipis.length ? `Naikin harga atau kecilin porsi ${(rugi[0] || tipis[0]).r.nama} dulu, karena ${rugi.length ? "tiap kejual malah rugi" : "paling sering kejual"}.` : "Mantap. Cek lagi tiap harga bahan naik.",
      href: "#/stok",
    });
  }

  if ((s.resep || []).length) {
    const share = qTotal ? (qLengkap / qTotal) * 100 : (lengkap.length / s.resep.length) * 100;
    const kosong = (s.resep || []).filter((r) => !adaResep(r)).map((r) => ({ nama: r.nama, q: qMenu[r.nama] || 0 })).sort((a, b) => b.q - a.q);
    add({
      id: "resep",
      judul: "Resep & HPP lengkap",
      status: !kosong.length ? "baik" : share >= 80 ? "waspada" : "bahaya",
      nilai: !kosong.length ? "Lengkap" : `${kosong.length} menu tanpa resep`,
      detail: !kosong.length ? "Semua menu punya resep, jadi HPP & stok kehitung." : `${qTotal ? `${pct(100 - share)} porsi terjual` : "Sebagian menu"} belum ada resepnya: ${daftar(kosong.map((x) => x.nama))}.`,
      saran: !kosong.length ? "Update resep kalau takaran berubah." : `Lengkapi resep ${kosong[0].nama} dulu (paling laku). Bisa pakai tombol AI di editor resep.`,
      href: "#/stok",
    });
  }

  // ---------- 4. Tren omzet: 14 hari terakhir vs 14 hari sebelumnya ----------
  const om = omzetHarian(s, addDays(today, -27), today);
  const hariAda = Object.keys(om).filter((t) => om[t] > 0);
  const akhir = sum(Object.entries(om).filter(([t]) => t > addDays(today, -14)), ([, v]) => v) / 14;
  const awal = sum(Object.entries(om).filter(([t]) => t <= addDays(today, -14)), ([, v]) => v) / 14;
  if (hariAda.length >= 10 && awal > 0 && hariAda.some((t) => t <= addDays(today, -21))) {
    const ch = ((akhir - awal) / awal) * 100;
    add({
      id: "tren",
      judul: "Tren omzet",
      status: ch >= -5 ? "baik" : ch >= -15 ? "waspada" : "bahaya",
      nilai: `${ch >= 0 ? "+" : ""}${pct(ch)} (2 minggu)`,
      detail: `Rata-rata ${rp(akhir)}/hari, 2 minggu sebelumnya ${rp(awal)}/hari.`,
      saran: ch >= 5 ? "Lagi naik! Jaga stok biar nggak kehabisan pas rame." : ch >= -5 ? "Stabil. Coba 1 promo kecil buat dorong naik." : "Omzet turun. Cek apa yang berubah (harga, rasa, kompetitor baru, cuaca), ajak pelanggan lama balik, dan bikin promo di jam sepi.",
      href: "#/laporan",
    });
  } else {
    add({ id: "tren", judul: "Tren omzet", status: "kosong", nilai: "Belum cukup data", detail: "Butuh ±3 minggu catatan penjualan.", saran: "Catat semua penjualan (Kasir atau Kas) tiap hari.", href: "#/kasir" });
  }

  // ---------- 5. Jam rame & sepi (detail order 30 hari) ----------
  const orders = (s.orders || []).filter((o) => o.status !== "batal" && dalam(o.tanggal, dari, today));
  if (orders.length >= 50) {
    const perJam = {};
    for (const o of orders) {
      const h = Number(String(o.waktu || "").slice(11, 13));
      if (Number.isFinite(h)) perJam[h] = (perJam[h] || 0) + 1;
    }
    const jam = Object.entries(perJam).map(([h, n]) => ({ h: Number(h), n })).sort((a, b) => b.n - a.n);
    const buka = jam.filter((x) => x.n >= orders.length * 0.02).sort((a, b) => a.h - b.h);
    const rame = jam[0];
    const sepi = [...buka].sort((a, b) => a.n - b.n)[0];
    const hh = (h) => `${String(h).padStart(2, "0")}.00`;
    add({
      id: "jam",
      judul: "Jam rame & sepi",
      status: "info",
      nilai: `Rame ${hh(rame.h)}–${hh(rame.h + 1)}`,
      detail: `Paling rame jam ${hh(rame.h)} (${pct((rame.n / orders.length) * 100)} order). Paling sepi (saat buka) jam ${hh(sepi.h)}.`,
      saran: `Siapin bahan & orang sebelum jam ${hh(rame.h)}. Jam ${hh(sepi.h)} cocok buat promo (mis. paket hemat / happy hour).`,
      href: "#/kasir?tab=rekap",
    });
  }

  // ---------- 6. Order online vs komisi ----------
  const online = orders.filter((o) => isOnline(o.channel));
  const ojol = (p.saluran || []).some((x) => ["GoFood", "GrabFood", "ShopeeFood"].includes(x));
  if (online.length) {
    const share = (sum(online, (o) => o.total) / Math.max(1, sum(orders, (o) => o.total))) * 100;
    const kurang = activeChannels(s).filter((c) => c.markup < saranMarkup(c.komisi));
    add({
      id: "online",
      judul: "Order online",
      status: kurang.length ? "waspada" : "baik",
      nilai: `${pct(share)} omzet`,
      detail: kurang.length
        ? `Markup ${daftar(kurang.map((c) => `${c.nama} ${c.markup}%`))} belum nutup komisi (saran ±${saranMarkup(kurang[0].komisi)}%). Untung per porsi online lebih kecil dari di toko.`
        : `Komisi ${rp(sum(online, (o) => o.komisi || 0))} (${HARI} hari) sudah tertutup markup harga online.`,
      saran: kurang.length ? "Naikin markup harga online di halaman Harga Online." : "Aman. Pantau kalau platform naikin komisi.",
      href: "#/online",
    });
  } else if (ojol) {
    add({ id: "online", judul: "Order online", status: "kosong", nilai: "Belum dicatat", detail: "Profil bilang jualan di ojol, tapi belum ada order online di Kasir.", saran: "Catat order GoFood dkk di Kasir (pilih salurannya) biar komisi kehitung.", href: "#/online" });
  }

  // ---------- 7. Stok: menipis, belum diisi, susut ----------
  if ((s.bahan || []).length) {
    const low = menipis(s.bahan);
    const blm = belumDiisi(s.bahan);
    const log = (s.stokLog || []).filter((l) => dalam(l.tanggal, dari, today));
    const nilaiB = (l) => Math.abs(Number(l.delta) || 0) * (Number(map[l.bahanId]?.harga) || 0);
    const pakai = sum(log.filter((l) => l.alasan === "jual" && l.delta < 0), nilaiB);
    const susut = sum(log.filter((l) => l.alasan === "opname" && l.delta < 0 && !/stok awal/i.test(l.catatan || "")), nilaiB);
    const susutPct = pakai ? (susut / pakai) * 100 : 0;
    const status = susutPct > 10 || low.length >= 4 ? "bahaya" : susutPct > 5 || low.length || blm.length ? "waspada" : "baik";
    add({
      id: "stok",
      judul: "Stok & bahan",
      status,
      nilai: susutPct > 5 ? `Susut ${pct(susutPct)}` : low.length ? `${low.length} menipis` : blm.length ? `${blm.length} belum diisi` : "Aman",
      detail: [
        low.length ? `Menipis: ${daftar(low.map((b) => b.nama))}.` : "",
        susutPct >= 1 ? `Selisih hitung fisik ${rp(susut)} (${pct(susutPct)} dari pemakaian ${rp(pakai)}).` : "",
        blm.length ? `${blm.length} bahan belum diisi stoknya, jadi nggak ikut dihitung.` : "",
      ]
        .filter(Boolean)
        .join(" ") || "Stok bahan aman & tercatat.",
      saran: susutPct > 5 ? "Susut di atas 5% biasanya bocor (porsi kebanyakan, bahan terbuang, atau hilang). Cek takaran & hitung stok tiap minggu." : low.length ? "Bikin daftar belanja sekarang biar nggak kehabisan." : blm.length ? "Isi stok bahan yang belum diisi." : "Hitung fisik stok seminggu sekali biar ketahuan kalau ada bocor.",
      href: low.length ? "#/belanja" : "#/stok?tab=bahan",
    });
  }

  // ---------- 8. Arus kas 30 hari ----------
  const tx = (s.transactions || []).filter((t) => dalam(t.tanggal, dari, today));
  if (tx.length >= 5) {
    const masuk = sum(tx.filter((t) => t.jenis === "masuk"), (t) => Number(t.nominal) || 0);
    const keluar = sum(tx.filter((t) => t.jenis === "keluar"), (t) => Number(t.nominal) || 0);
    const kat = {};
    for (const t of tx) if (t.jenis === "keluar") kat[t.kategori] = (kat[t.kategori] || 0) + (Number(t.nominal) || 0);
    const besar = Object.entries(kat).sort((a, b) => b[1] - a[1])[0];
    const sisa = masuk - keluar;
    const m = masuk ? (sisa / masuk) * 100 : -100;
    add({
      id: "kas",
      judul: "Arus kas",
      status: sisa < 0 ? "bahaya" : m < 10 ? "waspada" : "baik",
      nilai: `${sisa >= 0 ? "+" : "−"}${rp(Math.abs(sisa))}`,
      detail: `${HARI} hari: masuk ${rp(masuk)}, keluar ${rp(keluar)}${besar ? `. Pengeluaran terbesar: ${besar[0]} ${rp(besar[1])}` : ""}.`,
      saran: sisa < 0 ? "Uang keluar lebih besar dari masuk. Tahan belanja yang nggak mendesak & cek biaya terbesar." : m < 10 ? "Sisa uang tipis. Cek biaya rutin yang bisa dihemat." : "Sehat. Sisihkan sebagian buat dana darurat.",
      href: "#/kas",
    });
  } else {
    add({ id: "kas", judul: "Arus kas", status: "kosong", nilai: "Belum dicatat", detail: "Catatan Kas 30 hari terakhir masih sedikit.", saran: "Catat uang masuk & keluar tiap hari (bisa ketik bebas di Catat cepat).", href: "#/kas" });
  }

  // ---------- 9. Pelanggan balik ----------
  if (s.loyalty && (s.pelanggan || []).length >= 5) {
    const ajak = perluDiajak(s.pelanggan);
    const share = (ajak.length / s.pelanggan.length) * 100;
    add({
      id: "pelanggan",
      judul: "Pelanggan balik lagi",
      status: share <= 25 ? "baik" : share <= 45 ? "waspada" : "bahaya",
      nilai: `${ajak.length} lama nggak balik`,
      detail: `${pct(share)} dari ${s.pelanggan.length} pelanggan kartu stempel udah 3 minggu lebih nggak mampir.`,
      saran: ajak.length ? "Kirim pesan ajak balik lewat WA dari halaman Pelanggan." : "Mantap, pelanggan rajin balik.",
      href: "#/pelanggan",
    });
  } else {
    add({ id: "pelanggan", judul: "Pelanggan balik lagi", status: "kosong", nilai: "Belum dipantau", detail: "Belum ada kartu stempel / data pelanggan.", saran: "Aktifkan kartu stempel digital biar tahu siapa yang sering balik.", href: "#/pelanggan" });
  }

  // ---------- 10. Selisih kas kasir (shift) ----------
  const shifts = (s.shifts || []).filter((x) => x.tutup && x.hasil?.selisih != null && dalam(String(x.tutup).slice(0, 10), dari, today));
  if (shifts.length) {
    const minus = shifts.filter((x) => x.hasil.selisih < 0);
    const total = sum(minus, (x) => x.hasil.selisih);
    const status = total < -100000 || minus.length >= 8 ? "bahaya" : minus.length >= 5 || (minus.length >= 3 && total < -20000) ? "waspada" : "baik";
    add({
      id: "kasir",
      judul: "Selisih kas kasir",
      status,
      nilai: status !== "baik" ? `${minus.length}× kurang` : minus.length ? "Aman, selisih kecil" : "Pas terus",
      detail: minus.length ? `${minus.length} dari ${shifts.length} shift uangnya kurang, total ${rp(-total)}.` : `${shifts.length} shift ditutup tanpa kekurangan uang.`,
      saran: minus.length >= 3 && total < -20000 ? "Cek per kasir di halaman Shift. Biasakan hitung kembalian 2× & wajibkan buka shift." : "Bagus, lanjutkan tutup kasir tiap selesai jaga.",
      href: "#/shift",
    });
  } else if ((Number(p.karyawan) || 0) > 0 || (p.masalah || []).includes("karyawan")) {
    add({ id: "kasir", judul: "Selisih kas kasir", status: "kosong", nilai: "Belum dipantau", detail: "Belum ada shift kasir yang ditutup 30 hari terakhir.", saran: "Pakai Buka/Tutup shift biar ketahuan kalau uang laci kurang.", href: "#/shift" });
  }

  // ---------- Skor & prioritas ----------
  const dinilai = cek.filter((c) => c.status in NILAI);
  const skor = dinilai.length ? Math.round(sum(dinilai, (c) => NILAI[c.status]) / dinilai.length) : null;
  const fokus = new Set((p.masalah || []).flatMap((m) => FOKUS[m] || []));
  for (const c of cek) c.fokus = fokus.has(c.id);
  const urut = [...cek].sort((a, b) => URUT[a.status] - URUT[b.status] || (b.fokus ? 1 : 0) - (a.fokus ? 1 : 0));
  const prioritas = urut.filter((c) => c.status === "bahaya" || c.status === "waspada").slice(0, 3);
  // Belum ada masalah? Tawarkan melengkapi data yang kosong.
  if (prioritas.length < 3) prioritas.push(...urut.filter((c) => c.status === "kosong" && c.fokus).slice(0, 3 - prioritas.length));
  return {
    skor,
    label: skor === null ? "Belum cukup data" : skor >= 80 ? "Sehat" : skor >= 60 ? "Lumayan, ada PR" : "Perlu perhatian",
    dari,
    sampai: today,
    cek: urut,
    prioritas,
    dinilai: dinilai.length,
  };
}

/** Ringkasan pendek buat konteks Mentor AI. */
export function ringkasSehat(h) {
  if (!h) return null;
  return {
    skor: h.skor,
    label: h.label,
    periode: `${h.dari} s/d ${h.sampai}`,
    temuan: h.cek.filter((c) => c.status !== "kosong").map((c) => ({ cek: c.judul, status: c.status, nilai: c.nilai, detail: c.detail })),
    belum_ada_data: h.cek.filter((c) => c.status === "kosong").map((c) => c.judul),
  };
}
