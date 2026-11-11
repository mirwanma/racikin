// Klien AI: mode "online" memanggil Supabase Edge Function racikin-ai (wajib login),
// mode "demo" memakai generator lokal (tanpa internet / tanpa akun).
import { store } from "./store.js";
import { demo } from "./demo.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, accessToken, cloud } from "./cloud.js";

export const DEFAULT_ENDPOINT = `${SUPABASE_URL}/functions/v1/racikin-ai`;

export class AuthRequiredError extends Error {}

export async function ai(task, input = {}) {
  const { profile, settings } = store.get();
  if (settings.aiMode !== "online") {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    const fn = demo[task];
    if (!fn) throw new Error("Task demo belum ada: " + task);
    return fn(profile || {}, input, store.get());
  }

  const token = await accessToken();
  if (!token) throw new AuthRequiredError("Login dulu buat pakai AI Online ya (menu Akun).");

  const url = settings.endpoint || DEFAULT_ENDPOINT;
  const apikey = settings.endpoint ? settings.anonKey : SUPABASE_ANON_KEY;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(apikey ? { apikey } : {}) },
      body: JSON.stringify({ task, profile, input }),
    });
  } catch {
    throw new Error("Nggak bisa nyambung ke server AI. Cek internet kamu.");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthRequiredError(body.error || "Sesi login habis. Masuk lagi ya.");
  if (!res.ok) throw new Error(body.error || `Server AI error (${res.status})`);
  if (body.quota) cloud.quota = body.quota;
  return body.data;
}

export const isDemo = () => store.get().settings.aiMode !== "online";
