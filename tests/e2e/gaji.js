// E2E Racikin (gaji.js): gaji karyawan dengan data contoh, tanpa akun. Atur gaji harian, absen minggu lalu,
// kasbon karyawan, pengingat Beranda, hitung & bayar gaji (bonus + potong kasbon), Kas & slip WA, batal.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 }); await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); Object.assign(x, { karyawan: [], absen: {}, absenSetting: null, jadwal: null, gajian: [], kasbonKaryawan: [], thr: [], utangSupplier: [] }); x.transactions = x.transactions.filter((t) => t.ref !== 'gaji' && t.ref !== 'utang'); localStorage.setItem('racikin:v1', JSON.stringify(x)); }); await p.reload(); await p.waitForSelector('.journey'); // mulai fitur dari nol (data contoh sudah punya karyawan & utang)
    await p.goto(B + '#/karyawan'); await p.click('[data-action=nyala]'); await p.waitForSelector('form[data-form=karyawan]');

    // Karyawan + gaji harian
    await p.fill('form[data-form=karyawan] input[name=nama]', 'Ujang');
    await p.fill('form[data-form=karyawan] input[name=nominal]', '80000');
    await p.fill('form[data-form=karyawan] input[name=makan]', '10000');
    await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(150);
    let s = await st(p);
    const ujang = s.karyawan[0];
    ok(ujang.gaji?.skema === 'harian' && ujang.gaji.nominal === 80000 && ujang.gaji.makan === 10000 && ujang.gaji.periode === 'mingguan', 'gaji tersimpan');
    ok((await txt(p, 'main')).includes('80.000/hari'), 'kartu karyawan: info gaji');

    // Absen minggu lalu (Senin–Jumat hadir) disuntik
    const now = new Date(); const senin = new Date(now); senin.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
    const minggu = [...Array(5).keys()].map((i) => { const d = new Date(senin); d.setDate(senin.getDate() + i); return iso(d); });
    await p.evaluate(([id, hari]) => { const x = JSON.parse(localStorage.getItem('racikin:v1')); for (const t of hari) x.absen[t] = { [id]: { status: 'hadir', sumber: 'manual' } }; localStorage.setItem('racikin:v1', JSON.stringify(x)); }, [ujang.id, minggu]);
    await p.goto(B + '#/'); await p.reload(); await p.waitForSelector('.journey');
    ok((await txt(p, 'a[href="#/karyawan?tab=gaji"].pajak-mini')).includes('450.000'), 'Beranda: pengingat gajian Rp450.000');

    // Kasbon karyawan
    await p.click('a[href="#/karyawan?tab=gaji"].pajak-mini'); await p.waitForSelector('form[data-form=pinjam]');
    await p.selectOption('form[data-form=pinjam] select[name=karyawan]', ujang.id);
    await p.fill('form[data-form=pinjam] input[name=nominal]', '100000'); await p.click('form[data-form=pinjam] button'); await p.waitForTimeout(150);
    s = await st(p);
    ok(s.transactions.some((t) => t.kategori === 'Kasbon karyawan' && t.nominal === 100000 && t.jenis === 'keluar'), 'kasbon karyawan: Kas keluar');

    // Bayar gaji: bonus 20rb, potong kasbon 60rb
    await p.click(`[data-action=bukaBayar][data-id="${ujang.id}"]`); await p.waitForSelector('form[data-form=bayarGaji]');
    ok((await txt(p, 'form[data-form=bayarGaji]')).includes('5 × Rp 80.000'), 'rincian: 5 hari × 80rb');
    ok(await p.inputValue('form[data-form=bayarGaji] input[name=potong]') === '100000', 'potong kasbon default = sisa kasbon');
    await p.fill('form[data-form=bayarGaji] input[name=bonus]', '20000');
    await p.fill('form[data-form=bayarGaji] input[name=potong]', '60000');
    await p.screenshot({ path: `${OUT}/gaji-bayar-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('form[data-form=bayarGaji] button.primary'); await p.waitForSelector('.gaji-card.lunas');
    s = await st(p);
    const g = s.gajian[0];
    ok(g.kotor === 470000 && g.potongKasbon === 60000 && g.bersih === 410000, 'gaji: kotor 470rb, potong 60rb, diterima 410rb');
    const gajiTx = s.transactions.filter((t) => t.ref === 'gaji');
    ok(gajiTx.some((t) => t.kategori === 'Gaji' && t.nominal === 470000) && gajiTx.some((t) => t.kategori === 'Potong kasbon karyawan' && t.jenis === 'masuk' && t.nominal === 60000), 'Kas: Gaji kotor + potong kasbon masuk');
    const href = await p.getAttribute('.gaji-card.lunas a[target=_blank]', 'href');
    ok(decodeURIComponent(href).includes('Diterima Rp 410.000'), 'slip WA');
    ok((await txt(p, 'main')).includes('Rp 40.000'), 'sisa kasbon 40rb');
    await p.screenshot({ path: `${OUT}/gaji-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Kas: tag Gaji; Beranda: pengingat hilang
    await p.goto(B + '#/kas'); await p.waitForTimeout(300);
    ok(await p.$('a.tag[href="#/karyawan?tab=gaji"]'), 'Kas: tag Gaji');
    await p.goto(B + '#/'); await p.waitForSelector('.journey');
    ok(!(await p.$('a[href="#/karyawan?tab=gaji"].pajak-mini')), 'Beranda: pengingat gajian hilang');

    // Batal
    await p.goto(B + '#/karyawan?tab=gaji'); await p.waitForSelector('[data-action=batalGaji]');
    await p.click('[data-action=batalGaji]'); await p.waitForTimeout(200);
    s = await st(p);
    ok(!s.gajian.length && !s.transactions.some((t) => t.kategori === 'Gaji' && t.ref === 'gaji') && s.kasbonKaryawan.length === 1, 'batal: Kas & potongan dihapus');

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
