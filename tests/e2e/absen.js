// E2E Racikin (absen.js): karyawan & absen dengan data contoh, tanpa akun. Aktifkan, posisi custom, tambah karyawan
// (PIN mesin), absen harian sekali ketuk + jam, "sisanya hadir", impor file mesin absen (Excel .xlsx & log attlog .dat),
// petakan orang belum dikenal, rekap bulan.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pad = (n) => String(n).padStart(2, '0');

// File contoh mesin absen: kemarin (Excel laporan Fingerspot) & 2 hari lalu (attlog ZKTeco).
const hari = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/vendor/xlsx-0.20.3.full.min.js'), 'utf8'), ctx);
const D = (d, h, m) => vm.runInContext(`new Date(${d.getFullYear()}, ${d.getMonth()}, ${d.getDate()}, ${h}, ${m})`, ctx);
const k1 = hari(1), k2 = hari(2);
const ws = ctx.XLSX.utils.aoa_to_sheet([['Laporan Scan Log'], [], ['Tanggal scan', 'Tanggal', 'Jam', 'PIN', 'NIP', 'Nama'], [D(k1, 7, 58), D(k1, 0, 0), '07:58', '1', '', 'Ujang'], [D(k1, 17, 2), D(k1, 0, 0), '17:02', '1', '', 'Ujang'], [D(k1, 8, 25), D(k1, 0, 0), '08:25', '9', '', 'Dewi']], { cellDates: true });
const wb = ctx.XLSX.utils.book_new(); ctx.XLSX.utils.book_append_sheet(wb, ws, 'Log');
const XLSX_FILE = path.join(OUT, 'absen-fingerspot.xlsx');
fs.writeFileSync(XLSX_FILE, ctx.XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const DAT_FILE = path.join(OUT, 'attlog.dat');
fs.writeFileSync(DAT_FILE, `     1\t${iso(k2)} 08:01:10\t1\t0\t1\t0\n     1\t${iso(k2)} 16:30:00\t1\t1\t1\t0\n     5\t${iso(k2)} 07:40:00\t1\t0\t1\t0\n`);

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const p = await (await b.newContext({ viewport: vp })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });

    await p.goto(B + '#/bisnis'); await p.click('a[href="#/karyawan"].module'); await p.waitForSelector('[data-action=nyala]');
    await p.click('[data-action=nyala]'); await p.waitForSelector('form[data-form=karyawan]');

    // Posisi custom
    await p.fill('form[data-form=posisi] input[name=nama]', 'Cuci piring'); await p.click('form[data-form=posisi] button'); await p.waitForTimeout(150);
    let s = await st(p);
    ok(s.absenSetting.posisi.includes('Cuci piring'), 'posisi custom ditambah');
    ok(await p.$('form[data-form=karyawan] select[name=posisi] option:text("Cuci piring")'), 'posisi custom muncul di form');

    // Tambah 2 karyawan
    await p.fill('form[data-form=karyawan] input[name=nama]', 'Ujang'); await p.selectOption('form[data-form=karyawan] select[name=posisi]', 'Cuci piring');
    await p.fill('form[data-form=karyawan] input[name=pin]', '1'); await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(150);
    await p.click('[data-action=edit][data-id=baru]');
    await p.fill('form[data-form=karyawan] input[name=nama]', 'Siti'); await p.selectOption('form[data-form=karyawan] select[name=posisi]', 'Kasir');
    await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(150);
    s = await st(p);
    const ujang = s.karyawan.find((k) => k.nama === 'Ujang'), siti = s.karyawan.find((k) => k.nama === 'Siti');
    ok(ujang?.posisi === 'Cuci piring' && ujang.pin === '1' && siti, '2 karyawan tersimpan');
    await p.screenshot({ path: `${OUT}/absen-karyawan-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Absen hari ini
    await p.click('label:has(input[data-change=tab][value=absen])'); await p.waitForSelector('.absen-row');
    await p.click(`[data-action=status][data-id="${siti.id}"][data-v=hadir]`); await p.waitForSelector(`.absen-row[data-id="${siti.id}"] input[data-f=masuk]`);
    await p.fill(`.absen-row[data-id="${siti.id}"] input[data-f=masuk]`, '08:30'); await p.dispatchEvent(`.absen-row[data-id="${siti.id}"] input[data-f=masuk]`, 'change'); await p.waitForTimeout(150);
    ok((await txt(p, `.absen-row[data-id="${siti.id}"]`)).includes('telat'), 'jam masuk 08:30: telat');
    await p.click('[data-action=semuaHadir]'); await p.waitForTimeout(150);
    s = await st(p);
    const today = Object.keys(s.absen).sort().pop();
    ok(s.absen[today][ujang.id]?.status === 'hadir' && s.absen[today][siti.id]?.masuk === '08:30', 'sisanya hadir');
    await p.click(`[data-action=status][data-id="${ujang.id}"][data-v=sakit]`); await p.waitForTimeout(150);
    s = await st(p);
    ok(s.absen[today][ujang.id].status === 'sakit' && !s.absen[today][ujang.id].masuk, 'ganti jadi sakit');
    await p.screenshot({ path: `${OUT}/absen-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    // Impor Excel
    await p.click('[data-action=imporBuka]'); await p.waitForSelector('input[data-change=file]', { state: 'attached' });
    await p.setInputFiles('input[data-change=file]', XLSX_FILE); await p.waitForSelector('[data-action=imporCek]', { timeout: 15000 });
    ok(await p.evaluate(() => !!window.XLSX), 'pembaca Excel dimuat saat dibutuhkan');
    await p.click('[data-action=imporCek]'); await p.waitForSelector('[data-action=imporSimpan]');
    ok((await txt(p, 'main')).includes('Dewi'), 'orang belum dikenal (Dewi) ditampilkan');
    await p.screenshot({ path: `${OUT}/absen-impor-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('[data-action=imporSimpan]'); await p.waitForSelector('.absen-row');
    s = await st(p);
    const dewi = s.karyawan.find((k) => k.nama === 'Dewi');
    ok(s.absen[iso(k1)]?.[ujang.id]?.masuk === '07:58' && s.absen[iso(k1)][ujang.id].pulang === '17:02' && s.absen[iso(k1)][ujang.id].sumber === 'mesin', 'Excel: Ujang masuk 07:58 pulang 17:02');
    ok(dewi?.pin === '9' && s.absen[iso(k1)][dewi.id]?.masuk === '08:25', 'Excel: Dewi jadi karyawan baru (PIN 9)');

    // Impor attlog .dat: PIN 5 dipetakan ke Siti
    await p.click('[data-action=imporBuka]'); await p.setInputFiles('input[data-change=file]', DAT_FILE); await p.waitForSelector('[data-action=imporCek]');
    await p.click('[data-action=imporCek]'); await p.waitForSelector('select[data-change=petakan]');
    await p.selectOption('select[data-change=petakan]', siti.id);
    await p.click('[data-action=imporSimpan]'); await p.waitForSelector('.absen-row');
    s = await st(p);
    ok(s.absen[iso(k2)]?.[ujang.id]?.pulang === '16:30' && s.absen[iso(k2)]?.[siti.id]?.masuk === '07:40' && s.karyawan.find((k) => k.id === siti.id).pin === '5', 'attlog: Ujang & Siti (PIN 5 tersimpan)');

    // Rekap
    await p.click('label:has(input[data-change=tab][value=rekap])'); await p.waitForSelector('.rekap-absen');
    ok((await txt(p, '.rekap-absen')).includes('Dewi'), 'rekap bulan tampil');
    await p.screenshot({ path: `${OUT}/absen-rekap-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await p.context().close();
  }
  await b.close();
})();
