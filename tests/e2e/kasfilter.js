// E2E Racikin (kasfilter.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const fs = require('fs');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const nTx = (p) => p.$$eval('#tx-list .tx', (a) => a.length);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  const total = await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).transactions.length);
  let t0 = Date.now();
  await p.goto(B + '#/kas'); await p.waitForSelector('.tx-card');
  console.log('buka Kas:', Date.now() - t0, 'ms | tinggi halaman', await p.evaluate(() => document.documentElement.scrollHeight), '| baris tx', await nTx(p), 'dari total', total);
  console.log('default:', await txt(p, '.tx-sum'));
  await p.screenshot({ path: OUT + '/1-hari-ini.png', fullPage: true });
  await p.click('[data-action=periode][data-p="7"]');
  console.log('7 hari:', await txt(p, '.tx-sum'), '| baris', await nTx(p));
  await p.click('[data-action=periode][data-p="semua"]');
  console.log('semua:', await txt(p, '.tx-sum'), '| baris', await nTx(p), '|', await txt(p, '[data-action=more]'));
  await p.click('[data-action=more]');
  console.log('setelah muat lagi: baris', await nTx(p));
  // cari (live, fokus tetap)
  await p.fill('.tx-search', 'gas'); await p.waitForTimeout(400);
  console.log('cari "gas":', await txt(p, '.tx-sum'), '| fokus tetap:', await p.evaluate(() => document.activeElement?.classList.contains('tx-search')));
  await p.fill('.tx-search', '22rb'); await p.waitForTimeout(400);
  console.log('cari "22rb":', await txt(p, '.tx-sum'));
  await p.fill('.tx-search', ''); await p.waitForTimeout(400);
  // filter
  await p.click('.tx-filter summary');
  await p.selectOption('select[data-change=fsumber]', 'laci');
  console.log('sumber laci:', await txt(p, '.tx-sum'));
  await p.selectOption('select[data-change=fsumber]', '');
  await p.selectOption('select[data-change=fkategori]', 'Marketing');
  console.log('kategori Marketing:', await txt(p, '.tx-sum'), '| tombol filter:', await txt(p, '.tx-filter summary'));
  // CSV sesuai filter
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=csv]')]);
  const f = OUT + '/' + dl.suggestedFilename(); await dl.saveAs(f);
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  console.log('csv:', dl.suggestedFilename(), '| baris data', lines.length - 1, '|', lines[1]);
  await p.screenshot({ path: OUT + '/2-filter.png', fullPage: true });
  await p.click('.tx-filter [data-action=resetFilter]');
  // rentang tanggal
  await p.click('[data-action=periode][data-p="rentang"]');
  await p.fill('input[data-change=dari]', '2026-10-01'); await p.press('input[data-change=dari]', 'Tab');
  await p.fill('input[data-change=sampai]', '2026-10-07'); await p.press('input[data-change=sampai]', 'Tab');
  console.log('rentang 1-7 Okt:', await txt(p, '.tx-sum'));
  // navigasi bulan -> periode bulan
  await p.click('[data-action=prev]');
  console.log('bulan sebelumnya:', await txt(p, '.tx-sum'), '| chip aktif', await txt(p, '.tx-periode .chip-btn.on'));
  // hapus transaksi manual tetap jalan
  await p.click('[data-action=periode][data-p="semua"]');
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).transactions.length);
  await p.click('#tx-list [data-action=del] >> nth=0');
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).transactions.length);
  console.log('hapus:', before, '->', after);
  // tablet
  await p.setViewportSize({ width: 1180, height: 820 }); await p.goto(B + '#/kas'); await p.waitForSelector('.tx-card');
  await p.screenshot({ path: OUT + '/3-tablet.png', fullPage: true });
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
