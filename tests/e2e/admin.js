// E2E Racikin (admin.js): Dashboard Admin (#/admin) dengan sesi & RPC Supabase yang di-mock (tidak menyentuh data asli).
// Cek: akun non-admin ditolak, admin lihat ringkasan, adopsi fitur, daftar merchant (cari/filter/urut), detail, CSV,
// link di halaman Akun, akun tes disembunyikan secara default.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const F = (on) => Object.fromEntries(['kasir', 'tim', 'shift', 'stempel', 'online', 'varian', 'promo', 'wa', 'meja', 'dapur', 'foto', 'impor'].map((k) => [k, on.includes(k)]));

const MERCHANT = [
  { id: '11111111-1111-1111-1111-111111111111', nama: 'Bakso Bu Sari', pemilik: 'Sari', email: 'sari@contoh.id', kota: 'Bandung', jenis: 'Makanan berat', konsep: 'Kios / ruko', tahap: 'jalan', masalah: ['stok'], daftar: iso(70) + 'T03:00:00Z', login_terakhir: iso(0) + 'T03:00:00Z', diubah: iso(0) + 'T03:00:00Z', jualan_terakhir: iso(0), order7: 70, omzet7: 1400000, order30: 300, omzet30: 6000000, order_prev30: 250, omzet_prev30: 5000000, hari_jualan30: 28, menu: 12, bahan: 20, pelanggan: 40, tim: 2, ai30: 15, meja_order30: 30, fitur: F(['kasir', 'tim', 'shift', 'stempel', 'promo', 'wa', 'meja', 'varian']) },
  { id: '22222222-2222-2222-2222-222222222222', nama: 'Kopi Senja', pemilik: 'Dian', email: 'senja@contoh.id', kota: 'Bandung', jenis: 'Minuman / kopi', konsep: 'Kios / ruko', tahap: 'jalan', masalah: [], daftar: iso(100) + 'T03:00:00Z', login_terakhir: iso(27) + 'T03:00:00Z', diubah: iso(27) + 'T03:00:00Z', jualan_terakhir: iso(27), order7: 0, omzet7: 0, order30: 10, omzet30: 200000, order_prev30: 400, omzet_prev30: 8000000, hari_jualan30: 3, menu: 8, bahan: 5, pelanggan: 0, tim: 0, ai30: 0, meja_order30: 0, fitur: F(['kasir']) },
  { id: '33333333-3333-3333-3333-333333333333', nama: 'Dimsum Mama', pemilik: 'Rina', email: 'mama@contoh.id', kota: 'Depok', jenis: 'Jajanan / snack', konsep: 'Online / dari rumah', tahap: 'ide', masalah: [], daftar: iso(3) + 'T03:00:00Z', login_terakhir: iso(2) + 'T03:00:00Z', diubah: iso(2) + 'T03:00:00Z', jualan_terakhir: null, order7: 0, omzet7: 0, order30: 0, omzet30: 0, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 0, menu: 0, bahan: 0, pelanggan: 0, tim: 0, ai30: 6, meja_order30: 0, fitur: F([]) },
  { id: '55555555-5555-5555-5555-555555555555', nama: 'Akun Tes', pemilik: 'Tes', email: 'racikin-tim-owner@racikin.test', kota: 'Cimahi', jenis: 'Jajanan / snack', konsep: 'Gerobak / booth', tahap: 'jalan', masalah: [], daftar: iso(5) + 'T03:00:00Z', login_terakhir: iso(1) + 'T03:00:00Z', diubah: iso(1) + 'T03:00:00Z', jualan_terakhir: iso(1), order7: 50, omzet7: 1000000, order30: 50, omzet30: 1000000, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 5, menu: 15, bahan: 25, pelanggan: 35, tim: 3, ai30: 40, meja_order30: 5, fitur: F(['kasir', 'tim']) },
];
const DETAIL = { harian: Array.from({ length: 60 }, (_, i) => ({ tgl: iso(59 - i), order: 5 + (i % 7), omzet: (5 + (i % 7)) * 20000 })), terlaris: [{ nama: 'Bakso Urat', porsi: 420 }, { nama: 'Es Teh', porsi: 210 }], tim: [{ role: 'kasir', n: 2 }], ai: [{ task: 'mentor_chat', n: 10 }], meja: 30 };

async function halaman(b, { admin }) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 860 }, acceptDownloads: true });
  const uid = '99999999-9999-9999-9999-999999999999';
  // Sesi palsu (supabase-js membaca sesi dari localStorage; token tidak pernah dikirim ke server asli karena semua request di-mock).
  await ctx.addInitScript((u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-ujdxslztjcufidhqpmcd-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: u, email: 'admin@contoh.id', aud: 'authenticated', role: 'authenticated' } }));
  }, uid);
  await ctx.route('https://ujdxslztjcufidhqpmcd.supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.includes('/rpc/is_platform_admin')) return json(admin);
    if (url.includes('/rpc/admin_merchants')) return admin ? json(MERCHANT) : json({ message: 'Khusus admin Racikin' }, 400);
    if (url.includes('/rpc/admin_merchant_detail')) return json(DETAIL);
    if (url.includes('/auth/v1/user')) return json({ id: uid, email: 'admin@contoh.id', aud: 'authenticated', role: 'authenticated' });
    if (url.includes('/rpc/my_team')) return json(null);
    if (url.includes('/rpc/doc_get')) return json(null);
    if (url.includes('/rpc/doc_save')) return json({ ok: true, rev: 1, updated_at: new Date().toISOString() });
    return json(null);
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}

(async () => {
  const b = await chromium.launch();

  // Non-admin
  const n = await halaman(b, { admin: false });
  await n.goto(B + '#/admin'); await n.waitForSelector('text=bukan admin platform', { timeout: 20000 });
  ok(true, 'akun non-admin ditolak');
  await n.goto(B + '#/akun'); await n.waitForSelector('text=Keluar'); await n.waitForTimeout(800);
  ok(!(await n.$('a[href="#/admin"]')), 'non-admin: link dashboard tidak muncul di Akun');

  // Admin
  const p = await halaman(b, { admin: true });
  await p.goto(B + '#/akun'); await p.waitForSelector('a[href="#/admin"]', { timeout: 20000 });
  ok(true, 'admin: link Dashboard Admin muncul di Akun');
  await p.click('a[href="#/admin"]'); await p.waitForSelector('.adm-kpi');
  const kpi = await txt(p, '.adm-kpi');
  console.log('kpi:', kpi);
  const angka = await p.$$eval('.adm-kpi b', (a) => a.map((x) => x.textContent.trim()));
  ok(angka[0] === '3' && angka[1] === '2' && angka[2] === '1', 'ringkasan: 3 merchant (akun tes disembunyikan), 2 aktif 7 hari, 1 berisiko · ' + angka.join(' | '));
  ok(/Omzet merchant 30 hari\s*6[.,]2jt/i.test(kpi), 'omzet 30 hari ditampilkan');
  const rows = await p.$$eval('.adm-row .adm-nama b', (a) => a.map((x) => x.textContent));
  ok(rows.join() === 'Bakso Bu Sari,Dimsum Mama,Kopi Senja', 'urut terakhir aktif, tanpa akun tes: ' + rows.join());
  await p.screenshot({ path: OUT + '/a1-dashboard.png', fullPage: true });

  // Filter & cari
  await p.selectOption('select[data-change=status]', 'berisiko'); await p.waitForTimeout(150);
  ok((await p.$$eval('.adm-row', (a) => a.length)) === 1 && (await txt(p, '.adm-row')).includes('Kopi Senja'), 'filter berisiko');
  await p.selectOption('select[data-change=status]', '');
  await p.fill('input[data-change=q]', 'depok'); await p.press('input[data-change=q]', 'Tab'); await p.waitForTimeout(150);
  ok((await p.$$eval('.adm-row', (a) => a.length)) === 1, 'cari kota');
  await p.fill('input[data-change=q]', ''); await p.press('input[data-change=q]', 'Tab');
  await p.check('input[data-change=tes]'); await p.waitForTimeout(150);
  ok((await p.$$eval('.adm-row', (a) => a.length)) === 4, 'akun tes bisa diikutkan');
  await p.uncheck('input[data-change=tes]');
  await p.selectOption('select[data-change=urut]', 'omzet30'); await p.waitForTimeout(150);

  // Detail
  await p.click('.adm-row:has-text("Bakso Bu Sari") .pos-order-head'); await p.waitForSelector('.adm-chart i');
  const det = await txt(p, '.adm-detail');
  console.log('detail:', det.slice(0, 260));
  ok((await p.$$eval('.adm-chart i', (a) => a.length)) === 60 && det.includes('Bakso Urat') && det.includes('sari@contoh.id') && det.includes('2 kasir'), 'detail: grafik 60 hari, terlaris, email, tim');
  await p.screenshot({ path: OUT + '/a2-detail.png', fullPage: true });

  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=csv]')]);
  const isi = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  ok(dl.suggestedFilename().startsWith('racikin-merchant-') && isi.split('\n').length === 4 && isi.includes('Bakso Bu Sari'), 'CSV 3 merchant');

  // HP
  const m = await halaman(b, { admin: true });
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(B + '#/admin'); await m.waitForSelector('.adm-kpi', { timeout: 20000 });
  await m.screenshot({ path: OUT + '/a3-hp.png', fullPage: true });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');

  console.log('errors:', [...n.errs, ...p.errs, ...m.errs]);
  await b.close();
})();
