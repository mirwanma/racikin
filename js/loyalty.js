// Kartu stempel & pelanggan (logika murni, tanpa UI).
import { uid } from "./store.js";
import { todayISO } from "./ui.js";

export const DEFAULT_PROGRAM = { nama: "Kartu Setia", target: 5, hadiah: "1 porsi gratis", minBelanja: 0, pesanAjak: "" };
export const AJAK_HARI = 21; // pelanggan dianggap "lama nggak balik" setelah sekian hari

export const program = (s) => ({ ...DEFAULT_PROGRAM, ...(s.loyalty || {}) });

/** Nomor WA Indonesia -> format internasional tanpa +, mis. 0812… -> 62812… */
export function normWa(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

export const waLink = (wa, text) => `https://wa.me/${normWa(wa)}?text=${encodeURIComponent(text)}`;
export const cardUrl = (token) => `${location.origin}${location.pathname}#/kartu/${token}`;

export function newToken() {
  return crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = new Date(todayISO() + "T00:00:00") - new Date(iso + "T00:00:00");
  return Math.round(ms / 86400000);
}

export const siapTukar = (p, prog) => (Number(p.stempel) || 0) >= prog.target;
export const perluDiajak = (list, hari = AJAK_HARI) => (list || []).filter((p) => p.kunjungan > 0 && daysSince(p.terakhir) >= hari);

/** Patch store: tambah n stempel (kunjungan) untuk pelanggan. */
export function patchStempel(s, pelangganId, n = 1, alasan = "beli", catatan = "") {
  const tanggal = todayISO();
  return {
    pelanggan: s.pelanggan.map((p) =>
      p.id === pelangganId
        ? { ...p, stempel: Math.max(0, (Number(p.stempel) || 0) + n), kunjungan: (Number(p.kunjungan) || 0) + (alasan === "beli" ? 1 : 0), terakhir: alasan === "beli" ? tanggal : p.terakhir }
        : p,
    ),
    stempelLog: [...s.stempelLog, { id: uid(), tanggal, pelangganId, delta: n, alasan, catatan }],
  };
}

/** Patch store: tukar hadiah (kurangi stempel sebanyak target). */
export function patchTukar(s, pelangganId) {
  const prog = program(s);
  const tanggal = todayISO();
  return {
    pelanggan: s.pelanggan.map((p) =>
      p.id === pelangganId ? { ...p, stempel: Math.max(0, (Number(p.stempel) || 0) - prog.target), hadiahDiambil: (Number(p.hadiahDiambil) || 0) + 1 } : p,
    ),
    stempelLog: [...s.stempelLog, { id: uid(), tanggal, pelangganId, delta: -prog.target, alasan: "tukar", catatan: prog.hadiah }],
  };
}

export const nickname = (nama) => String(nama || "").trim().split(/\s+/)[0] || "Kak";

/** Isi template pesan: {nama} {stempel} {sisa} {target} {hadiah} {bisnis} {link} {hari} */
export function isiPesan(tpl, p, prog, bisnis, link = "") {
  const sisa = Math.max(0, prog.target - (Number(p.stempel) || 0));
  const hari = daysSince(p.terakhir);
  return String(tpl)
    .replaceAll("{hari}", Number.isFinite(hari) ? String(hari) : "beberapa")
    .replaceAll("{nama}", nickname(p.nama))
    .replaceAll("{stempel}", String(p.stempel || 0))
    .replaceAll("{sisa}", String(sisa))
    .replaceAll("{target}", String(prog.target))
    .replaceAll("{hadiah}", prog.hadiah)
    .replaceAll("{bisnis}", bisnis)
    .replaceAll("{link}", link)
    .replace(/\{[a-z_]+\}/gi, "") // kode yang tidak dikenal dibuang, jangan sampai terkirim mentah
    .replace(/ {2,}/g, " ")
    .trim();
}

export const PESAN_AJAK_DEFAULT =
  "Halo {nama}! Udah lama nggak mampir ke {bisnis} nih, kangen 😊 Stempel kamu udah {stempel}/{target}, tinggal {sisa} lagi buat dapet {hadiah}. Ditunggu ya!";
export const PESAN_KARTU =
  "Halo {nama}! Ini kartu stempel digital kamu di {bisnis}: {link}\nKumpulkan {target} stempel, dapat {hadiah}. Makasih udah mampir!";

/** Isi publik kartu (yang boleh dilihat pelanggan). Tanpa nomor WA. */
export function cardData(s, p) {
  const prog = program(s);
  const pal = s.brand?.palet || [];
  return {
    bisnis: s.brand?.terpilih?.nama || s.profile?.nama || "Usaha kami",
    program: prog.nama,
    nama: nickname(p.nama),
    stempel: Math.min(Number(p.stempel) || 0, 999),
    target: prog.target,
    hadiah: prog.hadiah,
    hadiahDiambil: Number(p.hadiahDiambil) || 0,
    lokasi: [s.profile?.area, s.profile?.kota].filter(Boolean).join(", "),
    warna: pal.length >= 2 ? { utama: pal[0].hex, aksen: pal[1].hex } : null,
  };
}
