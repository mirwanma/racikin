// Karyawan & absen harian. Murni (tanpa UI).
//
// - Karyawan nggak perlu akun. Opsional: PIN / ID di mesin absen (untuk impor file fingerprint) dan akun kasir
//   (shift yang dia buka otomatis dihitung hadir).
// - Absen dicatat pemilik/manajer (sekali ketuk per orang), otomatis dari shift kasir, atau impor file mesin absen
//   (Excel / CSV / log teks seperti attlog ZKTeco): scan pertama = masuk, scan terakhir = pulang.
//
// state.karyawan = [{ id, nama, wa, posisi, pin, akunId, aktif, mulai }]
// state.absen = { "YYYY-MM-DD": { [karyawanId]: { status, masuk?, pulang?, sumber: "manual"|"mesin", catatan? } } }
// state.absenSetting = { aktif, jamMasuk: "08:00", toleransi: 10 }
import { uid } from "./store.js";
import { tanggalISO, urutanTanggal } from "./imporjual.js";

export const STATUS = [
  { id: "hadir", nama: "Hadir", cls: "pos" },
  { id: "izin", nama: "Izin", cls: "warn" },
  { id: "sakit", nama: "Sakit", cls: "warn" },
  { id: "libur", nama: "Libur", cls: "muted" },
  { id: "alpa", nama: "Alpa", cls: "neg" },
];
// Posisi / kategori karyawan bebas diatur pemilik (absenSetting.posisi); ini cuma isian awal.
// Beda dengan peran akun tim (owner/manajer/kasir/dapur) yang mengatur hak akses aplikasi.
export const POSISI = ["Kasir", "Dapur / masak", "Helper", "Pelayan", "Barista", "Kurir", "Manajer"];
export const SETTING_AWAL = { aktif: false, jamMasuk: "08:00", toleransi: 10, posisi: POSISI };

export const setelan = (s) => ({ ...SETTING_AWAL, ...(s.absenSetting || {}) });

/** Tambah posisi baru (unik, tanpa beda huruf besar/kecil). Return list baru. */
export function tambahPosisi(list, nama) {
  const n = String(nama || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!n) throw new Error("Isi nama posisinya");
  if (list.some((x) => x.toLowerCase() === n.toLowerCase())) throw new Error(`${n} sudah ada`);
  return [...list, n];
}
/** Hapus posisi (karyawan yang sudah memakai posisi itu tetap menyimpan namanya). */
export const hapusPosisi = (list, nama) => list.filter((x) => x !== nama);
/** Jumlah karyawan aktif per posisi. */
export function hitungPosisi(s) {
  const out = {};
  for (const k of karyawanAktif(s)) if (k.posisi) out[k.posisi] = (out[k.posisi] || 0) + 1;
  return out;
}
export const absenAktif = (s) => !!s.absenSetting?.aktif;
export const karyawanAktif = (s) => (s.karyawan || []).filter((k) => k.aktif !== false).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
const menit = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const pad = (n) => String(n).padStart(2, "0");
const normNama = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
const normPin = (x) => String(x ?? "").trim().replace(/^0+(?=\d)/, "");

/** Telat? (jam masuk lewat jamMasuk + toleransi). */
export function telat(s, masuk) {
  const set = setelan(s);
  const m = menit(masuk);
  const batas = menit(set.jamMasuk);
  return m != null && batas != null && m > batas + (Number(set.toleransi) || 0);
}

/** Simpan / tambah karyawan. */
export function simpanKaryawan(s, data) {
  const nama = String(data.nama || "").trim().slice(0, 40);
  if (!nama) throw new Error("Isi nama karyawan");
  const pin = normPin(data.pin);
  const list = s.karyawan || [];
  if (list.some((k) => k.id !== data.id && normNama(k.nama) === normNama(nama))) throw new Error(`Nama ${nama} sudah ada`);
  if (pin && list.some((k) => k.id !== data.id && normPin(k.pin) === pin)) throw new Error(`PIN ${pin} sudah dipakai karyawan lain`);
  const k = {
    id: data.id || uid(),
    nama,
    wa: String(data.wa || "").trim(),
    posisi: String(data.posisi || "").trim().slice(0, 30),
    pin,
    akunId: data.akunId || null,
    aktif: data.aktif !== false,
    mulai: data.mulai || null,
  };
  return { karyawan: data.id && list.some((x) => x.id === data.id) ? list.map((x) => (x.id === data.id ? k : x)) : [...list, k], karyawanBaru: k };
}

/** Hadir otomatis dari shift kasir (karyawan yang dihubungkan ke akun kasir). { karyawanId: { masuk, pulang } } */
export function dariShift(s, tanggal) {
  const out = {};
  for (const k of s.karyawan || []) {
    if (!k.akunId) continue;
    const sh = (s.shifts || []).filter((x) => x.kasir?.id === k.akunId && String(x.buka).slice(0, 10) === tanggal).sort((a, b) => String(a.buka).localeCompare(String(b.buka)));
    if (!sh.length) continue;
    const akhir = sh[sh.length - 1];
    out[k.id] = { masuk: String(sh[0].buka).slice(11, 16), pulang: akhir.tutup && String(akhir.tutup).slice(0, 10) === tanggal ? String(akhir.tutup).slice(11, 16) : "" };
  }
  return out;
}

/** Absen efektif satu hari: catatan tersimpan, kalau kosong pakai shift kasir. { karyawanId: { status, masuk, pulang, sumber, telat } } */
export function absenHari(s, tanggal) {
  const simpan = s.absen?.[tanggal] || {};
  const shift = dariShift(s, tanggal);
  const out = {};
  for (const k of s.karyawan || []) {
    const a = simpan[k.id] || (shift[k.id] ? { status: "hadir", ...shift[k.id], sumber: "shift" } : null);
    if (a) out[k.id] = { ...a, telat: a.status === "hadir" && telat(s, a.masuk) };
  }
  return out;
}

/** Catat / ubah absen satu orang (status null = hapus catatan). */
export function catatAbsen(s, tanggal, karyawanId, data) {
  const hari = { ...(s.absen?.[tanggal] || {}) };
  if (!data || !data.status) delete hari[karyawanId];
  else {
    const lama = hari[karyawanId] || {};
    const a = { ...lama, ...data, sumber: data.sumber || "manual" };
    if (a.status !== "hadir") {
      delete a.masuk;
      delete a.pulang;
    }
    for (const f of ["masuk", "pulang", "catatan"]) if (a[f] === "" || a[f] == null) delete a[f];
    hari[karyawanId] = a;
  }
  const absen = { ...(s.absen || {}) };
  if (Object.keys(hari).length) absen[tanggal] = hari;
  else delete absen[tanggal];
  return { absen };
}

/** Tandai semua karyawan aktif yang belum tercatat sebagai hadir. */
export function semuaHadir(s, tanggal) {
  const ada = absenHari(s, tanggal);
  let st = s;
  for (const k of karyawanAktif(s)) if (!ada[k.id]) st = { ...st, ...catatAbsen(st, tanggal, k.id, { status: "hadir" }) };
  return { absen: st.absen || {} };
}

/** Rekap per karyawan untuk rentang tanggal [dari, sampai]. */
export function rekapAbsen(s, dari, sampai) {
  const out = Object.fromEntries((s.karyawan || []).map((k) => [k.id, { hadir: 0, telat: 0, izin: 0, sakit: 0, libur: 0, alpa: 0, menit: 0 }]));
  const tgl = new Set(Object.keys(s.absen || {}));
  for (const sh of s.shifts || []) tgl.add(String(sh.buka).slice(0, 10));
  for (const t of tgl) {
    if (t < dari || t > sampai) continue;
    for (const [id, a] of Object.entries(absenHari(s, t))) {
      const r = out[id];
      if (!r) continue;
      r[a.status] = (r[a.status] || 0) + 1;
      if (a.telat) r.telat += 1;
      const m1 = menit(a.masuk);
      const m2 = menit(a.pulang);
      if (m1 != null && m2 != null && m2 > m1) r.menit += m2 - m1;
    }
  }
  return out;
}

/** Ringkasan hari ini untuk Beranda / modul: { total, tercatat, hadir, belum }. */
export function ringkasHari(s, tanggal) {
  const ks = karyawanAktif(s);
  const a = absenHari(s, tanggal);
  return { total: ks.length, tercatat: ks.filter((k) => a[k.id]).length, hadir: ks.filter((k) => a[k.id]?.status === "hadir").length, belum: ks.filter((k) => !a[k.id]) };
}

// ---------- Impor file mesin absen (fingerprint) ----------

const POLA = {
  pin: /^(pin|id|no\.?\s*id|user\s*id|userid|ac-?no\.?|no\.?\s*(absen|karyawan|pegawai|kartu)|nik|nip|emp(loyee)?\s*(id|no\.?)|badge|enroll\s*(id|no\.?)|id\s*(karyawan|pegawai|user))$/i,
  nama: /^(nama|name|nama\s*(karyawan|pegawai|lengkap)|employee\s*name|full\s*name)$/i,
  waktu: /^(tanggal\s*scan|tgl\s*scan|waktu(\s*scan)?|date\s*\/?\s*time|datetime|scan\s*time|check\s*time|time\s*stamp|timestamp|tanggal\s*&?\s*jam|tanggal\s*dan\s*jam|log\s*time|punch\s*time)$/i,
  tanggal: /^(tanggal|tgl|date|hari\s*\/?\s*tanggal)$/i,
  jam: /^(jam|time|pukul|jam\s*scan|scan)$/i,
  masuk: /^(jam\s*)?(masuk|datang|check\s*-?\s*in|clock\s*-?\s*in|scan\s*masuk|in|on\s*duty|jam\s*datang)$/i,
  pulang: /^(jam\s*)?(pulang|keluar|check\s*-?\s*out|clock\s*-?\s*out|scan\s*pulang|out|off\s*duty)$/i,
};
export const KOLOM = [
  { id: "pin", nama: "PIN / ID mesin" },
  { id: "nama", nama: "Nama" },
  { id: "waktu", nama: "Tanggal + jam scan (satu kolom)" },
  { id: "tanggal", nama: "Tanggal" },
  { id: "jam", nama: "Jam scan" },
  { id: "masuk", nama: "Jam masuk" },
  { id: "pulang", nama: "Jam pulang" },
];

const RE_TGLJAM = /^(\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[ T]+\d{1,2}[:.]\d{2}/;

/** Sel dari Excel (Date / angka pecahan hari) -> teks "YYYY-MM-DD HH:MM:SS" / "HH:MM". */
export function selTeks(v) {
  if (v instanceof Date && !isNaN(v)) {
    v = new Date(Math.round(v.getTime() / 60000) * 60000); // Excel menyimpan pecahan hari: 17:02 bisa jadi 17:01:59.9
    const jam = `${pad(v.getHours())}:${pad(v.getMinutes())}`;
    return v.getFullYear() < 1901 ? jam : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}${v.getHours() || v.getMinutes() ? ` ${jam}` : ""}`;
  }
  return v == null ? "" : String(v).trim();
}

/** "07:58", "7.58", "07:58:12", "0.3319" (pecahan hari Excel), "2026-11-20 07:58" -> "07:58" | "" */
export function jamDari(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^0?\.\d+$/.test(s) || (/^\d*\.\d+$/.test(s) && Number(s) < 1)) {
    const m = Math.round(Number(s) * 1440);
    return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  }
  const m = s.match(/(?:^|[ T])(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/i) || s.match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return "";
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (/pm/i.test(m[3]) ? 12 : 0);
  return h < 24 && Number(m[2]) < 60 ? `${pad(h)}:${m[2]}` : "";
}

/**
 * Cari baris judul (export mesin sering diawali judul laporan) & tebak kolom.
 * rows = array of array (teks). Return { header, data, map, tanpaJudul }.
 */
export function kenaliTabel(rows) {
  const bersih = rows.map((r) => r.map(selTeks)).filter((r) => r.some((x) => x));
  for (let i = 0; i < Math.min(15, bersih.length); i++) {
    const map = tebakKolomAbsen(bersih[i]);
    const kena = Object.values(map).filter((x) => x >= 0).length;
    const punyaWaktu = map.waktu >= 0 || map.tanggal >= 0 || map.jam >= 0;
    if (kena >= 2 && punyaWaktu && (map.pin >= 0 || map.nama >= 0)) return { header: bersih[i], data: bersih.slice(i + 1), map, tanpaJudul: false };
  }
  // Tanpa judul (cth attlog.dat ZKTeco: "  1\t2026-11-20 07:58:12\t1\t0..."): kolom tanggal+jam & ID di depannya.
  const contoh = bersih.slice(0, 20);
  const n = Math.max(0, ...contoh.map((r) => r.length));
  const waktu = [...Array(n).keys()].find((j) => contoh.filter((r) => RE_TGLJAM.test(r[j] || "")).length >= Math.ceil(contoh.length / 2));
  if (waktu == null) return { header: bersih[0] || [], data: bersih.slice(1), map: tebakKolomAbsen(bersih[0] || []), tanpaJudul: false };
  const pin = [...Array(n).keys()].find((j) => j !== waktu && contoh.every((r) => /^\d+$/.test(r[j] || "")));
  const header = [...Array(n).keys()].map((j) => (j === waktu ? "Waktu" : j === pin ? "PIN" : `Kolom ${j + 1}`));
  return { header, data: bersih, map: { pin: pin ?? -1, nama: -1, waktu, tanggal: -1, jam: -1, masuk: -1, pulang: -1 }, tanpaJudul: true };
}

export function tebakKolomAbsen(header) {
  const pakai = new Set();
  const out = {};
  for (const id of ["waktu", "masuk", "pulang", "pin", "nama", "tanggal", "jam"]) {
    const i = header.findIndex((h, j) => !pakai.has(j) && POLA[id].test(String(h).trim()));
    out[id] = i;
    if (i >= 0) pakai.add(i);
  }
  return out;
}

/**
 * Olah tabel jadi absen per orang per hari.
 * Return { hari: [{ kunci, pin, nama, tanggal, masuk, pulang, scan, karyawanId|null }], belumKenal: [{ kunci, pin, nama, hari }],
 *          dari, sampai, dilewati }
 */
export function olahAbsen(s, data, map) {
  const ambil = (r, k) => (map[k] >= 0 ? String(r[map[k]] ?? "").trim() : "");
  const urutan = urutanTanggal(data.slice(0, 200).map((r) => ambil(r, "waktu") || ambil(r, "tanggal") || ambil(r, "jam")));
  const per = new Map();
  let dilewati = 0;
  for (const r of data) {
    const pin = normPin(ambil(r, "pin"));
    const nama = ambil(r, "nama");
    const kunci = pin ? `p:${pin}` : nama ? `n:${normNama(nama)}` : "";
    const sumberTgl = ambil(r, "waktu") || ambil(r, "tanggal") || (RE_TGLJAM.test(ambil(r, "jam")) ? ambil(r, "jam") : "");
    const tanggal = tanggalISO(sumberTgl, urutan);
    if (!kunci || !tanggal) {
      dilewati++;
      continue;
    }
    const scan = [];
    if (map.masuk >= 0 || map.pulang >= 0) {
      const m = jamDari(ambil(r, "masuk"));
      const p = jamDari(ambil(r, "pulang"));
      if (m) scan.push(m);
      if (p) scan.push(p);
    } else {
      const j = jamDari(ambil(r, "jam")) || jamDari(ambil(r, "waktu"));
      if (j) scan.push(j);
    }
    if (!scan.length) {
      dilewati++;
      continue;
    }
    const id = `${kunci}|${tanggal}`;
    const x = per.get(id) || { kunci, pin, nama, tanggal, scan: [] };
    x.scan.push(...scan);
    if (!x.nama && nama) x.nama = nama;
    per.set(id, x);
  }
  const byPin = new Map((s.karyawan || []).filter((k) => k.pin).map((k) => [`p:${normPin(k.pin)}`, k.id]));
  const byNama = new Map((s.karyawan || []).map((k) => [`n:${normNama(k.nama)}`, k.id]));
  const hari = [...per.values()]
    .map((x) => {
      const sc = [...new Set(x.scan)].sort();
      const masuk = sc[0];
      const pulang = sc.length > 1 && menit(sc[sc.length - 1]) - menit(masuk) >= 30 ? sc[sc.length - 1] : "";
      return { ...x, scan: sc.length, masuk, pulang, karyawanId: byPin.get(x.kunci) || (x.nama ? byNama.get(`n:${normNama(x.nama)}`) : null) || byNama.get(x.kunci) || null };
    })
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.kunci.localeCompare(b.kunci));
  const belum = new Map();
  for (const h of hari.filter((x) => !x.karyawanId)) {
    const b = belum.get(h.kunci) || { kunci: h.kunci, pin: h.pin, nama: h.nama, hari: 0 };
    b.hari++;
    if (!b.nama && h.nama) b.nama = h.nama;
    belum.set(h.kunci, b);
  }
  const tgl = hari.map((x) => x.tanggal);
  return { hari, belumKenal: [...belum.values()], dari: tgl[0] || null, sampai: tgl[tgl.length - 1] || null, dilewati };
}

/**
 * Simpan hasil impor. tambah = kunci orang belum dikenal yang dijadikan karyawan baru,
 * petakan = { kunci: karyawanId } orang belum dikenal = karyawan yang sudah ada (PIN-nya disimpan kalau masih kosong).
 * timpa = true: catatan manual (izin/sakit/dll.) di hari yang sama ditimpa jadi hadir; default dipertahankan.
 * Return { patch, n, dilewati }.
 */
export function simpanImpor(s, hasil, { tambah = [], petakan = {}, timpa = false } = {}) {
  let st = { ...s };
  const map = new Map();
  for (const b of hasil.belumKenal) {
    const id = petakan[b.kunci];
    const k = id && (st.karyawan || []).find((x) => x.id === id);
    if (!k) continue;
    map.set(b.kunci, id);
    if (b.pin && !k.pin && !(st.karyawan || []).some((x) => normPin(x.pin) === b.pin)) st = { ...st, karyawan: st.karyawan.map((x) => (x.id === id ? { ...x, pin: b.pin } : x)) };
  }
  for (const b of hasil.belumKenal.filter((x) => tambah.includes(x.kunci) && !map.has(x.kunci))) {
    const r = simpanKaryawan(st, { nama: b.nama || `Karyawan ${b.pin}`, pin: b.pin });
    st = { ...st, karyawan: r.karyawan };
    map.set(b.kunci, r.karyawanBaru.id);
  }
  let n = 0;
  let lewat = 0;
  for (const h of hasil.hari) {
    const id = h.karyawanId || map.get(h.kunci);
    if (!id) continue;
    const lama = st.absen?.[h.tanggal]?.[id];
    if (lama && lama.sumber !== "mesin" && lama.status !== "hadir" && !timpa) {
      lewat++;
      continue;
    }
    st = { ...st, ...catatAbsen(st, h.tanggal, id, { status: "hadir", masuk: h.masuk, pulang: h.pulang || (lama?.status === "hadir" ? lama.pulang : ""), sumber: "mesin" }) };
    n++;
  }
  return { patch: { karyawan: st.karyawan || [], absen: st.absen || {} }, n, dilewati: lewat };
}
