// E2E Racikin (saldo.js): saldo pelanggan dengan data contoh, tanpa akun. Aktifkan dari Bisnis, isi saldo di #/saldo
// (pelanggan baru), simpan kembalian dari Kasir, bayar pakai saldo (penuh & kurang + sisa QRIS), tarik saldo,
// Kas titipan vs penjualan, laci shift, kartu publik (data kartu), mati hanya kalau saldo kosong.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet .opsi-btn')) await p.click('.sheet [data-action=pilihTambah]'); };
const tanda = { isi: 1, pakai: -1, tarik: -1 };
const saldo = (s, id) => (s.saldoPelanggan || []).filter((k) => k.pelangganId === id).reduce((a, k) => a + tanda[k.jenis] * k.nominal, 0);
const titipan = (s) => s.transactions.filter((t) => t.kategori === 'Titipan saldo pelanggan').reduce((a, t) => a + (t.jenis === 'masuk' ? 1 : -1) * t.nominal, 0);
const penjualan = (s, t) => s.transactions.filter((x) => x.ref === 'pos' && x.tanggal === t && x.kategori === 'Penjualan').reduce((a, x) => a + x.nominal, 0);
const angka = (s) => Number(String(s).replace(/\D/g, ''));

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
    await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); x.posSetting = { ...(x.posSetting || {}), wajibShift: false }; localStorage.setItem('racikin:v1', JSON.stringify(x)); });
    await p.reload(); await p.waitForSelector('.journey');
    const hariIni = await p.evaluate(() => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });

    // Belum aktif: tanpa metode Saldo
    await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
    await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    await p.waitForSelector('[data-change=metode]');
    ok(!(await p.$('input[data-change=metode][value=saldo]')), 'saldo nonaktif: tanpa metode Saldo');

    // Aktifkan dari modul Bisnis
    await p.goto(B + '#/bisnis'); await p.click('a[href="#/saldo"].module'); await p.waitForSelector('[data-action=nyala]');
    await p.screenshot({ path: `${OUT}/saldo-mati-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('[data-action=nyala]'); await p.waitForSelector('form[data-form=baru]');
    let s = await st(p);
    ok(s.posSetting.saldo === true, 'aktif');

    // Pelanggan baru + isi saldo 50rb tunai
    await p.fill('form[data-form=baru] input[name=nama]', 'Mbak Rara'); await p.click('form[data-form=baru] button');
    await p.waitForSelector('.saldo-detail');
    await p.click('.saldo-detail [data-action=cepat][data-v="50000"]');
    await p.click('form[data-form=simpan] button.primary'); await p.waitForTimeout(200);
    s = await st(p);
    const rara = s.pelanggan.find((x) => x.nama === 'Mbak Rara');
    const t0 = titipan(s);
    ok(saldo(s, rara.id) === 50000 && t0 === 50000, 'isi 50rb: saldo & Kas titipan');
    ok(s.transactions.some((t) => t.id === `saldo-${hariIni}-tunai` && t.ref === 'saldo'), 'Kas titipan per hari per metode');
    ok((await txt(p, '.kasbon-row')).includes('Mbak Rara'), 'masuk daftar punya saldo');
    await p.screenshot({ path: `${OUT}/saldo-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Kasir: tunai, simpan kembalian ke saldo pelanggan lain (Mbak Rara juga, biar gampang)
    await p.goto(B + '#/kasir'); await p.reload(); await p.waitForSelector('.pos-grid');
    s = await st(p);
    const omzet0 = s.posHarian[hariIni]?.omzet || 0;
    await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    const total1 = angka(await txt(p, '.pos-total b'));
    await p.fill('input[data-change=bayar]', '50000'); await p.dispatchEvent('input[data-change=bayar]', 'change'); await p.waitForTimeout(100);
    ok((await txt(p, 'main')).includes('Pilih pelanggannya dulu'), 'kembalian: minta pilih pelanggan');
    await p.selectOption('select[data-change=pelanggan]', rara.id); await p.waitForTimeout(100);
    await p.click('label.impor-cek:has(input[data-change=simpan])'); await p.waitForTimeout(100);
    const kembali1 = 50000 - total1;
    ok(angka(await p.inputValue('input[data-change=simpanNominal]')) === kembali1, 'default simpan semua kembalian');
    await p.fill('input[data-change=simpanNominal]', String(kembali1 - 3000)); await p.dispatchEvent('input[data-change=simpanNominal]', 'change'); await p.waitForTimeout(100);
    await p.screenshot({ path: `${OUT}/saldo-kembalian-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
    ok((await txt(p, '.struk')).includes('disimpan'), 'struk: kembalian disimpan');
    s = await st(p);
    let o = s.orders[s.orders.length - 1];
    ok(o.kembali === 3000 && o.simpanSaldo === kembali1 - 3000, 'order: kembali 3rb, sisanya disimpan');
    ok(saldo(s, rara.id) === 50000 + kembali1 - 3000, 'saldo naik dari kembalian');
    ok(titipan(s) === 50000 + kembali1 - 3000, 'Kas titipan naik');

    // Bayar pakai saldo penuh (2 porsi)
    await p.click('[data-action=baru]'); await p.waitForSelector('.pos-grid');
    await pos(p, 'Tahu Guyur Original'); await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    const total2 = angka(await txt(p, '.pos-total b'));
    await p.click('label.chip:has(input[data-change=metode][value=saldo])'); await p.waitForSelector('.saldo-box');
    ok(await p.isDisabled('[data-action=selesai]'), 'saldo: belum pilih pelanggan, tombol mati');
    await p.selectOption('.saldo-box select', rara.id); await p.waitForTimeout(100);
    const saldoAwal = saldo(await st(p), rara.id);
    ok((await txt(p, '.saldo-box')).includes('Sisa saldo setelah bayar'), 'saldo cukup');
    await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
    s = await st(p);
    o = s.orders[s.orders.length - 1];
    ok(o.metode === 'saldo' && saldo(s, rara.id) === saldoAwal - total2, 'bayar penuh pakai saldo');
    ok((await txt(p, '.struk')).includes('Saldo Mbak Rara sekarang'), 'struk: sisa saldo');

    // Saldo kurang: habiskan saldo lewat keranjang besar, sisanya QRIS
    await p.click('[data-action=baru]'); await p.waitForSelector('.pos-grid');
    for (let i = 0; i < 6; i++) await pos(p, 'Tahu Guyur Original');
    if (hp) await p.click('[data-action=checkout]');
    const total3 = angka(await txt(p, '.pos-total b'));
    await p.click('label.chip:has(input[data-change=metode][value=saldo])'); await p.waitForSelector('.saldo-box');
    await p.selectOption('.saldo-box select', rara.id); await p.waitForTimeout(100);
    const sisaSaldo = saldo(await st(p), rara.id);
    ok(total3 > sisaSaldo, `keranjang ${total3} > saldo ${sisaSaldo}`);
    await p.click('.saldo-box label.chip:has(input[value=qris])'); await p.waitForTimeout(100);
    await p.screenshot({ path: `${OUT}/saldo-kurang-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
    s = await st(p);
    o = s.orders[s.orders.length - 1];
    ok(o.metode === 'campur' && o.pembayaran.find((x) => x.metode === 'qris').jumlah === total3 - sisaSaldo && saldo(s, rara.id) === 0, 'saldo kurang: sisanya QRIS, saldo habis');
    ok((s.posHarian[hariIni]?.omzet || 0) === omzet0 + total1 + total2 + total3, 'omzet naik penuh');
    ok(penjualan(s, hariIni) === s.posHarian[hariIni].omzet, 'Kas Penjualan = omzet (termasuk yang dibayar saldo)');
    ok(titipan(s) === 0, 'titipan habis terpakai');

    // Isi lagi lalu tarik sebagian (QRIS) dari halaman saldo; mati ditolak selama masih ada saldo
    await p.goto(B + '#/saldo'); await p.waitForSelector('form[data-form=baru]');
    await p.fill('input[data-change=cari]', 'rara'); await p.dispatchEvent('input[data-change=cari]', 'change'); await p.waitForTimeout(100);
    await p.click(`.saldo-cari .kasbon-row[data-id="${rara.id}"]`); await p.waitForSelector('.saldo-detail');
    await p.fill('form[data-form=simpan] input[name=nominal]', '20000'); await p.click('form[data-form=simpan] button.primary'); await p.waitForTimeout(150);
    ok(await p.$(".saldo-detail"), "detail tetap terbuka setelah isi");
    await p.click('.saldo-detail label.chip:has(input[data-change=mode][value=tarik])'); await p.waitForTimeout(100);
    await p.click('.saldo-detail label.chip:has(input[data-change=metode][value=qris])'); await p.waitForTimeout(100);
    await p.fill('form[data-form=simpan] input[name=nominal]', '5000'); await p.click('form[data-form=simpan] button.primary'); await p.waitForTimeout(150);
    s = await st(p);
    ok(saldo(s, rara.id) === 15000 && titipan(s) === 15000 && s.transactions.some((t) => t.id === `saldo-${hariIni}-tarik-qris` && t.jenis === 'keluar'), 'isi 20rb, tarik 5rb QRIS');
    ok(!(await p.$('[data-action=mati]')), 'masih ada saldo: tombol matikan disembunyikan');

    // Kartu publik ikut menampilkan saldo
    const kartu = await p.evaluate(async (id) => { const { cardData } = await import('./js/loyalty.js'); const x = JSON.parse(localStorage.getItem('racikin:v1')); return cardData(x, x.pelanggan.find((q) => q.id === id)); }, rara.id);
    ok(kartu.saldo === 15000, 'data kartu publik: saldo 15rb');

    // Kas: tag Saldo pada transaksi titipan
    await p.goto(B + '#/kas'); await p.waitForSelector('main');
    ok(await p.$('a.tag[href="#/saldo"]'), 'Kas: transaksi titipan bertag Saldo');

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
