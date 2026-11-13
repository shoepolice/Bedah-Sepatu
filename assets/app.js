// ====== Shoe Police — skrip bersama ======
const LOGO_SP = '<img src="assets/logo/logo-shoepolice.png" alt="Shoe Police" width="279" height="240">';
const SP = {
  config: null, data: null,

  async muatConfig() {
    if (this.config) return this.config;
    try { this.config = await (await fetch('data/config.json', { cache: 'no-cache' })).json(); } catch (e) { this.config = {}; }
    return this.config;
  },

  // Data live dari Apps Script; kalau belum dipasang / gagal → data/sepatu.json
  async muatData() {
    if (this.data) return this.data;
    const cfg = await this.muatConfig();
    if (cfg.apiUrl) {
      try { const r = await fetch(cfg.apiUrl); if (r.ok) this.data = await r.json(); }
      catch (e) { console.warn('API gagal, pakai data cadangan', e); }
    }
    if (!this.data) this.data = await (await fetch('data/sepatu.json', { cache: 'no-cache' })).json();
    (this.data.sepatu || []).forEach((s, i) => { s._urut = s._urut ?? i; s.tag = s.tag || []; });
    // buang sepatu di daftar banding yang sudah tidak ada di database (misal id berubah setelah data diperbarui)
    const ada = new Set((this.data.sepatu || []).map(s => s.id));
    const b = this.ambilBanding(), bersih = b.filter(id => ada.has(id));
    if (bersih.length !== b.length) this.simpanBanding(bersih);
    return this.data;
  },

  // ---------- definisi metrik lab ----------
  // arah: 1 = makin tinggi makin bagus, -1 = makin rendah makin bagus, 0 = netral (cuma info)
  METRIK: [
    { k: 'berat', lbl: 'Berat', sat: 'g', arah: -1, desc: '1 pcs, tanpa kotak & tali tambahan',
      plus: p => `Lebih ringan dari ${p}% sepatu {kat} yang sudah kami bedah`, minus: p => `Lebih berat dari ${100 - p}% sepatu {kat} yang sudah kami bedah` },
    { k: 'reboundHeel', lbl: 'Rebound heel', sat: '%', arah: 1, desc: 'Bola dijatuhkan 100 cm, pantulan pertama (rata-rata 5x)',
      plus: p => `Midsole tumit lebih memantul dari ${p}% sepatu {kat}`, minus: () => `Pantulan midsole di tumit di bawah rata-rata {kat}` },
    { k: 'reboundToe', lbl: 'Rebound forefoot', sat: '%', arah: 1, desc: 'Sama seperti heel, di area depan',
      plus: p => `Forefoot lebih responsif dari ${p}% sepatu {kat}`, minus: () => `Forefoot kurang memantul dibanding rata-rata {kat}` },
    { k: 'midsoleHeel', lbl: 'Kekerasan midsole heel', sat: 'HA', arah: 0, desc: 'Durometer Shore A — makin kecil makin empuk' },
    { k: 'midsoleForefoot', lbl: 'Kekerasan midsole forefoot', sat: 'HA', arah: 0, desc: 'Durometer Shore A — makin kecil makin empuk' },
    { k: 'stackHeel', lbl: 'Stack heel', sat: 'mm', arah: 0, desc: 'Tebal sol + insole di tengah tumit' },
    { k: 'stackToe', lbl: 'Stack forefoot', sat: 'mm', arah: 0, desc: 'Tebal sol + insole di titik ball' },
    { k: 'drop', lbl: 'Heel-to-toe drop', sat: 'mm', arah: 0, desc: 'Selisih stack heel dan forefoot' },
    { k: 'upperSkor', lbl: 'Ketahanan upper', sat: '/10', arah: 1, desc: 'Dremel grit 120, 15.500 rpm, maks 10 detik',
      plus: () => `Upper tahan kikis saat didremel`, minus: () => `Upper cepat rusak saat didremel` },
    { k: 'outsoleSkor', lbl: 'Ketahanan outsole', sat: '/10', arah: 1, desc: 'Dremel grit 80, 15.500 rpm, maks 20 detik',
      plus: () => `Outsole awet, tahan kikis di atas rata-rata`, minus: () => `Outsole cepat aus saat didremel` }
  ],

  // statistik per metrik dalam satu kelompok sepatu
  statistik(list, k) {
    const v = list.map(s => s.angka?.[k]).filter(x => typeof x === 'number');
    if (!v.length) return null;
    return { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length, v };
  },
  // persen sepatu yang "dikalahkan" (arah sesuai metrik)
  persentil(st, x, arah) {
    if (!st || st.n < 2) return null;
    const kalah = st.v.filter(y => arah === -1 ? y > x : y < x).length;
    return Math.round(kalah / (st.n - 1) * 100);
  },
  pembanding(semua, s) {
    const sama = semua.filter(x => x.kategori === s.kategori);
    return sama.length >= 3 ? sama : semua;
  },

  // kelebihan & kekurangan otomatis dari data
  kelebihan(semua, s) {
    const grup = this.pembanding(semua, s);
    const kat = grup === semua ? 'lain' : s.kategori.toLowerCase();
    const plus = [], minus = [];
    this.METRIK.filter(m => m.arah && typeof s.angka?.[m.k] === 'number').forEach(m => {
      const p = this.persentil(this.statistik(grup, m.k), s.angka[m.k], m.arah);
      if (m.k.endsWith('Skor')) {
        const x = s.angka[m.k];
        if (x >= 8) plus.push(m.plus(p).replace('{kat}', kat) + ` (${this.fmt(x)}/10)`);
        else if (x < 5.5) minus.push(m.minus(p).replace('{kat}', kat) + ` (${this.fmt(x)}/10)`);
        return;
      }
      if (p === null) return;
      if (p >= 65) plus.push(m.plus(p).replace('{kat}', kat));
      else if (p <= 35) minus.push(m.minus(p).replace('{kat}', kat));
    });
    (s.layer || []).forEach(l => {
      if (l.skor >= 8.5) plus.push(`Skor ${l.nama.toLowerCase()} tinggi: ${this.fmt(l.skor)} (${l.kelas})`);
      else if (l.skor < 6.5) minus.push(`Skor ${l.nama.toLowerCase()} masih rendah: ${this.fmt(l.skor)} (${l.kelas})`);
    });
    const a = s.angka || {};
    if (a.gripBasah && /low/i.test(a.gripBasah)) minus.push('Grip di permukaan basah rendah');
    if (a.gripKering && /high/i.test(a.gripKering)) plus.push('Grip di permukaan kering kuat');
    if (s.masalah) minus.push(s.masalah);
    return { plus, minus };
  },

  tier(x) {
    if (x == null) return { w: '#c9c9c2', t: 'Belum dinilai' };
    if (x >= 8.5) return { w: '#15803d', t: 'Luar biasa' };
    if (x >= 7.5) return { w: '#22a35a', t: 'Bagus' };
    if (x >= 6.5) return { w: '#E0A100', t: 'Cukup' };
    if (x >= 5) return { w: '#ea8a1a', t: 'Kurang' };
    return { w: '#d64545', t: 'Buruk' };
  },
  ring(x, ukuran = 78, label = '') {
    const t = this.tier(x);
    return `<div class="ring" style="--s:${ukuran}px;--p:${x == null ? 0 : x * 10};--w:${t.w}">
      <div class="dlm"><b>${x == null ? '–' : this.fmt(x)}</b>${label ? `<small>${label}</small>` : ''}</div></div>`;
  },

  fmt(n, d = 1) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: n % 1 ? 1 : 0 });
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  ytId(url) { const m = String(url || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); return m ? m[1] : null; },

  foto(s) {
    return s.foto ? `<img src="${this.esc(s.foto)}" alt="${this.esc(s.brand + ' ' + s.model)}" loading="lazy">` : this.siluet();
  },
  siluet() {
    return `<svg viewBox="0 0 200 110" width="70%" aria-hidden="true"><path fill="#d6d6cf" d="M12 72c0-9 6-14 14-15l40-6c10-2 18-9 24-18l8-12c3-4 8-5 12-2l12 9c4 3 9 4 14 3l14-3c5-1 9 2 10 7l3 14c2 8 9 13 17 14l4 1c7 1 12 7 12 14v8H12z"/><rect x="8" y="80" width="186" height="14" rx="7" fill="#c4c4bc"/></svg>`;
  },

  // ---------- kategori beranda (diatur di config.json) ----------
  teksCari(s) { return `${s.kategori} ${s.subtipe} ${(s.tag || []).join(' ')}`.toLowerCase(); },
  // cocok = salah satu kata ada · wajib = semua kata harus ada · kecuali = kata yang dikeluarkan
  cocok(s, kat) {
    if (!kat || kat.otomatis === 'terbaru') return true;
    const t = this.teksCari(s), ada = k => t.includes(k.toLowerCase());
    const c = kat.cocok || [], w = kat.wajib || [];
    if (!c.length && !w.length) return false;
    return (!c.length || c.some(ada)) && w.every(ada) && !(kat.kecuali || []).some(ada);
  },

  // ---------- pencarian kata kunci ----------
  // Semua kata harus ketemu di: brand, model, kategori, sub type, tag, nama kategori beranda
  normal(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.,]+/g, ' ').trim(); },
  teksLengkap(s) {
    if (s._cari) return s._cari;
    const kats = (this.config?.kategoriBeranda || []).filter(k => !k.otomatis && this.cocok(s, k)).map(k => k.nama);
    return (s._cari = this.normal(`${s.brand} ${s.model} ${s.brand}${s.model} ${s.kategori} ${s.subtipe} ${(s.tag || []).join(' ')} ${kats.join(' ')} ${s.angka?.materialMidsole || ''}`));
  },
  cocokKata(s, q) {
    const kata = this.normal(q).split(' ').filter(Boolean);
    if (!kata.length) return true;
    const t = this.teksLengkap(s);
    return kata.every(k => t.includes(k));
  },
  saran(sepatu, q) {
    const n = this.normal(q);
    if (!n) return null;
    const kats = (this.config?.kategoriBeranda || []).filter(k => this.normal(k.nama).includes(n) || (k.cocok || []).some(c => c.includes(n) || n.includes(c)))
      .map(k => ({ ...k, jml: this.isiKategori(sepatu, k).length })).filter(k => k.jml).slice(0, 4);
    const brands = [...new Set(sepatu.map(s => s.brand))].filter(b => this.normal(b).includes(n)).slice(0, 4);
    const hasil = sepatu.filter(s => this.cocokKata(s, q)).sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0)).slice(0, 6);
    return { kats, brands, hasil };
  },

  // ---------- ikon kategori ----------
  ikon(jenis) {
    const st = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"';
    const i = {
      sepatu: `<path fill="currentColor" d="M3 16c0-2 1-3 3-3l7-1c2 0 3-2 4-3l1-2c1-1 2-1 3 0l2 2c1 1 2 1 3 1l3-1c1 0 2 1 2 2l1 2c0 2 2 3 4 3h1c1 0 2 1 2 3v1H3z"/><rect x="2" y="18" width="38" height="3" rx="1.5" fill="currentColor" opacity=".55"/>`,
      boot: `<path fill="currentColor" d="M4 16c0-2 1-3 3-3l6-1c2-1 3-2 3-4V2c0-1 1-1 2-1h9c1 0 2 1 2 2v6c0 2 1 3 3 3h2c2 0 3 2 3 4v1H4z"/><rect x="3" y="17" width="35" height="4" rx="1.5" fill="currentColor" opacity=".55"/>`,
      sandal: `<rect x="3" y="16" width="36" height="4" rx="2" fill="currentColor"/><path ${st} d="M9 16c1-5 4-7 7-7s4 3 4 7M23 16c1-4 3-6 6-6 2 0 3 2 3 6"/>`,
      spike: `<path fill="currentColor" d="M3 14c0-2 1-3 3-3l9-1c2 0 3-2 4-3l1-1c1-1 2-1 3 0l2 1c1 1 2 1 3 1l3-1c1 0 2 1 2 2l1 2c1 1 2 2 4 2v2H3z"/><path ${st} d="M7 17l-1 4M13 17l-1 4M19 17l-1 4M25 17l-1 4"/>`,
      court: `<path fill="currentColor" d="M3 16c0-2 1-3 3-3l6-1c2 0 3-2 4-4l1-5c0-1 1-2 2-2h7c1 0 2 1 2 2v5c0 2 2 3 4 3h3c2 0 3 2 3 4v1H3z"/><rect x="2" y="17" width="37" height="4" rx="1.5" fill="currentColor" opacity=".55"/>`,
      heels: `<path fill="currentColor" d="M3 7c3 0 6 2 9 5l5 3c2 1 5 1 7 0l9-5c2-1 5 0 5 2v1L28 18H14c-2 0-4-1-5-3L6 11v9H4z"/>`
    };
    return `<svg class="ikon" viewBox="0 0 42 22" aria-hidden="true">${i[jenis] || i.sepatu}</svg>`;
  },
  // "16/10/26" atau "16/10/2026" → angka buat diurutkan
  tglNilai(t) {
    const m = String(t || '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return 0;
    const th = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return th * 10000 + +m[2] * 100 + +m[1];
  },
  terbaru(list) { return [...list].sort((a, b) => this.tglNilai(b.tanggal) - this.tglNilai(a.tanggal) || (b._urut ?? 0) - (a._urut ?? 0)); },
  isiKategori(sepatu, kat) {
    const l = sepatu.filter(s => this.cocok(s, kat));
    return kat.otomatis === 'terbaru' ? this.terbaru(l).slice(0, kat.jumlah || 12) : l;
  },

  // ---------- artikel ----------
  async muatArtikel() {
    if (this.artikel) return this.artikel;
    try { const d = await (await fetch('data/artikel.json', { cache: 'no-cache' })).json(); this.artikel = d.artikel || []; }
    catch (e) { this.artikel = []; }
    this.artikel.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
    return this.artikel;
  },
  tglIndo(t) {
    const d = new Date(t + 'T00:00:00');
    return isNaN(d) ? (t || '') : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  },
  menitBaca(a) { return Math.max(1, Math.round((a.isi || []).join(' ').split(/\s+/).length / 200)); },
  kartuArtikel(a, besar = false) {
    const e = this.esc;
    return `<a class="a-kartu ${besar ? 'besar' : ''}" href="artikel.html?id=${encodeURIComponent(a.id)}">
      <div class="a-foto">${a.gambar ? `<img src="${e(a.gambar)}" alt="" loading="lazy">` : `<div class="a-plh"><img src="assets/logo/logo-shoepolice.png" alt=""></div>`}</div>
      <div class="a-isi"><span class="a-kat">${e(a.kategori || 'Artikel')}</span><b>${e(a.judul)}</b>
      <p>${e(a.ringkasan || '')}</p><small>${this.tglIndo(a.tanggal)} · ${this.menitBaca(a)} menit baca</small></div></a>`;
  },
  // isi artikel: 1 baris = 1 paragraf; "## " subjudul, "- " poin, "> " catatan, "![ket](url)" gambar
  renderIsi(baris) {
    const e = this.esc, inline = t => e(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    let h = '', ul = false;
    (baris || []).forEach(b => {
      b = String(b);
      if (!b.startsWith('- ') && ul) { h += '</ul>'; ul = false; }
      const img = b.match(/^!\[(.*?)\]\((.+?)\)$/);
      if (img) h += `<figure><img src="${e(img[2])}" alt="${e(img[1])}" loading="lazy">${img[1] ? `<figcaption>${e(img[1])}</figcaption>` : ''}</figure>`;
      else if (b.startsWith('## ')) h += `<h2>${inline(b.slice(3))}</h2>`;
      else if (b.startsWith('- ')) { if (!ul) { h += '<ul>'; ul = true; } h += `<li>${inline(b.slice(2))}</li>`; }
      else if (b.startsWith('> ')) h += `<blockquote>${inline(b.slice(2))}</blockquote>`;
      else if (b.trim()) h += `<p>${inline(b)}</p>`;
    });
    return h + (ul ? '</ul>' : '');
  },

  // ---------- meteran garis (tick bar) ----------
  tick(persen, rata = null, jumlah = 36) {
    const isi = Math.round(Math.max(0, Math.min(100, persen || 0)) / 100 * jumlah);
    const avg = rata == null ? -1 : Math.round(Math.max(0, Math.min(100, rata)) / 100 * jumlah);
    return `<div class="tick" style="--n:${jumlah}">${Array.from({ length: jumlah }, (_, i) =>
      `<i class="${i < isi ? 'on' : ''}${i === avg ? ' avg' : ''}" style="--i:${i}"></i>`).join('')}</div>`;
  },

  // ---------- animasi: muncul saat discroll, judul kata per kata, angka berhitung ----------
  animasi(akar = document) {
    const halus = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    akar.querySelectorAll('.judul-kata:not([data-siap])').forEach(h => {
      h.dataset.siap = 1;
      h.innerHTML = h.textContent.trim().split(/\s+/).map((w, i) => `<span class="kata" style="--i:${i}">${this.esc(w)}</span>`).join(' ');
      h.setAttribute('data-reveal', '');
    });
    akar.querySelectorAll('.g-kartu,.a-kartu,.k-tile,.kartu,.panel,.uji,.faq-item,.box,.orang,.mini').forEach((el, i) => {
      if (!el.hasAttribute('data-reveal')) { el.setAttribute('data-reveal', ''); el.style.setProperty('--tunda', (i % 6) * 60 + 'ms'); }
    });
    const hitung = el => {
      const t = +el.dataset.nilai || 0, d = +el.dataset.desimal || 0, mulai = performance.now(), lama = 1100;
      const langkah = now => { const p = Math.min(1, (now - mulai) / lama), v = t * (1 - Math.pow(1 - p, 3));
        el.textContent = v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }); if (p < 1) requestAnimationFrame(langkah); };
      requestAnimationFrame(langkah);
    };
    const target = akar.querySelectorAll('[data-reveal]:not(.muncul), [data-hitung][data-nilai]:not([data-selesai])');
    if (!halus || !('IntersectionObserver' in window)) {
      target.forEach(el => { el.classList.add('muncul'); if (el.hasAttribute('data-hitung') && el.hasAttribute('data-nilai')) { el.dataset.selesai = 1; el.textContent = (+el.dataset.nilai || 0).toLocaleString('id-ID', { minimumFractionDigits: +el.dataset.desimal || 0, maximumFractionDigits: +el.dataset.desimal || 0 }); } });
      return;
    }
    document.documentElement.classList.add('anim');
    const obs = new IntersectionObserver(en => en.forEach(x => {
      if (!x.isIntersecting) return;
      const el = x.target; obs.unobserve(el);
      el.classList.add('muncul');
      if (el.hasAttribute('data-hitung') && el.hasAttribute('data-nilai')) { el.dataset.selesai = 1; hitung(el); }
      el.querySelectorAll?.('[data-hitung][data-nilai]:not([data-selesai])').forEach(n => { n.dataset.selesai = 1; hitung(n); });
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    target.forEach(el => obs.observe(el));
  },

  // ---------- bandingkan (disimpan di localStorage) ----------
  ambilBanding() { try { return JSON.parse(localStorage.getItem('sp-banding') || '[]'); } catch (e) { return []; } },
  simpanBanding(a) { try { localStorage.setItem('sp-banding', JSON.stringify(a.slice(0, 4))); } catch (e) {} }
};

// animasi otomatis untuk konten yang dirender belakangan
window.addEventListener('load', () => setTimeout(() => SP.animasi(), 60));
new MutationObserver(() => { clearTimeout(SP._t); SP._t = setTimeout(() => SP.animasi(), 80); })
  .observe(document.documentElement, { childList: true, subtree: true });

// ---------- status filter (disimpan di URL) ----------
SP.bacaFilter = function () {
  const p = new URLSearchParams(location.search), daftar = k => (p.get(k) || '').split(',').filter(Boolean);
  return { q: p.get('q') || '', kat: p.get('kat') || '', brand: daftar('brand'), sub: daftar('sub'),
    skor: +p.get('skor') || 0, berat: +p.get('berat') || 0, urut: p.get('urut') || '' };
};
SP.urlFilter = function (f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q); if (f.kat) p.set('kat', f.kat);
  if (f.brand?.length) p.set('brand', f.brand.join(',')); if (f.sub?.length) p.set('sub', f.sub.join(','));
  if (f.skor) p.set('skor', f.skor); if (f.berat) p.set('berat', f.berat); if (f.urut) p.set('urut', f.urut);
  const t = p.toString();
  return 'database.html' + (t ? '?' + t : '');
};
// Terapkan semua filter ke daftar sepatu (dipakai database & panel filter)
SP.saring = function (sepatu, f) {
  const kat = (this.config?.kategoriBeranda || []).find(k => k.id === f.kat);
  let l = kat ? this.isiKategori(sepatu, kat) : sepatu;
  return l.filter(s => this.cocokKata(s, f.q) &&
    (!f.brand.length || f.brand.includes(s.brand)) &&
    (!f.sub.length || f.sub.includes(s.subtipe)) &&
    (!f.skor || (s.skor ?? -1) >= f.skor) &&
    (!f.berat || (s.angka?.berat != null && s.angka.berat <= f.berat)));
};
SP.terapkan = function (f) {
  const url = this.urlFilter(f);
  if (document.body.dataset.hal === 'database') { history.replaceState(null, '', url); window.dispatchEvent(new Event('sp-filter')); }
  else location.href = url;
};

// ---------- header: logo + search + filter + menu ----------
(function pasangKerangka() {
  const hal = document.body.dataset.hal;
  const menu = [
    ['index.html', 'Beranda', 'beranda', 'Halaman utama'],
    ['database.html', 'Database', 'database', 'Semua sepatu yang sudah dibedah'],
    ['bandingkan.html', 'Bandingkan Sepatu', 'banding', 'Hasil lab berdampingan'],
    ['artikel.html', 'Artikel', 'artikel', 'Hasil lab, panduan & cerita sepatu'],
    ['metode.html', 'Metode Tes', 'metode', 'Cara kami membedah sepatu'],
    ['', 'Tentang Kami', ['tentang', 'konten', 'kontak'], [['tentang.html', 'Tentang Shoe Police', 'tentang'], ['konten.html', 'Konten', 'konten'], ['kontak.html', 'Kerja Sama', 'kontak']]]];
  const itemMenu = ([h, t, k, x]) => Array.isArray(x)
    ? `<div class="m-grup ${k.includes(hal) ? 'buka' : ''}"><button class="m-item">${t}<span class="panah-bawah">▾</span></button>
        <div class="m-anak">${x.map(([ah, at, ak]) => `<a href="${ah}" class="${ak === hal ? 'aktif' : ''}">${at}</a>`).join('')}</div></div>`
    : `<a class="m-item ${k === hal ? 'aktif' : ''}" href="${h}">${t}<small>${x}</small></a>`;
  const ikonCari = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `<div class="wrap nav-grid">
    <div class="nav-kiri"><button class="burger" id="buka-menu" aria-label="Buka menu"><span></span><span></span><span></span></button>
    <a href="index.html" class="logo" aria-label="Shoe Police — beranda">${LOGO_SP}</a></div>
    <div class="nav-kanan">
      <form class="cari-box" id="cari-form" autocomplete="off">
        <input type="search" id="cari-global" placeholder="Cari sepatu, brand, kategori…" aria-label="Cari sepatu">
        <button aria-label="Cari">${ikonCari}</button>
        <div class="saran" id="saran"></div>
      </form>
      <button class="tbl-filter tbl-cari" id="buka-cari" aria-label="Cari" title="Cari">${ikonCari}</button>
      <button class="tbl-filter" id="buka-filter" aria-label="Filter" title="Filter"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M3 6h18M6 12h12M10 18h4"/></svg><i id="jml-filter"></i></button>
    </div></div>`;
  document.body.prepend(nav);
  // Header hilang saat scroll ke bawah (layar penuh), muncul lagi saat mentok di atas
  let yLalu = 0, jalan = false;
  const cekScroll = () => {
    const y = window.scrollY;
    const terbuka = document.body.classList.contains('laci-buka') || document.body.classList.contains('menu-buka') || document.activeElement?.id === 'cari-global';
    if (y <= 10 || terbuka) document.body.classList.remove('nav-sembunyi');
    else if (y > yLalu && y > 80) document.body.classList.add('nav-sembunyi');
    yLalu = y; jalan = false;
  };
  window.addEventListener('scroll', () => { if (!jalan) { jalan = true; requestAnimationFrame(cekScroll); } }, { passive: true });

  // ----- sidebar menu (kiri) & panel filter (kanan) -----
  const laci = document.createElement('div');
  laci.innerHTML = `<div class="laci-latar" id="laci-latar"></div>
  <aside class="laci sisi-kiri" id="menu-laci" aria-label="Menu">
    <div class="laci-kepala"><a href="index.html" class="logo logo-gelap" aria-label="Shoe Police — beranda">${LOGO_SP}</a><button class="tutup-laci" aria-label="Tutup">✕</button></div>
    <nav class="laci-isi m-daftar">${menu.map(itemMenu).join('')}</nav>
    <div class="laci-kaki m-sos" id="m-sos"></div>
  </aside>
  <aside class="laci sisi-kanan" id="laci" aria-label="Filter sepatu">
    <div class="laci-kepala"><b id="laci-judul">Filter</b><button class="tutup-laci" aria-label="Tutup">✕</button></div>
    <form class="laci-cari" id="laci-cari-form" autocomplete="off">
      <div class="cari-box"><input type="search" id="laci-cari" placeholder="Cari sepatu, brand, kategori…" aria-label="Cari sepatu"><button aria-label="Cari">${ikonCari}</button></div>
      <div class="saran inline" id="laci-saran"></div>
    </form>
    <div class="laci-isi" id="laci-isi"></div>
    <div class="laci-kaki"><button class="tombol garis" id="reset-filter">Reset</button><button class="tombol" id="pakai-filter">Tampilkan</button></div>
  </aside>`;
  document.body.append(laci);
  const tutupSemua = () => document.body.classList.remove('laci-buka', 'menu-buka');
  document.getElementById('buka-menu').onclick = () => document.body.classList.add('menu-buka');
  document.getElementById('laci-latar').onclick = tutupSemua;
  laci.querySelectorAll('.tutup-laci').forEach(b => b.onclick = tutupSemua);
  document.addEventListener('keydown', ev => ev.key === 'Escape' && tutupSemua());
  laci.querySelectorAll('.m-grup > button').forEach(b => b.onclick = () => b.parentElement.classList.toggle('buka'));

  const ft = document.createElement('footer');
  ft.innerHTML = `<div class="wrap"><div class="ft-panel">
    <div class="ft-atas">
      <div class="ft-merek"><span class="ft-logo">${LOGO_SP}</span><p>Lab bedah sepatu dari Bandung. Kami beli, uji, dan buka hasilnya apa adanya.</p></div>
      <div class="ft-kolom"><b>Jelajahi</b><a href="database.html">Database</a><a href="bandingkan.html">Bandingkan</a><a href="artikel.html">Artikel</a><a href="metode.html">Metode Tes</a></div>
      <div class="ft-kolom"><b>Tentang</b><a href="tentang.html">Tentang Shoe Police</a><a href="konten.html">Konten</a><a href="kontak.html">Kerja Sama</a></div>
      <div class="ft-kolom"><b>Ikuti</b><span id="ft-sos"></span></div>
    </div>
    <div class="ft-bawah"><span>© ${new Date().getFullYear()} Shoe Police</span><span>Semua angka berasal dari pengujian lab Shoe Police, Bandung</span></div>
  </div></div>`;
  document.body.append(ft);

  const $ = id => document.getElementById(id);
  Promise.all([SP.muatConfig(), SP.muatData()]).then(([c, { sepatu = [] }]) => {
    const k = c.kontak || {};
    $('ft-sos').innerHTML = [['Instagram', k.instagram], ['SPW', k.instagramSPW], ['YouTube', k.youtube], ['TikTok', k.tiktok]]
      .filter(x => x[1]).map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join('');
    $('m-sos').innerHTML = $('ft-sos').innerHTML;

    // ===== SEARCH + SARAN (dipakai di header & di panel kanan) =====
    const e = SP.esc;
    function htmlSaran(q) {
      const r = SP.saran(sepatu, q);
      if (!r) return '';
      const f0 = SP.bacaFilter();
      let h = '';
      if (r.kats.length) h += `<div class="s-grup">Kategori</div>` + r.kats.map(x => `<a class="s-item" href="${SP.urlFilter({ ...f0, q: '', kat: x.id, brand: [], sub: [] })}">${SP.ikon(x.ikon)}<span>${e(x.nama)}</span><i>${x.jml}</i></a>`).join('');
      if (r.brands.length) h += `<div class="s-grup">Brand</div>` + r.brands.map(b => `<a class="s-item" href="${SP.urlFilter({ q: '', kat: '', brand: [b], sub: [], skor: 0, berat: 0 })}"><span class="s-huruf">${e(b[0])}</span><span>${e(b)}</span><i>${sepatu.filter(s => s.brand === b).length}</i></a>`).join('');
      if (r.hasil.length) h += `<div class="s-grup">Sepatu</div>` + r.hasil.map(s => `<a class="s-item s-sepatu" href="sepatu.html?id=${encodeURIComponent(s.id)}"><span class="s-foto">${SP.foto(s)}</span><span><b>${e(s.brand)} ${e(s.model)}</b><small>${e(s.kategori)}${s.subtipe ? ' · ' + e(s.subtipe) : ''}</small></span>${SP.ring(s.skor, 36)}</a>`).join('');
      h += `<a class="s-semua" href="${SP.urlFilter({ ...f0, q: q.trim() })}">Lihat semua hasil untuk "<b>${e(q.trim())}</b>" ›</a>`;
      if (!r.kats.length && !r.brands.length && !r.hasil.length) h = `<div class="s-kosong">Belum ada sepatu yang cocok dengan "<b>${e(q.trim())}</b>".<br>Coba kata kunci lain: nama model, brand, atau jenis (running, hiking, basket…)</div>`;
      return h;
    }
    function pasangSaran(inp, box, saatKetik) {
      let pilih = -1;
      const tampil = () => { const h = htmlSaran(inp.value); pilih = -1; box.innerHTML = h; box.classList.toggle('buka', !!h); };
      inp.addEventListener('input', () => { tampil(); saatKetik && saatKetik(); });
      inp.addEventListener('focus', () => inp.value && tampil());
      inp.addEventListener('keydown', ev => {
        const it = [...box.querySelectorAll('a')];
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault(); if (!it.length) return;
          pilih = (pilih + (ev.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length;
          it.forEach((a, i) => a.classList.toggle('pilih', i === pilih));
        } else if (ev.key === 'Enter' && pilih >= 0 && it[pilih]) { ev.preventDefault(); location.href = it[pilih].href; }
      });
      return () => box.classList.remove('buka');
    }
    const inp = $('cari-global'), box = $('saran');
    inp.value = SP.bacaFilter().q;
    const tutupSaran = pasangSaran(inp, box);
    inp.addEventListener('keydown', ev => ev.key === 'Escape' && tutupSaran());
    document.addEventListener('click', ev => { if (!ev.target.closest('.nav .cari-box')) tutupSaran(); });
    $('cari-form').onsubmit = ev => { ev.preventDefault(); tutupSaran(); SP.terapkan({ ...SP.bacaFilter(), q: inp.value.trim() }); inp.blur(); };

    // ===== PANEL FILTER =====
    let f = SP.bacaFilter();
    const hitungAktif = x => (x.kat ? 1 : 0) + x.brand.length + x.sub.length + (x.skor ? 1 : 0) + (x.berat ? 1 : 0);
    const badge = () => { const n = hitungAktif(SP.bacaFilter()); $('jml-filter').textContent = n || ''; };
    badge(); window.addEventListener('sp-filter', badge);
    const lInp = $('laci-cari'), lBox = $('laci-saran');
    const sempit = () => matchMedia('(max-width:900px)').matches;
    const buka = (modeCari = false) => {
      f = SP.bacaFilter(); f.q = inp.value.trim() || f.q;
      lInp.value = f.q; lBox.classList.remove('buka');
      $('laci-judul').textContent = sempit() ? 'Cari & Filter' : 'Filter';
      isiLaci(); document.body.classList.add('laci-buka');
      if (modeCari) setTimeout(() => lInp.focus(), 280);
    };
    const tutup = tutupSemua;
    $('buka-filter').onclick = () => buka(false);
    $('buka-cari').onclick = () => buka(true);
    SP.bukaFilter = () => buka(false);
    // ketik di panel → kata kunci ikut jadi filter & jumlah hasil langsung berubah
    pasangSaran(lInp, lBox, () => { f.q = lInp.value.trim(); hitungTombol(); });
    $('laci-cari-form').onsubmit = ev => { ev.preventDefault(); f.q = lInp.value.trim(); tutup(); SP.terapkan(f); };
    function hitungTombol() {
      const n = SP.saring(sepatu, f).length;
      $('pakai-filter').textContent = `Tampilkan ${n} sepatu`; $('pakai-filter').disabled = !n;
    }

    function isiLaci() {
      const kats = (c.kategoriBeranda || []).map(x => ({ ...x, jml: SP.isiKategori(sepatu, x).length }));
      const dasar = SP.saring(sepatu, { ...f, brand: [], sub: [] });
      const hit = fn => dasar.reduce((m, s) => (fn(s) && (m[fn(s)] = (m[fn(s)] || 0) + 1), m), {});
      const brands = Object.entries(hit(s => s.brand)).sort((a, b) => a[0].localeCompare(b[0]));
      f.brand.forEach(b => !brands.some(x => x[0] === b) && brands.push([b, 0]));
      const subs = Object.entries(hit(s => s.subtipe)).sort((a, b) => b[1] - a[1]);
      const cek = (grup, [v, n], arr) => `<label class="cek"><input type="checkbox" data-g="${grup}" value="${e(v)}" ${arr.includes(v) ? 'checked' : ''}><span>${e(v)}</span><i>${n}</i></label>`;
      $('laci-isi').innerHTML = `
        <div class="f-grup"><h4>Urutkan</h4>
          <select id="lf-urut">${[['', 'Skor tertinggi'], ['baru', 'Terbaru dibedah'], ['ringan', 'Paling ringan'], ['rebound', 'Rebound tertinggi'], ['skor-asc', 'Skor terendah'], ['az', 'Nama A–Z']]
            .map(([v, t]) => `<option value="${v}" ${f.urut === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="f-grup"><h4>Kategori ${f.kat ? '<a id="lf-kat-reset">hapus</a>' : ''}</h4>
          <div class="kat-list">${kats.map(x => `<button class="kat-item ${f.kat === x.id ? 'aktif' : ''} ${x.jml ? '' : 'kosong'}" data-kat="${e(x.id)}">${SP.ikon(x.ikon)}<span>${e(x.nama)}</span><i>${x.jml || '–'}</i></button>`).join('')}</div></div>
        <div class="f-grup"><h4>Skor minimal <span>${f.skor ? SP.fmt(f.skor) : 'semua'}</span></h4>
          <input type="range" class="rentang" id="lf-skor" min="0" max="9" step="0.5" value="${f.skor}"><div class="rentang-nilai"><span>semua</span><span>9+</span></div></div>
        <div class="f-grup"><h4>Berat maksimal (1 pcs) <span>${f.berat ? f.berat + ' g' : 'semua'}</span></h4>
          <input type="range" class="rentang" id="lf-berat" min="150" max="800" step="10" value="${f.berat || 800}"><div class="rentang-nilai"><span>150 g</span><span>semua</span></div></div>
        ${subs.length ? `<div class="f-grup"><h4>Tipe</h4>${subs.map(x => cek('sub', x, f.sub)).join('')}</div>` : ''}
        <div class="f-grup"><h4>Brand</h4>
          ${brands.length > 8 ? '<input type="search" id="lf-cari-brand" placeholder="Cari brand…" style="margin-bottom:8px;padding:8px 10px">' : ''}
          <div id="lf-brand">${brands.map(x => cek('brand', x, f.brand)).join('')}</div></div>`;
      hitungTombol();

      $('laci-isi').querySelectorAll('.kat-item').forEach(b => b.onclick = () => { if (b.classList.contains('kosong')) return; f.kat = f.kat === b.dataset.kat ? '' : b.dataset.kat; f.brand = []; f.sub = []; isiLaci(); });
      $('lf-kat-reset') && ($('lf-kat-reset').onclick = () => { f.kat = ''; isiLaci(); });
      $('lf-urut').onchange = ev => { f.urut = ev.target.value; };
      $('lf-skor').onchange = ev => { f.skor = +ev.target.value; isiLaci(); };
      $('lf-skor').oninput = ev => ev.target.closest('.f-grup').querySelector('h4 span').textContent = +ev.target.value ? SP.fmt(+ev.target.value) : 'semua';
      $('lf-berat').onchange = ev => { f.berat = +ev.target.value >= 800 ? 0 : +ev.target.value; isiLaci(); };
      $('lf-berat').oninput = ev => ev.target.closest('.f-grup').querySelector('h4 span').textContent = +ev.target.value >= 800 ? 'semua' : ev.target.value + ' g';
      $('laci-isi').querySelectorAll('input[data-g]').forEach(i => i.onchange = () => {
        const arr = f[i.dataset.g]; i.checked ? arr.push(i.value) : arr.splice(arr.indexOf(i.value), 1); isiLaci(); });
      const cb = $('lf-cari-brand');
      if (cb) cb.oninput = () => $('lf-brand').querySelectorAll('.cek').forEach(l => l.style.display = l.textContent.toLowerCase().includes(cb.value.toLowerCase()) ? '' : 'none');
    }
    $('reset-filter').onclick = () => { f = { q: '', kat: '', brand: [], sub: [], skor: 0, berat: 0, urut: '' }; inp.value = ''; lInp.value = ''; lBox.classList.remove('buka'); isiLaci(); };
    $('pakai-filter').onclick = () => { tutup(); SP.terapkan(f); };
  });
})();
