// E2E Racikin (sehat.js): Cek kesehatan usaha dari data contoh & usaha baru, kartu Beranda, modul Bisnis, Mentor AI (Mode Demo).
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());

  // Data contoh (usaha udah jalan, 60 hari)
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  ok(await p.isVisible('.sehat-mini'), 'kartu kesehatan muncul di Beranda');
  console.log('kartu beranda:', await txt(p, '.sehat-mini'));
  await p.screenshot({ path: OUT + '/s1-beranda.png' });
  await p.click('.sehat-mini'); await p.waitForSelector('.sehat-head');
  const skor = Number(await txt(p, '.sehat-head .sehat-skor'));
  console.log('skor:', skor, '|', await txt(p, '.sehat-head h2'));
  ok(skor >= 70 && skor <= 100, 'skor data contoh masuk akal');
  const cek = await p.$$eval('.sehat-cek', (a) => a.map((x) => x.querySelector('h3').textContent + ' = ' + x.querySelector('.sehat-pill').textContent + ' · ' + x.querySelector('.sehat-nilai').textContent));
  console.log(cek.join('\n'));
  ok(cek.length >= 9, `${cek.length} pemeriksaan tampil`);
  ok(!cek.some((x) => x.includes('Belum ada data')), 'data contoh: semua pemeriksaan punya data');
  await p.screenshot({ path: OUT + '/s2-sehat.png', fullPage: true });

  // Tanya Mentor AI (Mode Demo) langsung dari prioritas
  if (await p.$('a[href="#/mentor?tanya=sehat"]')) {
    await p.click('a[href="#/mentor?tanya=sehat"]'); await p.waitForSelector('.bubble.me');
    ok((await txt(p, '.bubble.me')).includes('cek kesehatan'), 'pertanyaan otomatis terkirim ke Mentor');
    await p.waitForSelector('.bubble.ai >> nth=1', { timeout: 10000 });
    ok(p.url().endsWith('#/mentor'), 'hash dibersihkan (tidak kirim ulang)');
  }

  // Modul di halaman Bisnis
  await p.goto(B + '#/bisnis'); await p.waitForSelector('.module');
  ok((await p.$$eval('.module h3', (a) => a.map((x) => x.textContent)))[0] === 'Cek Kesehatan Usaha', 'Usahamu: Cek Kesehatan Usaha paling atas');

  // Usaha baru (belum ada data)
  await p.evaluate(() => localStorage.setItem('racikin:v1', JSON.stringify({ profile: { tahap: 'jalan', owner: 'A', nama: 'Warung A', ide: 'warung', jenis: 'Makanan berat', kota: 'B', target: [], skill: [], karyawan: 2, saluran: ['GoFood'], masalah: ['karyawan'] } })));
  await p.evaluate(() => history.replaceState(null, '', '#/sehat')); await p.reload(); await p.waitForSelector('.sehat-head');
  ok((await txt(p, '.sehat-head h2')) === 'Belum cukup data', 'usaha baru: belum cukup data');
  ok(await p.isVisible('text=Selisih kas kasir'), 'punya karyawan -> pemeriksaan kasir tetap tampil (belum ada data)');
  await p.screenshot({ path: OUT + '/s3-kosong.png', fullPage: true });
  await p.goto(B); await p.waitForSelector('.journey');
  ok(!(await p.$('.sehat-mini')), 'beranda usaha baru: kartu kesehatan disembunyikan sampai ada data');

  console.log('errors:', errs);
  await b.close();
})();
