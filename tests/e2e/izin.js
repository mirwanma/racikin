// E2E Racikin (izin.js): Panduan perizinan (#/izin): rekomendasi per profil, status & dokumen tersimpan, masa berlaku
// otomatis, pengingat di Beranda, modul Bisnis, Mentor AI (Mode Demo), tampilan HP & layar lebar.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());

  // Data contoh (Tahu Guyur, gerobak, makanan siap saji)
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  ok(!(await p.$('.izin-mini')), 'Beranda: belum ada pengingat izin');
  await p.goto(B + '#/bisnis'); await p.waitForSelector('a[href="#/izin"]');
  ok((await txt(p, 'a[href="#/izin"]')).includes('Panduan Perizinan'), 'modul Panduan Perizinan di Bisnis');
  await p.click('a[href="#/izin"]'); await p.waitForSelector('.izin');
  const kartu = await p.$$eval('.izin', (a) => a.map((x) => x.dataset.izin + ':' + x.querySelector('.sehat-pill').textContent));
  console.log(kartu.join(' | '));
  ok(kartu[0] === 'nib:Wajib' && kartu.includes('halal:Wajib') && kartu.includes('pirt:Belum perlu'), 'rekomendasi: NIB & halal wajib, PIRT belum perlu untuk makanan siap saji');
  ok((await txt(p, '.card.accent')).includes('0/'), 'progres awal 0');
  ok(await p.$eval('.izin[data-izin=nib] details', (d) => d.open), 'NIB terbuka duluan');
  ok((await p.$eval('.izin[data-izin=nib] a[target=_blank]', (a) => a.href)).startsWith('https://oss.go.id'), 'link resmi OSS');
  ok((await txt(p, '.izin-disclaimer')).includes('bukan nasihat hukum'), 'ada disclaimer');
  await p.screenshot({ path: OUT + '/i1-izin.png', fullPage: true });

  // Centang dokumen, set status NIB selesai + nomor
  await p.check('.izin[data-izin=nib] input[data-change=dok][value="0"]');
  await p.check('.izin[data-izin=nib] input[data-change=dok][value="1"]');
  await p.selectOption('.izin[data-izin=nib] select[data-change=status]', 'selesai'); await p.waitForTimeout(150);
  await p.fill('.izin[data-izin=nib] input[data-f=nomor]', '1234567890123'); await p.press('.izin[data-izin=nib] input[data-f=nomor]', 'Tab');
  await p.selectOption('.izin[data-izin=halal] select[data-change=status]', 'proses'); await p.waitForTimeout(150);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).izin);
  console.log('izin:', JSON.stringify(st));
  ok(st.nib.status === 'selesai' && st.nib.nomor === '1234567890123' && st.nib.dok.join() === '0,1' && st.halal.status === 'proses', 'status, nomor & dokumen tersimpan');
  ok((await txt(p, '.card.accent')).includes('1/') && (await txt(p, '.card.accent')).includes('Sertifikat Halal'), 'progres 1 beres, berikutnya halal');

  // SLHS selesai, terbit hampir 3 tahun lalu -> otomatis habis sebentar lagi, pengingat muncul
  await p.selectOption('.izin[data-izin=slhs] select[data-change=status]', 'selesai'); await p.waitForTimeout(150);
  const terbit = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); d.setDate(d.getDate() + 20); return d.toISOString().slice(0, 10); })();
  await p.fill('.izin[data-izin=slhs] input[data-f=terbit]', terbit); await p.waitForTimeout(200);
  const slhs = await txt(p, '.izin[data-izin=slhs]');
  ok(/hari lagi, siapin perpanjangan/.test(slhs), 'masa berlaku otomatis 3 tahun dari terbit + peringatan');
  ok((await txt(p, '.card.accent')).includes('SLHS'), 'pengingat di ringkasan');
  await p.screenshot({ path: OUT + '/i2-status.png', fullPage: true });

  await p.goto(B); await p.waitForSelector('.izin-mini');
  console.log('beranda:', await txt(p, '.izin-mini'));
  ok((await txt(p, '.izin-mini')).includes('SLHS'), 'pengingat izin di Beranda');
  await p.goto(B + '#/bisnis'); await p.waitForSelector('a[href="#/izin"]');
  ok((await txt(p, 'a[href="#/izin"]')).includes('ada yang mau habis'), 'modul Bisnis: status izin');

  // Mentor
  await p.goto(B + '#/izin'); await p.waitForSelector('.izin');
  await p.click('a[href="#/mentor?tanya=izin"]'); await p.waitForSelector('.bubble.me');
  ok((await txt(p, '.bubble.me')).includes('urus izin'), 'pertanyaan izin terkirim ke Mentor');
  await p.waitForSelector('.bubble.ai >> nth=1', { timeout: 10000 });
  ok(p.url().endsWith('#/mentor'), 'hash dibersihkan');

  // HP tanpa scroll samping
  await p.goto(B + '#/izin'); await p.waitForSelector('.izin');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');

  // Frozen food dari rumah -> PIRT disarankan
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('racikin:v1')); s.profile.jenis = 'Frozen food'; s.profile.konsep = 'Online / dari rumah'; localStorage.setItem('racikin:v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('.izin');
  ok((await txt(p, '.izin[data-izin=pirt] .sehat-pill')) === 'Disarankan', 'frozen food dari rumah: PIRT disarankan');

  // Layar lebar
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/i3-lebar.png', fullPage: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'layar lebar: tidak ada scroll ke samping');

  console.log('errors:', errs);
  ok(errs.length === 0, 'tanpa error');
  await b.close();
})();
