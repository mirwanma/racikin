// E2E Racikin (dummy.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.waitForSelector('[data-action=dummy]');
  const t0 = Date.now();
  await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  console.log('waktu generate:', Date.now() - t0, 'ms');
  const raw = await p.evaluate(() => localStorage.getItem('racikin:v1'));
  const s = JSON.parse(raw);
  console.log('ukuran:', Math.round(raw.length / 1024), 'KB');
  console.log('menu', s.resep.length, '| bahan', s.bahan.length, '| order (30 hr)', s.orders.length, '| hari rekap', Object.keys(s.posHarian).length, '| transaksi', s.transactions.length, '| stokLog', s.stokLog.length, '| pelanggan', s.pelanggan.length, '| stempelLog', s.stempelLog.length);
  // Konsistensi
  let bad = 0;
  for (const [tgl, r] of Object.entries(s.posHarian)) {
    const kas = s.transactions.filter(t => t.ref === 'pos' && t.tanggal === tgl && t.jenis === 'masuk').reduce((a, t) => a + t.nominal, 0);
    if (kas !== r.omzet) bad++;
  }
  console.log('hari dgn kas != omzet rekap:', bad);
  const stokCek = s.bahan.map(bh => Math.abs(s.stokLog.filter(l => l.bahanId === bh.id).reduce((a, l) => a + l.delta, 0) - bh.stok) < 0.05 || bh.stok === 0);
  console.log('bahan stok cocok riwayat:', stokCek.filter(Boolean).length, '/', s.bahan.length, '| bahan stok 0:', s.bahan.filter(x => x.stok === 0).map(x => x.nama));
  const stCek = s.pelanggan.every(pl => s.stempelLog.filter(l => l.pelangganId === pl.id).reduce((a, l) => a + l.delta, 0) === pl.stempel);
  console.log('stempel cocok log:', stCek);
  const bulan = {};
  for (const t of s.transactions) { const m = t.tanggal.slice(0, 7); bulan[m] ??= { masuk: 0, keluar: 0 }; bulan[m][t.jenis] += t.nominal; }
  console.log('per bulan:', JSON.stringify(bulan));
  const omzet = Object.values(s.posHarian).reduce((a, r) => a + r.omzet, 0), n = Object.values(s.posHarian).reduce((a, r) => a + r.order, 0);
  console.log('total 60 hari: order', n, '| omzet', omzet, '| rata/order', Math.round(omzet / n), '| order/hari', Math.round(n / 60));
  console.log('menipis:', s.bahan.filter(x => x.tracked && x.stok <= x.min).map(x => `${x.nama} ${x.stok}/${x.min}`));
  await p.screenshot({ path: OUT + '/1-home.png', fullPage: true });
  for (const [route, name, sel] of [['kas', '2-kas', '.tx'], ['kasir?tab=rekap', '3-rekap', '.stats3'], ['stok?tab=bahan', '4-stok', '.bahan'], ['pelanggan', '5-pelanggan', '.cust'], ['konten', '6-konten', '.post'], ['rab', '7-rab', '.card'], ['online', '8-online', '.om-menu']]) {
    await p.goto(B + '#/' + route); await p.waitForSelector(sel, { timeout: 10000 });
    await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
  await p.goto(B + '#/kasir'); await p.click('label:has(input[value=jual])'); await p.waitForSelector('.pos-grid'); await p.screenshot({ path: OUT + '/9-kasir.png', fullPage: true });
  await p.goto(B + '#/stok'); await p.click('label:has(input[value=menu])'); await p.waitForSelector('.resep-card'); await p.screenshot({ path: OUT + '/4b-menu.png', fullPage: true });
  await p.goto(B + '#/kas'); await p.waitForSelector('.stats3');
  console.log('kas bulan ini:', await txt(p, '.stats3'));
  await p.goto(B + '#/pelanggan'); await p.waitForSelector('.stats3');
  console.log('pelanggan:', await txt(p, '.stats3'));
  await p.goto(B + '#/kasir?tab=rekap'); await p.waitForSelector('.stats3');
  console.log('rekap hari ini:', await txt(p, '.stats3'));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
