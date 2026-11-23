// Pengingat yang jatuh tempo untuk satu perangkat, dihitung dari dokumen usaha. Murni (tanpa I/O).

export type Prefs = { konten?: boolean; stok?: boolean; ajak?: boolean; rekap?: boolean; pajak?: boolean; utang?: boolean; kasbon?: boolean; gaji?: boolean; jadwal?: boolean; pagi?: number; malam?: number };
export type Notif = { kind: string; title: string; body: string; url: string };
// deno-lint-ignore no-explicit-any
type Doc = Record<string, any>;

export const DEFAULT_PREFS = { konten: true, stok: true, ajak: true, rekap: true, pajak: true, utang: true, kasbon: true, gaji: true, jadwal: true, pagi: 8, malam: 21 };
export const KINDS_PER_ROLE: Record<string, string[]> = {
  owner: ["konten", "stok", "ajak", "rekap", "pajak", "utang", "kasbon", "gaji", "jadwal"],
  manajer: ["konten", "stok", "ajak", "rekap", "pajak", "utang", "kasbon", "gaji", "jadwal"],
  kasir: ["stok", "rekap", "jadwal"],
  dapur: ["jadwal"],
};
const AJAK_HARI = 21;
const JENDELA_JAM = 3; // kalau jadwal sempat terlewat, masih dikirim sampai 3 jam setelah jam pilihan

/** Tanggal (YYYY-MM-DD), jam (0-23) & hari (0 = Minggu) lokal di zona waktu tz. */
export function localNow(now: Date, tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  } catch {
    return localNow(now, "Asia/Jakarta");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hari = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { tanggal: `${get("year")}-${get("month")}-${get("day")}`, jam: Number(get("hour")) % 24, hari };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const rupiah = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));
const daftar = (names: string[], max = 3) => (names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} +${names.length - max} lainnya`);
const inWindow = (jam: number, mulai: number) => jam >= mulai && jam < Math.min(24, mulai + JENDELA_JAM);

export function kontenHariIni(doc: Doc, tanggal: string): Notif | null {
  const cal = doc.calendar;
  if (!cal?.start || !Array.isArray(cal.jadwal)) return null;
  const list = cal.jadwal.filter((j: Doc) => !j.done && addDays(cal.start, (Number(j.hari_ke) || 1) - 1) === tanggal);
  if (!list.length) return null;
  const desc = (j: Doc) => `${j.ide}${j.platform || j.jam ? ` (${[j.platform, j.jam].filter(Boolean).join(" ")})` : ""}`;
  return {
    kind: "konten",
    title: list.length > 1 ? `${list.length} jadwal posting hari ini` : "Jadwal posting hari ini",
    body: list.length > 1 ? list.slice(0, 3).map(desc).join(" · ") : `${desc(list[0])}. Caption & hashtag sudah siap di Konten.`,
    url: "#/konten",
  };
}

export function stokMenipis(doc: Doc): Notif | null {
  const low = (doc.bahan || []).filter((b: Doc) => b.tracked && (Number(b.stok) || 0) <= (Number(b.min) || 0));
  if (!low.length) return null;
  return {
    kind: "stok",
    title: `${low.length} bahan menipis`,
    body: `${daftar(low.map((b: Doc) => String(b.nama)))}. Saatnya belanja sebelum kehabisan.`,
    url: "#/stok?tab=bahan",
  };
}

export function ajakBalik(doc: Doc, tanggal: string): Notif | null {
  if (!doc.loyalty) return null;
  const list = (doc.pelanggan || []).filter((p: Doc) => Number(p.kunjungan) > 0 && p.terakhir && daysBetween(p.terakhir, tanggal) >= AJAK_HARI);
  if (!list.length) return null;
  return {
    kind: "ajak",
    title: `${list.length} pelanggan lama nggak mampir`,
    body: `${daftar(list.map((p: Doc) => String(p.nama).split(/\s+/)[0]))}. Kirim pesan ajak balik lewat WA, template-nya sudah siap.`,
    url: "#/pelanggan",
  };
}

export function rekapHarian(doc: Doc, tanggal: string): Notif | null {
  const r = doc.posHarian?.[tanggal];
  if (!r || !r.order) return null;
  const top = Object.entries((r.items || {}) as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
  return {
    kind: "rekap",
    title: `Tutup kasir: ${rupiah(r.omzet)}`,
    body: `Hari ini ${r.order} order${top ? ` · terlaris ${top[0]} (${top[1]})` : ""}. Cek rekap lengkapnya.`,
    url: "#/kasir?tab=rekap",
  };
}

// ---------- Tagihan & gajian (logika ringkas dari js/pajak.js, js/utang.js, js/kasbon.js, js/gaji.js) ----------
const TARIF_PPH = 0.005;
const BEBAS_OP = 500_000_000;
const KAT_OMZET = ["Penjualan", "Pre-order", "Katering/pesanan", "Pelunasan kasbon"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const namaBulan = (ym: string) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const tglPendek = (iso: string) => `${Number(iso.slice(8))} ${BULAN[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const ymLalu = (tanggal: string) => {
  const [y, m] = tanggal.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** PPh Final UMKM satu bulan (orang pribadi: Rp500 juta pertama setahun bebas; PT perorangan / koperasi: semua omzet). */
export function pphBulan(doc: Doc, ym: string): number {
  const bentuk = doc.pajak?.bentuk || "op";
  if (bentuk === "lain") return 0;
  const tahun = ym.slice(0, 4);
  const per: Record<string, number> = {};
  for (const t of doc.transactions || []) {
    if (t.jenis !== "masuk" || !KAT_OMZET.includes(t.kategori) || String(t.tanggal).slice(0, 4) !== tahun) continue;
    const k = String(t.tanggal).slice(0, 7);
    per[k] = (per[k] || 0) + (Number(t.nominal) || 0);
  }
  let sebelum = 0;
  for (const [k, v] of Object.entries(per)) if (k < ym) sebelum += v;
  const kum = sebelum + (per[ym] || 0);
  const dpp = bentuk === "op" ? Math.max(0, kum - Math.max(sebelum, BEBAS_OP)) : per[ym] || 0;
  return Math.floor(dpp * TARIF_PPH);
}

/** PPh bulan lalu belum dibayar: tgl 10–15 tiap hari, lewat tempo tiap Senin. */
export function pajakTagihan(doc: Doc, tanggal: string, hari: number): Notif | null {
  const ym = ymLalu(tanggal);
  if (doc.pajak?.bayar?.[ym]) return null;
  const pph = pphBulan(doc, ym);
  if (!pph) return null;
  const tgl = Number(tanggal.slice(8));
  const telat = tgl > 15;
  if (!(tgl >= 10 && tgl <= 15) && !(telat && hari === 1)) return null;
  return {
    kind: "pajak",
    title: telat ? `PPh ${namaBulan(ym)} lewat jatuh tempo` : `Setor PPh ${namaBulan(ym)}: ${rupiah(pph)}`,
    body: telat ? `${rupiah(pph)} belum dicatat lunas. Bayar secepatnya biar bunganya kecil.` : `Paling lambat tanggal 15. Kode billing KAP 411128 KJS 420, caranya ada di halaman Pajak.`,
    url: "#/pajak",
  };
}

/** Nota utang supplier yang jatuh tempo ≤ 3 hari lagi atau sudah lewat. */
export function utangTagihan(doc: Doc, tanggal: string): Notif | null {
  const nama = new Map((doc.supplier || []).map((x: Doc) => [x.id, String(x.nama)]));
  const list = (doc.utangSupplier || [])
    .map((n: Doc) => ({ n, sisa: (Number(n.total) || 0) - (n.bayar || []).reduce((a: number, b: Doc) => a + (Number(b.nominal) || 0), 0) }))
    .filter((x: Doc) => x.sisa > 0 && daysBetween(tanggal, x.n.tempo) <= 3)
    .sort((a: Doc, b: Doc) => String(a.n.tempo).localeCompare(String(b.n.tempo)));
  if (!list.length) return null;
  const telat = list.filter((x: Doc) => x.n.tempo < tanggal).length;
  const total = list.reduce((a: number, x: Doc) => a + x.sisa, 0);
  const sup = [...new Set(list.map((x: Doc) => nama.get(x.n.supplierId) || "supplier"))] as string[];
  return {
    kind: "utang",
    title: telat ? `Utang supplier lewat tempo: ${rupiah(total)}` : `Utang supplier jatuh tempo: ${rupiah(total)}`,
    body: `${daftar(sup)} · ${telat ? `${telat} nota lewat tempo` : `paling lambat ${tglPendek(list[0].n.tempo)}`}.`,
    url: "#/belanja?tab=utang",
  };
}

/** Tiap Senin: kasbon pelanggan yang belum lunas > 14 hari (pelunasan menutup kasbon terlama dulu). */
export function kasbonTagihan(doc: Doc, tanggal: string, hari: number): Notif | null {
  if (!doc.posSetting?.kasbon || hari !== 1) return null;
  const per = new Map<string, Doc[]>();
  for (const k of doc.kasbon || []) per.set(k.pelangganId, [...(per.get(k.pelangganId) || []), k]);
  const nama = new Map((doc.pelanggan || []).map((p: Doc) => [p.id, String(p.nama)]));
  const lama: { nama: string; sisa: number }[] = [];
  for (const [id, list] of per) {
    let bayar = list.filter((k) => k.jenis === "bayar").reduce((a, k) => a + (Number(k.nominal) || 0), 0);
    const utang = list.filter((k) => k.jenis === "utang").sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    const sisa = utang.reduce((a, k) => a + (Number(k.nominal) || 0), 0) - bayar;
    let sejak: string | null = null;
    for (const u of utang) {
      const n = Number(u.nominal) || 0;
      if (bayar >= n) bayar -= n;
      else {
        sejak = u.tanggal;
        break;
      }
    }
    if (sisa > 0 && sejak && daysBetween(sejak, tanggal) >= 14) lama.push({ nama: (nama.get(id) as string) || "pelanggan", sisa });
  }
  if (!lama.length) return null;
  return {
    kind: "kasbon",
    title: `Kasbon ${rupiah(lama.reduce((a, x) => a + x.sisa, 0))} lewat 2 minggu`,
    body: `${daftar(lama.map((x) => x.nama.split(/\s+/)[0]))}. Tagih pelan-pelan lewat WA, template-nya ada di halaman Kasbon.`,
    url: "#/kasbon",
  };
}

/** Periode gaji yang memuat tanggal: mingguan Senin–Minggu, bulanan tgl 1–akhir bulan. */
function periodeGaji(periode: string, iso: string) {
  if (periode === "bulanan") {
    const [y, m] = iso.split("-").map(Number);
    const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { dari: `${iso.slice(0, 7)}-01`, sampai: `${iso.slice(0, 7)}-${String(akhir).padStart(2, "0")}` };
  }
  const dow = (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
  const dari = addDays(iso, -dow);
  return { dari, sampai: addDays(dari, 6) };
}

/** Gaji periode lalu belum dibayar (3 hari pertama setelah periode selesai) + THR menjelang batas H-7. */
export function gajiTagihan(doc: Doc, tanggal: string): Notif | null {
  if (!doc.absenSetting?.aktif) return null;
  const ks = (doc.karyawan || []).filter((k: Doc) => k.aktif !== false && Number(k.gaji?.nominal) > 0);
  if (!ks.length) return null;
  const belum: string[] = [];
  for (const k of ks) {
    const p = periodeGaji(k.gaji?.periode === "bulanan" ? "bulanan" : "mingguan", addDays(periodeGaji(k.gaji?.periode === "bulanan" ? "bulanan" : "mingguan", tanggal).dari, -1));
    if (daysBetween(p.sampai, tanggal) > 3) continue;
    if (k.mulai && k.mulai > p.sampai) continue;
    if ((doc.gajian || []).some((g: Doc) => g.karyawanId === k.id && g.dari <= p.sampai && g.sampai >= p.dari)) continue;
    belum.push(String(k.nama));
  }
  const hr = doc.absenSetting?.hariRaya;
  const batas = hr ? addDays(hr, -7) : null;
  const thr =
    hr && batas && tanggal <= hr && daysBetween(tanggal, batas) <= 7
      ? ks.filter((k: Doc) => !(doc.thr || []).some((x: Doc) => x.karyawanId === k.id && x.hariRaya === hr)).map((k: Doc) => String(k.nama))
      : [];
  if (!belum.length && !thr.length) return null;
  const bagian = [belum.length ? `Gaji periode lalu belum dibayar: ${daftar(belum)}` : "", thr.length ? `THR ${daftar(thr)} paling lambat ${tglPendek(batas!)}` : ""].filter(Boolean);
  return {
    kind: "gaji",
    title: thr.length && !belum.length ? (tanggal > batas! ? "THR lewat batas H-7" : "THR wajib dibayar H-7") : `Gajian: ${belum.length} karyawan belum dibayar`,
    body: `${bagian.join(". ")}.`,
    url: "#/karyawan?tab=gaji",
  };
}

/** Malam: jadwal besok. Akun yang dihubungkan ke karyawan dapat jadwalnya sendiri; pemilik/manajer dapat ringkasan. */
export function jadwalBesok(doc: Doc, tanggal: string, opt: { role: string; userId?: string }): Notif | null {
  const j = doc.jadwal;
  if (!j?.hari) return null;
  const besok = addDays(tanggal, 1);
  const h = j.hari[besok] || {};
  const shift = (id: string) => (Array.isArray(j.shift) && j.shift.length ? j.shift : [{ id: "pagi", nama: "Pagi", mulai: "07:00", selesai: "15:00" }, { id: "siang", nama: "Siang", mulai: "11:00", selesai: "19:00" }, { id: "malam", nama: "Malam", mulai: "15:00", selesai: "23:00" }]).find((x: Doc) => x.id === id);
  const kid = opt.userId ? j.akun?.[opt.userId] : null;
  if (kid) {
    const v = h[kid];
    if (!v) return null;
    if (v === "libur") return { kind: "jadwal", title: "Besok kamu libur", body: "Selamat istirahat! Cek jadwal minggu ini di app.", url: "#/jadwal" };
    const sh = shift(v);
    if (!sh) return null;
    return { kind: "jadwal", title: `Besok masuk ${sh.nama} ${sh.mulai}–${sh.selesai}`, body: "Jangan telat ya. Jadwal lengkapnya ada di Jadwal saya.", url: "#/jadwal" };
  }
  if (opt.role !== "owner" && opt.role !== "manajer") return null;
  const nama = new Map((doc.karyawan || []).filter((k: Doc) => k.aktif !== false).map((k: Doc) => [k.id, String(k.nama)]));
  const masuk = Object.entries(h)
    .filter(([id, v]) => v !== "libur" && nama.has(id) && shift(v as string))
    .map(([id, v]) => ({ nama: nama.get(id) as string, sh: shift(v as string) }))
    .sort((a, b) => String(a.sh.mulai).localeCompare(String(b.sh.mulai)));
  if (!masuk.length) return null;
  return {
    kind: "jadwal",
    title: `Besok masuk ${masuk.length} orang`,
    body: daftar(masuk.map((x) => `${x.nama.split(/\s+/)[0]} (${x.sh.nama})`), 4) + ".",
    url: "#/karyawan?tab=jadwal",
  };
}

/**
 * Pengingat yang perlu dikirim sekarang ke satu perangkat.
 * sent = { [kind]: tanggal terakhir dikirim } supaya tiap jenis maksimal sekali sehari.
 */
export function dueNotifs(doc: Doc, opt: { role: string; prefs: Prefs; tz: string; now: Date; sent: Record<string, string>; userId?: string }): Notif[] {
  const p = { ...DEFAULT_PREFS, ...(opt.prefs || {}) };
  const { tanggal, jam, hari } = localNow(opt.now, opt.tz);
  const boleh = new Set((KINDS_PER_ROLE[opt.role] || []).filter((k) => (p as Record<string, unknown>)[k] !== false));
  const belum = (k: string) => boleh.has(k) && opt.sent?.[k] !== tanggal;
  const out: Notif[] = [];
  if (inWindow(jam, Number(p.pagi))) {
    if (belum("konten")) out.push(kontenHariIni(doc, tanggal) as Notif);
    if (belum("stok")) out.push(stokMenipis(doc) as Notif);
    if (belum("ajak") && hari === 1) out.push(ajakBalik(doc, tanggal) as Notif); // tiap Senin
    if (belum("pajak")) out.push(pajakTagihan(doc, tanggal, hari) as Notif);
    if (belum("utang")) out.push(utangTagihan(doc, tanggal) as Notif);
    if (belum("kasbon")) out.push(kasbonTagihan(doc, tanggal, hari) as Notif);
    if (belum("gaji")) out.push(gajiTagihan(doc, tanggal) as Notif);
  }
  if (inWindow(jam, Number(p.malam))) {
    if (belum("rekap")) out.push(rekapHarian(doc, tanggal) as Notif);
    if (belum("jadwal")) out.push(jadwalBesok(doc, tanggal, { role: opt.role, userId: opt.userId }) as Notif);
  }
  return out.filter(Boolean);
}

// ---------- Multi-cabang ----------
export type Cabang = { id: string; nama: string; utama: boolean; doc: Doc | null };

/** Tambahkan ?cabang=<id> ke url hash, supaya app langsung membuka cabang itu waktu notifikasi diklik. */
export const urlCabang = (url: string, id: string) => `${url}${url.includes("?") ? "&" : "?"}cabang=${encodeURIComponent(id)}`;

/**
 * Pengingat pemilik dengan beberapa cabang: dihitung per cabang. Penanda "sudah dikirim" per cabang (kunci
 * "<jenis>" untuk cabang utama, sama seperti sebelumnya, "<jenis>@<cabangId>" untuk cabang lain), judul diawali nama
 * cabang, url membawa ?cabang=. Satu cabang saja = sama persis dengan dueNotifs.
 */
export function dueNotifsCabang(cabang: Cabang[], opt: { role: string; prefs: Prefs; tz: string; now: Date; sent: Record<string, string>; userId?: string }): Notif[] {
  const list = cabang.filter((c) => c.doc);
  if (list.length <= 1 && (!list[0] || list[0].utama)) return list[0] ? dueNotifs(list[0].doc!, opt) : [];
  const out: Notif[] = [];
  for (const c of list) {
    const akhiran = c.utama ? "" : `@${c.id}`;
    const sent: Record<string, string> = {};
    for (const [k, v] of Object.entries(opt.sent || {})) {
      if (akhiran ? k.endsWith(akhiran) : !k.includes("@")) sent[akhiran ? k.slice(0, -akhiran.length) : k] = v;
    }
    for (const n of dueNotifs(c.doc!, { ...opt, sent })) {
      out.push({ ...n, kind: n.kind + akhiran, title: `${c.nama} · ${n.title}`, url: urlCabang(n.url, c.id) });
    }
  }
  return out;
}

/** Nama cabang untuk judul notifikasi. */
export const namaCabang = (u: { nama?: string; utama?: boolean }, doc: Doc | null) =>
  String(u.nama || doc?.profile?.cabang || doc?.profile?.nama || (u.utama ? "Cabang utama" : "Cabang")).slice(0, 40);
