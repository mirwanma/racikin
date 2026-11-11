// Pengingat yang jatuh tempo untuk satu perangkat, dihitung dari dokumen usaha. Murni (tanpa I/O).

export type Prefs = { konten?: boolean; stok?: boolean; ajak?: boolean; rekap?: boolean; pagi?: number; malam?: number };
export type Notif = { kind: string; title: string; body: string; url: string };
// deno-lint-ignore no-explicit-any
type Doc = Record<string, any>;

export const DEFAULT_PREFS = { konten: true, stok: true, ajak: true, rekap: true, pagi: 8, malam: 21 };
export const KINDS_PER_ROLE: Record<string, string[]> = {
  owner: ["konten", "stok", "ajak", "rekap"],
  manajer: ["konten", "stok", "ajak", "rekap"],
  kasir: ["stok", "rekap"],
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

/**
 * Pengingat yang perlu dikirim sekarang ke satu perangkat.
 * sent = { [kind]: tanggal terakhir dikirim } supaya tiap jenis maksimal sekali sehari.
 */
export function dueNotifs(doc: Doc, opt: { role: string; prefs: Prefs; tz: string; now: Date; sent: Record<string, string> }): Notif[] {
  const p = { ...DEFAULT_PREFS, ...(opt.prefs || {}) };
  const { tanggal, jam, hari } = localNow(opt.now, opt.tz);
  const boleh = new Set((KINDS_PER_ROLE[opt.role] || []).filter((k) => (p as Record<string, unknown>)[k] !== false));
  const belum = (k: string) => boleh.has(k) && opt.sent?.[k] !== tanggal;
  const out: Notif[] = [];
  if (inWindow(jam, Number(p.pagi))) {
    if (belum("konten")) out.push(kontenHariIni(doc, tanggal) as Notif);
    if (belum("stok")) out.push(stokMenipis(doc) as Notif);
    if (belum("ajak") && hari === 1) out.push(ajakBalik(doc, tanggal) as Notif); // tiap Senin
  }
  if (inWindow(jam, Number(p.malam)) && belum("rekap")) out.push(rekapHarian(doc, tanggal) as Notif);
  return out.filter(Boolean);
}
