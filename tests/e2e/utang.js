// E2E Racikin (utang.js): utang ke supplier dengan data contoh, tanpa akun. Belanja tempo (stok masuk, Kas belum),
// tab Utang, cicil (Kas keluar), lunasi semua, tag "Utang" di Kas, pengingat Beranda & modul Bisnis.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const keluarUtang = (s) => s.transactions.filter((t) => t.ref === 'utang').reduce((a, t) => a + t.nominal, 0);

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 }); await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); Object.assign(x, { karyawan: [], absen: {}, absenSetting: null, jadwal: null, gajian: [], kasbonKaryawan: [], thr: [], utangSupplier: [] }); x.transactions = x.transactions.filter((t) => t.ref !== 'gaji' && t.ref !== 'utang'); localStorage.setItem('racikin:v1', JSON.stringify(x)); }); await p.reload(); await p.waitForSelector('.journey'); // mulai fitur dari nol (data contoh sudah punya karyawan & utang)

    await p.goto(B + '#/belanja'); await p.waitForSelector('[data-action=catat]');
    ok(!(await p.$('input[data-change=tab][value=utang]')), 'belum ada utang: tab Utang belum muncul');
    let s = await st(p);
    const tx0 = s.transactions.length;
    // Grup supplier pertama (bukan "Belum ada supplier")
    const btn = await p.$('section.card:not(:has-text("Belum ada supplier")) [data-action=catat]');
    await btn.click(); await p.waitForSelector('form[data-form=catat]');
    const t1 = await p.$('form[data-form=catat] input[name^="t-"]');
    await t1.fill('77000');
    await p.check('form[data-form=catat] input[name=utang]');
    ok((await t1.inputValue()) === '77000', 'centang utang: angka yang diketik nggak hilang');
    ok(await p.isVisible('form[data-form=catat] input[name=tempo]') && !(await p.isVisible('form[data-form=catat] .kas-cek')), 'muncul jatuh tempo, opsi Kas disembunyikan');
    const rows = await p.$$eval('form[data-form=catat] input[name^="q-"]', (a) => a.map((x) => [x.name.slice(2), Number(x.value)]));
    const totals = await p.$$eval('form[data-form=catat] input[name^="t-"]', (a) => a.reduce((x, y) => x + (Number(y.value) || 0), 0));
    const stok0 = Object.fromEntries(s.bahan.map((x) => [x.id, Number(x.stok) || 0]));
    await p.screenshot({ path: `${OUT}/utang-catat-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('form[data-form=catat] button.primary'); await p.waitForTimeout(300);
    s = await st(p);
    const nota = s.utangSupplier[0];
    ok(nota && nota.total === totals && s.transactions.length === tx0, `nota utang ${totals}, Kas belum dicatat`);
    ok(rows.every(([id, q]) => Math.abs((Number(s.bahan.find((x) => x.id === id).stok) || 0) - (stok0[id] + q)) < 0.01), 'stok tetap bertambah');

    // Tab Utang
    await p.click('label:has(input[data-change=tab][value=utang])'); await p.waitForSelector('.utang-nota');
    ok((await txt(p, '.stats3')).includes((totals).toLocaleString('id-ID')), 'ringkasan total utang');
    await p.click(`.utang-head[data-id="${nota.id}"]`); await p.waitForSelector('form[data-form=bayarUtang]');
    await p.fill('form[data-form=bayarUtang] input[name=nominal]', '20000');
    await p.click('form[data-form=bayarUtang] button'); await p.waitForTimeout(200);
    s = await st(p);
    ok(keluarUtang(s) === 20000 && s.utangSupplier[0].bayar.length === 1, 'cicil 20rb: Kas keluar');
    await p.screenshot({ path: `${OUT}/utang-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Nota kedua lewat tempo (disuntik) -> pengingat Beranda & lunasi semua
    await p.evaluate((sup) => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.utangSupplier.push({ id: 'lama', supplierId: sup, tanggal: '2026-01-02', tempo: '2026-01-09', total: 15000, rincian: [{ kategori: 'Bahan Baku', nominal: 15000 }], catatan: 'tahu', bayar: [] }); localStorage.setItem('racikin:v1', JSON.stringify(x)); }, nota.supplierId);
    await p.goto(B + '#/'); await p.reload(); await p.waitForSelector('.journey');
    ok((await txt(p, 'a[href="#/belanja?tab=utang"].pajak-mini')).includes('lewat jatuh tempo'), 'Beranda: pengingat utang lewat tempo');
    await p.goto(B + '#/bisnis'); await p.waitForSelector('a[href="#/belanja"].module');
    ok((await txt(p, 'a[href="#/belanja"].module')).includes('lewat tempo'), 'modul Bisnis: info utang');
    await p.goto(B + '#/belanja?tab=utang'); await p.waitForSelector('[data-action=lunasiSup]');
    await p.click('[data-action=lunasiSup]'); await p.waitForTimeout(300);
    s = await st(p);
    ok(keluarUtang(s) === totals + 15000 && s.utangSupplier.every((n) => n.bayar.reduce((a, x) => a + x.nominal, 0) === n.total), 'lunasi semua: Kas = total belanja');
    ok((await txt(p, 'main')).includes('Nggak ada utang'), 'tab Utang: kosong');

    // Kas: transaksi utang pakai tag, nggak bisa dihapus langsung
    await p.goto(B + '#/kas'); await p.waitForTimeout(300);
    ok(await p.$('a.tag[href="#/belanja?tab=utang"]'), 'Kas: tag Utang');

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
