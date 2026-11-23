// Daftar satuan bahan & nama kemasan yang bisa diatur admin platform (dashboard admin -> Satuan & kemasan,
// platform_setting.satuan / .kemasan, dibaca lewat RPC satuan_daftar). Murni (tanpa I/O server): app.js mengambil data
// dari server lalu memanggil setDaftar; disimpan di HP supaya tetap jalan offline. Belum pernah termuat = daftar bawaan.
//
// satuan = [{ nama, alias: [kata lain untuk impor teks], inti? }]. gram, ml, pcs = inti (dipakai hitungan app:
// pembulatan belanja & konversi kg / liter), selalu ada. Bahan menyimpan nama satuan sebagai teks, jadi satuan yang
// dihapus admin tetap tampil di bahan lama (opsiSatuan menambahkan satuan yang sedang dipakai).
import { SATUAN as SATUAN_BAWAAN, KEMASAN as KEMASAN_BAWAAN } from "./stok-utils.js";

export const INTI = ["gram", "ml", "pcs"];
const ALIAS_BAWAAN = { renceng: ["rencengan", "renteng", "rentengan"] };
export const BAWAAN = {
  satuan: SATUAN_BAWAAN.map((nama) => ({ nama, alias: ALIAS_BAWAAN[nama] || [], ...(INTI.includes(nama) ? { inti: true } : {}) })),
  kemasan: [...KEMASAN_BAWAAN],
};
const KEY = "racikin:satuan";
const NAMA_RE = /^[a-z][a-z0-9 ]{0,19}$/;
const KATA_RE = /^[a-z][a-z0-9]{0,19}$/;

/** Rapikan data dari server / HP: huruf kecil, buang yang nggak valid & dobel, satuan inti selalu ada. null kalau rusak. */
export function rapikan(d) {
  if (!d || !Array.isArray(d.satuan)) return null;
  const pakai = new Set();
  const satuan = [];
  for (const x of d.satuan) {
    const nama = String(x?.nama ?? "").trim().toLowerCase();
    if (!NAMA_RE.test(nama) || pakai.has(nama)) continue;
    pakai.add(nama);
    const alias = [];
    for (const a of Array.isArray(x.alias) ? x.alias : []) {
      const k = String(a ?? "").trim().toLowerCase();
      if (!KATA_RE.test(k) || pakai.has(k)) continue;
      pakai.add(k);
      alias.push(k);
    }
    satuan.push({ nama, alias, ...(INTI.includes(nama) ? { inti: true } : {}) });
  }
  for (const n of [...INTI].reverse()) if (!pakai.has(n)) satuan.unshift({ nama: n, alias: [], inti: true });
  const kemasan = [...new Set((Array.isArray(d.kemasan) ? d.kemasan : []).map((k) => String(k ?? "").trim().toLowerCase()).filter((k) => NAMA_RE.test(k)))];
  return { satuan, kemasan };
}

let data = null;
function muatLokal() {
  try {
    return rapikan(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return null;
  }
}
const daftar = () => data || (data = muatLokal() || BAWAAN);

/** Pakai daftar baru (dari server / setelah admin menyimpan). Return true kalau isinya berubah. */
export function setDaftar(d) {
  const r = rapikan(d);
  if (!r) return false;
  const berubah = JSON.stringify(r) !== JSON.stringify(daftar());
  data = r;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* abaikan */
  }
  return berubah;
}

/** Daftar lengkap { satuan: [{ nama, alias, inti? }], kemasan: [...] } (salinan). */
export const daftarLengkap = () => JSON.parse(JSON.stringify(daftar()));
export const daftarSatuan = () => daftar().satuan.map((x) => x.nama);
export const daftarKemasan = () => [...daftar().kemasan];
/** Pilihan satuan untuk dropdown; satuan yang sedang dipakai bahan tetap muncul walau sudah dihapus admin. */
export const opsiSatuan = (cur) => {
  const l = daftarSatuan();
  return cur && !l.includes(cur) ? [...l, cur] : l;
};
/** Kata satuan untuk impor teks: [[kata tertulis, satuan]] (nama satuan + kata lainnya). */
export const kataSatuan = () => daftar().satuan.flatMap((x) => [x.nama, ...(x.alias || [])].map((k) => [k, x.nama]));
