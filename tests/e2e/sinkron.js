// E2E Racikin (sinkron.js): sinkron dokumen + tabel order (pos_orders) antar 2 HP dengan server Supabase palsu di memori
// (doc_get_v2 / doc_save dengan rev, orders_pull / orders_push dengan updated_at & aturan "batal menang" seperti di SQL).
// Cek: dokumen di server nggak memuat order, order 30 hari pindah ke tabel, HP baru dapat semua order, order baru dari HP
// lain masuk & rekap/Kas ikut naik, pembatalan ikut tersinkron, kirim ulang hanya order yang berubah.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));

const uid = '77777777-7777-7777-7777-777777777777';
const server = { doc: null, rev: 0, orders: new Map(), push: [], clock: Date.parse('2026-11-21T08:00:00Z') };
const tick = () => new Date((server.clock += 1000)).toISOString();

async function hp(b, nama) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((u) => {
    if (localStorage.getItem('sb-ujdxslztjcufidhqpmcd-auth-token')) return;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-ujdxslztjcufidhqpmcd-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: u, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' } }));
  }, uid);
  await ctx.route('https://ujdxslztjcufidhqpmcd.supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    const arg = () => JSON.parse(route.request().postData() || '{}');
    if (url.includes('/auth/v1/user')) return json({ id: uid, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' });
    if (url.includes('/rpc/my_team')) return json({ owner_id: uid, role: 'owner', anggota: 0 });
    if (url.includes('/rpc/paket_saya')) return json({ paket: 'pro', sumber: 'bayar', sampai: '2027-12-31T00:00:00Z' });
    if (url.includes('/rpc/doc_get_v2')) return json(server.doc ? { data: server.doc, rev: server.rev, updated_at: new Date(server.clock).toISOString(), role: 'owner' } : null);
    if (url.includes('/rpc/doc_get')) return json({ error: 'app baru nggak boleh pakai doc_get lama' });
    if (url.includes('/rpc/doc_save')) {
      const a = arg();
      if (a.p_base_rev !== server.rev) return json({ ok: false, rev: server.rev });
      server.doc = { ...a.p_data };
      server.docPunyaOrders = 'orders' in a.p_data;
      delete server.doc.orders;
      server.rev += 1;
      return json({ ok: true, rev: server.rev, updated_at: tick() });
    }
    if (url.includes('/rpc/orders_pull')) {
      const { p_since } = arg();
      const rows = [...server.orders.values()].filter((r) => !p_since || r.updated_at > p_since).sort((x, y) => x.updated_at.localeCompare(y.updated_at));
      return json({ rows, now: new Date(server.clock).toISOString() });
    }
    if (url.includes('/rpc/orders_push')) {
      const { p_orders } = arg();
      server.push.push(p_orders.length);
      let n = 0;
      for (const o of p_orders) {
        const lama = server.orders.get(o.id);
        if (lama && JSON.stringify(lama.data) === JSON.stringify(o)) continue;
        if (lama && lama.data.status === 'batal' && o.status !== 'batal') continue;
        server.orders.set(o.id, { data: o, updated_at: tick() });
        n++;
      }
      return json(n);
    }
    if (url.includes('/rest/v1/team_members') || url.includes('/rest/v1/team_invites') || url.includes('stamp_cards')) return json([]);
    return json(null);
  });
  const p = await ctx.newPage();
  p.nama = nama;
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
const sinkron = (p) => p.evaluate(async () => { const m = await import('./js/cloud.js'); await m.syncNow(); });

(async () => {
  const b = await chromium.launch();

  // HP 1: data contoh -> sinkron pertama
  const a = await hp(b, 'HP pemilik');
  await a.goto(B + '#/profil'); await a.waitForSelector('[data-action=dummy]', { timeout: 20000 });
  await a.click('[data-action=dummy]'); await a.waitForSelector('.journey', { timeout: 20000 });
  await sinkron(a); await a.waitForTimeout(300); await sinkron(a);
  let sa = await st(a);
  ok(server.doc && !('orders' in server.doc) && !server.docPunyaOrders, 'dokumen di server tanpa order (doc_save nggak kirim orders)');
  ok(server.orders.size === sa.orders.length && sa.orders.length > 500, `semua order (${sa.orders.length}) ada di tabel`);
  ok(JSON.stringify(server.doc).length < 1_000_000, `dokumen kecil: ${Math.round(JSON.stringify(server.doc).length / 1024)} KB`);
  const pushAwal = server.push.length;
  await sinkron(a);
  ok(server.push.length === pushAwal, 'sinkron ulang tanpa perubahan: nggak ada order yang dikirim lagi');

  // HP 2: login baru -> dapat dokumen + semua order
  const c = await hp(b, 'HP kedua');
  await c.goto(B + '#/'); await c.waitForTimeout(500); await sinkron(c); await c.waitForTimeout(300);
  let sc = await st(c);
  ok(sc.orders.length === sa.orders.length && JSON.stringify(sc.posHarian) === JSON.stringify(sa.posHarian), 'HP kedua: order & rekap sama dengan HP pemilik');

  // HP 2 jualan 1 order -> HP 1 ikut dapat, rekap & Kas hari ini naik
  await c.goto(B + '#/kasir'); await c.waitForSelector('.pos-grid');
  await c.click('.pos-item:has-text("Air Mineral")');
  await c.click('[data-action=checkout]'); await c.click('[data-action=uang] >> nth=0'); await c.click('[data-action=selesai]'); await c.waitForSelector('.struk');
  sc = await st(c);
  const baru = sc.orders[sc.orders.length - 1];
  await sinkron(c);
  ok(server.orders.has(baru.id) && server.push.at(-1) === 1, 'HP kedua: cuma 1 order baru yang dikirim');
  const omzetSebelum = sa.posHarian[baru.tanggal]?.omzet || 0;
  await sinkron(a); sa = await st(a);
  ok(sa.orders.some((x) => x.id === baru.id), 'HP pemilik: order dari HP kedua masuk');
  ok(sa.posHarian[baru.tanggal].omzet === omzetSebelum + baru.total, 'HP pemilik: rekap hari ini ikut naik');
  const kas = sa.transactions.filter((t) => t.ref === 'pos' && t.tanggal === baru.tanggal && t.jenis === 'masuk').reduce((x, t) => x + t.nominal, 0);
  ok(kas === sa.posHarian[baru.tanggal].omzet, 'HP pemilik: Kas = rekap');

  // HP 1 batalkan order itu -> server batal, HP 2 ikut batal, rekap turun lagi
  await a.evaluate(async (id) => { const { store } = await import('./js/store.js'); const { batalOrder } = await import('./js/pos.js'); store.set(batalOrder(store.get(), id)); }, baru.id);
  await sinkron(a);
  ok(server.orders.get(baru.id).data.status === 'batal', 'pembatalan tersimpan di tabel');
  await sinkron(c); sc = await st(c);
  ok(sc.orders.find((x) => x.id === baru.id).status === 'batal' && sc.posHarian[baru.tanggal].omzet === omzetSebelum, 'HP kedua: ikut batal & rekap turun');

  // HP pemilik sebelumnya memegang dokumen lain (mis. habis pindah cabang / keluar tim): data lokal dikosongkan lalu
  // ditarik dari cloud. Dulu userId masih tersimpan, jadi data kosong dianggap versi terbaru & menimpa cloud.
  const resepServer = server.doc.resep.length;
  const revSebelum = server.rev;
  await a.evaluate(() => { const m = JSON.parse(localStorage.getItem('racikin:sync')); localStorage.setItem('racikin:sync', JSON.stringify({ ...m, docOwner: 'dokumen-lain' })); });
  await sinkron(a); sa = await st(a);
  ok(server.doc.resep.length === resepServer && server.rev === revSebelum, 'ganti dokumen: cloud nggak ditimpa data kosong');
  ok(sa.resep.length === resepServer && sa.orders.length === sc.orders.length, 'ganti dokumen: data ditarik lagi dari cloud');

  for (const p of [a, c]) { console.log(p.nama, 'errors:', p.errs); ok(!p.errs.length, `${p.nama}: tanpa error`); }
  await b.close();
})();
