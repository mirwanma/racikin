// Studio Brand: tema dari brand kit, pemuat font Google, dan ekspor PNG/SVG.

const HEX = /^#[0-9a-f]{6}$/i;
const okHex = (h) => (HEX.test(h || "") ? h.toUpperCase() : null);

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** Warna teks yang terbaca di atas `bg`. */
export const onColor = (bg, dark = "#1B1916", light = "#FFFFFF") => (contrast(bg, dark) >= contrast(bg, light) ? dark : light);

export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Ambil peran warna dari palet brand kit (urutan tidak dijamin). */
function colors(palet = []) {
  const list = palet.map((c) => ({ ...c, hex: okHex(c.hex) })).filter((c) => c.hex);
  const find = (re) => list.find((c) => re.test(`${c.peran} ${c.nama}`.toLowerCase()));
  let primary = find(/utama|primer|primary|main/) || list[0];
  let accent = find(/aksen|accent|sekunder|secondary/) || list.find((c) => c !== primary) || null;
  let bg = find(/latar|background|bg|dasar/) || null;
  let ink = find(/teks|text|tulisan|gelap/) || null;
  const P = primary?.hex || "#FFC531";
  const A = accent && accent.hex !== P ? accent.hex : "#1B1916";
  let B = bg?.hex || "#FFF8EC";
  if (lum(B) < 0.6) B = mix(B, "#FFFFFF", 0.88); // latar harus terang supaya cetakan terbaca
  let I = ink?.hex || "#1B1916";
  if (contrast(I, B) < 4.5) I = "#1B1916";
  return { primary: P, accent: A, bg: B, ink: I, onPrimary: onColor(P), onAccent: onColor(A), tint: mix(P, "#FFFFFF", 0.82) };
}

const WEIGHTS = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
/** "Poppins ExtraBold" -> { family: "Poppins", weight: 800 } */
export function parseFont(name, fallbackWeight) {
  let family = String(name || "").trim();
  let weight = fallbackWeight;
  const m = family.match(/\s+(thin|extralight|extra light|light|regular|medium|semibold|semi bold|bold|extrabold|extra bold|black)$/i);
  if (m) {
    weight = WEIGHTS[m[1].toLowerCase().replace(/\s/g, "")] || weight;
    family = family.slice(0, m.index).trim();
  }
  if (!/^[a-z0-9 ]{2,40}$/i.test(family)) family = "";
  return { family, weight };
}

export const ICON_BY_JENIS = { "Minuman / kopi": "cup", Dessert: "cake", "Frozen food": "box", Katering: "box" };

export function theme(s) {
  const b = s.brand || {};
  const p = s.profile || {};
  const st = s.studio || {};
  const head = parseFont(b.font?.judul, 800);
  const body = parseFont(b.font?.isi, 400);
  const menu = (s.resep?.length ? s.resep.map((r) => ({ nama: r.nama, harga: r.harga })) : (b.ide_menu || []).map((m, i) => ({ nama: m.nama, harga: i === 0 ? p.harga : "" })))
    .filter((m) => m.nama)
    .slice(0, 6);
  const name = b.terpilih?.nama || p.nama || "Usahamu";
  return {
    name,
    tagline: b.terpilih?.tagline || (b.tagline || [])[0] || "",
    c: colors(b.palet),
    font: { head: head.family || "Archivo", headWeight: head.weight || 800, body: body.family || "Archivo" },
    icon: ICON_BY_JENIS[p.jenis] || (p.jenis === "Minuman / kopi" ? "cup" : "bowl"),
    product: p.jenis === "Minuman / kopi" ? "cup" : "bowl",
    logo: st.logo || "badge",
    menu,
    lokasi: st.alamat || [p.area, p.kota].filter(Boolean).join(", "),
    kota: p.kota || "",
    copy: {
      headline: st.headline || `${menu[0]?.nama || name}`,
      sub: st.sub || b.terpilih?.tagline || "",
      promo: st.promo || "",
      cta: st.cta || "Pesan sekarang",
      short: st.short || "",
    },
    kontak: { wa: st.wa || "", ig: st.ig || "", jam: st.jam || "" },
    year: new Date().getFullYear(),
  };
}

// ---------- Font Google ----------
const cssCache = new Map();

async function fetchCss(family, weights) {
  const fam = family.replace(/ /g, "+");
  const tries = [`${fam}:wght@${[...new Set(weights)].sort((a, b) => a - b).join(";")}`, `${fam}:wght@400;700`, fam];
  for (const q of tries) {
    try {
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${q}&display=swap`);
      if (res.ok) return await res.text();
    } catch {
      return null;
    }
  }
  return null;
}

/** Pastikan font brand termuat di halaman (untuk preview). Return CSS @font-face-nya. */
export async function loadFonts(t) {
  const want = [
    [t.font.head, [400, 700, t.font.headWeight]],
    [t.font.body, [400, 700]],
  ];
  let all = "";
  for (const [family, weights] of want) {
    if (!family || family === "Archivo") continue;
    const key = family + weights.join();
    if (!cssCache.has(key)) cssCache.set(key, fetchCss(family, weights));
    const css = await cssCache.get(key);
    if (!css) continue;
    const id = "font-" + family.replace(/\W/g, "");
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = css;
      document.head.appendChild(el);
    }
    all += css;
  }
  return all;
}

const b64Cache = new Map();
async function toDataUrl(url) {
  if (!b64Cache.has(url)) {
    b64Cache.set(
      url,
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => new Promise((ok) => {
          const fr = new FileReader();
          fr.onload = () => ok(fr.result);
          fr.readAsDataURL(blob);
        })),
    );
  }
  return b64Cache.get(url);
}

/** CSS @font-face dengan file font di-embed (subset latin saja) supaya ekspor PNG/SVG tetap pakai font brand. */
async function embeddedCss(t) {
  const css = await loadFonts(t);
  if (!css) return "";
  const blocks = css.split(/(?=\/\*\s*[a-z-]+\s*\*\/)/i).filter((b) => /\/\*\s*latin\s*\*\//i.test(b) || !/\/\*/.test(b));
  const out = [];
  for (const block of blocks) {
    const m = block.match(/url\((https:[^)]+)\)/);
    if (!m) continue;
    try {
      out.push(block.replace(m[1], await toDataUrl(m[1])));
    } catch {
      /* lewati font yang gagal diunduh */
    }
  }
  return out.join("\n");
}

function withFonts(svg, css) {
  if (!css) return svg;
  return svg.replace(/<svg([^>]*)>/, `<svg$1><defs><style>${css.replace(/]]>/g, "")}</style></defs>`);
}

function save(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";

export async function downloadSvg(svg, t, filename) {
  const css = await embeddedCss(t).catch(() => "");
  save(new Blob([withFonts(svg, css)], { type: "image/svg+xml" }), filename);
}

/** Render SVG ke PNG dengan lebar `outW` piksel. */
export async function downloadPng(svg, t, w, h, outW, filename, transparent = false) {
  const css = await embeddedCss(t).catch(() => "");
  const src = URL.createObjectURL(new Blob([withFonts(svg, css)], { type: "image/svg+xml" }));
  try {
    const img = await new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error("Gagal merender gambar"));
      im.src = src;
    });
    const scale = outW / w;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!transparent) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("File terlalu besar untuk perangkat ini");
    save(blob, filename);
  } finally {
    URL.revokeObjectURL(src);
  }
}
