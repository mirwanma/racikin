// E2E Racikin (foto.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2], IMG = process.argv[3];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  let s = await st(p);
  const r0 = s.resep[0];
  // Belum login: upload dinonaktifkan
  await p.goto(B + '#/resep?id=' + r0.id); await p.waitForSelector('.foto-card');
  log('belum login:', await txt(p, '.foto-card'));
  // Login
  await p.goto(B + '#/akun'); await p.fill('input[name=email]', 'racikin-tim-owner@racikin.test'); await p.fill('input[name=password]', process.env.RACIKIN_TEST_PASSWORD);
  await p.click('form[data-form=auth] button.primary'); await p.waitForTimeout(2500);
  await p.goto(B + '#/akun'); await p.waitForSelector('.sync-box.synced', { timeout: 60000 });
  s = await st(p); const r0b = s.resep.find(x => x.nama === r0.nama); log('resep sama setelah login:', r0b.id === r0.id); r0.id = r0b.id;
  // Upload foto
  await p.goto(B + '#/resep?id=' + r0.id); await p.waitForSelector('.foto-card input[type=file]:not([disabled])', { state: 'attached' });
  await p.setInputFiles('.foto-card input[type=file]', IMG);
  await p.waitForSelector('.foto-compare img');
  const info = await p.evaluate(async () => { const i = document.querySelector('.foto-compare img'); await i.decode(); return `${i.naturalWidth}x${i.naturalHeight}`; });
  log('foto asli diproses:', info);
  // Percantik otomatis
  await p.click('[data-action=fotoAuto]'); await p.waitForSelector('.foto-compare .hasil img', { timeout: 20000 });
  log('hasil otomatis:', await txt(p, '.foto-compare .hasil figcaption'));
  await p.screenshot({ path: OUT + '/1-compare.png', fullPage: true });
  // AI (billing belum aktif -> pesan jelas)
  await p.click('[data-action=fotoGaya][data-g=kayu]');
  await p.click('[data-action=fotoAI]'); await p.waitForFunction(() => !document.querySelector('.foto-loading'), null, { timeout: 130000 });
  log('AI:', (await p.$('.foto-card .warn-box')) ? (await txt(p, '.foto-card .warn-box')).slice(0, 200) : 'berhasil: ' + (await txt(p, '.foto-compare .hasil figcaption')));
  // Simpan hasil otomatis (atau AI kalau berhasil)
  await p.click('[data-action=fotoSimpan][data-v=hasil]'); await p.waitForSelector('.foto-now img', { timeout: 30000 });
  s = await st(p);
  const f = s.resep.find(x => x.id === r0.id).foto;
  log('foto tersimpan:', JSON.stringify({ ai: f.ai, path: f.path.split('/').slice(1).join('/'), url: f.url.slice(0, 70) + '…' }));
  const head = await p.evaluate(async (u) => { const r = await fetch(u); return `${r.status} ${r.headers.get('content-type')} ${(await r.blob()).size} bytes`; }, f.url);
  log('URL publik:', head);
  // Edit resep (ubah harga) -> foto tetap ada
  await p.fill('[data-f=harga][data-change=field]', '12500'); await p.press('[data-f=harga][data-change=field]', 'Tab');
  await p.click('[data-action=save]'); await p.waitForTimeout(600);
  s = await st(p);
  log('setelah edit resep: harga', s.resep.find(x => x.id === r0.id).harga, '| foto masih ada:', !!s.resep.find(x => x.id === r0.id).foto);
  // Kasir & stok
  await p.goto(B + '#/kasir'); await p.click('label:has(input[value=jual])').catch(() => {}); await p.waitForSelector('.pos-item.foto img');
  await p.screenshot({ path: OUT + '/2-kasir.png' });
  await p.goto(B + '#/stok'); await p.click('label:has(input[value=menu])'); await p.waitForSelector('.resep-thumb');
  log('stok thumb:', true);
  // Resep baru + foto
  await p.goto(B + '#/resep?id=new'); await p.waitForSelector('.foto-card');
  await p.fill('[data-f=nama][data-change=field]', 'Tahu Crispy Spesial'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.setInputFiles('.foto-card input[type=file]', IMG); await p.waitForSelector('.foto-compare img');
  await p.click('[data-action=fotoSimpan][data-v=asli]'); await p.waitForSelector('.foto-now img', { timeout: 30000 });
  log('resep baru, judul:', await txt(p, '.page-head h1'), '| tombol hapus resep ada:', !!(await p.$('[data-action=del]')));
  await p.click('[data-action=aiFill]'); await p.waitForFunction(() => document.querySelectorAll('.resep-row').length > 1, null, { timeout: 30000 });
  await p.click('[data-action=save]'); await p.waitForTimeout(800);
  s = await st(p);
  const baru = [...s.resep].reverse().find(x => x.nama === 'Tahu Crispy Spesial' && x.foto);
  log('resep baru tersimpan dengan foto:', !!baru, !!baru?.foto, '| jumlah resep', s.resep.length);
  // Hapus foto
  await p.goto(B + '#/resep?id=' + baru.id); await p.waitForSelector('[data-action=fotoHapus]');
  await p.click('[data-action=fotoHapus]'); await p.waitForTimeout(1500);
  s = await st(p);
  log('foto dihapus:', !s.resep.find(x => x.id === baru.id).foto, '| path', baru.foto.path.split('/')[1]);
  console.log('PATH_HAPUS', baru.foto.path);
  console.log('PATH_ADA', f.path);
  log('errors:', errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
