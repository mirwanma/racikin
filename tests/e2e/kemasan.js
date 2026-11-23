// E2E Racikin (kemasan.js): isi per kemasan beli (dus / tray / kotak) di bahan, dengan data contoh, tanpa akun.
// Cek: tampil di baris bahan (harga per dus & stok ≈ dus), form beli punya tombol "1 dus" dst, tambah bahan baru dengan
// kemasan, edit kemasan, kosongkan = hapus, daftar belanja menyebut dus.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
    let s = await st(p);
    const air = s.bahan.find((x) => x.nama.startsWith('Air mineral'));

    await p.goto(B + '#/stok?tab=bahan'); await p.waitForSelector('.bahan');
    const row = `.bahan:has(b:text-is("${air.nama}"))`;
    const t = await txt(p, row);
    ok(t.includes('1 dus = 24 pcs') && t.includes('Rp 60.000'), 'baris bahan: 1 dus = 24 pcs + harga per dus');
    // Beli: tombol 2 dus mengisi 48
    await p.click(`${row} [data-action=open][data-type=beli]`); await p.waitForSelector(`form[data-form=beli][data-id="${air.id}"]`);
    ok((await txt(p, `form[data-form=beli][data-id="${air.id}"]`)).includes('1 dus = 24 pcs'), 'form beli: keterangan kemasan');
    await p.click(`[data-action=isiKemasan][data-id="${air.id}"]:has-text("2 dus")`);
    ok((await p.inputValue(`form[data-form=beli][data-id="${air.id}"] input[name=qty]`)) === '48', 'tombol 2 dus = 48 pcs');
    await p.click(`form[data-form=beli][data-id="${air.id}"] button.primary`); await p.waitForTimeout(200);
    s = await st(p);
    ok(s.bahan.find((x) => x.id === air.id).stok === air.stok + 48, 'stok bertambah 48');
    await p.screenshot({ path: `${OUT}/kemasan-stok-${hp ? 'hp' : 'lebar'}.png`, fullPage: false });

    // Edit kemasan: 12 per pak, lalu kosongkan
    await p.click(`${row} [data-action=open][data-type=edit]`); await p.waitForSelector(`form[data-form=edit][data-id="${air.id}"]`);
    await p.fill(`form[data-form=edit][data-id="${air.id}"] input[name=pack]`, '12');
    await p.fill(`form[data-form=edit][data-id="${air.id}"] input[name=packNama]`, 'pak');
    await p.click(`form[data-form=edit][data-id="${air.id}"] button.primary`); await p.waitForTimeout(200);
    s = await st(p);
    ok(s.bahan.find((x) => x.id === air.id).pack === 12 && s.bahan.find((x) => x.id === air.id).packNama === 'pak', 'edit: 1 pak = 12');
    ok((await txt(p, row)).includes('1 pak = 12 pcs'), 'baris bahan ikut berubah');
    await p.click(`${row} [data-action=open][data-type=edit]`); await p.waitForSelector(`form[data-form=edit][data-id="${air.id}"]`);
    await p.fill(`form[data-form=edit][data-id="${air.id}"] input[name=pack]`, '');
    await p.click(`form[data-form=edit][data-id="${air.id}"] button.primary`); await p.waitForTimeout(200);
    s = await st(p);
    ok(!('pack' in s.bahan.find((x) => x.id === air.id)) && !(await txt(p, row)).includes(' = '), 'dikosongkan: kemasan hilang');

    // Tambah bahan baru dengan kemasan
    await p.click('details.card:has(form[data-form=addBahan]) summary');
    await p.fill('form[data-form=addBahan] input[name=nama]', 'Teh botol 350 ml');
    await p.selectOption('form[data-form=addBahan] select[name=satuan]', 'pcs');
    await p.fill('form[data-form=addBahan] input[name=harga]', '3500');
    await p.fill('form[data-form=addBahan] input[name=stok]', '36');
    await p.fill('form[data-form=addBahan] input[name=pack]', '12');
    await p.fill('form[data-form=addBahan] input[name=packNama]', 'krat');
    await p.click('form[data-form=addBahan] button.primary'); await p.waitForTimeout(200);
    s = await st(p);
    const tb = s.bahan.find((x) => x.nama === 'Teh botol 350 ml');
    ok(tb && tb.pack === 12 && tb.packNama === 'krat' && tb.stok === 36, 'bahan baru dengan kemasan');
    ok((await txt(p, `.bahan:has(b:text-is("Teh botol 350 ml"))`)).includes('≈ 3 krat'), 'stok ≈ 3 krat');

    // Daftar belanja: telur per tray
    await p.goto(B + '#/belanja'); await p.waitForTimeout(500);
    const bel = await txt(p, 'main');
    console.log('belanja menyebut kemasan:', /tray|kotak|dus/.test(bel));
    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
