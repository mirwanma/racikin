// E2E Racikin (laporan.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const fs = require('fs');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B + '#/laporan'); await p.waitForSelector('.card');
  // kosong dulu (tanpa profil -> diarahkan ke profil)
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  await p.goto(B + '#/kas'); await p.waitForSelector('.lr-link');
  await p.click('.lr-link'); await p.waitForSelector('.lr-statement');
  console.log('chips:', await p.$$eval('.chips .chip-btn', a => a.map(x => x.textContent).join(' | ')));
  console.log('hero:', await txt(p, '.lr-hero'));
  await p.screenshot({ path: OUT + '/1-laporan.png', fullPage: true });
  // Oktober (bulan penuh)
  const okt = await p.$$eval('.chips .chip-btn', a => a.find(x => /Okt/i.test(x.textContent))?.dataset.ym);
  await p.click(`.chips [data-ym="${okt}"]`); await p.waitForTimeout(200);
  console.log('statement okt:', await txt(p, '.lr-statement'));
  // cek silang dengan data
  const s = JSON.parse(await p.evaluate(() => localStorage.getItem('racikin:v1')));
  const tx = s.transactions.filter(t => t.tanggal.startsWith(okt));
  const masuk = tx.filter(t => t.jenis === 'masuk').reduce((a, t) => a + t.nominal, 0), keluar = tx.filter(t => t.jenis === 'keluar').reduce((a, t) => a + t.nominal, 0);
  console.log('cek kas okt: masuk', masuk, 'keluar', keluar, 'arus', masuk - keluar);
  console.log('menu:', (await txt(p, 'section.card:has(h2:text("Menu paling untung"))')).slice(0, 260));
  console.log('catatan:', await txt(p, '.lr-notes'));
  await p.screenshot({ path: OUT + '/2-oktober.png', fullPage: true });
  // metode belanja
  await p.click('label:has(input[value=belanja])'); await p.waitForTimeout(200);
  console.log('metode belanja:', (await txt(p, '.lr-hero')).slice(0, 120), '| HPP:', await txt(p, '.lr-row:has-text("Harga pokok")'));
  await p.click('label:has(input[value=resep])');
  // grafik: hover & klik
  await p.hover('.lr-col >> nth=0'); await p.waitForTimeout(150);
  console.log('tooltip:', await txt(p, '.lr-col >> nth=0 >> .lr-tip'));
  await p.screenshot({ path: OUT + '/3-chart-hover.png', clip: { x: 0, y: 300, width: 390, height: 360 } });
  await p.click('.lr-col >> nth=-1'); await p.waitForTimeout(150);
  console.log('klik batang terakhir ->', await txt(p, '.chips .chip-btn.on'));
  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=csv]')]);
  const f = OUT + '/' + dl.suggestedFilename(); await dl.saveAs(f);
  console.log('csv:', dl.suggestedFilename(), '|', fs.readFileSync(f, 'utf8').split('\n').slice(0, 12).join(' / '));
  // Cetak
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: OUT + '/4-print.png', fullPage: true });
  console.log('print: tabbar tampil', await p.isVisible('.tabbar'), '| tombol tampil', await p.isVisible('[data-action=cetak]'));
  await p.emulateMedia({ media: 'screen' });
  // dark mode
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: OUT + '/5-dark.png', fullPage: false });
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
