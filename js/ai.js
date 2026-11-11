// Klien AI: mode "online" memanggil Supabase Edge Function racikin-ai,
// mode "demo" memakai generator lokal (tanpa internet / tanpa API key).
import { store } from "./store.js";
import { demo } from "./demo.js";

// Server AI default (Supabase project "racikin"). Anon key memang publik.
export const DEFAULT_ENDPOINT = "https://ujdxslztjcufidhqpmcd.supabase.co/functions/v1/racikin-ai";
export const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHhzbHp0amN1ZmlkaHFwbWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNjAzNjksImV4cCI6MjEwOTkzNjM2OX0.L14cm7bGefoezyhIy0Dbuk2yoF789XnWauEKLgkSlUI";

const endpointOf = (s) => (s.endpoint ? { url: s.endpoint, key: s.anonKey } : { url: DEFAULT_ENDPOINT, key: DEFAULT_ANON_KEY });

export async function ai(task, input = {}) {
  const { profile, settings } = store.get();
  if (settings.aiMode !== "online") {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    const fn = demo[task];
    if (!fn) throw new Error("Task demo belum ada: " + task);
    return fn(profile || {}, input, store.get());
  }

  const { url, key } = endpointOf(settings);
  const headers = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = "Bearer " + key;
    headers.apikey = key;
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ task, profile, input }),
    });
  } catch {
    throw new Error("Nggak bisa nyambung ke server AI. Cek internet atau URL endpoint.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server AI error (${res.status})`);
  return body.data;
}

export const isDemo = () => store.get().settings.aiMode !== "online";
