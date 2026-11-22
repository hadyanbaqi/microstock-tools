# Analisis Kebutuhan Kontributor Microstock (Adobe Stock)

## Siapa penggunanya

| Persona | Kondisi | Kebutuhan utama |
|---|---|---|
| Pemula | Portofolio < 500 aset, belum tahu niche | Ide niche yang masih terbuka, contoh aset laku, metadata yang benar |
| Kontributor aktif | Upload rutin, ingin naik penghasilan | Prioritas niche, keyword yang menjual, waktu upload musiman |
| Pengguna AI generatif | Produksi cepat, banyak aset | Tahu niche mana yang jenuh AI dan mana yang masih menerima AI |
| Tim/agensi | Banyak kontributor, target bulanan | Perbandingan niche, riset kompetitor, ekspor data |

## Masalah utama → fitur

| # | Masalah kontributor | Fitur di StockScope |
|---|---|---|
| 1 | "Niche mana yang masih ada peluang?" | **Skor peluang** (permintaan, momentum, ruang aset baru, keterbukaan, penalti AI) + rincian komponen dan kesimpulan |
| 2 | "Apakah saya masih bisa bersaing di sini?" | **Dominasi top 5 kontributor**, porsi aset baru di daftar teratas, **kecepatan jual per umur aset** |
| 3 | "Apakah konten AI laku di niche ini?" | **AI vs non-AI** (rata-rata download & dl/bln) + insight otomatis |
| 4 | "Keyword apa yang dipakai aset terlaris?" | **Keyword terlaris** (huruf besar/kecil digabung, % aset yang memakai, dl/bln) |
| 5 | "Keyword apa yang belum banyak dipakai tapi laku?" | **Keyword emas**: dipakai ≤ 25% aset teratas namun dl/bln di atas rata-rata niche |
| 6 | Mengisi metadata makan waktu, 10 keyword pertama paling berpengaruh | Salin 25/49 keyword terlaris, 10 keyword utama sebuah aset, atau keyword andalan kontributor; frasa judul terlaris |
| 7 | Upload musiman sering terlambat | Riset niche musiman lewat urutan "Terbaru"/"Sedang naik" (Kalender Musiman dihapus dari aplikasi) |
| 8 | Sulit memilih di antara beberapa ide | **Bandingkan niche**: hingga 5 niche, diurutkan berdasarkan skor |
| 9 | Ingin belajar dari kontributor besar | **Lacak Kontributor**: Creator ID/link profil → karya terlaris, sedang naik, distribusi performa (hit rate, pareto), format & kategori, niche andalan, aktivitas upload; **Pantau** menyimpan snapshot untuk melihat pertumbuhan download |
| 10 | Riset berulang dan biaya | Cache 48 jam (query tidak peka huruf besar), riwayat pencarian, penggabungan permintaan ganda, batas per IP |

## Cara membaca skor peluang

- **Permintaan**: rata-rata download aset teratas (skala log).
- **Momentum**: rata-rata download per bulan aset berumur ≤ 12 bulan. Tinggi = aset baru masih laku.
- **Ruang aset baru**: porsi aset ≤ 12 bulan di daftar teratas.
- **Keterbukaan**: 100 − porsi download yang dikuasai 5 kontributor teratas.
- Total dikurangi hingga 30% sesuai porsi konten AI.

≥ 60 = peluang bagus · 35–59 = kompetitif · < 35 = jenuh/permintaan rendah. Ini heuristik dari sampel, bukan angka pasti; bobotnya di `lib/analyze.js`.

## Keterbatasan data

- Jumlah download adalah snapshot Adobe Stock dan bisa tidak akurat untuk sebagian aset.
- Sampel hanya berisi aset teratas sesuai urutan yang dipilih (default: download terbanyak), bukan seluruh pasar. Jumlah total hasil pencarian (sisi penawaran) belum tersedia dari actor.

## Pengembangan berikutnya (prioritas)

1. **Trend tracker**: simpan snapshot harian ke database untuk melihat niche yang naik/turun (butuh Supabase).
2. **Jumlah hasil pencarian (supply)** per keyword untuk rasio permintaan/penawaran yang sebenarnya.
3. **Login + kuota** (Free 5 pencarian/hari, Pro) dan pembayaran.
5. **Saran keyword dari gambar** (vision model) yang dicocokkan dengan keyword terlaris niche.

## Ketersediaan API (ditulis untuk actor lama `igolaizola/adobe-stock-scraper`; sekarang `kawsar/adobe-stock-scraper`, lihat CLAUDE.md)

Dicek Oktober 2026 dari dokumentasi publik actor dan form input yang dikirim pengguna. Apify tidak bisa diakses langsung dari server pengembangan, jadi nilai yang ditandai "belum pasti" perlu diuji sekali dengan token asli.

| Input | Status | Dipakai di StockScope |
|---|---|---|
| `query` | Pasti | Kata kunci |
| `creatorId` | Pasti (sendiri = portofolio, + query = cari di portofolio) | Analisis Kompetitor |
| `maxItems` | Pasti (default 100; 0 = tanpa batas) | Jumlah aset, dibatasi 10–300 di server |
| `ai`: `""`, `only`, `exclude` | Pasti | AI generatif |
| `asset`: photo, illustration, vector, video, template, 3d | Pasti | Jenis konten |
| "All Types" | Ada di form actor; nilainya tidak diketahui | "Semua jenis" = `asset` tidak dikirim. Dokumentasi lama menyebut default `photo`, jadi bila hasilnya hanya foto, ganti nilainya |
| `order`: `downloads`, `relevance`, `newest` | Pasti | Urutkan |
| `order`: Recent, Featured, Undiscovered | Label ada di form actor; nilai `recent`/`featured`/`undiscovered` belum pasti | Bila ditolak, aplikasi menampilkan pesan jelas (validasi gagal sebelum run, tanpa biaya) |

| Output | Status | Dipakai |
|---|---|---|
| id, title, details_url, creator, kategori, keywords, tanggal, download, AI, thumbnail | Pasti | Semua fitur |
| Views | Disebut di dokumentasi; nama field diasumsikan `nb_views` | Konversi (download per 100 views), urut "paling banyak dilihat" |
| Dimensi | Disebut di dokumentasi; diasumsikan `width`/`height` | Orientasi (horizontal/vertikal/persegi) dan ukuran |
| Jenis aset per item | Belum pasti | `detectType` membaca `media_type_id`/field jenis/URL bila ada |

Panel dan filter yang bergantung pada field yang belum pasti otomatis disembunyikan bila datanya tidak ada.

Filter Adobe Stock lain (orientasi saat mencari, warna, orang, latar terisolasi, gratis) **tidak** tercantum sebagai input actor ini, jadi tidak ditambahkan ke pencarian. Orientasi tetap tersedia sebagai filter hasil dari data dimensi.

## Lacak Kontributor: apa yang bisa dari API

| Kebutuhan | Bisa? | Caranya / batasannya |
|---|---|---|
| Cari kontributor | Ya, lewat ID | Actor menerima `creatorId` (angka). Link profil Adobe Stock diubah otomatis ke ID. Pencarian berdasarkan **nama** tidak didukung actor; nama bisa ditemukan lewat tab Kompetisi di Riset Niche. |
| Karya terlaris | Ya | `order: downloads` + `creatorId` → aset diurutkan dari download terbanyak. |
| Analitik portofolio | Ya, dari sampel | Dihitung dari maks. 300 aset per pengecekan (batas biaya). Untuk kontributor besar ini adalah aset teratasnya, bukan seluruh portofolio. |
| Performa download | Ya | Total, rata-rata, median, download/bulan, hit rate (≥100 dl), distribusi, pareto 10%. Angka download adalah total sepanjang masa dari Adobe. |
| Pertumbuhan dari waktu ke waktu | Sebagian | API tidak menyediakan riwayat. StockScope menyimpan snapshot setiap kali kontributor yang dipantau dicek (di browser), lalu menghitung selisihnya. Untuk SaaS: pindahkan ke database + cek terjadwal. |
| Jumlah total aset portofolio, penghasilan, profil (foto, bio) | Tidak | Tidak ada di output actor. |
