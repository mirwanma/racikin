// E2E Racikin (bill.js): open bill di Kasir. Aktifkan, simpan keranjang ke bill, transaksi lain tetap jalan,
// nambah ronde, batalkan item, bayar campuran (tunai + QRIS), Kas & stok konsisten, peringatan tutup shift, tablet.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet .opsi-btn')) await p.click('.sheet [data-action=pilihTambah]'); };
const logTotal = (s, nama) => { const id = s.bahan.find((x) => x.nama === nama).id; return s.stokLog.filter((l) => l.bahanId === id).reduce((a, l) => a + l.delta, 0); };
const stok = (s, nama) => s.bahan.find((x) => x.nama === nama).stok;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const jawab = []; // jawaban prompt/confirm berurutan
  p.on('dialog', (d) => { const j = jawab.shift(); if (j === false) d.dismiss(); else d.accept(typeof j === 'string' ? j : undefined); });
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); localStorage.setItem('racikin:v1', JSON.stringify(x)); }); await p.reload(); await p.waitForSelector('.journey'); // promo mati (biar total nggak tergantung hari/jam)

  // --- Aktifkan open bill (default nonaktif)
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  ok(!(await p.$('[data-action=billSimpanBuka]')), 'default: belum ada tombol simpan ke bill');
  await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('[data-action=billNyala]');
  await p.click('[data-action=billNyala]'); await p.waitForSelector('form[data-form=billBaru]');
  ok((await st(p)).posSetting.openBill === true, 'open bill aktif');

  // --- Jual: keranjang -> Simpan ke bill (bill baru "Meja 3")
  let s = await st(p);
  const tahu0 = stok(s, 'Tahu putih'), kas0 = s.transactions.length, nOrder0 = s.orders.length;
  await p.click('input[data-change=tab][value=jual]'); await p.waitForSelector('.pos-grid');
  await pos(p, 'Tahu Guyur Original'); await pos(p, 'Tahu Guyur Original'); await pos(p, 'Es Teh Manis');
  await p.click('[data-action=checkout]'); await p.waitForSelector('[data-action=billSimpanBuka]');
  await p.click('[data-action=billSimpanBuka]'); await p.waitForSelector('.sheet form[data-form=billBaru]');
  await p.fill('.sheet form[data-form=billBaru] input[name=nama]', 'Meja 3'); await p.click('.sheet form[data-form=billBaru] button');
  await p.waitForSelector('.bill-card');
  s = await st(p);
  const bill = s.bills.find((x) => x.nama === 'Meja 3');
  ok(bill && bill.ronde.length === 1 && bill.ronde[0].items.length === 2, 'bill Meja 3 dibuat dengan ronde 1');
  ok(stok(s, 'Tahu putih') < tahu0, 'stok dipotong waktu ronde dikirim');
  ok(s.orders.length === nOrder0 && s.transactions.length === kas0, 'belum jadi order & belum masuk Kas');
  ok((await txt(p, 'input[data-change=tab][value=bill] + span')).includes('1'), 'tab Bill menampilkan jumlah bill');
  await p.screenshot({ path: OUT + '/b1-bill.png', fullPage: true });

  // --- Transaksi lain tetap jalan (bayar langsung)
  await p.click('input[data-change=tab][value=jual]'); await p.waitForSelector('.pos-grid');
  await pos(p, 'Air Mineral');
  await p.click('[data-action=checkout]'); await p.waitForSelector('[data-action=selesai]');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  ok(s.orders.length === nOrder0 + 1 && s.bills.filter((x) => x.status !== 'batal').length === 1, 'pembeli lain bayar langsung, bill Meja 3 tetap utuh');

  // --- Nambah pesanan ke bill (ronde 2)
  await p.click('[data-action=baru]');
  await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('[data-action=billTambahMulai]');
  await p.click(`[data-action=billTambahMulai][data-id="${bill.id}"]`); await p.waitForSelector('.bill-banner');
  ok((await txt(p, '.bill-banner')).includes('Meja 3'), 'banner: lagi nambah ke Meja 3');
  await pos(p, 'Es Teh Manis'); await pos(p, 'Es Teh Manis');
  await p.click('[data-action=checkout]'); await p.waitForSelector('[data-action=billKirim]');
  ok(!(await p.$('[data-action=selesai]')), 'mode nambah: nggak ada tombol bayar');
  await p.click('[data-action=billKirim]'); await p.waitForSelector('.bill-detail');
  s = await st(p);
  let bb = s.bills.find((x) => x.id === bill.id);
  ok(bb.ronde.length === 2, 'ronde 2 tersimpan');
  ok((await p.$$eval('.bill-ronde', (a) => a.length)) === 2, 'detail bill menampilkan 2 ronde');

  // --- Batalkan 1 item (pemilik): alasan + kembalikan stok
  const sebelum = stok(s, 'Teh celup');
  jawab.push('2', 'Salah input', true); // batalkan berapa (2 dari 2), alasan, stok kembali
  await p.click('.bill-ronde:nth-of-type(2) [data-action=billHapusItem]'); await p.waitForTimeout(300);
  s = await st(p);
  bb = s.bills.find((x) => x.id === bill.id);
  ok(bb.hapus.length === 1 && bb.hapus[0].alasan === 'Salah input' && stok(s, 'Teh celup') > sebelum, 'item dibatalkan + stok kembali');
  await p.screenshot({ path: OUT + '/b2-detail.png', fullPage: true });

  // --- Bayar bill: campuran tunai + QRIS
  const totalBill = bb.ronde.flatMap((r) => r.items).reduce((a, i) => a + i.harga * i.qty, 0);
  await p.click(`[data-action=billBayar][data-id="${bill.id}"]`); await p.waitForSelector('.bill-bayar');
  ok(!(await p.$('.pos-line .stepper')), 'isi bill nggak bisa diubah waktu bayar');
  await p.click('label.chip:has(input[data-change=metode][value=qris])');
  await p.check('input[data-change=campur]'); await p.waitForSelector('[data-change=tunaiSebagian]');
  ok(await p.isDisabled('[data-action=selesai]'), 'campuran: wajib isi bagian tunai');
  await p.fill('[data-change=tunaiSebagian]', '10000'); await p.press('[data-change=tunaiSebagian]', 'Tab'); await p.waitForTimeout(150);
  ok((await txt(p, '[data-action=selesai]')).includes('Lunasi bill'), 'tombol: Lunasi bill');
  await p.screenshot({ path: OUT + '/b3-bayar.png', fullPage: true });
  await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  const o = s.orders[s.orders.length - 1];
  ok(o.total === totalBill && o.metode === 'campur' && o.pembayaran[0].jumlah === 10000 && o.bill?.nama === 'Meja 3', `order bill: ${o.total} campuran tunai 10rb + QRIS`);
  ok(!s.bills.some((x) => x.id === bill.id), 'bill hilang dari daftar setelah dibayar');
  ok((await txt(p, '.struk')).includes('QRIS'), 'struk menampilkan pembayaran campuran');
  ok(['Tahu putih', 'Teh celup'].every((n) => Math.abs(logTotal(s, n) - stok(s, n)) < 0.01), 'stok = total stokLog (nggak dipotong dua kali)');
  const t = o.tanggal;
  const kasHari = s.transactions.filter((x) => x.ref === 'pos' && x.tanggal === t && x.jenis === 'masuk').reduce((a, x) => a + x.nominal, 0);
  ok(kasHari === s.posHarian[t].omzet, 'Kas = rekap kasir hari ini');

  // --- Bill dibiarkan buka -> peringatan di tutup shift
  await p.click('[data-action=baru]');
  await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('form[data-form=billBaru]');
  await p.fill('form[data-form=billBaru] input[name=nama]', 'Budi'); await p.click('form[data-form=billBaru] button');
  await p.waitForSelector('.bill-banner'); await pos(p, 'Tahu Guyur Original');
  await p.click('[data-action=checkout]'); await p.click('[data-action=billKirim]'); await p.waitForSelector('.bill-card');
  await p.goto(B + '#/shift'); await p.waitForTimeout(400);
  if (await p.$('form[data-form=buka]')) { await p.fill('form[data-form=buka] input[name=modal]', '100000').catch(() => {}); await p.click('form[data-form=buka] button.primary').catch(() => {}); await p.waitForTimeout(400); }
  const shiftTxt = await txt(p, '.view');
  ok(/1 bill belum dibayar.*Budi/.test(shiftTxt), 'tutup shift: peringatan bill belum dibayar');

  // --- Batalkan bill (pemilik)
  await p.goto(B + '#/kasir'); await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('.bill-card');
  if (!(await p.$('.bill-detail'))) await p.click('.bill-card .bill-head');
  jawab.push('Pembeli pergi', false);
  await p.click('[data-action=billBatal]'); await p.waitForTimeout(300);
  s = await st(p);
  ok(s.bills.find((x) => x.nama === 'Budi')?.status === 'batal' && !(await p.$('.bill-card')), 'bill dibatalkan (tersimpan sebagai riwayat)');

  // --- Tablet: dua panel, tab Bill
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(300);
  await p.click('input[data-change=tab][value=jual]'); await p.waitForSelector('.pos-split');
  await pos(p, 'Es Teh Manis');
  ok(await p.isVisible('[data-action=billSimpanBuka]'), 'tablet: tombol simpan ke bill di panel kanan');
  await p.screenshot({ path: OUT + '/b4-tablet.png' });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'tidak ada scroll ke samping');

  console.log('errors:', errs);
  ok(!errs.length, 'tanpa error');
  await b.close();
})();
