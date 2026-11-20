// E2E Racikin (pengingat.js): daftar jenis pengingat push per peran di halaman #/notif, tanpa akun & tanpa push
// sungguhan (browser disimulasikan nggak mendukung push, jadi yang tampil daftar "Yang bakal diingatkan").
// Kirim pengingatnya sendiri dites di unit/notif.test.mts; alur nyala/matikan push di notif.js (butuh akun).
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { delete window.PushManager; });
  await p.goto(B); await p.waitForSelector('#view');
  const lihat = async (peran) => {
    await p.evaluate(async (r) => { const m = await import('./js/cloud.js'); m.cloud.user = { id: 'u-tes' }; m.cloud.team = r === 'owner' ? null : { ownerId: 'x', role: r, nama: 'Tes', bisnis: '', anggota: 0 }; location.hash = '#/setelan'; await new Promise((ok) => setTimeout(ok, 50)); location.hash = '#/notif'; }, peran);
    await p.waitForSelector('ul.checks');
    return p.$$eval('ul.checks li b', (a) => a.map((x) => x.textContent));
  };
  const owner = await lihat('owner');
  console.log('pemilik:', owner.join(' | '));
  ok(['Setor pajak UMKM', 'Utang supplier jatuh tempo', 'Kasbon pelanggan lama', 'Gajian & THR', 'Jadwal kerja besok'].every((x) => owner.includes(x)) && owner.length === 9, 'pemilik: 9 jenis termasuk tagihan & jadwal');
  await p.screenshot({ path: `${OUT}/pengingat-pemilik.png`, fullPage: true });
  ok((await lihat('manajer')).length === 9, 'manajer: 9 jenis');
  const kasir = await lihat('kasir');
  ok(kasir.join() === 'Bahan menipis,Rekap tutup kasir,Jadwal kerja besok', 'kasir: stok, rekap, jadwal (tanpa tagihan)');
  const dapur = await lihat('dapur');
  ok(dapur.join() === 'Jadwal kerja besok', 'dapur: cuma jadwal');
  console.log('errors:', errs);
  ok(!errs.length, 'tanpa error');
  await b.close();
})();
