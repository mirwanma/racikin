// E2E Racikin (jadwal.js): jadwal shift dengan data contoh, tanpa akun. Template default & custom, kuas, isi cepat
// (pola bergilir + libur), mingguan/bulanan, salin minggu lalu, label jadwal di absen + telat dari jam shift,
// Beranda "hari ini masuk", kirim WA, "Jadwal saya" untuk kasir (disimulasikan).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
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
    const p = await (await b.newContext({ viewport: vp, acceptDownloads: true })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
    await p.goto(B + '#/karyawan'); await p.click('[data-action=nyala]'); await p.waitForSelector('form[data-form=karyawan]');
    for (const nama of ['Ujang', 'Siti']) {
      if (!(await p.$('form[data-form=karyawan]'))) await p.click('[data-action=edit][data-id=baru]');
      await p.fill('form[data-form=karyawan] input[name=nama]', nama); await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(120);
    }
    let s = await st(p);
    const ujang = s.karyawan.find((k) => k.nama === 'Ujang'), siti = s.karyawan.find((k) => k.nama === 'Siti');
    // Hubungkan Ujang ke akun kasir (disuntik: shift atas nama akun-u)
    await p.evaluate((id) => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.karyawan = x.karyawan.map((k) => (k.id === id ? { ...k, akunId: 'akun-u' } : k)); localStorage.setItem('racikin:v1', JSON.stringify(x)); }, ujang.id);
    await p.reload(); await p.goto(B + '#/karyawan?tab=jadwal'); await p.waitForSelector('.jadwal-grid');

    // Template default
    ok((await txt(p, '.jg-kuas')).includes('Pagi 07:00–15:00') && (await txt(p, '.jg-kuas')).includes('Malam'), 'template default Pagi/Siang/Malam');
    // Tambah shift custom
    await p.click('details:has(form[data-form=shiftBaru]) summary');
    await p.fill('form[data-form=shiftBaru] input[name=nama]', 'Middle'); await p.fill('form[data-form=shiftBaru] input[name=mulai]', '09:00'); await p.fill('form[data-form=shiftBaru] input[name=selesai]', '17:00');
    await p.click('form[data-form=shiftBaru] button'); await p.waitForTimeout(150);
    s = await st(p);
    const middle = s.jadwal.shift.find((x) => x.nama === 'Middle');
    ok(middle && s.jadwal.shift.length === 4, 'shift custom Middle ditambah');

    // Kuas: Ujang hari ini Pagi
    const today = iso(new Date());
    await p.click('[data-action=kuas][data-v=pagi]');
    await p.click(`[data-action=sel][data-t="${today}"][data-k="${ujang.id}"]`); await p.waitForTimeout(120);
    s = await st(p);
    ok(s.jadwal.hari[today]?.[ujang.id] === 'pagi', 'kuas: Ujang hari ini Pagi');

    // Isi cepat: Siti bergilir Siang/Middle, libur Minggu (default)
    await p.click('details:has(form[data-form=pola]) summary');
    const chip = (sel) => p.click(`form[data-form=pola] label.chip:has(${sel})`);
    await chip(`input[name=k][value="${ujang.id}"]`);
    await chip('input[name=sh][value=pagi]');
    await chip('input[name=sh][value=siang]'); await chip(`input[name=sh][value="${middle.id}"]`);
    await p.click('form[data-form=pola] button.primary'); await p.waitForTimeout(150);
    s = await st(p);
    const minggu = Object.keys(s.jadwal.hari).filter((t) => s.jadwal.hari[t][siti.id]);
    const minggunya = minggu.find((t) => new Date(t + 'T00:00:00').getDay() === 0);
    ok(minggu.length === 7 && s.jadwal.hari[minggunya][siti.id] === 'libur' && s.jadwal.hari[today][ujang.id] === 'pagi', 'pola: Siti 7 hari, Minggu libur, Ujang nggak ketimpa');
    await p.screenshot({ path: `${OUT}/jadwal-minggu-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Minggu depan: salin minggu lalu
    await p.click('[data-action=jGeser][data-d="1"]'); await p.waitForTimeout(100);
    await p.click('details:has(form[data-form=pola]) summary');
    await p.click('[data-action=salinJadwal]'); await p.waitForTimeout(150);
    s = await st(p);
    const hariIsi = Object.keys(s.jadwal.hari);
    ok(hariIsi.length === 14 && hariIsi.filter((t) => s.jadwal.hari[t][siti.id]).length === 14, 'salin minggu lalu ke minggu depan (2 minggu terisi)');

    // Bulanan
    await p.click('label:has(input[data-change=jMode][value=bulan])'); await p.waitForTimeout(150);
    const kolom = await p.$$eval('.jadwal-grid thead th', (a) => a.length - 1);
    ok(kolom >= 28, `tampilan bulanan ${kolom} hari`);
    await p.screenshot({ path: `${OUT}/jadwal-bulan-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'bulanan di HP: geser di dalam tabel, halaman nggak melebar');

    // Ekspor Excel (bulanan) -> baca balik pakai SheetJS
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=excelJadwal]')]);
    const ctxX = {}; ctxX.window = ctxX; vm.createContext(ctxX);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctxX);
    const wbX = ctxX.XLSX.read(fs.readFileSync(await dl.path()), { type: 'buffer' });
    const aoaX = ctxX.XLSX.utils.sheet_to_json(wbX.Sheets.Jadwal, { header: 1, defval: '' });
    const barisSiti = aoaX.find((r) => r[0] === 'Siti');
    ok(dl.suggestedFilename().endsWith('.xlsx') && aoaX[3][0] === 'Nama' && aoaX[3].length >= 32 && barisSiti.includes('Siang') && barisSiti.includes('Libur'), `Excel: ${aoaX[3].length - 4} hari, isi shift Siti`);
    ok(aoaX.some((r) => r[0] === 'Middle' && r[1] === '09:00'), 'Excel: keterangan jam shift');

    // Cetak / PDF: cuma lembar jadwal yang tampil waktu print
    await p.evaluate(() => { window.print = () => {}; });
    await p.click('[data-action=cetakJadwal]');
    await p.emulateMedia({ media: 'print' });
    ok(await p.isVisible('.jadwal-cetak') && !(await p.isVisible('.jg-kuas')) && !(await p.isVisible('.tabbar')), 'print: cuma lembar jadwal');
    if (!hp) await p.pdf({ path: `${OUT}/jadwal-bulan.pdf`, preferCSSPageSize: true, printBackground: true });
    await p.emulateMedia({ media: 'screen' });
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(!(await p.isVisible('.jadwal-cetak')) && !(await p.$('#cetak-jadwal-page')), 'selesai cetak: lembar & gaya cetak dibersihkan');

    // Kirim WA
    ok(decodeURIComponent(await p.getAttribute('a.chip-btn[href*="wa.me"]', 'href')).includes('Jadwal kerja'), 'kirim jadwal lewat WA');

    // Absen: label jadwal + telat dari jam shift (Pagi 07:00, masuk 07:30 -> telat; jam masuk umum 08:00 nggak)
    await p.click('label:has(input[data-change=tab][value=absen])'); await p.waitForSelector('.absen-row');
    ok((await txt(p, `.absen-row[data-id="${ujang.id}"]`)).includes('Pagi 07:00–15:00'), 'absen: label jadwal');
    await p.click(`[data-action=status][data-id="${ujang.id}"][data-v=hadir]`); await p.waitForSelector(`.absen-row[data-id="${ujang.id}"] input[data-f=masuk]`);
    await p.fill(`.absen-row[data-id="${ujang.id}"] input[data-f=masuk]`, '07:30'); await p.dispatchEvent(`.absen-row[data-id="${ujang.id}"] input[data-f=masuk]`, 'change'); await p.waitForTimeout(150);
    ok((await txt(p, `.absen-row[data-id="${ujang.id}"]`)).includes('telat'), 'telat dihitung dari jam mulai shift');

    // Beranda
    await p.goto(B + '#/'); await p.waitForSelector('.journey');
    ok((await txt(p, 'a[href="#/karyawan?tab=jadwal"].pajak-mini')).includes('Ujang (Pagi)'), 'Beranda: hari ini masuk');

    // Kasir (disimulasikan): Jadwal saya
    await p.evaluate(async () => { const m = await import('./js/cloud.js'); m.cloud.user = { id: 'akun-u' }; m.cloud.team = { ownerId: 'x', role: 'kasir', nama: 'Ujang', bisnis: '', anggota: 0 }; location.hash = '#/jadwal'; });
    await p.waitForSelector('text=Minggu ini');
    ok((await txt(p, 'main')).includes('Hari ini: Pagi 07:00–15:00'), 'kasir: Jadwal saya');
    await p.screenshot({ path: `${OUT}/jadwal-saya-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.evaluate(async () => { const m = await import('./js/cloud.js'); m.cloud.user = null; m.cloud.team = null; });

    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
