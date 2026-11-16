// E2E Racikin (impor.js): usaha udah jalan -> masukin menu cepat, bahan & stok cepat, saldo kas awal (Mode Demo, parser lokal).
// Baca foto lewat AI Online butuh akun + kuota Gemini, jadi di sini hanya dicek tampilan & pesan Mode Demo-nya.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());

  // Profil usaha udah jalan (langsung lewat localStorage biar singkat)
  await p.goto(B);
  await p.evaluate(() => localStorage.setItem('racikin:v1', JSON.stringify({ profile: { tahap: 'jalan', owner: 'Bu Sari', nama: 'Bakso Bu Sari', ide: 'Warung bakso', jenis: 'Makanan berat', konsep: 'Kios / ruko', kota: 'Bandung', target: [], skill: [], karyawan: 0, saluran: ['Jualan langsung'], masalah: ['catat'] } })));
  await p.evaluate(() => history.replaceState(null, '', '#/')); await p.reload(); await p.waitForSelector('.journey');
  const langkah = await p.$$eval('.journey .step', (a) => a.map((x) => x.textContent.trim()));
  console.log('langkah:', langkah);
  await p.click('.journey .btn.primary'); await p.waitForSelector('textarea[data-change=text]');
  ok((await p.url()).includes('#/impor?jenis=menu'), 'langkah 1 membuka input menu cepat');

  // --- Menu cepat ---
  await p.click('label:has(input[name=mode][value=foto])');
  ok(await p.isVisible('text=Baca foto butuh'), 'mode foto di Mode Demo: info butuh AI Online');
  await p.screenshot({ path: OUT + '/i1-foto-demo.png' });
  await p.click('label:has(input[name=mode][value=teks])');
  await p.fill('textarea[data-change=text]', 'MAKANAN\n1. Bakso urat - 15rb\n2. Mie ayam bakso 18.000\nBakso jumbo (isi telur) 25k\nMINUMAN\nEs teh manis 4\nEs jeruk 6rb\nKerupuk');
  await p.press('textarea[data-change=text]', 'Tab');
  await p.click('[data-action=baca]'); await p.waitForSelector('.impor-row', { timeout: 10000 });
  const nRow = await p.$$eval('.impor-row', (a) => a.length);
  ok(nRow === 6, `kebaca ${nRow} menu`);
  console.log('review:', (await p.$$eval('.impor-row', (a) => a.map((x) => [...x.querySelectorAll('input')].map((i) => i.value).join(' | ')))).join(' ; '));
  // Benerin harga kerupuk, lewati es jeruk
  await p.fill('.impor-row >> nth=5 >> input[data-f=harga]', '2000'); await p.press('.impor-row >> nth=5 >> input[data-f=harga]', 'Tab');
  await p.click('.impor-row >> nth=4 >> label.impor-cek');
  await p.screenshot({ path: OUT + '/i2-review-menu.png', fullPage: true });
  ok((await txt(p, '[data-action=simpan]')) === 'Simpan 5 menu', 'tombol simpan 5 menu');
  await p.click('[data-action=simpan]'); await p.waitForSelector('text=menu baru masuk');
  let s = await st(p);
  ok(s.resep.length === 5 && s.resep.find((r) => r.nama === 'Kerupuk').harga === 2000 && s.resep.every((r) => Array.isArray(r.items)), 'menu tersimpan jadi resep (tanpa bahan)');
  await p.screenshot({ path: OUT + '/i3-menu-selesai.png' });

  // Input lagi: menu sama dengan harga baru -> update harga
  await p.goto(B + '#/stok'); await p.click('a[href="#/impor?jenis=menu"]'); await p.waitForSelector('textarea[data-change=text]');
  ok((await p.inputValue('textarea[data-change=text]')) === '', 'buka lagi: mulai bersih');
  await p.fill('textarea[data-change=text]', 'Bakso urat 16rb\nTahu goreng 5rb'); await p.press('textarea[data-change=text]', 'Tab');
  await p.click('[data-action=baca]'); await p.waitForSelector('.impor-row');
  ok((await txt(p, '.impor-row >> nth=0')).includes('Sudah ada'), 'menu yang sudah ada ditandai');
  await p.click('[data-action=simpan]'); await p.waitForSelector('text=harga diupdate');
  s = await st(p);
  ok(s.resep.length === 6 && s.resep.find((r) => r.nama === 'Bakso urat').harga === 16000, 'harga menu lama diupdate, tidak dobel');

  // --- Bahan & stok cepat ---
  await p.click('a[href="#/impor?jenis=bahan"]'); await p.waitForSelector('textarea[data-change=text]');
  await p.fill('textarea[data-change=text]', 'daging sapi 2 kg 260rb\nmie kuning 30 bungkus @3000\ntelur 2 tray\nminyak goreng 5 liter 90.000');
  await p.press('textarea[data-change=text]', 'Tab');
  await p.click('[data-action=baca]'); await p.waitForSelector('.impor-row.bahan');
  await p.screenshot({ path: OUT + '/i4-review-bahan.png', fullPage: true });
  await p.click('[data-action=simpan]'); await p.waitForSelector('text=bahan baru');
  s = await st(p);
  const daging = s.bahan.find((x) => x.nama === 'Daging Sapi');
  ok(s.bahan.length === 4 && daging.stok === 2000 && daging.satuan === 'gram' && daging.harga === 130 && daging.tracked, 'bahan tersimpan dengan stok & harga per satuan');
  ok(s.bahan.every((x) => Math.abs(s.stokLog.filter((l) => l.bahanId === x.id).reduce((a, l) => a + l.delta, 0) - x.stok) < 0.01), 'stok = total riwayat stok');

  // --- Saldo kas awal ---
  await p.goto(B + '#/kas?saldo=1'); await p.waitForSelector('form[data-form=saldo]');
  await p.fill('form[data-form=saldo] input[name=nominal]', '2500000');
  await p.click('form[data-form=saldo] button.primary'); await p.waitForSelector('.saldo-card .saldo');
  ok((await txt(p, '.saldo-card .saldo')) === 'Rp 2.500.000', 'saldo awal tampil');
  // jual 1 order di kasir -> saldo naik
  await p.goto(B + '#/kasir'); await p.click('.pos-item:has-text("Bakso urat")'); await p.click('[data-action=checkout]'); await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  await p.goto(B + '#/kas'); await p.waitForSelector('.saldo-card .saldo');
  ok((await txt(p, '.saldo-card .saldo')) === 'Rp 2.516.000', 'saldo bertambah dari penjualan kasir');
  await p.screenshot({ path: OUT + '/i5-saldo.png' });

  // Beranda: langkah menu, stok, saldo, kasir selesai
  await p.goto(B); await p.waitForSelector('.journey');
  const done = await p.$$eval('.journey .step.done', (a) => a.map((x) => x.textContent.trim()));
  console.log('selesai:', done);
  ok(done.length >= 4, 'langkah menu, stok, saldo & kasir tercentang');
  ok((await txt(p, '.view')).includes('Saldo kas sekarang'), 'saldo tampil di kartu Kas beranda');
  await p.screenshot({ path: OUT + '/i6-beranda.png', fullPage: true });

  console.log('errors:', errs);
  await b.close();
})();
