# Analisis Fitur Pesaing vs Data API StockScope

Sumber data StockScope: actor Apify `kawsar/adobe-stock-scraper` (sebelumnya igolaizola; catatan di bawah ditulis dengan data actor lama).
- **Input:** keyword, `creatorId`, jenis konten, AI, urutan, jumlah aset.
- **Output:** per aset (ID, judul, keyword, kategori, kontributor, tanggal, **jumlah download**, AI, thumbnail; views/dimensi bila ada).

Tidak ada: pencarian gambar, riwayat harian, total hasil pencarian (supply), penghasilan.

## Klaim angka di landing page pesaing

| Klaim | Bisa kita tiru? | Catatan |
|---|---|---|
| 1M+ aset dilacak | Tidak sekarang | Butuh crawling terjadwal + database. Kita mengambil data saat dibutuhkan (on-demand). |
| 100% data download asli | Ya | Angka `nb_downloads` berasal dari Adobe Stock lewat actor. |
| 50k+ niche ditemukan | Tidak sekarang | Butuh database riwayat pencarian. |
| 24/7 update pasar | Tidak sekarang | Butuh job terjadwal (cron) + database. |

## Fitur per fitur

| Fitur pesaing | Status | Implementasi di StockScope |
|---|---|---|
| **Spy on sales**: download count aset mana pun | ✅ | Kartu aset + modal detail |
| Cari by keyword | ✅ | Riset Niche, kotak cari di Beranda |
| Cari by **Image ID** | ⚠️ belum terverifikasi | Beranda/Aset Dipantau menerima ID atau link aset. Actor tidak punya input ID, jadi ID dicari sebagai keyword (Adobe Stock mengenali ID di pencarian) lalu dicocokkan. Perlu diuji dengan token asli. |
| Sort by popularitas asli | ✅ | Urutan Download terbanyak / Sedang naik / Konversi |
| **Untapped niches**: bandingkan download antar niche | ✅ | Bandingkan & Peta Pasar (peta panas) |
| Keyword persaingan rendah | ✅ | Keyword emas |
| Ide konten berbasis data | ✅ baru | Tab Keyword → **Ide konten** (dari keyword emas, kategori memanas, frasa judul terlaris) |
| **Track performance**: riwayat data | ⚠️ sebagian | **Aset Dipantau**: snapshot setiap kali aset dicek atau muncul di hasil riset. Disimpan di browser, belum harian otomatis. |
| Grafik performa | ✅ baru | Grafik garis di Aset Dipantau dan modal detail |
| Ekspor CSV | ✅ | Ekspor CSV aset dan riwayat pantauan |
| Efek perubahan keyword/judul terhadap download | ⚠️ | Bisa dilihat manual lewat grafik riwayat. Belum ada penanda "judul diubah". |
| **Reverse image search** | ❌ | Actor tidak menerima gambar. Alternatif masa depan: model vision (mis. Claude) membuat keyword dari gambar, lalu riset niche dengan keyword itu ("mirip secara konsep", bukan visual). |
| **Analyze top portfolios** | ✅ | Lacak Kontributor (metrik sukses, terlaris, niche andalan) |
| **Market heatmap**: peta saturasi | ⚠️ sebagian | **Tren kategori** di Riset Niche (treemap porsi penjualan + peta panas kategori × waktu upload) dan peta panas di Bandingkan |
| Kategori memanas/mendingin | ✅ baru | Label ▲ memanas / ▼ mendingin per kategori (aset ≤12 bln vs >12 bln). Ini dari satu sampel, bukan tren waktu. |
| Demand vs supply | ❌ | Jumlah total hasil pencarian (supply) tidak tersedia dari actor |
| Seasonal trend alerts | ❌ | Kalender musiman sudah dihapus atas permintaan; alert butuh job terjadwal |

## Struktur dashboard

Menu dikelompokkan berdasarkan pertanyaan pengguna, bukan berdasarkan data:

```
Beranda               Satu kotak cari pintar (keyword / ID-link aset / link kontributor)
                      + 4 kartu alat dengan pertanyaan yang dijawabnya
                      + ringkasan aset & kontributor yang dipantau
RISET  (menemukan)
  Riset Niche         Ringkasan · Aset · Keyword (+ Ide konten) · Kompetisi
                      Ringkasan memuat Skor peluang dan Peta pasar
  Bandingkan & Peta   Beberapa niche / format → peta panas
LACAK  (mengikuti)
  Kontributor         Cari, Pantau, Ringkasan · Terlaris · Niche · Semua aset
  Aset Dipantau       Riwayat download, grafik, pertumbuhan/hari, CSV
Token Apify           Di bawah sidebar
```

Prinsipnya:
- **Satu pintu masuk.** Kotak cari Beranda mengenali jenis input sendiri, jadi pengguna tidak perlu tahu harus ke menu mana.
- **Semua terhubung.** Aset → Lacak kontributornya. Kontributor → Riset niche andalannya. Ide konten → Riset niche baru. Aset mana pun → Pantau.
- **Pemantauan gratis.** Aset yang dipantau ikut diperbarui setiap kali muncul di hasil riset atau portofolio, tanpa biaya tambahan.

## Yang dibutuhkan untuk menyamai pesaing sepenuhnya

1. **Database** (Supabase/Postgres): simpan setiap hasil pencarian dan snapshot. Ini dasar untuk "1M+ aset", riwayat lintas perangkat, dan tren pasar.
2. **Job terjadwal** (Vercel Cron/Apify Schedules): cek ulang aset dan kontributor yang dipantau setiap hari, plus sejumlah niche populer untuk heatmap tren.
3. **Pencarian visual**: model vision untuk keyword dari gambar (perkiraan konsep, bukan pencocokan visual persis).
