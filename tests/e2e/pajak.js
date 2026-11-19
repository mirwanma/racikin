// E2E Racikin (pajak.js): halaman Pajak UMKM dengan data contoh. Hitung PPh per bulan dari Kas, ganti bentuk usaha,
// catat bayar (masuk Kas kategori Pajak), batal, pengingat Beranda, modul Bisnis. Tanpa akun.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    const hp = vp.width < 900;
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });

    // Data contoh omzetnya kecil (< 500jt) -> semua bulan bebas. Tambah omzet besar bulan lalu biar kena pajak.
    const today = await p.evaluate(() => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); });
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    const lalu = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    await p.evaluate((lalu) => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.transactions.push({ id: 'besar', tanggal: lalu + '-02', jenis: 'masuk', kategori: 'Katering/pesanan', nominal: 600000000, catatan: 'Katering besar' }); localStorage.setItem('racikin:v1', JSON.stringify(x)); }, lalu);
    await p.reload(); await p.waitForSelector('.journey');
    ok(await p.$('.pajak-mini'), 'Beranda: pengingat PPh bulan lalu');

    await p.goto(B + '#/bisnis'); await p.waitForSelector('a[href="#/pajak"].module');
    ok((await txt(p, 'a[href="#/pajak"].module')).includes('belum dibayar'), 'modul Bisnis: ada tagihan');
    await p.goto(B + '#/pajak'); await p.waitForSelector('.pajak-tabel');
    if (m === 1) { await p.click('[data-action=tahun][data-d="-1"]'); await p.waitForSelector('.pajak-tabel'); }
    let s = await st(p);
    const h = await p.evaluate(async ([th, lalu]) => { const P = await import('./js/pajak.js'); const s = JSON.parse(localStorage.getItem('racikin:v1')); const d = new Date(); const today = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); const h = P.hitungPajak(s, th, today); const hp = P.hitungPajak({ ...s, pajak: { bentuk: 'ptp' } }, th, today); return { omzet: h.omzet, pph: h.pph, pphPt: hp.pph, bulan: h.bulan.find((x) => x.ym === lalu).pph }; }, [Number(lalu.slice(0, 4)), lalu]);
    const { omzet, pph } = h;
    const angka = (t) => Number(t.replace(/\D/g, ''));
    const stats = await p.$$eval('.stats3 b', (a) => a.map((x) => x.title || x.textContent));
    ok(angka(stats[0]) === omzet && angka(stats[1]) === pph, `ringkasan: omzet ${omzet}, PPh ${pph}`);
    ok((await txt(p, '.pajak-bebas')).includes('sudah lewat'), 'batas bebas 500jt sudah lewat');
    await p.screenshot({ path: `${OUT}/pajak-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // PT perorangan: semua omzet kena
    await p.selectOption('select[data-change=bentuk]', 'ptp'); await p.waitForTimeout(150);
    ok(angka((await p.$$eval('.stats3 b', (a) => a.map((x) => x.textContent)))[1]) === h.pphPt && h.pphPt > pph, 'PT perorangan: semua omzet kena');
    ok(!(await p.$('.pajak-bebas')), 'PT perorangan: tanpa batas bebas');
    await p.selectOption('select[data-change=bentuk]', 'lain'); await p.waitForTimeout(150);
    ok(!(await p.$('.pajak-tabel')) && (await txt(p, 'main')).includes('tarif umum'), 'CV/PT biasa: info tarif umum');
    await p.selectOption('select[data-change=bentuk]', 'op'); await p.waitForSelector('.pajak-tabel');

    // Catat bayar bulan lalu
    await p.click(`.pajak-tagih [data-action=bayar]`); await p.waitForSelector('form[data-form=bayar]');
    ok(angka(await p.inputValue('form[data-form=bayar] input[name=nominal]')) === h.bulan, 'form: nominal default = PPh bulan itu');
    await p.fill('form[data-form=bayar] input[name=ntpn]', 'NTPN123456789ABC');
    await p.click('form[data-form=bayar] button.primary'); await p.waitForTimeout(200);
    s = await st(p);
    const kas = s.transactions.find((t) => t.ref === 'pajak');
    ok(s.pajak.bayar[lalu]?.ntpn === 'NTPN123456789ABC' && kas?.nominal === h.bulan && kas.kategori === 'Pajak' && kas.jenis === 'keluar', 'tercatat lunas + Kas keluar kategori Pajak');
    ok((await txt(p, '.pajak-tabel')).includes('Lunas') && !(await p.$('.pajak-tagih')), 'tabel: Lunas, tagihan hilang');
    await p.goto(B + '#/'); await p.waitForSelector('.journey');
    ok(!(await p.$('.pajak-mini')), 'Beranda: pengingat hilang');
    await p.goto(B + '#/kas'); await p.waitForTimeout(300);
    ok((await txt(p, 'main')).includes('Pajak'), 'Kas: muncul pengeluaran Pajak');

    // Batal
    await p.goto(B + '#/pajak'); await p.waitForSelector('.pajak-tabel');
    if (m === 1) { await p.click('[data-action=tahun][data-d="-1"]'); await p.waitForSelector('.pajak-tabel'); }
    await p.click(`[data-action=batal][data-ym="${lalu}"]`); await p.waitForTimeout(200);
    s = await st(p);
    ok(!s.pajak.bayar[lalu] && !s.transactions.some((t) => t.ref === 'pajak'), 'batal: catatan & Kas terhapus');

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
