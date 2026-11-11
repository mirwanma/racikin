// Supabase Edge Function: racikin-ai
// POST { task, profile, input } -> { data }
//
// Provider AI dipilih dari secret yang tersedia:
//   1. GEMINI_API_KEY (atau GOOGLE_API_KEY)  -> Google Gemini   (utama)
//   2. ANTHROPIC_API_KEY                      -> Claude          (cadangan)
// Secret opsional: GEMINI_MODEL, RACIKIN_MODEL (Claude), RACIKIN_ALLOWED_ORIGIN
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { BASE_SYSTEM, TASKS, type TaskDef } from "./tasks.ts";

const ALLOWED_ORIGIN = Deno.env.get("RACIKIN_ALLOWED_ORIGIN") ?? "*";
const MAX_INPUT_CHARS = 20_000;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Error dengan pesan yang aman ditampilkan ke user. */
class UserError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ---------- Gemini ----------
// gemini-3.6-flash dipilih karena jauh lebih cepat & stabil dari 3.8-flash (hasil uji: ~2 dtk vs 7-27 dtk).
const GEMINI_MODELS = [...new Set([Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash", "gemini-3.5-flash-lite"])];
// Batas waktu Edge Function Supabase ~150 dtk: tiap percobaan maks 60 dtk, total semua percobaan maks 130 dtk.
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_TOTAL_MS = 130_000;
const THINKING: Record<TaskDef["effort"], string> = { low: "LOW", medium: "MEDIUM", high: "HIGH" };

function geminiFetch(model: string, apiKey: string, body: string, deadline: number) {
  const left = deadline - Date.now();
  if (left < 3000) throw new Error("deadline");
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body,
    signal: AbortSignal.timeout(Math.min(GEMINI_TIMEOUT_MS, left)),
  });
}

async function callGemini(apiKey: string, def: TaskDef, userText: string): Promise<unknown> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: `${BASE_SYSTEM}\n\nTUGAS:\n${def.instruction}` }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: def.schema,
      maxOutputTokens: 16000,
      thinkingConfig: { thinkingLevel: THINKING[def.effort] },
    },
  });

  // Coba model utama; kalau gagal (404/5xx/timeout), pakai model cadangan.
  const deadline = Date.now() + GEMINI_TOTAL_MS;
  for (const [i, model] of GEMINI_MODELS.entries()) {
    const t0 = Date.now();
    const isLast = i === GEMINI_MODELS.length - 1;
    let res: Response;
    try {
      res = await geminiFetch(model, apiKey, body, deadline);
      // Google kadang balas 503 "high demand" sesaat: coba sekali lagi sebelum pindah model.
      if (res.status === 503 || res.status === 500) {
        console.warn(`Model ${model} ${res.status}, retry sekali`);
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, 1500));
        res = await geminiFetch(model, apiKey, body, deadline);
      }
    } catch (err) {
      console.warn(JSON.stringify({ gemini: model, error: String(err), ms: Date.now() - t0 }));
      if (!isLast) continue; // timeout / jaringan -> coba model cadangan
      throw new UserError("AI lagi lambat banget, coba lagi sebentar ya.", 504);
    }
    // 404 (model tidak ada), 429 (kuota per-model habis, mis. free tier 5 req/menit) dan 5xx -> coba model cadangan.
    if ((res.status === 404 || res.status === 429 || res.status >= 500) && !isLast) {
      console.warn(`Model ${model} gagal (${res.status}), coba cadangan`);
      await res.body?.cancel();
      continue;
    }
    const data = await res.json().catch(() => ({}));
    console.log(JSON.stringify({ gemini: model, status: res.status, ms: Date.now() - t0, usage: data.usageMetadata ?? null, version: data.modelVersion ?? null }));
    if (!res.ok) {
      console.error("Gemini API error", res.status, JSON.stringify(data).slice(0, 500));
      if (res.status === 429) throw new UserError("Kuota AI lagi penuh (batas per menit). Tunggu ±1 menit lalu coba lagi ya.", 429);
      if (res.status === 503) throw new UserError("Server Gemini lagi rame banget. Coba lagi sebentar ya.", 503);
      if (res.status === 401 || res.status === 403 || /API_KEY/i.test(JSON.stringify(data))) {
        throw new UserError("API key Gemini ditolak. Cek secret GEMINI_API_KEY di Supabase.", 502);
      }
      if (res.status === 400) throw new UserError("Permintaan ke AI ditolak (400). Cek log function.", 502);
      throw new UserError("Gagal menghubungi AI.", 502);
    }

    if (data.promptFeedback?.blockReason) {
      throw new UserError("AI tidak bisa memproses permintaan ini. Coba ubah kata-katanya ya.", 422);
    }
    const cand = data.candidates?.[0];
    if (cand?.finishReason === "MAX_TOKENS") {
      throw new UserError("Jawaban AI kepotong. Coba lagi dengan permintaan lebih kecil.", 502);
    }
    const text = (cand?.content?.parts ?? [])
      .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
      .map((p: { text: string }) => p.text)
      .join("");
    if (!text) {
      console.error("Gemini response kosong", JSON.stringify(data).slice(0, 500));
      throw new UserError("AI tidak memberi jawaban. Coba lagi ya.", 502);
    }
    return JSON.parse(text);
  }
  throw new UserError("Model Gemini tidak tersedia.", 502);
}

// ---------- Claude (cadangan) ----------
let anthropic: Anthropic | null = null;
async function callClaude(apiKey: string, def: TaskDef, userText: string): Promise<unknown> {
  anthropic ??= new Anthropic({ apiKey });
  // deno-lint-ignore no-explicit-any
  const params: any = {
    model: Deno.env.get("RACIKIN_MODEL") ?? "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: def.effort, format: { type: "json_schema", schema: def.schema } },
    system: [
      { type: "text", text: BASE_SYSTEM },
      { type: "text", text: `TUGAS:\n${def.instruction}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userText }],
  };
  try {
    const response = await anthropic.beta.messages.create(params);
    if (response.stop_reason === "refusal") {
      throw new UserError("AI tidak bisa memproses permintaan ini. Coba ubah kata-katanya ya.", 422);
    }
    if (response.stop_reason === "max_tokens") {
      throw new UserError("Jawaban AI kepotong. Coba lagi dengan permintaan lebih kecil.", 502);
    }
    const text = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new UserError("AI lagi sibuk banget, coba sebentar lagi.", 429);
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      throw new UserError("Gagal menghubungi AI.", 502);
    }
    throw err;
  }
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Dibaca per request supaya secret yang baru di-set langsung terpakai.
  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!geminiKey && !claudeKey) {
    return json({ error: "Server AI belum siap: secret GEMINI_API_KEY belum di-set di Supabase." }, 503);
  }

  let body: { task?: string; profile?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body harus JSON" }, 400);
  }

  const def = body.task ? TASKS[body.task] : undefined;
  if (!def) return json({ error: `Task tidak dikenal: ${body.task}` }, 400);

  const context = JSON.stringify({ profil_bisnis: body.profile ?? {}, input: body.input ?? {} });
  if (context.length > MAX_INPUT_CHARS) return json({ error: "Input terlalu panjang" }, 413);
  const userText = `Data user (JSON):\n${context}\n\nKerjakan tugasnya dan jawab sesuai schema.`;

  try {
    const data = geminiKey ? await callGemini(geminiKey, def, userText) : await callClaude(claudeKey!, def, userText);
    return json({ data });
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) {
      console.error("JSON AI tidak valid", err.message);
      return json({ error: "Jawaban AI formatnya rusak. Coba lagi ya." }, 502);
    }
    console.error(err);
    return json({ error: "Terjadi kesalahan di server." }, 500);
  }
});
