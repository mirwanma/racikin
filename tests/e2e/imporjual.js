// E2E Racikin (imporjual.js): impor riwayat penjualan dari file CSV & tempel dari spreadsheet, ringkasan, simpan, batalkan.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const iso = (d) => d.toISOString().slice(0, 10);
const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

(async () => {
  // CSV ala aplikasi kasir lain: 35 hari ke belakang (sampai kemarin), 3 menu, toko + GoFood
  const baris = ['Tanggal;No Order;Nama Produk;Qty;Harga;Total;Tipe Pesanan'];
  for (let i = 35; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    for (let k = 0; k < 6; k++) {
      const no = `${iso(d)}-${k}`;
      baris.push(`${dmy(d)} 1${k}:00;${no};Bakso Urat;2;15.000;30.000;${k === 5 ? 'GoFood' : 'Dine In'}`);
      if (k % 2 === 0) baris.push(`${dmy(d)} 1${k}:00;${no};Es Teh Manis;1;4.000;4.000;Dine In`);
    }
  }
  const file = path.join(OUT, 'penjualan-lama.csv');
  fs.writeFileSync(file, baris.join('\n'));

  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B);
  await p.evaluate(() => localStorage.setItem('racikin:v1', JSON.stringify({ profile: { tahap: 'jalan', owner: 'Bu Sari', nama: 'Bakso Bu Sari', ide: 'warung', jenis: 'Makanan berat', kota: 'Bandung', target: [], skill: [], karyawan: 0, saluran: ['Jualan langsung', 'GoFood'], masalah: ['sepi'] }, resep: [{ id: 'r1', nama: 'Bakso Urat', harga: 15000, hasil: 1, items: [] }] })));
  await p.evaluate(() => history.replaceState(null, '', '#/sehat')); await p.reload(); await p.waitForSelector('.sehat-head');
  ok((await txt(p, '.sehat-cek:has-text("Tren omzet")')).includes('Impor'), 'cek kesehatan: tren kosong menyarankan impor');
  await p.click('.sehat-cek:has-text("Tren omzet") a'); await p.waitForSelector('input[data-change=file]', { state: 'attached' });
  ok(p.url().includes('#/impor-jual'), 'link ke halaman impor');

  // Unduh contoh
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=contoh]')]);
  ok(dl.suggestedFilename() === 'contoh-impor-penjualan.csv', 'contoh CSV bisa diunduh');

  // Upload file
  await p.setInputFiles('input[data-change=file]', file); await p.waitForSelector('.kolom-map');
  const map = await p.$$eval('.kolom-map select', (a) => a.map((s) => s.dataset.p + '=' + s.selectedOptions[0].textContent));
  console.log('kolom:', map.join(' | '));
  ok(map.includes('tanggal=Tanggal') && map.includes('menu=Nama Produk') && map.includes('total=Total') && map.includes('saluran=Tipe Pesanan') && map.includes('order=No Order'), 'kolom ditebak otomatis');
  await p.screenshot({ path: OUT + '/j1-kolom.png', fullPage: true });
  await p.click('[data-action=olah]'); await p.waitForSelector('[data-action=simpan]');
  console.log('ringkasan:', (await txt(p, 'section.card')).slice(0, 260));
  ok((await txt(p, '.stats3')).includes('35'), '35 hari terbaca');
  await p.screenshot({ path: OUT + '/j2-ringkasan.png', fullPage: true });
  await p.click('[data-action=simpan]'); await p.waitForSelector('text=hari penjualan masuk');
  let s = await st(p);
  const hari = Object.keys(s.posHarian).length;
  const omzet = Object.values(s.posHarian).reduce((a, r) => a + r.omzet, 0);
  ok(hari === 35 && omzet === 35 * (6 * 30000 + 3 * 4000), `rekap ${hari} hari, omzet ${omzet}`);
  ok(Object.values(s.posHarian)[0].order === 6 && Object.values(s.posHarian)[0].items['Bakso Urat'] === 12, 'order unik & porsi per menu');
  ok(s.resep.some((r) => r.nama === 'Es Teh Manis' && r.harga === 4000), 'menu baru ditambahkan dengan harga rata-rata');
  const kasMasuk = s.transactions.filter((t) => t.ref === 'impor' && t.jenis === 'masuk').reduce((a, t) => a + t.nominal, 0);
  ok(kasMasuk === omzet && s.transactions.some((t) => t.kategori === 'Komisi Order Online'), 'Kas: penjualan per saluran + komisi GoFood');
  await p.screenshot({ path: OUT + '/j3-selesai.png', fullPage: true });

  // Cek kesehatan langsung pakai data impor
  await p.click('a[href="#/sehat"]'); await p.waitForSelector('.sehat-head');
  const tren = await txt(p, '.sehat-cek:has-text("Tren omzet")');
  console.log('tren:', tren.slice(0, 120));
  ok(!tren.includes('Belum cukup data'), 'tren omzet terbaca dari data impor');

  // Tempel dari spreadsheet (tab) -> hari yang sama dilewati
  await p.goto(B + '#/impor-jual'); await p.waitForSelector('textarea[data-change=text]');
  await p.fill('textarea[data-change=text]', baris.slice(0, 20).join('\n').replace(/;/g, '\t')); await p.press('textarea[data-change=text]', 'Tab');
  await p.click('[data-action=bacaTeks]'); await p.waitForSelector('.kolom-map'); await p.click('[data-action=olah]'); await p.waitForSelector('text=dilewati');
  ok(!(await p.$('[data-action=simpan]')), 'impor ulang hari yang sama: semua dilewati, tidak bisa disimpan');

  // Batalkan
  await p.click('[data-action=ulang]'); await p.waitForSelector('.impor-batch');
  await p.click('.impor-batch [data-action=batal]'); await p.waitForTimeout(300);
  s = await st(p);
  ok(Object.keys(s.posHarian).length === 0 && !s.transactions.some((t) => t.ref === 'impor') && s.imporJual.length === 0, 'impor dibatalkan bersih');

  console.log('errors:', errs);
  await b.close();
})();
