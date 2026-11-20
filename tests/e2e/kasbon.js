// E2E Racikin (kasbon.js): kasbon pelanggan dengan data contoh, tanpa akun. Aktifkan, order Kasbon di Kasir
// (pelanggan baru cepat, batas, DP tunai), Kas belum naik, terima cicilan & lunas di #/kasbon, Kas & pengingat Beranda.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet .opsi-btn')) await p.click('.sheet [data-action=pilihTambah]'); };
const saldo = (s, id) => s.kasbon.filter((k) => k.pelangganId === id).reduce((a, k) => a + (k.jenis === 'utang' ? 1 : -1) * k.nominal, 0);
const kasKb = (s) => s.transactions.filter((t) => t.ref === 'kasbon').reduce((a, t) => a + t.nominal, 0);
const kasHari = (s, t) => s.transactions.filter((x) => x.ref === 'pos' && x.tanggal === t && x.jenis === 'masuk').reduce((a, x) => a + x.nominal, 0);

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
    await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); localStorage.setItem('racikin:v1', JSON.stringify(x)); });
    await p.reload(); await p.waitForSelector('.journey');

    // Belum aktif: chip Kasbon belum ada
    await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
    await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    await p.waitForSelector('[data-change=metode]');
    ok(!(await p.$('input[data-change=metode][value=kasbon]')), 'kasbon nonaktif: tanpa metode Kasbon');

    // Aktifkan dari modul Bisnis
    await p.goto(B + '#/bisnis'); await p.click('a[href="#/kasbon"].module'); await p.waitForSelector('[data-action=nyala]');
    await p.click('[data-action=nyala]'); await p.waitForSelector('[data-change=batasDefault]');
    await p.fill('[data-change=batasDefault]', '30000'); await p.dispatchEvent('[data-change=batasDefault]', 'change'); await p.waitForTimeout(150);
    let s = await st(p);
    ok(s.posSetting.kasbon === true && s.posSetting.kasbonBatas === 30000, 'aktif + batas 30rb');

    // Kasir: Kasbon, pelanggan baru cepat (reload: kosongkan keranjang tadi)
    await p.goto(B + '#/kasir'); await p.reload(); await p.waitForSelector('.pos-grid');
    s = await st(p);
    const hariIni = await p.evaluate(() => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });
    const omzet0 = s.posHarian[hariIni]?.omzet || 0;
    for (let i = 0; i < 3; i++) await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    await p.click('label.chip:has(input[data-change=metode][value=kasbon])'); await p.waitForSelector('.kasbon-box');
    ok(await p.isDisabled('[data-action=selesai]'), 'belum pilih pelanggan: tombol mati');
    await p.click('[data-action=kasbonBaru]'); await p.fill('form[data-form=kasbonPelanggan] input[name=nama]', 'Pak Joko'); await p.click('form[data-form=kasbonPelanggan] button');
    await p.waitForTimeout(150);
    const total = Number((await txt(p, '.pos-total b')).replace(/\D/g, ''));
    console.log('total keranjang:', total);
    if (total > 30000) {
      ok((await txt(p, '.kasbon-box')).includes('Lewat batas') && (await p.isDisabled('[data-action=selesai]')), 'lewat batas: ditolak');
      await p.click('.kasbon-box input[data-change=campur]');
      await p.fill('.kasbon-box input[data-change=tunaiSebagian]', String(total - 25000)); await p.dispatchEvent('.kasbon-box input[data-change=tunaiSebagian]', 'change'); await p.waitForTimeout(150);
    }
    await p.screenshot({ path: `${OUT}/kasbon-kasir-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    ok(!(await p.isDisabled('[data-action=selesai]')), 'dalam batas: boleh');
    await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
    ok((await txt(p, '.struk')).includes('Kasbon Pak Joko'), 'struk: info kasbon');
    s = await st(p);
    const joko = s.pelanggan.find((x) => x.nama === 'Pak Joko');
    const o = s.orders[s.orders.length - 1];
    const kb = total > 30000 ? 25000 : total;
    ok(saldo(s, joko.id) === kb, `kasbon Pak Joko ${kb}`);
    ok(s.posHarian[o.tanggal].omzet === omzet0 + total, 'omzet rekap naik penuh');
    ok(kasHari(s, o.tanggal) === s.posHarian[o.tanggal].omzet - kb, 'Kas = omzet - kasbon');

    // Halaman kasbon: cicil tunai lalu lunas QRIS
    await p.goto(B + '#/kasbon'); await p.waitForSelector('.kasbon-row');
    await p.click(`.kasbon-row[data-id="${joko.id}"]`); await p.waitForSelector('.kasbon-detail');
    ok((await p.getAttribute('.kasbon-detail a[data-action=tagih]', 'href')).includes(encodeURIComponent('Pak Joko')), 'link tagih WA');
    await p.fill('form[data-form=bayar] input[name=nominal]', '10000'); await p.click('form[data-form=bayar] button'); await p.waitForTimeout(200);
    s = await st(p);
    ok(saldo(s, joko.id) === kb - 10000 && kasKb(s) === 10000, 'cicil 10rb: masuk Kas');
    await p.screenshot({ path: `${OUT}/kasbon-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('.kasbon-detail label.chip:has(input[value=qris])');
    await p.click('form[data-form=bayar] button'); await p.waitForTimeout(200);
    s = await st(p);
    ok(saldo(s, joko.id) === 0 && kasKb(s) === kb && s.transactions.some((t) => t.id.endsWith('-qris') && t.ref === 'kasbon'), 'lunas: Kas tunai + QRIS');
    ok(kasHari(s, o.tanggal) + kasKb(s) === s.posHarian[o.tanggal].omzet, 'Kas + pelunasan = omzet');
    ok((await txt(p, 'main')).includes('semua lunas'), 'daftar kosong');

    // Pengingat Beranda untuk kasbon lama
    await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.kasbon.push({ id: 'lama', jenis: 'utang', pelangganId: x.pelanggan[0].id, tanggal: '2026-01-02', nominal: 15000 }); localStorage.setItem('racikin:v1', JSON.stringify(x)); });
    await p.goto(B + '#/'); await p.reload(); await p.waitForSelector('.journey');
    ok(await p.$('a[href="#/kasbon"].pajak-mini'), 'Beranda: pengingat kasbon lama');

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
