// E2E Racikin (thr.js): lembur otomatis dari jam masuk-pulang, THR (masa kerja, H-7, pengingat Beranda, bayar -> Kas),
// unduh rekap gaji & THR (CSV). Data contoh, tanpa akun.
const { chromium } = require('playwright');
const fs = require('fs');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const geser = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) {
    const hp = vp.width < 900;
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    p.on('dialog', (d) => d.accept());
    await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
    await p.goto(B + '#/karyawan'); await p.click('[data-action=nyala]'); await p.waitForSelector('form[data-form=karyawan]');

    // Karyawan harian 80rb + lembur tarif tetap 10rb/jam, mulai kerja 5 bulan lalu
    await p.fill('form[data-form=karyawan] input[name=nama]', 'Ujang');
    await p.fill('form[data-form=karyawan] input[name=nominal]', '80000');
    await p.selectOption('form[data-form=karyawan] select[name=lembur]', 'tetap');
    await p.fill('form[data-form=karyawan] input[name=tarifLembur]', '10000');
    const mulai = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5); return iso(d); })();
    await p.fill('form[data-form=karyawan] input[name=mulai]', mulai);
    await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(150);
    let s = await st(p);
    const ujang = s.karyawan[0];
    ok(ujang.gaji.lembur === 'tetap' && ujang.gaji.tarifLembur === 10000 && ujang.mulai === mulai, 'setelan lembur & mulai kerja tersimpan');

    // Absen minggu lalu: Senin 08:00-19:30 (3 jam lembur), Selasa 08:00-16:00
    const now = new Date(); const senin = new Date(now); senin.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7);
    const sel = new Date(senin); sel.setDate(senin.getDate() + 1);
    await p.evaluate(([id, a, b2]) => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.absen[a] = { [id]: { status: 'hadir', masuk: '08:00', pulang: '19:30', sumber: 'manual' } }; x.absen[b2] = { [id]: { status: 'hadir', masuk: '08:00', pulang: '16:00', sumber: 'manual' } }; localStorage.setItem('racikin:v1', JSON.stringify(x)); }, [ujang.id, iso(senin), iso(sel)]);
    await p.reload(); await p.goto(B + '#/karyawan?tab=gaji'); await p.waitForSelector('[data-action=bukaBayar]');
    await p.click(`[data-action=bukaBayar][data-id="${ujang.id}"]`); await p.waitForSelector('form[data-form=bayarGaji]');
    ok((await txt(p, 'form[data-form=bayarGaji]')).includes('Lembur 3 jam'), 'lembur 3 jam dihitung dari absen');
    await p.click('form[data-form=bayarGaji] button.primary'); await p.waitForSelector('.gaji-card.lunas');
    s = await st(p);
    ok(s.gajian[0].rincian.lembur === 30000 && s.gajian[0].kotor === 190000, 'gaji: 2 × 80rb + lembur 30rb = 190rb');

    // THR: hari raya 20 hari lagi
    const hr = geser(20);
    await p.fill('input[data-change=hariRaya]', hr); await p.dispatchEvent('input[data-change=hariRaya]', 'change'); await p.waitForSelector('.thr-row');
    ok((await txt(p, '.thr-row')).includes('masa kerja 5 bulan'), 'THR: masa kerja 5 bulan');
    const nominal = Number(await p.inputValue('form[data-form=thr] input[name=nominal]'));
    console.log('THR proporsional:', nominal);
    ok(nominal > 0 && nominal < 80000 * 26, 'THR proporsional terisi');
    ok((await txt(p, '.thr-row')).includes('bisa kekecilan'), 'peringatan: riwayat gaji belum cukup');
    await p.goto(B + '#/'); await p.waitForSelector('.journey');
    ok((await txt(p, 'a[href="#/karyawan?tab=gaji"].pajak-mini')).includes('THR'), 'Beranda: pengingat THR');
    await p.goto(B + '#/karyawan?tab=gaji'); await p.waitForSelector('form[data-form=thr]');
    await p.screenshot({ path: `${OUT}/thr-${hp ? 'hp' : 'lebar'}.png`, fullPage: true });
    await p.click('form[data-form=thr] button'); await p.waitForTimeout(200);
    s = await st(p);
    ok(s.thr[0]?.nominal === nominal && s.transactions.some((t) => t.kategori === 'THR' && t.nominal === nominal), 'THR dibayar: Kas keluar kategori THR');
    ok((await txt(p, '.thr-row')).includes('Dibayar'), 'status THR dibayar');

    // CSV
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=csvGaji]')]);
    const isi = fs.readFileSync(await dl.path(), 'utf8');
    ok(isi.split('\n').length === 3 && isi.includes('"THR"') && isi.includes('"190000"'), 'CSV rekap: 1 gaji + 1 THR');

    // Pemilik: toggle izin manajer ada. Manajer (disimulasikan): form gaji terkunci sampai diizinkan.
    await p.goto(B + '#/karyawan'); await p.click('label:has(input[data-change=tab][value=orang])'); await p.waitForSelector('input[data-change=manajerAtur]');
    ok(!(await p.isChecked('input[data-change=manajerAtur]')), 'pemilik: izin manajer default mati');
    const jadi = (peran) => p.evaluate(async (r) => { const m = await import('./js/cloud.js'); m.cloud.team = r ? { ownerId: 'x', role: r, nama: 'Tes', bisnis: '', anggota: 0 } : null; location.hash = '#/bisnis'; await new Promise((ok) => setTimeout(ok, 50)); location.hash = '#/karyawan'; }, peran);
    await jadi('manajer'); await p.click('label:has(input[data-change=tab][value=orang])'); await p.click(`[data-action=edit][data-id="${ujang.id}"]`); await p.waitForSelector('fieldset.gaji-set');
    ok(await p.$eval('fieldset.gaji-set', (f) => f.disabled) && !(await p.$('input[data-change=manajerAtur]')) && (await p.isDisabled('input[data-change=jamKerja]')), 'manajer tanpa izin: gaji & lembur terkunci');
    await p.fill('form[data-form=karyawan] input[name=nama]', 'Ujang S'); await p.click('form[data-form=karyawan] button.primary'); await p.waitForTimeout(150);
    s = await st(p);
    ok(s.karyawan[0].nama === 'Ujang S' && s.karyawan[0].gaji.nominal === 80000 && s.karyawan[0].gaji.lembur === 'tetap', 'manajer boleh ubah data lain, gaji tetap');
    await jadi(null); await p.click('label:has(input[data-change=tab][value=orang])'); await p.waitForSelector('input[data-change=manajerAtur]');
    await p.check('input[data-change=manajerAtur]'); await p.waitForTimeout(150);
    await jadi('manajer'); await p.click('label:has(input[data-change=tab][value=orang])'); await p.click(`[data-action=edit][data-id="${ujang.id}"]`); await p.waitForSelector('fieldset.gaji-set');
    ok(!(await p.$eval('fieldset.gaji-set', (f) => f.disabled)), 'setelah diizinkan pemilik: manajer bisa atur gaji');
    await jadi(null);

    if (hp) ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
    console.log('errors:', errs);
    ok(!errs.length, `tanpa error (${hp ? 'HP' : 'lebar'})`);
    await ctx.close();
  }
  await b.close();
})();
