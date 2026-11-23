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
  // Cek keras (exit code 1 kalau gagal)
  const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
  ok(bad === 0, 'Kas kasir = omzet rekap tiap hari');
  ok(stokCek.every(Boolean) && s.bahan.every((x) => x.stok >= 0), 'stok = riwayat stok, nggak ada yang minus');
  ok(stCek, 'stempel = riwayat stempel');
  const hari = Object.keys(s.posHarian).sort();
  const rata = (a, z) => hari.slice(a, z).reduce((x, d) => x + s.posHarian[d].omzet, 0) / (z - a);
  const tumbuh = rata(-8, -1) / rata(0, 7);
  console.log('omzet/hari minggu pertama', Math.round(rata(0, 7)), '-> minggu terakhir', Math.round(rata(-8, -1)), `(${tumbuh.toFixed(2)}x)`);
  ok(tumbuh > 2.6 && tumbuh < 3.6, 'usaha tumbuh ±3x');
  ok(s.karyawan.length === 5 && s.absenSetting?.aktif && Object.keys(s.jadwal?.hari || {}).length > 60, 'karyawan, absen & jadwal shift ada');
  const kasGaji = s.transactions.filter((x) => x.ref === 'gaji' && x.kategori === 'Gaji').reduce((a, x) => a + x.nominal, 0);
  ok(s.gajian.length > 20 && kasGaji === s.gajian.reduce((a, g) => a + g.kotor, 0), 'Kas Gaji = total gaji yang dibayar');
  const saldoKb = (id) => s.kasbonKaryawan.filter((x) => x.karyawanId === id).reduce((a, x) => a + (x.jenis === 'pinjam' ? 1 : -1) * x.nominal, 0);
  ok(s.karyawan.every((k) => saldoKb(k.id) >= 0), 'kasbon karyawan nggak minus');
  const kasUtang = s.transactions.filter((x) => x.ref === 'utang').reduce((a, x) => a + x.nominal, 0);
  ok(kasUtang === s.utangSupplier.reduce((a, n) => a + n.bayar.reduce((x, y) => x + y.nominal, 0), 0) && s.utangSupplier.some((n) => !n.bayar.length), 'utang supplier: Kas = yang sudah dibayar, ada yang belum lunas');
  ok(!('_ada' in s.pelanggan[0]) && s.pelanggan.every((x) => x.token), 'pelanggan bersih & punya token kartu');
  const tanda = { isi: 1, pakai: -1, tarik: -1 };
  const saldoP = (id) => (s.saldoPelanggan || []).filter((k) => k.pelangganId === id).reduce((x, k) => x + tanda[k.jenis] * k.nominal, 0);
  const totalSaldo = s.pelanggan.reduce((x, pl) => x + saldoP(pl.id), 0);
  const kasTitipan = s.transactions.filter((t) => t.kategori === 'Titipan saldo pelanggan').reduce((x, t) => x + (t.jenis === 'masuk' ? 1 : -1) * t.nominal, 0);
  console.log('saldo pelanggan:', (s.saldoPelanggan || []).length, 'catatan | total', totalSaldo, '| order dibayar saldo', s.orders.filter((o) => o.metode === 'saldo' || o.pembayaran?.some((x) => x.metode === 'saldo')).length);
  ok(s.posSetting.saldo && totalSaldo > 0 && kasTitipan === totalSaldo && s.pelanggan.every((pl) => saldoP(pl.id) >= 0), 'saldo pelanggan: Kas titipan = total saldo, nggak ada yang minus');
  const pakaiCocok = (s.saldoPelanggan || []).filter((k) => k.jenis === 'pakai').every((k) => { const o = s.orders.find((x) => x.id === k.orderId); return o && (o.metode === 'saldo' ? o.total : o.pembayaran.find((x) => x.metode === 'saldo').jumlah) === k.nominal; });
  ok(pakaiCocok, 'pemakaian saldo = bagian saldo di order');
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
  for (const [tab, sel] of [['absen', '.absen-row'], ['jadwal', '.jadwal-grid'], ['gaji', '.gaji-card']]) {
    await p.goto(B + '#/bisnis'); await p.goto(B + '#/karyawan'); await p.click(`label:has(input[data-change=tab][value=${tab}])`); await p.waitForSelector(sel, { timeout: 10000 });
    await p.screenshot({ path: `${OUT}/10-karyawan-${tab}.png`, fullPage: true });
  }
  await p.goto(B + '#/belanja?tab=utang'); await p.waitForSelector('.utang-nota'); await p.screenshot({ path: OUT + '/11-utang.png', fullPage: true });
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
