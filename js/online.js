// Harga khusus order online (GoFood, GrabFood, ShopeeFood). Murni, tanpa UI.
//
// Model:
//   state.online = {
//     channels: { gofood: { aktif, komisi, markup, bulat }, grabfood: {...}, shopeefood: {...} },
//     harga: { [resepId]: { gofood: 15000, ... } }   // override manual per menu (opsional)
//   }
// Harga online otomatis = harga toko × (1 + markup%), dibulatkan KE ATAS ke kelipatan `bulat`.

export const CHANNELS = [
  { id: "gofood", nama: "GoFood", komisi: 20 },
  { id: "grabfood", nama: "GrabFood", komisi: 20 },
  { id: "shopeefood", nama: "ShopeeFood", komisi: 20 },
];
export const isOnline = (id) => CHANNELS.some((c) => c.id === id);
export const channelNama = (id) => CHANNELS.find((c) => c.id === id)?.nama || id;

/** Markup supaya untung per porsi sama dengan jual di toko: P/(1-k) − P. */
export const saranMarkup = (komisi) => Math.ceil(((1 / (1 - Math.min(90, Math.max(0, komisi)) / 100)) - 1) * 100);

export function channelCfg(s, id) {
  const def = CHANNELS.find((c) => c.id === id);
  const cfg = s.online?.channels?.[id] || {};
  const komisi = cfg.komisi ?? def.komisi;
  return { id, nama: def.nama, aktif: !!cfg.aktif, komisi, markup: cfg.markup ?? saranMarkup(komisi), bulat: cfg.bulat || 500 };
}
export const activeChannels = (s) => CHANNELS.map((c) => channelCfg(s, c.id)).filter((c) => c.aktif);

const roundUp = (n, step) => Math.ceil(n / step) * step;

/** Harga otomatis untuk menu di saluran (tanpa override). */
export function hargaAuto(s, resep, channelId) {
  const c = channelCfg(s, channelId);
  return roundUp((Number(resep.harga) || 0) * (1 + c.markup / 100), c.bulat);
}

/** Harga menu di saluran. "toko" = harga resep. */
export function hargaDi(s, resep, channelId) {
  if (!channelId || channelId === "toko") return Number(resep.harga) || 0;
  const manual = s.online?.harga?.[resep.id]?.[channelId];
  return manual ? Number(manual) : hargaAuto(s, resep, channelId);
}

/** Komisi (Rp) untuk total penjualan di saluran. */
export const komisiRp = (s, channelId, total) => (isOnline(channelId) ? Math.round((total * channelCfg(s, channelId).komisi) / 100) : 0);

/** Untung per porsi: { harga, komisi, terima, untung, margin } */
export function untungPorsi(s, resep, channelId, hpp) {
  const harga = hargaDi(s, resep, channelId);
  const komisi = komisiRp(s, channelId, harga);
  const terima = harga - komisi;
  const untung = terima - hpp;
  return { harga, komisi, terima, untung, margin: harga ? (untung / harga) * 100 : 0 };
}
