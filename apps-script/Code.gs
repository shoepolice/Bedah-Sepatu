/**
 * API DATABASE BEDAH — SHOE POLICE
 * Baca semua file "NEW FORM_BEDAH_*" (1 tab = 1 sepatu), ubah jadi JSON buat website.
 * Juga nerima kiriman form kerja sama dari website (masuk ke sheet "Kerja Sama Website").
 *
 * Cara pasang: lihat README.md bagian "Pasang Apps Script".
 */

// ====== PENGATURAN ======
const FILE_BEDAH = {
  'Sneakers':    '1DAxttPWBWXnMw3m4ikEQxxyMwLpa-y3Feg8cp0wCvFc',
  'Running':     '11SJTEJotbtgPWfLnpmZoCqYuDc7VohQ4ICQ2ztEmT1U',
  'Court':       '183-cNTumGaAl1_mJ5UTh5_fAUuRQCIpDYXbYyLkHaFk',
  'Safety Shoe': '13PbvszpZxTR0kdEj0NKibS6S9_qzLlHEhqXZ8eo9eY0',
  'Kulit':       '1g9dfSItLRPhqv6yfh6B_iZEpJKanzm2Z1DWDqAq27TY',
  'Hiking':      '1yNYb6EiwZrP9jDGw4N1C2ZRvJBorvgrPY5k4yZuv1VQ',
  'Sandal':      '1pNyspZhC7ewUeWGWZaczYQWsxxjmuJecybSl6mGQnvc'
};
// Tab yang dilewati (template / aturan / dummy). Huruf besar-kecil gak ngaruh.
const TAB_DILEWATI = [/^rules$/i, /^form bedah/i, /dummy/i];
// Tab yang belum boleh tayang (misal bedah collab yang belum rilis) — tulis nama tab persis.
const TAB_DISEMBUNYIKAN = [];
// Kalau true, sepatu tanpa FINAL SCORE gak ditampilkan.
const WAJIB_ADA_SKOR = true;
// =========================

/** Website memanggil URL ini (GET) → dapat JSON. */
function doGet() {
  const json = ambilCache_() || bangunData();
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Form kerja sama dari website (POST). */
function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { d = e.parameter || {}; }
  const ss = sheetKerjaSama_();
  ss.appendRow([new Date(), d.nama || '', d.brand || '', d.email || '', d.whatsapp || '', d.jenis || '', d.pesan || '']);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

/** Jalankan manual sekali, lalu otomatis tiap jam lewat pasangTrigger(). */
function bangunData() {
  const hasil = [];
  Object.keys(FILE_BEDAH).forEach(kategori => {
    let ss;
    try { ss = SpreadsheetApp.openById(FILE_BEDAH[kategori]); } catch (err) { return; }
    ss.getSheets().forEach((sh, urut) => {
      const nama = sh.getName().trim();
      if (TAB_DILEWATI.some(r => r.test(nama)) || TAB_DISEMBUNYIKAN.indexOf(nama) > -1) return;
      try {
        const s = parseTab_(sh, kategori);
        s._urut = urut; // urutan tab: tab paling kanan dianggap paling baru kalau tanggal tes kosong
        if (!s.brand && !s.model) return;
        if (WAJIB_ADA_SKOR && s.skor === null) return;
        hasil.push(s);
      } catch (err) { console.log('Gagal baca tab ' + nama + ': ' + err); }
    });
  });
  hasil.sort((a, b) => (b.skor || 0) - (a.skor || 0));
  const json = JSON.stringify({ diperbarui: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm'), sepatu: hasil });
  simpanCache_(json);
  return json;
}

function pasangTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'bangunData').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('bangunData').timeBased().everyHours(1).create();
  bangunData();
}

// ---------- parser ----------
function parseTab_(sh, kategori) {
  const rows = sh.getDataRange().getDisplayValues();
  const peta = {};           // label kolom A → baris pertama yang cocok
  rows.forEach(r => { const k = norm_(r[0]); if (k && !(k in peta)) peta[k] = r; });
  const B = l => val_(peta[norm_(l)], 1);
  const D = l => val_(peta[norm_(l)], 3);
  const G = l => val_(peta[norm_(l)], 6);
  const cari = awalan => { const k = Object.keys(peta).find(x => x.indexOf(norm_(awalan)) === 0); return k ? peta[k] : null; };
  const Gc = awalan => val_(cari(awalan), 6);

  // layer dari "Ringkasan layer"
  const layer = [];
  const iRing = rows.findIndex(r => norm_(r[0]) === 'ringkasan layer');
  if (iRing > -1) {
    for (let i = iRing + 1; i < rows.length && i < iRing + 8; i++) {
      const a = String(rows[i][0]).trim();
      if (!/^layer\s/i.test(a)) break;
      layer.push({ nama: a.split(/[—-]/).pop().trim(), kelas: rows[i][3], skor: num_(rows[i][6]), bobot: rows[i][7] });
    }
  }
  // verdict / final di bagian ringkasan (baris setelah ringkasan)
  let verdict = '';
  const iV = rows.findIndex(r => norm_(r[0]) === 'verdict');
  if (iV > -1) verdict = rows[iV][6];
  const skor = num_(rows[0] && rows[0][6]);

  const brand = B('Brand'), model = B('Model');
  const klaimLengkap = B('Klaim brand terbukti?');

  return {
    id: slug_(kategori + '-' + brand + '-' + model + '-' + sh.getSheetId()),
    tab: sh.getName(),
    kategori: kategori,
    brand: brand,
    model: model,
    subtipe: B('Sub Type') || B('Kategori lari') || B('Kategori') || B('Sub type'),
    size: B('Size (EU)'),
    harga: B('Harga retail (Rp)'),
    tanggal: B('Tanggal tes'),
    tester: val_(peta[norm_('Profil tester')], 1),
    skor: skor,
    verdict: verdict,
    layer: layer,
    angka: {
      berat: num_(B('Berat sepatu (1 pcs)')),
      reboundHeel: num_(Gc('→ Rebound heel')),
      reboundToe: num_(Gc('→ Rebound toe')),
      midsoleHeel: num_(B('Midsole heel')),
      midsoleForefoot: num_(B('Midsole forefoot')),
      materialMidsole: B('Jenis material midsole'),
      stackHeel: num_(B('Stack at heel')),
      stackToe: num_(B('Stack at toe')),
      drop: num_(G('→ Heel-to-toe drop')),
      upperSkor: num_(Gc('A1  Upper durability')),
      outsoleSkor: num_(Gc('A3  Outsole compound')),
      outsoleMaterial: B('Material outsole'),
      gripKering: B('→ Level grip kering'),
      gripBasah: B('→ Level grip basah'),
      sizing: B('Sizing')
    },
    klaim: B('Klaim brand yang diuji'),
    klaimHasil: klaimLengkap,
    masalah: B('Masalah yang ditemukan'),
    video: B('Link video') || '',
    tag: B('Tag website').split(',').map(x => x.trim()).filter(Boolean),
    foto: linkFoto_(B('Link foto'))
  };
}

// Link Google Drive → link gambar yang bisa tampil di website (file harus "Anyone with the link")
function linkFoto_(u) {
  if (!u) return '';
  const m = String(u).match(/(?:\/d\/|id=)([\w-]{20,})/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1000' : u;
}

function norm_(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function val_(row, i) { return row && row[i] != null ? String(row[i]).trim() : ''; }
function num_(s) {
  if (s === '' || s == null) return null;
  const n = parseFloat(String(s).replace('%', '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}
function slug_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// ---------- cache di Drive (biar website cepat) ----------
function simpanCache_(json) {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('CACHE_FILE');
  try { if (id) { DriveApp.getFileById(id).setContent(json); return; } } catch (e) {}
  id = DriveApp.createFile('shoepolice-web-cache.json', json, 'application/json').getId();
  p.setProperty('CACHE_FILE', id);
}
function ambilCache_() {
  const id = PropertiesService.getScriptProperties().getProperty('CACHE_FILE');
  if (!id) return null;
  try { return DriveApp.getFileById(id).getBlob().getDataAsString(); } catch (e) { return null; }
}
function sheetKerjaSama_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('SHEET_KERJASAMA');
  let ss;
  try { if (id) ss = SpreadsheetApp.openById(id); } catch (e) {}
  if (!ss) {
    ss = SpreadsheetApp.create('Kerja Sama Website — Shoe Police');
    ss.getSheets()[0].appendRow(['Waktu', 'Nama', 'Brand / Perusahaan', 'Email', 'WhatsApp', 'Jenis kerja sama', 'Pesan']);
    p.setProperty('SHEET_KERJASAMA', ss.getId());
  }
  return ss.getSheets()[0];
}
