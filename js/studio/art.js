// Studio Brand: semua desain digambar sebagai SVG dari tema brand.
// Satuan = piksel di ukuran asli aset. Semua teks di-escape.
import { mix, onColor } from "./theme.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fit = (text, maxW, maxSize, ratio = 0.6) => Math.round(Math.min(maxSize, maxW / Math.max(1, String(text).length * ratio)));
const HF = (t) => `font-family:'${t.font.head}',Archivo,sans-serif;font-weight:${t.font.headWeight}`;
const BF = (t, w = 400) => `font-family:'${t.font.body}',Archivo,sans-serif;font-weight:${w}`;
/** Potong teks di batas kata + "…" kalau lebih dari n karakter. */
const clip = (s, n) => {
  s = String(s || "");
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, n - 1)) + "…";
};
const rp = (n) => (Number(n) ? "Rp" + Number(n).toLocaleString("id-ID") : "");
const up = (s) => String(s || "").toUpperCase();
let uidN = 0;
const uid = (p) => `${p}${++uidN}`;

/** Pecah teks jadi beberapa baris berdasarkan perkiraan jumlah karakter. */
function wrap(text, maxChars, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = head[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    return head;
  }
  return lines;
}
function textLines(lines, xPos, y, size, lh, attrs) {
  return lines.map((l, i) => `<text x="${xPos}" y="${y + i * size * lh}" font-size="${size}" ${attrs}>${x(l)}</text>`).join("");
}
const nested = (inner, w, h, X, Y, W) => `<svg x="${X}" y="${Y}" width="${W}" height="${(W * h) / w}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
const doc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

// ---------- Ikon produk (pusat 0,0, ±50) ----------
function icon(name, stroke, fill = "none", sw = 6) {
  const a = `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const steam = `<path d="M-14 -22c0-8 8-9 8-17M6 -22c0-8 8-9 8-17" fill="none" ${a}/>`;
  switch (name) {
    case "cup":
      return `<path d="M-26 -18h52l-7 56h-38z" fill="${fill}" ${a}/><rect x="-31" y="-28" width="62" height="10" rx="4" fill="${fill}" ${a}/><path d="M8 -28l12-20" fill="none" ${a}/><path d="M-22 8h44" fill="none" ${a}/>`;
    case "cake":
      return `<path d="M-38 34h76v-34l-76-14z" fill="${fill}" ${a}/><path d="M-38 14l76 8" fill="none" ${a}/><circle cx="0" cy="-26" r="7" fill="${stroke}"/>`;
    case "box":
      return `<rect x="-36" y="-22" width="72" height="56" rx="5" fill="${fill}" ${a}/><path d="M-36 -6h72M0 -22v56" fill="none" ${a}/>${steam.replace(/-22/g, "-30").replace(/-39/g, "-44")}`;
    default:
      return `<path d="M-42 -4h84a42 42 0 0 1-84 0z" fill="${fill}" ${a}/><path d="M-22 40h44" fill="none" ${a}/>${steam}`;
  }
}

// ---------- Logo (4 gaya) ----------
export const LOGO_STYLES = [
  { id: "badge", nama: "Lencana bulat" },
  { id: "wordmark", nama: "Wordmark" },
  { id: "stamp", nama: "Stempel" },
  { id: "monogram", nama: "Monogram" },
];

/** Logo -> { w, h, inner }. opts.dark = taruh di latar gelap. */
export function logo(t, style = t.logo, opts = {}) {
  const c = t.c;
  const ink = opts.dark ? "#FFFFFF" : c.ink;
  const short = up(t.copy.short || t.tagline).slice(0, 30);
  if (style === "wordmark") {
    const size = fit(t.name, 420, 96, 0.58);
    const barW = Math.min(420, t.name.length * size * 0.56);
    return {
      w: 660,
      h: 220,
      inner: `<rect x="0" y="20" width="180" height="180" rx="38" fill="${c.primary}"/>
        <g transform="translate(90 112) scale(1.35)">${icon(t.icon, c.onPrimary)}</g>
        <text x="212" y="126" font-size="${size}" fill="${ink}" style="${HF(t)}">${x(t.name)}</text>
        <rect x="214" y="146" width="${barW}" height="10" rx="5" fill="${c.accent === ink ? c.primary : c.accent}"/>
        ${short ? `<text x="214" y="192" font-size="22" letter-spacing="2" fill="${ink}" opacity="0.72" style="${BF(t, 600)}">${x(short)}</text>` : ""}`,
    };
  }
  if (style === "stamp") {
    const col = opts.dark ? "#FFFFFF" : c.primary;
    return {
      w: 460,
      h: 320,
      inner: `<g transform="rotate(-5 230 160)">
        <rect x="24" y="44" width="412" height="232" rx="30" fill="${opts.dark ? "none" : c.bg}" stroke="${col}" stroke-width="10"/>
        <rect x="42" y="62" width="376" height="196" rx="20" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="10 8"/>
        <text x="230" y="102" text-anchor="middle" font-size="20" letter-spacing="6" fill="${col}" style="${BF(t, 700)}">— SEJAK ${t.year} —</text>
        <text x="230" y="${178 + fit(t.name, 340, 84) * 0.12}" text-anchor="middle" font-size="${fit(t.name, 340, 84)}" fill="${col}" style="${HF(t)}">${x(t.name)}</text>
        <text x="230" y="232" text-anchor="middle" font-size="20" letter-spacing="5" fill="${col}" style="${BF(t, 700)}">${x(up(t.kota || "INDONESIA"))}</text>
      </g>`,
    };
  }
  if (style === "monogram") {
    const initial = (t.name.match(/[A-Za-z0-9]/) || ["R"])[0].toUpperCase();
    return {
      w: 420,
      h: 440,
      inner: `<rect x="84" y="24" width="270" height="270" rx="66" fill="${c.accent === ink && !opts.dark ? c.ink : c.accent}"/>
        <rect x="70" y="10" width="270" height="270" rx="66" fill="${c.primary}"/>
        <text x="205" y="212" text-anchor="middle" font-size="200" fill="${c.onPrimary}" style="${HF(t)}">${x(initial)}</text>
        <text x="210" y="${short ? 376 : 392}" text-anchor="middle" font-size="${fit(t.name, 390, 66)}" fill="${ink}" style="${HF(t)}">${x(t.name)}</text>
        ${short ? `<text x="210" y="420" text-anchor="middle" font-size="19" letter-spacing="3" fill="${ink}" opacity="0.72" style="${BF(t, 600)}">${x(short)}</text>` : ""}`,
    };
  }
  // badge
  const id = uid("arc");
  return {
    w: 400,
    h: 400,
    inner: `<defs><path id="${id}t" d="M62 200 A138 138 0 0 1 338 200"/><path id="${id}b" d="M50 200 A150 150 0 0 0 350 200"/></defs>
      <circle cx="200" cy="200" r="196" fill="${c.primary}"/>
      <circle cx="200" cy="200" r="174" fill="none" stroke="${c.onPrimary}" stroke-width="4" stroke-dasharray="1 11" stroke-linecap="round"/>
      <g transform="translate(200 132) scale(0.95)">${icon(t.icon, c.onPrimary)}</g>
      <text x="200" y="${232}" text-anchor="middle" font-size="${fit(t.name, 270, 74)}" fill="${c.onPrimary}" style="${HF(t)}">${x(t.name)}</text>
      <text font-size="20" letter-spacing="5" fill="${c.onPrimary}" style="${BF(t, 700)}"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">EST. ${t.year}${t.kota ? " · " + x(up(t.kota)) : ""}</textPath></text>
      ${short ? `<text font-size="19" letter-spacing="3" fill="${c.onPrimary}" style="${BF(t, 700)}"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${x(short.slice(0, 26))}</textPath></text>` : ""}
      <circle cx="58" cy="200" r="5" fill="${c.onPrimary}"/><circle cx="342" cy="200" r="5" fill="${c.onPrimary}"/>`,
  };
}
export const logoDoc = (t, style, opts) => {
  const l = logo(t, style, opts);
  return doc(l.w, l.h, l.inner);
};
const placeLogo = (t, X, Y, W, style, opts) => {
  const l = logo(t, style, opts);
  return nested(l.inner, l.w, l.h, X, Y, W);
};

// ---------- Ilustrasi produk ----------
function bowlArt(t, cx, cy, s, withLogo = true) {
  const c = t.c;
  const g = uid("bw");
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.75" stop-color="#F3EEE6"/><stop offset="1" stop-color="#DCD3C6"/></linearGradient>
    <clipPath id="${g}c"><path d="M-200 -10L200 -10C195 110 120 200 0 200C-120 200-195 110-200 -10Z"/></clipPath></defs>
    <ellipse cx="0" cy="214" rx="220" ry="24" fill="#000" opacity="0.12"/>
    <path d="M-200 -10L200 -10C195 110 120 200 0 200C-120 200-195 110-200 -10Z" fill="url(#${g})" stroke="${c.ink}" stroke-width="6"/>
    <rect x="-210" y="-10" width="420" height="44" fill="${c.primary}" clip-path="url(#${g}c)"/>
    <ellipse cx="0" cy="-10" rx="200" ry="40" fill="#E8A13A" stroke="${c.ink}" stroke-width="6"/>
    <ellipse cx="0" cy="-12" rx="168" ry="26" fill="#F0B654"/>
    <rect x="-110" y="-30" width="58" height="40" rx="8" fill="#F7E7BF" stroke="#C99A52" stroke-width="3" transform="rotate(-8 -80 -10)"/>
    <rect x="-30" y="-36" width="60" height="42" rx="8" fill="#F7E7BF" stroke="#C99A52" stroke-width="3"/>
    <rect x="50" y="-30" width="56" height="40" rx="8" fill="#F7E7BF" stroke="#C99A52" stroke-width="3" transform="rotate(10 78 -10)"/>
    <circle cx="-130" cy="-4" r="7" fill="#D93A1F"/><circle cx="120" cy="2" r="6" fill="#D93A1F"/><circle cx="-12" cy="10" r="6" fill="#D93A1F"/>
    <circle cx="-60" cy="12" r="5" fill="#4C9A3D"/><circle cx="40" cy="12" r="5" fill="#4C9A3D"/><circle cx="140" cy="-14" r="4" fill="#4C9A3D"/>
    <path d="M-60 -70c0-24 22-26 22-50M0 -76c0-24 22-26 22-50M60 -70c0-24 22-26 22-50" fill="none" stroke="${c.ink}" stroke-width="7" stroke-linecap="round" opacity="0.28"/>
    ${withLogo ? `<circle cx="0" cy="104" r="66" fill="${c.bg}" stroke="${c.ink}" stroke-width="4"/>${placeLogo(t, -56, 48, 112, "badge")}` : ""}
  </g>`;
}

function cupArt(t, cx, cy, s) {
  const c = t.c;
  const g = uid("cp");
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#F1ECE4"/><stop offset="1" stop-color="#D9D0C2"/></linearGradient>
    <clipPath id="${g}c"><path d="M-125 -150L125 -150L98 236L-98 236Z"/></clipPath></defs>
    <ellipse cx="0" cy="246" rx="150" ry="20" fill="#000" opacity="0.12"/>
    <rect x="18" y="-330" width="22" height="200" rx="6" fill="${c.accent}" stroke="${c.ink}" stroke-width="5" transform="rotate(14 29 -230)"/>
    <path d="M-125 -150L125 -150L98 236L-98 236Z" fill="url(#${g})" stroke="${c.ink}" stroke-width="6"/>
    <rect x="-140" y="10" width="280" height="130" fill="${c.primary}" clip-path="url(#${g}c)"/>
    <path d="M-150 -150h300v-26a14 14 0 0 0-14-14h-272a14 14 0 0 0-14 14z" fill="#FFFFFF" stroke="${c.ink}" stroke-width="6"/>
    <path d="M-118 -190Q0 -290 118 -190" fill="#FFFFFF" stroke="${c.ink}" stroke-width="6" opacity="0.9"/>
    <text x="0" y="${80 + fit(t.name, 190, 44) * 0.36}" text-anchor="middle" font-size="${fit(t.name, 190, 44)}" fill="${c.onPrimary}" style="${HF(t)}">${x(t.name)}</text>
    ${placeLogo(t, -44, -120, 88, "badge")}
  </g>`;
}

function bagArt(t, cx, cy, s) {
  const c = t.c;
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="268" rx="210" ry="22" fill="#000" opacity="0.12"/>
    <path d="M-80 -110C-80 -230 80 -230 80 -110" fill="none" stroke="#8B6A45" stroke-width="14" stroke-linecap="round"/>
    <path d="M170 -110L215 -80L215 260L170 260Z" fill="#B58F64" stroke="${c.ink}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="-170" y="-110" width="340" height="370" fill="#CBA77B" stroke="${c.ink}" stroke-width="6"/>
    <rect x="-170" y="-110" width="340" height="38" fill="#BC9768"/>
    <circle cx="0" cy="96" r="112" fill="${c.bg}" stroke="${c.ink}" stroke-width="4"/>
    ${placeLogo(t, -96, 0, 192, "badge")}
  </g>`;
}

const productArt = (t, cx, cy, s) => (t.product === "cup" ? cupArt(t, cx, cy + 20 * s, s * 0.95) : bowlArt(t, cx, cy, s));

// ---------- Aset ----------
function kontakLine(t, sep = "   ·   ") {
  return [t.lokasi, t.kontak.jam && `Buka ${t.kontak.jam}`, t.kontak.wa && `WA ${t.kontak.wa}`, t.kontak.ig && `IG ${t.kontak.ig.replace(/^@?/, "@")}`].filter(Boolean).join(sep);
}

function sticker(t) {
  const c = t.c;
  const id = uid("st");
  const short = up(t.copy.short || t.tagline).slice(0, 32);
  return doc(1000, 1000, `<defs><path id="${id}t" d="M150 500 A350 350 0 0 1 850 500"/><path id="${id}b" d="M120 500 A380 380 0 0 0 880 500"/></defs>
    <circle cx="500" cy="500" r="496" fill="${c.primary}"/>
    <circle cx="500" cy="500" r="420" fill="${c.bg}"/>
    <circle cx="500" cy="500" r="404" fill="none" stroke="${c.primary}" stroke-width="6" stroke-dasharray="2 18" stroke-linecap="round"/>
    <text font-size="${Math.min(84, fit(t.name, 900, 84, 0.7))}" letter-spacing="6" fill="${c.ink}" style="${HF(t)}"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${x(up(t.name))}</textPath></text>
    ${short ? `<text font-size="40" letter-spacing="8" fill="${c.ink}" style="${BF(t, 700)}"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${x(short)}</textPath></text>` : ""}
    <g transform="translate(500 470) scale(4.2)">${icon(t.icon, c.ink, c.tint, 5)}</g>
    <text x="500" y="760" text-anchor="middle" font-size="44" letter-spacing="6" fill="${c.ink}" style="${BF(t, 700)}">EST. ${t.year}</text>`);
}

function mockBowl(t) {
  const c = t.c;
  return doc(1200, 1200, `<rect width="1200" height="1200" fill="${c.tint}"/>
    <circle cx="980" cy="200" r="260" fill="${c.primary}" opacity="0.18"/>
    <rect x="0" y="880" width="1200" height="320" fill="${mix(c.tint, "#000000", 0.06)}"/>
    ${productArt(t, 600, 640, t.product === "cup" ? 1.35 : 1.75)}
    <text x="60" y="110" font-size="40" letter-spacing="6" fill="${c.ink}" opacity="0.6" style="${BF(t, 700)}">MOCKUP KEMASAN</text>
    <text x="60" y="180" font-size="${fit(t.name, 700, 72)}" fill="${c.ink}" style="${HF(t)}">${x(t.name)}</text>`);
}

function mockBag(t) {
  const c = t.c;
  return doc(1200, 1200, `<rect width="1200" height="1200" fill="${mix(c.bg, c.primary, 0.12)}"/>
    <rect x="0" y="900" width="1200" height="300" fill="${mix(c.bg, "#000000", 0.07)}"/>
    ${bagArt(t, 640, 600, 1.55)}
    ${t.product === "cup" ? cupArt(t, 240, 760, 0.62) : bowlArt(t, 250, 800, 0.62)}`);
}

function booth(t) {
  const c = t.c;
  const W = 1600, H = 1200;
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${230 + i * 114}" y="270" width="114" height="70" fill="${i % 2 ? "#FFFFFF" : c.primary}"/><path d="M${230 + i * 114} 340a57 57 0 0 0 114 0z" fill="${i % 2 ? "#FFFFFF" : c.primary}" stroke="${c.ink}" stroke-width="5"/>`).join("");
  const bulbs = Array.from({ length: 12 }, (_, i) => `<circle cx="${270 + i * 97}" cy="${236 + (i % 2) * 6}" r="11" fill="#FFE27A" stroke="${c.ink}" stroke-width="3"/>`).join("");
  const menu = t.menu.slice(0, 3);
  const menuText = menu
    .map((m, i) => `<text x="1300" y="${770 + i * 78}" text-anchor="end" font-size="44" fill="${c.onPrimary}" style="${BF(t, 700)}">${x(clip(m.nama, 22))}${m.harga ? `  <tspan style="${HF(t)}">${x(rp(m.harga))}</tspan>` : ""}</text>`)
    .join("");
  return doc(W, H, `<rect width="${W}" height="${H}" fill="${mix(c.bg, "#9CC7E8", 0.25)}"/>
    <rect x="0" y="1000" width="${W}" height="200" fill="${mix(c.bg, "#000000", 0.12)}"/>
    <rect x="300" y="340" width="1000" height="290" fill="${mix(c.bg, "#000000", 0.08)}"/>
    <rect x="270" y="270" width="24" height="740" fill="${c.ink}"/><rect x="1306" y="270" width="24" height="740" fill="${c.ink}"/>
    <rect x="210" y="200" width="1180" height="74" rx="10" fill="${c.primary}" stroke="${c.ink}" stroke-width="6"/>
    ${stripes}${bulbs}
    <rect x="500" y="40" width="600" height="170" rx="22" fill="${c.ink}"/>
    <text x="800" y="${125 + fit(t.name, 520, 110) * 0.35}" text-anchor="middle" font-size="${fit(t.name, 520, 110)}" fill="${onColor(c.ink)}" style="${HF(t)}">${x(t.name)}</text>
    ${t.product === "cup" ? cupArt(t, 820, 525, 0.3) + cupArt(t, 1000, 525, 0.3) : bowlArt(t, 830, 560, 0.3, false) + bowlArt(t, 1030, 560, 0.3, false)}
    <rect x="230" y="608" width="1140" height="44" rx="8" fill="#8B5E3C" stroke="${c.ink}" stroke-width="6"/>
    <rect x="250" y="652" width="1100" height="350" fill="${c.primary}" stroke="${c.ink}" stroke-width="6"/>
    <circle cx="460" cy="826" r="146" fill="${c.bg}" stroke="${c.ink}" stroke-width="5"/>
    ${placeLogo(t, 336, 702, 248, "badge")}
    ${t.tagline ? `<text x="1300" y="712" text-anchor="end" font-size="34" letter-spacing="2" fill="${c.onPrimary}" opacity="0.85" style="${BF(t, 600)}">${x(t.tagline.slice(0, 40))}</text>` : ""}
    ${menuText}
    <rect x="270" y="1000" width="1060" height="16" fill="${c.ink}" opacity="0.4"/>`);
}

function spanduk(t) {
  const c = t.c;
  const W = 3000, H = 1000;
  const menu = t.menu.slice(0, 3);
  let mx = 1000;
  const chips = menu
    .map((m) => {
      const label = `${clip(m.nama, 20)}${m.harga ? "  " + rp(m.harga) : ""}`;
      const w = label.length * 30 + 80;
      const out = `<rect x="${mx}" y="640" width="${w}" height="110" rx="55" fill="${c.bg}" stroke="${c.ink}" stroke-width="5"/><text x="${mx + w / 2}" y="713" text-anchor="middle" font-size="52" fill="${c.ink}" style="${BF(t, 700)}">${x(label)}</text>`;
      mx += w + 30;
      return mx > 2950 ? "" : out;
    })
    .join("");
  return doc(W, H, `<rect width="${W}" height="${H}" fill="${c.primary}"/>
    <circle cx="2850" cy="120" r="420" fill="${c.accent}" opacity="0.14"/>
    <circle cx="470" cy="440" r="370" fill="${c.bg}" stroke="${c.ink}" stroke-width="8"/>
    ${placeLogo(t, 170, 140, 600, "badge")}
    <text x="1000" y="${330 + 0}" font-size="${fit(t.name, 1900, 280, 0.62)}" fill="${c.onPrimary}" style="${HF(t)}">${x(t.name)}</text>
    ${t.tagline ? `<text x="1006" y="470" font-size="${fit(t.tagline, 1900, 96)}" fill="${c.onPrimary}" opacity="0.9" style="${BF(t, 600)}">${x(t.tagline)}</text>` : ""}
    ${chips}
    <rect x="0" y="870" width="${W}" height="130" fill="${c.ink}"/>
    <text x="1500" y="955" text-anchor="middle" font-size="${fit(kontakLine(t), 2800, 58, 0.55)}" fill="${onColor(c.ink)}" style="${BF(t, 600)}">${x(kontakLine(t))}</text>`);
}

function burst(cx, cy, r, fill, stroke) {
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const rr = i % 2 ? r * 0.86 : r;
    const a = (Math.PI * 2 * i) / 32;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="8" stroke-linejoin="round"/>`;
}

function poster(t) {
  const c = t.c;
  const W = 2480, H = 3508;
  const hl = wrap(t.copy.headline, 14, 2);
  const hs = fit(hl.reduce((a, b) => (a.length > b.length ? a : b), ""), 2100, 300, 0.6);
  const promo = t.copy.promo ? wrap(t.copy.promo, 12, 3) : [];
  return doc(W, H, `<rect width="${W}" height="${H}" fill="${c.bg}"/>
    <rect width="${W}" height="220" fill="${c.primary}"/>
    <text x="150" y="146" font-size="${fit(t.name, 1500, 110)}" fill="${c.onPrimary}" style="${HF(t)}">${x(t.name)}</text>
    <text x="${W - 150}" y="140" text-anchor="end" font-size="64" letter-spacing="10" fill="${c.onPrimary}" style="${BF(t, 700)}">${x(up(t.kota))}</text>
    <circle cx="${W / 2}" cy="2180" r="700" fill="${c.tint}"/>
    ${productArt(t, W / 2, 2120, t.product === "cup" ? 2.1 : 2.6)}
    ${textLines(hl, W / 2, 560, hs, 1.05, `text-anchor="middle" fill="${c.ink}" style="${HF(t)}"`)}
    ${t.copy.sub ? textLines(wrap(t.copy.sub, 34, 2), W / 2, 560 + (hl.length - 1) * hs * 1.05 + 170, 88, 1.3, `text-anchor="middle" fill="${c.ink}" opacity="0.8" style="${BF(t, 500)}"`) : ""}
    ${promo.length ? burst(1960, 1620, 340, c.accent, c.ink) + textLines(promo, 1960, 1620 - ((promo.length - 1) * 92 * 1.1) / 2 + 30, 92, 1.1, `text-anchor="middle" fill="${c.onAccent}" style="${HF(t)}"`) : ""}
    <rect x="${W / 2 - 700}" y="2950" width="1400" height="210" rx="105" fill="${c.ink}"/>
    <text x="${W / 2}" y="3080" text-anchor="middle" font-size="${fit(t.copy.cta, 1200, 96)}" fill="${onColor(c.ink)}" style="${HF(t)}">${x(t.copy.cta)}</text>
    <text x="${W / 2}" y="3340" text-anchor="middle" font-size="${fit(kontakLine(t), 2200, 64, 0.55)}" fill="${c.ink}" style="${BF(t, 600)}">${x(kontakLine(t))}</text>`);
}

function menuBoard(t) {
  const c = t.c;
  const W = 3508, H = 2480;
  const board = lumDark(c.ink) ? c.ink : "#1B1916";
  const light = "#F6EFDC";
  const items = (t.menu.length ? t.menu : [{ nama: t.name, harga: "" }]).slice(0, 6);
  const rows = items
    .map((m, i) => {
      const y = 760 + i * 250;
      const harga = rp(m.harga) || "-";
      const x1 = 220 + Math.min(26, m.nama.length) * 54 + 50;
      const x2 = 2160 - harga.length * 62 - 50;
      return `<text x="220" y="${y}" font-size="96" fill="${light}" style="${BF(t, 700)}">${x(clip(m.nama, 26))}</text>
        ${x2 > x1 + 40 ? `<line x1="${x1}" y1="${y - 26}" x2="${x2}" y2="${y - 26}" stroke="${light}" stroke-width="8" stroke-dasharray="4 26" stroke-linecap="round" opacity="0.5"/>` : ""}
        <text x="2160" y="${y}" text-anchor="end" font-size="104" fill="${c.primary}" style="${HF(t)}">${x(harga)}</text>`;
    })
    .join("");
  return doc(W, H, `<rect width="${W}" height="${H}" fill="${board}"/>
    <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="40" fill="none" stroke="${c.primary}" stroke-width="12"/>
    <text x="220" y="430" font-size="300" fill="${c.primary}" style="${HF(t)}">MENU</text>
    <text x="226" y="530" font-size="64" letter-spacing="8" fill="${light}" opacity="0.75" style="${BF(t, 600)}">${x(up(t.name))}</text>
    ${rows}
    <circle cx="2850" cy="1080" r="520" fill="${c.primary}" opacity="0.16"/>
    ${productArt(t, 2850, 1000, t.product === "cup" ? 1.5 : 1.9)}
    ${placeLogo(t, 2600, 1680, 500, "badge")}
    <text x="220" y="2300" font-size="${fit(kontakLine(t), 2200, 60, 0.55)}" fill="${light}" opacity="0.8" style="${BF(t, 600)}">${x(kontakLine(t))}</text>`);
}
const lumDark = (hex) => onColor(hex) === "#FFFFFF";

function feed(t) {
  const c = t.c;
  const hl = wrap(t.copy.headline, 14, 2);
  const hs = fit(hl.reduce((a, b) => (a.length > b.length ? a : b), ""), 900, 120, 0.6);
  return doc(1080, 1080, `<rect width="1080" height="1080" fill="${c.primary}"/>
    <circle cx="540" cy="700" r="380" fill="${c.bg}"/>
    ${textLines(hl, 540, 150, hs, 1.02, `text-anchor="middle" fill="${c.onPrimary}" style="${HF(t)}"`)}
    ${productArt(t, 540, 650, t.product === "cup" ? 0.95 : 1.15)}
    ${t.copy.promo ? `<rect x="190" y="930" width="700" height="96" rx="48" fill="${c.ink}"/><text x="540" y="993" text-anchor="middle" font-size="${fit(t.copy.promo, 620, 46)}" fill="${onColor(c.ink)}" style="${HF(t)}">${x(t.copy.promo)}</text>` : ""}
    <text x="60" y="1050" font-size="28" fill="${c.onPrimary}" opacity="0.85" style="${BF(t, 700)}">${x(t.kontak.ig ? t.kontak.ig.replace(/^@?/, "@") : t.name)}</text>`);
}

function story(t) {
  const c = t.c;
  const hl = wrap(t.copy.headline, 14, 2);
  const hs = fit(hl.reduce((a, b) => (a.length > b.length ? a : b), ""), 940, 112, 0.6);
  return doc(1080, 1920, `<rect width="1080" height="1920" fill="${c.bg}"/>
    <rect width="1080" height="760" fill="${c.primary}"/>
    ${placeLogo(t, 400, 90, 280, "badge")}
    ${textLines(hl, 540, hl.length > 1 ? 520 : 580, hs, 1.02, `text-anchor="middle" fill="${c.onPrimary}" style="${HF(t)}"`)}
    <circle cx="540" cy="1160" r="330" fill="${c.tint}"/>
    ${productArt(t, 540, 1110, t.product === "cup" ? 0.9 : 1.1)}
    ${t.copy.promo ? textLines(wrap(t.copy.promo, 26, 2), 540, 1560, 56, 1.2, `text-anchor="middle" fill="${c.ink}" style="${HF(t)}"`) : ""}
    <rect x="190" y="1700" width="700" height="110" rx="55" fill="${c.ink}"/>
    <text x="540" y="1772" text-anchor="middle" font-size="${fit(t.copy.cta, 620, 50)}" fill="${onColor(c.ink)}" style="${HF(t)}">${x(t.copy.cta)}</text>
    <text x="540" y="1870" text-anchor="middle" font-size="30" fill="${c.ink}" opacity="0.7" style="${BF(t, 600)}">${x(t.kontak.wa ? "WA " + t.kontak.wa : t.lokasi)}</text>`);
}

/** Daftar aset Studio. size = ukuran cetak / pakai; png = lebar ekspor (px). */
export const ASSETS = [
  { id: "logo", grup: "Identitas", nama: "Logo", size: "PNG transparan", draw: (t) => logoDoc(t, t.logo), png: 2000, transparent: true },
  { id: "stiker", grup: "Kemasan", nama: "Stiker kemasan bulat", size: "Ø 5 cm (cetak) · 1000×1000", w: 1000, h: 1000, draw: sticker, png: 1200, transparent: true },
  { id: "mock-kemasan", grup: "Kemasan", nama: t0 => (t0.product === "cup" ? "Mockup cup" : "Mockup paper bowl"), size: "Preview 1200×1200", w: 1200, h: 1200, draw: mockBowl, png: 2400 },
  { id: "mock-kantong", grup: "Kemasan", nama: "Mockup kantong kertas", size: "Preview 1200×1200", w: 1200, h: 1200, draw: mockBag, png: 2400 },
  { id: "booth", grup: "Outlet", nama: "Mockup booth / gerobak", size: "Preview 1600×1200", w: 1600, h: 1200, draw: booth, png: 3200 },
  { id: "spanduk", grup: "Outlet", nama: "Spanduk", size: "300×100 cm · 6000×2000 px", w: 3000, h: 1000, draw: spanduk, png: 6000 },
  { id: "menu", grup: "Outlet", nama: "Papan menu", size: "A4 landscape · 3508×2480", w: 3508, h: 2480, draw: menuBoard, png: 3508 },
  { id: "poster", grup: "Promosi", nama: "Poster promo", size: "A4 · 2480×3508 (300 dpi)", w: 2480, h: 3508, draw: poster, png: 2480 },
  { id: "feed", grup: "Sosmed", nama: "Feed Instagram", size: "1080×1080", w: 1080, h: 1080, draw: feed, png: 1080 },
  { id: "story", grup: "Sosmed", nama: "Story IG / WA", size: "1080×1920", w: 1080, h: 1920, draw: story, png: 1080 },
];

/** Gambar aset -> { svg, w, h }. */
export function render(asset, t) {
  const svg = asset.draw(t);
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  return { svg, w: Number(m[1]), h: Number(m[2]) };
}
