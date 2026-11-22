# StockScope — Riset Microstock Adobe Stock

Web app untuk kontributor microstock: riset niche, keyword terlaris, dan analisis kompetitor di Adobe Stock, memakai Apify actor [kawsar/adobe-stock-scraper](https://apify.com/kawsar/adobe-stock-scraper).

## Fitur

Menu dikelompokkan berdasarkan pertanyaan pengguna. Analisis kebutuhan: [docs/analisis-kebutuhan.md](docs/analisis-kebutuhan.md) · Perbandingan dengan fitur pesaing: [docs/analisis-fitur-pesaing.md](docs/analisis-fitur-pesaing.md). · Rekomendasi fokus "aset yang laku": [docs/rekomendasi-fokus-download.md](docs/rekomendasi-fokus-download.md).

**Beranda**
- Satu kotak cari pintar: keyword → Cari Aset, ID/link aset → detail aset + jumlah download, link kontributor → Lacak Kontributor.
- Mulai dalam 3 langkah, kotak angka, kartu alat, **keyword lagi naik** (dari tren tersimpan), dan aset tercepat dari pencarian terakhir.

**Riset**
- **Cari Aset (fitur utama):** ketik keyword, pilih jenis konten, urutan, AI/non-AI, dan jumlah aset. Pencarian baru meminta **konfirmasi** berisi perkiraan biaya dulu. Semua hasil berbayar **disimpan permanen** di Supabase (daftar *Tersimpan*, gratis dibuka lagi), dan hasil lama bisa **dipulihkan dari Apify** (± 7 hari terakhir).
  - *Aset* (tab pertama): galeri aset yang **paling cepat laku** (dl/bln), filter gratis (format, orientasi, AI, umur, kategori, kontributor), detail lengkap, CSV.
  - *Ringkasan*: **Brief konten**, skor peluang, insight, **Tren kategori** (peta kategori + peta panas per waktu upload), AI vs non-AI, format, orientasi.
  - *Keyword*: terlaris berbobot aset ≤2 tahun (▲/▼), keyword emas, **ide konten**, frasa judul, kategori.
  - *Kompetisi*: dominasi dan kontributor teratas.
- **Tren Keyword:** keyword di 15 tema dengan label 🔥 Naik daun / 🌱 Celah / 📈 Laku stabil / ⚠️ Jenuh, angka laku, naik, % terjual, % upload baru, % AI, keyword pasangan, format terbaik, contoh aset, dan ▲/▼ dibanding pembaruan sebelumnya. Data hanya diambil saat tombol **Perbarui tren** diklik dan dikonfirmasi (± $1, 5–8 menit); hasilnya disimpan di Supabase dan gratis dilihat semua pengguna.

**Lacak**
- **Lacak Kontributor:** ringkasan portofolio, terlaris, sedang naik, niche andalan, semua aset; **Pantau** untuk snapshot pertumbuhan.

Lainnya: **panduan** lewat tombol **?** mengambang (otomatis membuka topik halaman yang sedang dibuka, plus daftar istilah), token Apify milik sendiri, riwayat pencarian, hasil tersimpan permanen, dan mode demo tanpa token.

## Cara menjalankan

Butuh Node.js 18.18 atau lebih baru (unduh versi LTS di https://nodejs.org).

**Cara cepat (sekali klik):**
- Windows: klik dua kali `install-windows.bat`
- macOS/Linux: jalankan `bash install-mac-linux.sh`

Skrip memeriksa Node.js, menginstal dependensi, membuat `.env.local`, lalu menjalankan aplikasi dan membuka browser.

**Manual:**

```bash
npm install
cp .env.example .env.local   # lalu isi APIFY_TOKEN
npm run dev
```

Buka http://localhost:3000.

**Token Apify milik sendiri:** klik tombol **Token Apify** di kanan atas, tempel token, lalu *Tes token* / *Simpan*. Token disimpan hanya di browser (opsi "Ingat di browser ini"), dikirim saat mencari, dan tidak disimpan di server. Biaya pencarian masuk ke akun Apify masing-masing pengguna. `APIFY_TOKEN` di `.env.local` tetap bisa dipakai sebagai token server (cadangan bila pengguna tidak memasukkan token).

Tanpa token sama sekali, aplikasi berjalan dalam **mode demo** dengan data contoh, jadi tampilannya bisa dicoba dulu tanpa biaya.

API token tersedia di Apify Console → Settings → API & Integrations.

## Struktur

```
app/page.js                 Navigasi atas, hero, Cari Aset
app/api/research/route.js   Endpoint backend: validasi input → cache → Apify → analisis
app/api/asset/route.js      Cari satu aset berdasarkan ID (lewat pencarian Adobe)
lib/parse.js                Mengenali input: keyword / ID-link aset / link kontributor
app/components/             Dashboard, NicheReport, ContributorView, AssetWatch, AssetList + AssetModal, Compare, watch (watchlist), ui
lib/apify.js                Pemanggil Apify + data demo
lib/analyze.js              Perhitungan metrik, keyword, kategori, kontributor, skor peluang
lib/contentTypes.js         Daftar jenis konten, tips, ekstensi, deteksi jenis aset
lib/cache.js                Hasil tersimpan: Supabase (permanen) atau file .cache/ saat development
lib/ratelimit.js            Batas pencarian berbayar per IP per jam (RATE_LIMIT_PER_HOUR)
```

## Situs pribadi dan MCP Claude

Situs dikunci password: isi `SITE_PASSWORD` di Environment Variables (Vercel). Tanpa itu situs menolak semua akses.

Claude bisa memakai StockScope lewat MCP: isi `MCP_SECRET` (acak, min. 24 karakter) dan `MCP_APIFY_TOKEN`, lalu di Claude →
Settings → Connectors → Add custom connector, masukkan `https://<situs>/api/mcp?key=<MCP_SECRET>`. Tool: cari_aset,
analisis_kontributor, tren_keyword, riwayat_pencarian, cek_kuota. Pencarian baru dibatasi `MCP_DAILY_LIMIT` per hari (default 30).

## Biaya

Actor kawsar dikenai biaya $0,60 per 1.000 hasil (paket Free Apify; $0,50 di Starter). Satu analisis 100 aset ≈ $0,06. Cache mengurangi biaya untuk pencarian yang berulang.

## Langkah selanjutnya (untuk dijadikan SaaS)

1. Ganti cache file dengan database (Supabase/Postgres) dan simpan snapshot untuk Trend Tracker.
2. Tambah login (Supabase Auth/Clerk) dan kuota per paket.
3. Pembayaran: Midtrans/Xendit (lokal) atau Stripe/Lemon Squeezy (global).
4. Untuk query besar, ganti `run-sync-get-dataset-items` dengan run async + webhook Apify.
5. Deploy ke Vercel (cache file tidak persisten di Vercel, jadi pindahkan ke database dulu).

## Catatan

- Angka download adalah snapshot dari Adobe Stock dan bisa tidak akurat untuk sebagian aset. Tampilkan sebagai estimasi.
- Actor ini dibuat pihak ketiga dan tidak berafiliasi dengan Adobe. Periksa Terms of Service Adobe Stock dan Apify sebelum dijual komersial.
