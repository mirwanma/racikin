// Foto menu: kecilkan & kompres di HP, percantik (otomatis gratis / AI), upload ke Supabase Storage.
import { sb, cloud, accessToken, SUPABASE_URL, SUPABASE_ANON_KEY } from "./cloud.js";

export const BUCKET = "menu-foto";
const MAX_SISI = 1024;
const KUALITAS = 0.82;

export const GAYA = [
  { id: "studio", nama: "Studio terang" },
  { id: "kayu", nama: "Meja kayu hangat" },
  { id: "polos", nama: "Latar polos" },
  { id: "natural", nama: "Natural" },
];

async function bitmapDari(src) {
  if (src instanceof Blob) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(src, { imageOrientation: "from-image" });
      } catch {
        /* fallback di bawah */
      }
    }
    src = URL.createObjectURL(src);
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

function kanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const keBlob = (c, type = "image/webp", q = KUALITAS) =>
  new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Gagal memproses foto"))), type, q));

/** Kecilkan (sisi terpanjang maks 1024px) & ubah ke WebP. Return { blob, url, w, h }. */
export async function siapkan(src) {
  const bmp = await bitmapDari(src);
  const sw = bmp.width;
  const sh = bmp.height;
  if (!sw || !sh) throw new Error("File ini bukan foto yang bisa dibaca");
  const k = Math.min(1, MAX_SISI / Math.max(sw, sh));
  const c = kanvas(Math.round(sw * k), Math.round(sh * k));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await keBlob(c);
  if (blob.type !== "image/webp") blob = await keBlob(c, "image/jpeg", 0.85); // Safari lama tanpa WebP
  return { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height };
}

/**
 * Percantik otomatis (tanpa AI, gratis, di HP): rentangkan level terang-gelap, tambah kontras & warna
 * sedikit, hangatkan sedikit, lalu pertajam halus.
 */
export async function percantikOtomatis(src) {
  const bmp = await bitmapDari(src);
  const c = kanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Histogram luminansi -> titik hitam/putih 1% & 99%
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  const total = d.length / 4;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) if ((acc += hist[v]) > total * 0.01) { lo = v; break; }
  acc = 0;
  for (let v = 255; v >= 0; v--) if ((acc += hist[v]) > total * 0.01) { hi = v; break; }
  if (hi - lo < 40) { lo = 0; hi = 255; }
  const skala = 255 / (hi - lo);
  const SAT = 1.18;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const n = Math.min(1, Math.max(0, ((v - lo) * skala) / 255));
    lut[v] = 255 * (n < 0.5 ? 0.5 * Math.pow(2 * n, 1.12) : 1 - 0.5 * Math.pow(2 * (1 - n), 1.12)); // kurva S ringan
  }
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]] * 1.03; // sedikit hangat
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]] * 0.97;
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    d[i] = l + (r - l) * SAT;
    d[i + 1] = l + (g - l) * SAT;
    d[i + 2] = l + (b - l) * SAT;
  }
  ctx.putImageData(img, 0, 0);
  // Pertajam halus (unsharp mask sederhana dengan blur CSS)
  const blur = kanvas(c.width, c.height);
  const bctx = blur.getContext("2d");
  bctx.filter = "blur(1.2px)";
  bctx.drawImage(c, 0, 0);
  const a = ctx.getImageData(0, 0, c.width, c.height);
  const b2 = bctx.getImageData(0, 0, c.width, c.height).data;
  const ad = a.data;
  for (let i = 0; i < ad.length; i += 4) {
    ad[i] += (ad[i] - b2[i]) * 0.45;
    ad[i + 1] += (ad[i + 1] - b2[i + 1]) * 0.45;
    ad[i + 2] += (ad[i + 2] - b2[i + 2]) * 0.45;
  }
  ctx.putImageData(a, 0, 0);
  const blob = await keBlob(c);
  return { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height };
}

const keBase64 = (blob) =>
  new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => no(new Error("Gagal membaca foto"));
    r.readAsDataURL(blob);
  });

/** Percantik pakai AI (Gemini lewat Edge Function racikin-foto). */
export async function percantikAI(blob, { nama = "", gaya = "studio" } = {}) {
  const token = await accessToken();
  if (!token) throw new Error("Login dulu untuk pakai AI foto.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/racikin-foto`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "edit", image: await keBase64(blob), mime: blob.type || "image/webp", nama, gaya }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "AI foto gagal");
  const bin = Uint8Array.from(atob(data.image), (ch) => ch.charCodeAt(0));
  const hasil = await siapkan(new Blob([bin], { type: data.mime || "image/png" })); // kecilkan & jadikan WebP lagi
  return { ...hasil, quota: data.quota };
}

/** Upload ke Storage. Return { url, path }. */
export async function upload(blob, resepId) {
  if (!cloud.user || !cloud.team) throw new Error("Login dulu supaya foto bisa disimpan.");
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${cloud.team.ownerId}/${String(resepId).replace(/[^a-z0-9-]/gi, "")}-${Date.now()}.${ext}`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/row-level|not allowed|unauthorized/i.test(error.message) ? "Hanya pemilik/manajer yang bisa menyimpan foto menu." : error.message);
  return { url: sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path };
}

/** Hapus file lama (gagal = diabaikan). */
export async function hapusFile(path) {
  if (!path || !cloud.user) return;
  await sb().storage.from(BUCKET).remove([path]).catch(() => {});
}
