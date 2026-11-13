# Website Shoe Police — Database Bedah Sepatu

Website statis buat GitHub Pages. Datanya diambil otomatis dari Form Bedah di Google Drive (1 tab = 1 sepatu).

## Isi folder
| File | Fungsi |
|---|---|
| `index.html` | Beranda: hero + pencarian, deretan "Baru dibedah", card kategori |
| `database.html` | Hasil cari & filter. Kolom cari + tombol Filter (panel dari samping) ada di header semua halaman |
| `bandingkan.html` / `metode.html` | Bandingkan 2–4 sepatu · penjelasan metode tes |
| `sepatu.html` | Halaman detail hasil bedah 1 sepatu |
| `tentang.html` | Tentang, segmen konten, tim |
| `konten.html` | Embed video YouTube & post Instagram |
| `kontak.html` | Form kerja sama |
| `data/config.json` | **Semua yang bisa diedit tanpa ngoding**: link sosmed, video, tim, segmen, URL API |
| `data/sepatu.json` | Data cadangan (dipakai kalau Apps Script belum dipasang) |
| `apps-script/Code.gs` | API yang baca semua Form Bedah → JSON + nyimpen kiriman form kerja sama |

## 1. Upload ke GitHub (akun Shoe Police)
1. Login GitHub pakai akun Shoe Police → **New repository** → nama misal `shoepolice.github.io` (biar alamatnya `https://<username>.github.io`) atau nama bebas, set **Public**.
2. Klik **uploading an existing file** → drag semua isi folder ini (termasuk folder `assets`, `data`) → **Commit changes**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
4. Tunggu 1–2 menit, website tayang di alamat yang muncul di halaman Pages.

## 2. Pasang Apps Script (biar data live dari Form Bedah)
1. Buka https://script.google.com pakai akun yang punya akses ke file Form Bedah → **New project**.
2. Hapus isi default, paste semua isi `apps-script/Code.gs` → Save.
3. Pilih fungsi `pasangTrigger` → **Run** → izinkan aksesnya. (Ini bikin data pertama + update otomatis tiap jam.)
4. **Deploy → New deployment** → type **Web app** → Execute as: *Me* · Who has access: *Anyone* → Deploy → copy URL-nya.
5. Paste URL itu ke `data/config.json` di `"apiUrl": "…"` lalu commit.

Sepatu baru otomatis muncul paling lambat 1 jam setelah tab-nya diisi FINAL SCORE.
Mau sembunyikan sepatu tertentu (misal collab yang belum tayang)? Tulis nama tab-nya di `TAB_DISEMBUNYIKAN` di Code.gs.
Kiriman form kerja sama masuk ke spreadsheet baru "Kerja Sama Website — Shoe Police" di Drive.

## 3. Nambah video / ganti tim
Edit `data/config.json` langsung di GitHub (ikon pensil):
- `videoYoutube`: daftar link video, misal `["https://youtu.be/xxxxxxxxxxx"]`
- `postInstagram`: daftar link post IG
- `tim`: nama, peran, link foto
- Link video bedah per sepatu: tambahkan baris **"Link video"** (kolom A) + link-nya (kolom B) di tab Form Bedah sepatu itu.
- Foto sepatu: tambahkan baris **"Link foto"** (kolom A) + link Google Drive foto (kolom B). Set foto ke "Anyone with the link". Paling bagus foto samping (side view) dengan background putih/polos.

## 4. Ganti kategori di beranda
Buka `data/config.json` → bagian `kategoriBeranda`. Tiap kategori:
```json
{ "id": "trail-run", "nama": "Trail Run", "deskripsi": "…", "cocok": ["trail"], "kecuali": [], "gambar": "" }
```
- **Urutan** di file = urutan card di beranda. Mau hapus kategori? Hapus barisnya. Mau tambah? Copy satu baris, ganti `id` & `nama`.
- **cocok** = kata kunci yang dicari di kategori Form Bedah (Sneakers/Running/…), Sub Type / Kategori lari, dan baris **"Tag website"**.
- **kecuali** = kata kunci yang dikeluarkan (misal Running tanpa trail).
- **wajib** = semua kata kunci ini harus ada (misal Hiking Boots: wajib `hiking` + cocok `boot`).
- **ikon** = `sepatu`, `boot`, `sandal`, `spike`, `court`, atau `heels` (tampil di panel Filter & card tanpa foto).
- **gambar** = link foto cover card (kosongkan = pakai foto sepatu di kategori itu).
- `"otomatis": "terbaru"` = isi otomatis sepatu paling baru dibedah (pakai Tanggal tes; kalau kosong, tab paling kanan dianggap paling baru).
- Kategori yang belum ada isinya tampil redup "Segera hadir". Mau disembunyikan? Ubah `"tampilkanKategoriKosong": false`.

Buat kategori yang tidak ada di Form Bedah (misal **Women Shoes**): tambahkan baris **"Tag website"** di kolom A tab sepatu itu, isi kolom B misal `women` (boleh lebih dari satu: `women, casual`).

## 5. Nulis artikel
Buka `data/artikel.json` di GitHub (ikon pensil) → copy satu blok artikel paling atas → ganti isinya → Commit.
- `id`: alamat artikel, huruf kecil pakai tanda minus (misal `review-hoka-speedgoat-7`)
- `tanggal`: format `2026-11-20` (artikel diurutkan dari yang terbaru; 3 terbaru tampil di beranda)
- `kategori`: bebas (Hasil Lab, Panduan, Berita, Investigasi…) → otomatis jadi tab di halaman Artikel
- `gambar`: link gambar cover (kosong = cover hitam-kuning otomatis)
- `sepatu`: daftar `id` sepatu dari database yang dibahas → muncul kotak "Sepatu di artikel ini" + tombol bandingkan
- `isi`: satu baris = satu paragraf. `## ` subjudul, `- ` poin, `> ` catatan, `![keterangan](link)` gambar, `**tebal**`, `[teks](link)` tautan
