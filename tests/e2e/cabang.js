// E2E Racikin (cabang.js): multi-cabang (paket Max) dengan server Supabase palsu di memori (dokumen & order per cabang,
// my_team dengan daftar cabang, cabang_buat / cabang_ringkasan / cabang_hapus). Penguncian & akses aslinya dites di SQL.
// Cek: tambah cabang (menu disalin, stok 0, Kas kosong), ringkasan gabungan, pindah cabang (data lokal ganti), jualan
// di cabang masuk ke cabang itu saja, kirim menu ke cabang utama (stok utama tetap), balik ke utama, paket Pro terkunci,
// halaman Paket menampilkan kolom Max.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();

const uid = '66666666-6666-6666-6666-666666666666';
let clock = Date.parse('2026-11-21T08:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
// usaha: id -> { nama, utama, doc, rev, orders: Map }
const usaha = new Map([[uid, { nama: '', utama: true, doc: null, rev: 0, orders: new Map(), dibuat: 0 }]]);
let paket = 'max';

async function buka(b, vp = { width: 390, height: 844 }) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addInitScript((u) => {
    if (localStorage.getItem('sb-ujdxslztjcufidhqpmcd-auth-token')) return;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-ujdxslztjcufidhqpmcd-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: u, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' } }));
  }, uid);
  await ctx.route('https://ujdxslztjcufidhqpmcd.supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    const arg = () => JSON.parse(route.request().postData() || '{}');
    const nama = (id, u) => u.nama || u.doc?.profile?.nama || '';
    if (url.includes('/auth/v1/user')) return json({ id: uid, email: 'warung@contoh.id', aud: 'authenticated', role: 'authenticated' });
    if (url.includes('/rpc/my_team')) return json({ owner_id: uid, role: 'owner', anggota: 0, cabang: [...usaha].map(([id, u]) => ({ id, nama: nama(id, u), utama: u.utama, anggota: 0 })) });
    if (url.includes('/rpc/paket_saya')) return json({ paket, sumber: 'bayar', sampai: '2027-12-31T00:00:00Z', harga_bulan: 49000, harga_tahun: 490000, harga_max_bulan: 99000, harga_max_tahun: 990000, wa: '6281211112222', fitur: { cabang: 'max' } });
    if (url.includes('/rpc/is_platform_admin')) return json(false);
    const u = () => usaha.get(arg().p_owner);
    if (url.includes('/rpc/doc_get_v2')) { const x = u(); return json(x?.doc ? { data: x.doc, rev: x.rev, updated_at: new Date(clock).toISOString(), role: 'owner' } : null); }
    if (url.includes('/rpc/doc_save')) {
      const a = arg(); const x = usaha.get(a.p_owner);
      if (!x) return json({ message: 'tidak punya akses', code: '42501' }, 403);
      if (a.p_base_rev !== x.rev) return json({ ok: false, rev: x.rev });
      x.doc = { ...a.p_data }; delete x.doc.orders; x.rev += 1;
      return json({ ok: true, rev: x.rev, updated_at: tick() });
    }
    if (url.includes('/rpc/orders_pull')) {
      const a = arg(); const x = usaha.get(a.p_owner);
      const rows = [...x.orders.values()].filter((r) => !a.p_since || r.updated_at > a.p_since).sort((p, q) => p.updated_at.localeCompare(q.updated_at));
      return json({ rows, now: new Date(clock).toISOString() });
    }
    if (url.includes('/rpc/orders_push')) {
      const a = arg(); const x = usaha.get(a.p_owner);
      for (const o of a.p_orders) x.orders.set(o.id, { data: o, updated_at: tick() });
      return json(a.p_orders.length);
    }
    if (url.includes('/rpc/cabang_buat')) {
      if (paket !== 'max') return json({ message: 'Multi-cabang khusus paket Max. Upgrade dulu di halaman Paket ya.', code: 'P0001' }, 400);
      const id = `cab0000${usaha.size}-0000-0000-0000-000000000000`;
      usaha.set(id, { nama: arg().p_nama, utama: false, doc: null, rev: 0, orders: new Map(), dibuat: usaha.size });
      return json({ id, nama: arg().p_nama });
    }
    if (url.includes('/rpc/cabang_ubah')) { const a = arg(); usaha.get(a.p_id).nama = a.p_nama; return json({ id: a.p_id, nama: a.p_nama }); }
    if (url.includes('/rpc/cabang_hapus')) { const a = arg(); if (usaha.get(a.p_id)?.utama) return json({ message: 'utama', code: 'P0001' }, 400); usaha.delete(a.p_id); return json(true); }
    if (url.includes('/rpc/cabang_ringkasan')) {
      const dari = arg().p_dari;
      return json([...usaha].map(([id, x]) => ({ id, nama: nama(id, x), utama: x.utama, data: x.doc ? {
        profile: x.doc.profile, resep: x.doc.resep, bahan: x.doc.bahan, opsi: x.doc.opsi, kasbon: [],
        posHarian: Object.fromEntries(Object.entries(x.doc.posHarian || {}).filter(([t]) => t >= dari)),
        transactions: (x.doc.transactions || []).filter((t) => t.tanggal >= dari),
      } : null })));
    }
    if (url.includes('/rest/v1/') ) return json([]);
    return json(null);
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
  p.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept(p.ketik || '') : d.accept()));
  return p;
}
const sinkron = (p) => p.evaluate(async () => { const m = await import('./js/cloud.js'); await m.syncNow(); });

(async () => {
  const b = await chromium.launch();
  const p = await buka(b);
  await p.goto(B + '#/profil'); await p.waitForSelector('[data-action=dummy]', { timeout: 20000 });
  await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); x.posSetting = { ...(x.posSetting || {}), wajibShift: false }; localStorage.setItem('racikin:v1', JSON.stringify(x)); });
  await p.reload(); await p.waitForSelector('.journey');
  await sinkron(p); await p.waitForTimeout(300); await sinkron(p);
  const utama = usaha.get(uid);
  ok(utama.doc && utama.orders.size > 100, `cabang utama tersimpan (${utama.orders.size} order)`);
  ok(!(await p.$('.cabang-chip')), 'satu cabang: tanpa chip cabang');

  // Bisnis -> Cabang -> tambah
  await p.goto(B + '#/bisnis'); await p.click('a[href="#/cabang"].module'); await p.waitForSelector('form[data-form=tambah]');
  await p.fill('form[data-form=tambah] input[name=nama]', 'Cabang Dago'); await p.click('form[data-form=tambah] button');
  await p.waitForSelector('.cabang-row >> nth=1', { timeout: 10000 });
  const [idDago, dago] = [...usaha].find(([, x]) => x.nama === 'Cabang Dago');
  const su = await st(p);
  ok(dago.doc && dago.doc.resep.length === su.resep.length && dago.doc.bahan.every((x) => x.stok === 0), 'cabang baru: menu disalin, stok 0');
  ok(dago.doc.transactions.length === 0 && !dago.doc.pelanggan && dago.doc.profile.cabang === 'Cabang Dago', 'cabang baru: Kas & pelanggan kosong');
  await p.waitForSelector('.cabang-tabel', { timeout: 10000 });
  const tabel = await txt(p, '.cabang-tabel');
  ok(tabel.includes('Cabang Dago') && tabel.includes('Semua cabang'), 'ringkasan gabungan tampil');
  await p.screenshot({ path: `${OUT}/cabang-daftar.png`, fullPage: true });

  // Pindah ke Dago
  await p.click(`[data-action=pindah][data-id="${idDago}"]`); await p.waitForTimeout(3000); await p.screenshot({ path: `${OUT}/cabang-pindah.png`, fullPage: true }); console.log('hash', await p.evaluate(() => location.hash), p.errs); await p.waitForSelector('.journey', { timeout: 15000 });
  await p.waitForTimeout(300);
  let sd = await st(p);
  ok(sd.resep.length === su.resep.length && (sd.orders || []).length === 0 && sd.transactions.length === 0, 'pindah: data lokal = cabang Dago');
  ok((await txt(p, '.cabang-chip')).includes('Cabang Dago'), 'Beranda: chip Cabang Dago');

  // Jualan di Dago
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  ok((await txt(p, '.cabang-chip')).includes('Cabang Dago'), 'Kasir: chip cabang');
  await p.click('.pos-item:has-text("Air Mineral")'); await p.click('[data-action=checkout]'); await p.waitForSelector('[data-action=selesai]');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  await sinkron(p); await p.waitForTimeout(200);
  const orderUtama = utama.orders.size;
  ok(dago.orders.size === 1 && utama.orders.size === orderUtama, 'order masuk ke Dago saja');

  // Ubah harga di Dago lalu kirim menu ke utama
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.resep[0].harga += 1000; localStorage.setItem('racikin:v1', JSON.stringify(x)); });
  await p.reload(); await p.waitForTimeout(500);
  const hargaBaru = (await st(p)).resep[0].harga;
  const stokUtama = JSON.stringify(utama.doc.bahan.map((x) => x.stok));
  await p.goto(B + '#/cabang'); await p.waitForSelector('[data-change=ke]');
  await p.click(`label.impor-cek:has(input[data-change=ke][value="${uid}"])`);
  await p.click('label.impor-cek:has(input[data-change=bagian][value=promo])');
  await p.click('[data-action=kirim]'); await p.waitForTimeout(1500);
  ok(utama.doc.resep[0].harga === hargaBaru, 'kirim menu: harga baru sampai di cabang utama');
  ok(JSON.stringify(utama.doc.bahan.map((x) => x.stok)) === stokUtama, 'kirim menu: stok cabang utama tetap');
  await p.screenshot({ path: `${OUT}/cabang-kirim.png`, fullPage: true });

  // Balik ke utama
  await p.click(`[data-action=pindah][data-id="${uid}"]`); await p.waitForSelector('.journey', { timeout: 15000 });
  await p.waitForTimeout(300);
  const sb = await st(p);
  ok(sb.orders.length === su.orders.length && sb.resep[0].harga === hargaBaru, 'balik ke utama: order utama lengkap, harga ikut kiriman');

  // Hapus Dago (ketik nama)
  await p.goto(B + '#/cabang'); await p.waitForSelector(`[data-action=hapus][data-id="${idDago}"]`);
  p.ketik = 'Cabang Dago';
  await p.click(`[data-action=hapus][data-id="${idDago}"]`); await p.waitForTimeout(800);
  ok(!usaha.has(idDago) && !(await p.$(`[data-action=hapus][data-id="${idDago}"]`)), 'hapus cabang (konfirmasi nama)');
  console.log('errors:', p.errs); ok(!p.errs.length, 'tanpa error');

  // Paket Pro: cabang terkunci + halaman Paket ada kolom Max
  paket = 'pro';
  const q = await buka(b, { width: 1280, height: 860 });
  await q.goto(B + '#/'); await q.waitForTimeout(800); await sinkron(q); // HP lain, akun sama: data cabang utama ditarik dari cloud
  await q.goto(B + '#/'); await q.waitForSelector('.journey', { timeout: 20000 });
  await q.waitForTimeout(600);
  await q.goto(B + '#/cabang'); await q.waitForSelector('.pro-kunci', { timeout: 10000 });
  ok((await txt(q, '.pro-kunci')).includes('khusus paket Max'), 'paket Pro: multi-cabang terkunci (Max)');
  await q.goto(B + '#/paket'); await q.waitForSelector('.paket-kol.max');
  const kol = await txt(q, '.paket-kol.max');
  ok(kol.includes('Rp 99.000') && kol.includes('Multi-cabang'), 'Paket: kolom Max dengan harga & fitur cabang');
  const linkMax = await q.getAttribute('.paket-kol.max a.btn.primary', 'href');
  ok(decodeURIComponent(linkMax).includes('Racikin Max'), 'tombol upgrade Max ke WA admin');
  await q.screenshot({ path: `${OUT}/cabang-paket-max.png`, fullPage: true });
  console.log('errors:', q.errs); ok(!q.errs.length, 'tanpa error (paket)');
  await b.close();
})();
