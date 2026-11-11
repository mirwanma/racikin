// Penggabungan otomatis (3-way merge) data dari beberapa perangkat. Murni, tanpa UI.
//
// base   = versi terakhir yang sama-sama diketahui (hasil sinkron terakhir di perangkat ini)
// local  = data di perangkat ini sekarang
// remote = data di cloud sekarang (mungkin sudah diubah perangkat lain)
//
// Aturan:
// - Bagian yang hanya diubah satu pihak -> pakai perubahan pihak itu.
// - Daftar ber-id (order, transaksi, bahan, pelanggan, ...) digabung per item:
//   item baru dari dua pihak sama-sama masuk, item yang dihapus satu pihak ikut terhapus
//   (kecuali pihak lain baru saja mengubahnya).
// - Angka "penghitung" (stok, stempel, delta, ...) yang diubah dua pihak digabung sebagai
//   selisih: base + (lokal - base) + (cloud - base). Jadi -4 dari kasir A dan -8 dari kasir B = -12.
// - Selain itu, kalau dua pihak mengubah hal yang sama, perubahan di perangkat ini yang menang.

const COUNTERS = new Set(["stok", "stempel", "kunjungan", "hadiahDiambil", "delta"]);

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isIdArray = (x) => Array.isArray(x) && x.every((e) => isObj(e) && e.id != null);

/** Bandingkan isi (urutan key objek tidak berpengaruh; key bernilai undefined dianggap tidak ada). */
export function same(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

function mergeIdArrays(base, local, remote) {
  const byId = (arr) => new Map((arr || []).map((e) => [String(e.id), e]));
  const B = byId(base);
  const L = byId(local);
  const R = byId(remote);
  const out = [];
  const seen = new Set();
  const put = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const v = merge3(B.get(id), L.get(id), R.get(id));
    if (v !== undefined) out.push(v);
  };
  // Urutan: ikuti cloud, lalu item yang hanya ada di perangkat ini (urutan lokal).
  for (const id of R.keys()) put(id);
  for (const id of L.keys()) put(id);
  return out;
}

function mergeObjects(base, local, remote) {
  const b = isObj(base) ? base : {};
  const out = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(b)])) {
    const v = merge3(b[k], local[k], remote[k], k);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Gabungkan tiga versi. undefined = tidak ada / dihapus. */
export function merge3(base, local, remote, key = "") {
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  // Dua pihak sama-sama mengubah (sejak base). Penghitung tetap dijumlah walau hasilnya kebetulan
  // sama (dua HP sama-sama kasih +1 stempel = +2), jadi objek/daftar diperiksa per bagian.
  if (typeof local === "number" && typeof remote === "number" && COUNTERS.has(key)) {
    const b = typeof base === "number" ? base : 0;
    return Math.round((b + (local - b) + (remote - b)) * 1000) / 1000;
  }
  if (local === undefined || remote === undefined) {
    // Satu pihak menghapus, pihak lain mengubah: pertahankan yang diubah.
    return local === undefined ? remote : local;
  }
  if (isObj(local) && isObj(remote)) return mergeObjects(base, local, remote);
  if (isIdArray(local) && isIdArray(remote) && (base === undefined || isIdArray(base))) return mergeIdArrays(base, local, remote);
  return local; // sama persis, atau bentrok biasa: perangkat ini menang
}

/** Gabungkan seluruh dokumen. Tanpa base (belum pernah sinkron) -> dianggap base kosong. */
export const mergeDocs = (base, local, remote) => mergeObjects(base || {}, local || {}, remote || {});

/** Hapus key tertentu dari objek (dangkal). */
export const omit = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.includes(k)));

/** Salinan bersih lewat JSON (sama seperti yang tersimpan di database). */
export const norm = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
