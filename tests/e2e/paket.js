// E2E Racikin (paket.js): paket Gratis vs Pro (masa coba) dari sisi merchant, dengan sesi & RPC Supabase yang di-mock
// (penguncian aslinya dites langsung di SQL, lihat supabase/migrations/20261120100000_monetisasi.sql).
// Cek: Beranda & Akun, halaman Paket (harga, link upgrade WA), fitur Pro terkunci (tim, meja, dapur, open bill,
// impor penjualan, foto AI), dan masa coba membuka semuanya. Tanpa akun: tetap bisa dicoba (dites di bill.js dll).
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString();

async function halaman(b, paket) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const uid = '88888888-8888-8888-8888-888888888888';
  await ctx.addInitScript((u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-ujdxslztjcufidhqpmcd-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: u, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' } }));
  }, uid);
  await ctx.route('https://ujdxslztjcufidhqpmcd.supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.includes('/rpc/paket_saya')) return json({ ...paket, harga_bulan: 49000, harga_tahun: 490000, wa: '6281211112222', coba_hari: 14, ai_hari: paket.paket === 'pro' ? 300 : 20 });
    if (url.includes('/rpc/is_platform_admin')) return json(false);
    if (url.includes('/auth/v1/user')) return json({ id: uid, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' });
    if (url.includes('/rpc/my_team')) return json({ owner_id: uid, role: 'owner', anggota: 0 });
    if (url.includes('/rpc/doc_get')) return json(null);
    if (url.includes('/rpc/doc_save')) return json({ ok: true, rev: 1, updated_at: new Date().toISOString() });
    if (url.includes('/rest/v1/team_members') || url.includes('/rest/v1/team_invites')) return json([]);
    return json(null);
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '#/profil'); await p.waitForSelector('[data-action=dummy]', { timeout: 20000 });
  await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.waitForTimeout(500);
  return p;
}

(async () => {
  const b = await chromium.launch();

  // --- Gratis (baru turun dari masa coba 3 hari lalu)
  const g = await halaman(b, { paket: 'gratis', sumber: null, sampai: null, pro_terakhir: iso(-3) });
  await g.waitForSelector('.paket-mini');
  ok((await txt(g, '.paket-mini')).includes('Paket kamu sekarang Gratis'), 'Beranda: info turun ke Gratis');
  await g.goto(B + '#/akun'); await g.waitForSelector('a[href="#/paket"]');
  ok((await txt(g, 'a[href="#/paket"]')).includes('Paket: Gratis'), 'Akun: paket Gratis');
  await g.click('a[href="#/paket"]'); await g.waitForSelector('.paket-grid');
  const pk = await txt(g, '.view');
  ok(pk.includes('Rp 49.000') && pk.includes('Rp 490.000') && pk.includes('hemat Rp 98.000'), 'Paket: harga bulanan & tahunan + hemat');
  const link = await g.getAttribute('.paket-kol.pro a.btn.primary', 'href');
  ok(link.startsWith('https://wa.me/6281211112222') && decodeURIComponent(link).includes('warung@contoh.id') && /Usaha: \S+/.test(decodeURIComponent(link)), 'tombol upgrade ke WA admin dengan email & nama usaha');
  await g.screenshot({ path: OUT + '/p1-paket-gratis.png', fullPage: true });

  const terkunci = async (hash, label) => {
    await g.goto(B + hash); await g.waitForTimeout(400);
    ok(!!(await g.$('.pro-kunci')), `${label} terkunci (Gratis)`);
  };
  await terkunci('#/meja', 'Pesan meja');
  await terkunci('#/dapur', 'Layar dapur');
  await terkunci('#/impor-jual', 'Impor penjualan');
  await terkunci('#/tim', 'Undang tim');
  ok(!(await g.isVisible('form[data-form=undang]')), 'form undang tim disembunyikan');
  await g.goto(B + '#/kasir'); await g.waitForSelector('.pos-grid');
  await g.click('input[data-change=tab][value=bill]'); await g.waitForSelector('.pro-kunci');
  ok((await txt(g, '.pro-kunci')).includes('Open bill khusus paket Pro'), 'Open bill terkunci (Gratis)');
  await g.click('input[data-change=tab][value=jual]'); await g.waitForSelector('.pos-grid');
  await g.click('.pos-item:has-text("Air Mineral")'); await g.click('[data-action=checkout]'); await g.waitForSelector('[data-action=selesai]');
  ok(!(await g.$('[data-action=billSimpanBuka]')), 'nggak ada tombol simpan ke bill');
  ok(!!(await g.$('[data-action=selesai]')), 'Kasir biasa tetap jalan di paket Gratis');
  await g.goto(B + '#/resep?id=' + (await g.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).resep[0].id))); await g.waitForTimeout(400);
  const fotoAi = await g.$('a[href="#/paket"].foto-btn');
  ok(!(await g.$('[data-action=fotoAI]')), 'foto menu AI terkunci' + (fotoAi ? ' (link ke Paket)' : ''));

  // --- Masa coba (sisa 5 hari): semua kebuka + pengingat
  const c = await halaman(b, { paket: 'pro', sumber: 'coba', sampai: iso(4.5), coba_sampai: iso(4.5) });
  await c.waitForSelector('.paket-mini');
  ok(/Masa coba Pro habis 5 hari lagi/.test(await txt(c, '.paket-mini')), 'Beranda: pengingat masa coba');
  await c.goto(B + '#/paket'); await c.waitForSelector('.paket-status');
  ok((await txt(c, '.paket-status')).includes('Pro · masa coba (sisa 5 hari)'), 'Paket: label masa coba');
  await c.screenshot({ path: OUT + '/p2-paket-coba.png', fullPage: true });
  await c.goto(B + '#/kasir'); await c.waitForSelector('.pos-grid');
  await c.click('input[data-change=tab][value=bill]'); await c.waitForSelector('[data-action=billNyala]');
  ok(true, 'masa coba: open bill bisa diaktifkan');
  await c.goto(B + '#/meja'); await c.waitForTimeout(400);
  ok(!(await c.$('.pro-kunci')), 'masa coba: pesan meja kebuka');
  await c.goto(B + '#/impor-jual'); await c.waitForTimeout(300);
  ok(!(await c.$('.pro-kunci')), 'masa coba: impor penjualan kebuka');

  // --- Konfigurasi admin: pesan meja & foto AI dijadikan Gratis, kuota AI gratis 50
  const k = await halaman(b, { paket: 'gratis', sumber: null, sampai: null, fitur: { tim: 'pro', meja: 'gratis', dapur: 'pro', bill: 'pro', foto: 'gratis', imporJual: 'pro' }, ai_gratis: 50, ai_pro: 400 });
  await k.goto(B + '#/meja'); await k.waitForTimeout(400);
  ok(!(await k.$('.pro-kunci')), 'konfigurasi: pesan meja Gratis -> kebuka di paket Gratis');
  await k.goto(B + '#/impor-jual'); await k.waitForTimeout(300);
  ok(!!(await k.$('.pro-kunci')), 'konfigurasi: impor penjualan tetap Pro');
  await k.goto(B + '#/paket'); await k.waitForSelector('.paket-grid');
  const kolGratis = await txt(k, '.paket-kol:not(.pro)'), kolPro = await txt(k, '.paket-kol.pro');
  ok(kolGratis.includes('Pesan lewat QR meja') && kolGratis.includes('Foto menu AI') && kolGratis.includes('AI 50x/hari') && !kolPro.includes('Pesan lewat QR meja') && kolPro.includes('Kuota AI 400/hari'), 'halaman Paket ikut konfigurasi admin');
  await k.screenshot({ path: OUT + '/p3-paket-konfig.png', fullPage: true });
  k.errs.forEach((e) => g.errs.push(e));

  ok(await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
  console.log('errors:', [...g.errs, ...c.errs]);
  ok(![...g.errs, ...c.errs].length, 'tanpa error');
  await b.close();
})();
