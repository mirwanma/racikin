// Service worker: app shell offline-first. Naikkan VERSION tiap rilis.
const VERSION = "racikin-v6";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "icons/icon.svg",
  "icons/icon-192.png",
  "js/app.js",
  "js/cloud.js",
  "js/icons.js",
  "js/stok-utils.js",
  "js/vendor/supabase-2.118.0.js",
  "js/store.js",
  "js/ui.js",
  "js/ai.js",
  "js/demo.js",
  "js/views/_shared.js",
  "js/views/home.js",
  "js/views/profil.js",
  "js/views/bisnis.js",
  "js/views/ide.js",
  "js/views/rab.js",
  "js/views/brand.js",
  "js/views/aktivasi.js",
  "js/views/kas.js",
  "js/views/konten.js",
  "js/views/mentor.js",
  "js/views/setelan.js",
  "js/views/akun.js",
  "js/views/stok.js",
  "js/views/resep.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // panggilan AI (POST) selalu ke network
  const url = new URL(req.url);
  const isFont = url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com");
  if (url.origin !== location.origin && !isFont) return;

  // Network-first untuk file app (biar update cepat), fallback ke cache saat offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html"))),
  );
});
