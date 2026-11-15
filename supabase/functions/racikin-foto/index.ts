// Supabase Edge Function: racikin-foto (percantik foto menu pakai AI)
//
// POST { action: "edit", image: <base64>, mime, nama, gaya } -> { image: <base64>, mime, model }
// POST { action: "models" }                                   -> daftar model gambar yang tersedia di API key
//
// Wajib login (access token user). Kuota terpisah dari AI teks: RACIKIN_FOTO_PER_DAY (default 15) & 3/menit.
// Model: GEMINI_IMAGE_MODEL (opsional) lalu daftar cadangan; dipakai yang pertama berhasil.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("RACIKIN_ALLOWED_ORIGIN") ?? "*";
const PER_DAY = Number(Deno.env.get("RACIKIN_FOTO_PER_DAY") ?? 15);
const MAX_BYTES = 1_600_000; // gambar masuk (setelah dikecilkan di HP) maks ±1,6 MB

const MODELS = [...new Set([Deno.env.get("GEMINI_IMAGE_MODEL"), "gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3.1-flash-lite-image"].filter(Boolean))] as string[];

const GAYA: Record<string, string> = {
  studio: "bright clean studio lighting, soft shadows, neutral light background",
  kayu: "warm natural light, rustic wooden table background, cozy warung atmosphere",
  polos: "clean solid pastel background that complements the food, minimal composition",
  natural: "natural daylight, keep the original background but cleaner and less cluttered",
};

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function userOf(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id && u.role === "authenticated" ? u.id : null;
}

async function kuota(uid: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota_task`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user: uid, p_task: "foto", p_per_minute: 3, p_per_day: PER_DAY }),
  });
  if (!res.ok) throw new Error("Gagal cek kuota");
  return res.json();
}

function prompt(nama: string, gaya: string) {
  return [
    `This is a real photo of a menu item from a small Indonesian food business${nama ? `: "${nama}"` : ""}.`,
    "Edit it into an appetizing, professional menu photo for a delivery app and social media.",
    "IMPORTANT: keep the exact same food, ingredients, portion size, plating and container. Do not add or remove any food items. Do not change what the dish is.",
    `Improve lighting, color balance, sharpness and composition. Style: ${GAYA[gaya] ?? GAYA.studio}.`,
    "Photorealistic. No text, no logos, no watermark, no people, no hands. Square-friendly framing.",
  ].join(" ");
}

async function editGambar(image: string, mime: string, nama: string, gaya: string) {
  let lastErr = "";
  for (const model of MODELS) {
    const t0 = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: image } }, { text: prompt(nama, gaya) }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: AbortSignal.timeout(110_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }) as unknown as Response);
    const data = await res.json().catch(() => ({}));
    console.log(JSON.stringify({ model, status: res.status, ms: Date.now() - t0 }));
    if (!res.ok) {
      lastErr = `${model}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`;
      if (res.status === 404 || res.status === 400 || res.status === 429 || res.status >= 500 || res.status === 0) continue;
      break;
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
    if (img) return { image: img.inlineData.data, mime: img.inlineData.mimeType || "image/png", model };
    lastErr = `${model}: tidak ada gambar (${data.candidates?.[0]?.finishReason ?? "?"})`;
  }
  console.error("Edit foto gagal", lastErr);
  throw new Error(/429/.test(lastErr) ? "Kuota AI gambar di Google lagi penuh. Coba lagi beberapa menit lagi." : "AI belum bisa memproses foto ini. Coba foto lain atau gaya lain.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const uid = await userOf(req);
  if (!uid) return json({ error: "Login dulu untuk pakai AI foto." }, 401);
  if (!GEMINI_KEY) return json({ error: "API key Gemini belum dipasang di server." }, 500);
  let body: { action?: string; image?: string; mime?: string; nama?: string; gaya?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body harus JSON" }, 400);
  }

  if (body.action === "models") {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": GEMINI_KEY } });
    const data = await res.json();
    const list = (data.models ?? []).map((m: { name: string; supportedGenerationMethods?: string[] }) => m.name.replace("models/", "")).filter((n: string) => /image|imagen/i.test(n));
    return json({ status: res.status, image_models: list, dipakai: MODELS });
  }

  if (body.action !== "edit") return json({ error: "Action tidak dikenal" }, 400);
  const mime = String(body.mime || "");
  if (!["image/webp", "image/jpeg", "image/png"].includes(mime)) return json({ error: "Format foto harus JPG, PNG, atau WebP" }, 400);
  const image = String(body.image || "");
  if (!image || (image.length * 3) / 4 > MAX_BYTES) return json({ error: "Foto terlalu besar" }, 413);

  const q = await kuota(uid).catch(() => null);
  if (!q?.ok) {
    return json({ error: q?.reason === "per_day" ? `Kuota AI foto hari ini habis (${q.limit}/hari). Coba lagi besok ya.` : "Pelan-pelan ya, tunggu 1 menit lalu coba lagi." }, 429);
  }
  try {
    const out = await editGambar(image, mime, String(body.nama || "").slice(0, 80), String(body.gaya || "studio"));
    return json({ ...out, quota: { used_today: q.used_today, limit_day: q.limit_day } });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
