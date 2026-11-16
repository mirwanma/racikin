// E2E Racikin (promo.js): halaman Promo & Voucher, bikin promo dari contoh, promo otomatis & kode voucher di Kasir,
// struk, rekap hari ini, nonaktifkan, laporan, info promo di menu QR (Mode Demo, data contoh).
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet')) await p.click('.sheet [data-action=pilihTambah]'); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });

  // Daftar promo data contoh + statistik
  await p.goto(B + '#/promo'); await p.waitForSelector('.promo-card');
  const kartu = await p.$$eval('.promo-card', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 140)));
  console.log(kartu.join('\n'));
  ok(kartu.length === 3 && kartu.every((k) => !/Dipakai 0×/.test(k)), '3 promo contoh, semua pernah dipakai');
  await p.screenshot({ path: OUT + '/p1-daftar.png', fullPage: true });

  // Matikan promo otomatis contoh biar tes Kasir terkendali
  for (const el of await p.$$('.promo-card .switch input')) if (await el.isChecked()) await el.click({ force: true });
  let s = await st(p);
  ok(s.promo.every((x) => !x.aktif), 'promo bisa dinonaktifkan dari daftar');

  // Bikin promo dari contoh "Diskon min. belanja"
  await p.click('a[href="#/promo?id=new"]'); await p.waitForSelector('[data-f=nama]');
  await p.click('a[href="#/promo?id=new&preset=min"]'); await p.waitForFunction(() => document.querySelector('[data-f=nama]')?.value === 'Hemat belanja banyak');
  ok((await p.inputValue('[data-f=nama]')) === 'Hemat belanja banyak' && (await p.inputValue('input[data-f=minBelanja]')) === '50000', 'contoh cepat terisi');
  console.log('preview:', await txt(p, 'section.card.accent'));
  await p.screenshot({ path: OUT + '/p2-editor.png', fullPage: true });
  await p.click('[data-action=simpan]'); await p.waitForSelector('.promo-card');
  // Voucher dari contoh
  await p.goto(B + '#/promo?id=new&preset=voucher'); await p.waitForSelector('input[data-f=kode]');
  await p.click('[data-action=simpan]'); await p.waitForSelector('.promo-card');
  s = await st(p);
  ok(s.promo.length === 5 && s.promo.find((x) => x.kode === 'HEMAT5').kuota === 50, 'promo & voucher tersimpan');

  // Kasir: 2 Bakso (16rb) + 2 Telur (15rb) = 62rb -> otomatis Rp5.000
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  await pos(p, 'Tahu Guyur Bakso'); await pos(p, 'Tahu Guyur Bakso'); await pos(p, 'Tahu Guyur Telur'); await pos(p, 'Tahu Guyur Telur');
  console.log('bar:', await txt(p, '.pos-bar'));
  await p.click('[data-action=checkout]'); await p.waitForSelector('.promo-line');
  ok((await txt(p, '.promo-line')).includes('Hemat belanja banyak') && (await txt(p, '.promo-line')).includes('5.000'), 'promo otomatis kepakai');
  // Voucher HEMAT5 juga 5rb -> tidak numpuk, tetap satu promo
  await p.fill('.pos-kode', 'hemat5'); await p.press('.pos-kode', 'Tab'); await p.waitForTimeout(200);
  console.log('setelah kode:', await txt(p, '.promo-line'), '|', (await p.$('p.neg')) ? await txt(p, 'p.neg') : '-');
  ok((await p.$$('.promo-line')).length === 1, 'promo nggak numpuk');
  await p.fill('.pos-kode', 'NGASAL'); await p.press('.pos-kode', 'Tab'); await p.waitForTimeout(200);
  ok((await txt(p, 'p.neg')).includes('nggak ditemukan'), 'kode salah ditolak');
  await p.fill('.pos-kode', ''); await p.press('.pos-kode', 'Tab'); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/p3-bayar.png', fullPage: true });
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  console.log('struk:', await txt(p, '.struk'));
  ok((await txt(p, '.struk')).includes('Promo Hemat belanja banyak') && (await txt(p, '.struk-total')).includes('57.000'), 'struk: promo & total 57.000');
  s = await st(p);
  const o = s.orders[s.orders.length - 1];
  ok(o.promo?.potongan === 5000 && o.total === 57000, 'order menyimpan promo');

  // Order kecil + voucher: belanja 32rb, promo otomatis min 50rb nggak kena, voucher HEMAT5 (min 30rb) kepakai
  await p.click('[data-action=baru]'); await pos(p, 'Tahu Guyur Bakso'); await pos(p, 'Tahu Guyur Bakso');
  await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-kode');
  ok((await txt(p, '.promo-hint')).includes('Tambah'), 'hint: tambah belanja biar dapat promo');
  await p.fill('.pos-kode', 'HEMAT5'); await p.press('.pos-kode', 'Tab'); await p.waitForSelector('.promo-line');
  ok((await txt(p, '.promo-line')).includes('HEMAT5'), 'voucher kepakai');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');

  // Rekap hari ini
  await p.click('label:has(input[name=tab][value=rekap])'); await p.waitForSelector('.stats3');
  const rekap = await txt(p, '.view');
  ok(/Promo hari ini.*Hemat belanja banyak.*1×.*Voucher hemat.*1×/.test(rekap), 'rekap hari ini: promo kepakai');

  // Statistik di halaman promo
  await p.goto(B + '#/promo'); await p.waitForSelector('.promo-card');
  ok((await txt(p, '.promo-card:has-text("Voucher hemat")')).includes('1/50'), 'kuota voucher terhitung 1/50');

  // Laporan
  await p.goto(B + '#/laporan'); await p.waitForSelector('.lr-statement');
  ok((await txt(p, '.lr-statement')).includes('sudah dipotong promo'), 'laporan: info potongan promo');

  // Menu publik (QR) ikut info promo tanpa kode
  const pub = await p.evaluate(async () => { const { menuPublik } = await import('./js/meja.js'); return menuPublik(JSON.parse(localStorage.getItem('racikin:v1'))).promo; });
  console.log('promo publik:', JSON.stringify(pub));
  ok(pub.length === 1 && pub[0].nama === 'Hemat belanja banyak' && !JSON.stringify(pub).includes('HEMAT5'), 'menu QR: promo otomatis tampil, kode voucher tidak bocor');

  // Tablet
  const t = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  t.on('dialog', (d) => d.accept());
  await t.goto(B); await t.click('[data-action=dummy]'); await t.waitForSelector('.journey', { timeout: 20000 });
  await t.goto(B + '#/promo?id=new&preset=happy'); await t.waitForSelector('[data-f=nama]');
  await t.screenshot({ path: OUT + '/p4-tablet-editor.png', fullPage: true });

  console.log('errors:', errs);
  await b.close();
})();
