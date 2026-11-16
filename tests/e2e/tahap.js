// E2E Racikin (tahap.js): onboarding "Udah jalan" vs "Baru ide", langkah Beranda, halaman Bisnis, tawaran naik tahap.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const steps = (p) => p.$$eval('.journey .step', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());

  // --- Onboarding: usaha yang sudah jalan ---
  await p.goto(B); await p.waitForSelector('form[data-form=save]');
  ok(await p.isHidden('[data-only=jalan]'), 'default: bagian "udah jalan" tersembunyi');
  await p.click('label.tahap-opt:has(input[value=jalan])');
  ok(await p.isVisible('text=Kondisi usaha sekarang'), 'pilih Udah jalan -> bagian kondisi usaha muncul');
  ok(await p.isHidden('text=Modal & waktu'), 'bagian modal (khusus ide) disembunyikan');
  await p.fill('input[name=owner]', 'Bu Sari');
  await p.fill('[data-only=jalan] textarea[name=ide]', 'Warung bakso depan pasar, rame pas makan siang');
  await p.fill('[data-only=jalan] input[name=nama]', 'Bakso Bu Sari');
  await p.click('label.chip:has(input[name=jenis][value="Makanan berat"])');
  await p.click('label.chip:has(input[name=konsep][value="Kios / ruko"])');
  await p.fill('input[name=menu]', 'bakso urat, mie ayam, es jeruk');
  await p.fill('input[name=kota]', 'Bandung');
  await p.click('label.chip:has(input[name=lama][value="1–3 tahun"])');
  await p.fill('input[name=omzetHarian]', '1500000'); await p.fill('input[name=karyawan]', '2');
  await p.fill('[data-only=jalan] input[name=harga]', '15000');
  await p.click('label.chip:has(input[name=saluran][value="GoFood"])');
  ok(await p.isHidden('textarea[name=masalahLain]'), 'kolom Lainnya tersembunyi sebelum dicentang');
  await p.click('label.chip:has(input[name=masalah][value=stok])');
  await p.click('label.chip:has(input[name=masalah][value=lain])');
  ok(await p.isVisible('textarea[name=masalahLain]'), 'centang Lainnya -> kolom isian muncul');
  await p.click('label.chip:has(input[name=masalah][value=karyawan])');
  ok(!(await p.isChecked('input[name=masalah][value=karyawan]')), 'masalah maksimal 2 (Lainnya ikut dihitung)');
  await p.fill('textarea[name=masalahLain]', 'Sering kehabisan kuah pas jam makan siang');
  await p.click('label.chip:has(input[name=waktu][value="Full-time"])');
  await p.screenshot({ path: OUT + '/t1-profil-jalan.png', fullPage: true });
  await p.click('form[data-form=save] button.primary'); await p.waitForSelector('.journey');
  let s = await st(p);
  console.log('profil:', JSON.stringify(s.profile));
  ok(s.profile.tahap === 'jalan' && s.profile.karyawan === 2 && s.profile.masalah.join() === 'stok,lain' && s.profile.modal === 0, 'profil "udah jalan" tersimpan');
  ok(s.profile.ide.startsWith('Warung bakso'), 'cerita usaha tersimpan di field ide (konteks AI)');
  ok(s.profile.masalahLain === 'Sering kehabisan kuah pas jam makan siang', 'masalah lain tersimpan');
  ok((await txt(p, '.journey')).includes('Sering kehabisan kuah'), 'masalah lain tampil di baris Fokus');
  console.log('langkah:', await steps(p));
  ok((await txt(p, '.journey h2')) === 'Beresin usahamu', 'judul beranda "Beresin usahamu"');
  const st1 = await steps(p);
  ok(st1[0].includes('Masukin daftar menu') && st1[1].includes('stok awal') && st1[2].includes('saldo') && st1[3].includes('Kasir'), 'urutan: menu, stok (masalah utama didahulukan), saldo, kasir');
  ok(st1.some((x) => x.includes('harga online')), 'jualan di GoFood -> langkah harga online');
  await p.screenshot({ path: OUT + '/t2-beranda-jalan.png', fullPage: true });

  // Halaman Bisnis
  await p.goto(B + '#/bisnis'); await p.waitForSelector('.page-head h1');
  ok((await txt(p, '.page-head h1')) === 'Usahamu', 'halaman Bisnis -> "Usahamu"');
  const mods = await p.$$eval('.module h3', (a) => a.map((x) => x.textContent));
  console.log('modul:', mods.join(' | '));
  ok(mods[0] === 'Cek Kesehatan Usaha' && mods[1] === 'Impor Penjualan Lama' && mods[2] === 'Kasir (POS)' && mods.includes('Rencana renovasi / cabang') && !mods.includes('Analisa ide'), 'operasional dulu, perencanaan jadi alat pengembangan');
  await p.screenshot({ path: OUT + '/t3-bisnis-jalan.png', fullPage: true });

  // Balik ke tahap ide (data "udah jalan" tetap tersimpan)
  await p.goto(B + '#/profil'); await p.waitForSelector('form[data-form=save]');
  ok(await p.isChecked('input[name=tahap][value=jalan]') && (await p.inputValue('input[name=omzetHarian]')) === '1500000', 'edit profil: isian lama terisi');
  await p.click('label.tahap-opt:has(input[value=ide])');
  await p.fill('[data-only=ide] textarea[name=ide]', 'Buka cabang bakso kedua');
  await p.fill('input[name=modal]', '20000000');
  await p.click('form[data-form=save] button.primary'); await p.waitForTimeout(400);
  s = await st(p);
  ok(s.profile.tahap === 'ide' && s.profile.modal === 20000000 && s.profile.karyawan === 2 && !!s.profile.masalahLain, 'pindah ke ide: modal tersimpan, data usaha jalan tetap ada');
  await p.goto(B); await p.waitForSelector('.journey');
  ok((await steps(p))[0].includes('Analisa ide'), 'beranda ide: langkah analisa ide');

  // --- Tawaran naik tahap (data contoh 60 hari jualan, dipaksa ke tahap ide) ---
  await p.evaluate(() => localStorage.clear()); await p.goto(B); await p.waitForSelector('[data-action=dummy]');
  await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  s = await st(p);
  ok(s.profile.tahap === 'jalan', 'data contoh = usaha udah jalan');
  console.log('langkah data contoh:', await steps(p));
  await p.screenshot({ path: OUT + '/t4-beranda-dummy.png', fullPage: true });
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('racikin:v1')); s.profile.tahap = 'ide'; localStorage.setItem('racikin:v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('[data-action=naikTahap]');
  ok(true, 'tawaran naik tahap muncul');
  await p.screenshot({ path: OUT + '/t5-naik.png' });
  await p.click('[data-action=naikTahap]'); await p.waitForSelector('form[data-form=save] .warn-box');
  ok(await p.isChecked('input[name=tahap][value=jalan]'), 'pindah -> profil dibuka di tahap "udah jalan"');

  // Tablet: pilihan tahap berdampingan
  const t = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  await t.goto(B); await t.waitForSelector('.tahap-pilih');
  await t.screenshot({ path: OUT + '/t6-tablet-onboarding.png' });

  console.log('errors:', errs);
  await b.close();
})();
