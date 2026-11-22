# Rekomendasi: Fokus ke "Aset yang Laku"

Tujuan utama pengguna bukan "melihat data", melainkan **membuat aset yang di-download**. Setiap fitur dinilai dari seberapa dekat ia membawa pengguna ke keputusan "buat apa, seperti apa, dan bagaimana menandainya".

## 1. Alur kerja kontributor vs StockScope saat ini

| Tahap | Pertanyaan kontributor | Sekarang | Celah |
|---|---|---|---|
| 1. Memilih ide | "Niche apa yang masih laku dan belum terlalu ramai?" | Kuat: Riset Niche, Bandingkan, Peta pasar, Ide konten | Hasilnya angka, belum berupa **keputusan** |
| 2. Merancang aset | "Format, gaya, orientasi, elemen apa yang harus ada?" | Datanya ada (format, orientasi, AI, kategori, keyword) tapi tersebar di 4 tab | **Tidak ada brief konten** |
| 3. Produksi | (di luar aplikasi) | – | – |
| 4. Metadata | "Judul dan keyword apa?" | Salin keyword terlaris dan frasa judul | Keyword diurutkan dari aset lama, belum dari yang **laku sekarang** |
| 5. Upload | "Kapan?" | Urutan "Sedang naik" | Kalender dihapus; cukup |
| 6. Evaluasi | "Aset saya yang mana yang laku, dan kenapa?" | Lacak Kontributor + Aset Dipantau (umum) | **Tidak ada "Portofolio Saya"** yang menghubungkan aset sendiri dengan pasar |

**Kesimpulan:** tahap 1 sudah kuat. Nilai terbesar yang belum digarap ada di **tahap 2 (brief)** dan **tahap 6 (belajar dari portofolio sendiri)**. Keduanya bisa dibuat dari data API yang sudah ada.

## 2. Fitur baru yang paling berdampak (prioritas)

### P1. Brief Konten: "Apa yang harus dibuat"
Satu kartu di atas hasil Riset Niche yang mengubah data menjadi instruksi, misalnya:
- **Buat:** Foto, horizontal, non-AI. Kategori: People.
- **Elemen yang sering ada di aset laku:** copy space, teamwork, office, diversity (dari keyword aset dengan dl/bln tertinggi).
- **Hindari:** konten AI (non-AI laku 2,1× lebih cepat di niche ini).
- **Referensi:** 6 aset ≤12 bulan yang paling cepat laku.
- **Judul & 25 keyword awal:** siap disalin.
- Tombol **Salin brief** untuk dibawa ke sesi foto/desain.

Semua komponen sudah dihitung oleh `analyze()`; tinggal dirangkum.

### P2. Portofolio Saya
Pengguna memasukkan Creator ID-nya sekali, lalu Beranda menampilkan:
- aset saya yang paling cepat laku dan yang **0 download** (kandidat perbaikan judul/keyword);
- niche andalan saya dan **performa saya vs pasar** di niche itu (dl/bln saya vs rata-rata niche);
- **celah**: niche yang memanas di pasar tapi belum saya isi;
- tren portofolio dari snapshot (sudah ada mekanismenya).

Ini mengubah StockScope dari "alat mata-mata" menjadi "pelatih portofolio".

### P3. Daftar Ide (simpan & prioritaskan)
Tombol "Simpan ide" di Ide konten, keyword emas, dan hasil Bandingkan. Daftar ide menyimpan skor peluangnya dan bisa ditandai *direncanakan → dibuat → diupload*. Ini menjembatani riset dan produksi; disimpan di browser seperti watchlist.

## 3. Optimasi fitur yang sudah ada

| # | Masalah | Perbaikan |
|---|---|---|
| O1 | **Total download** jadi angka utama, padahal aset lama selalu menang. | Jadikan **dl/bln (kecepatan jual)** metrik utama di kartu, tabel, dan urutan default. Total download jadi angka pendukung. |
| O2 | Keyword terlaris dihitung dari semua aset teratas, termasuk aset 5 tahun lalu. | Bobot keyword berdasarkan **aset ≤12–24 bulan yang laku**, tampilkan "naik/turun" per keyword. |
| O3 | Skor peluang tanpa penjelasan tindakan. | Tambahkan 2–3 **tindakan** di bawah skor (mis. "pakai sub-niche", "hindari AI", "fokus video"). |
| O4 | Sampel default 100 aset terlaris = bias ke aset lama. | Riset Niche otomatis mengambil 2 sampel kecil (terlaris + terbaru) atau menyarankan "Sedang naik" saat aset baru sedikit. Biaya naik sedikit, wawasan "laku sekarang" jauh lebih akurat. |
| O5 | Banyak angka, pengguna baru bingung. | Mode ringkas di Ringkasan: Kesimpulan → Brief → detail (detail bisa dibuka). Panduan sudah ada. |
| O6 | Lacak Kontributor menampilkan apa yang laku, belum **kenapa**. | Pola dari karya terlaris mereka: format dominan, orientasi, kategori, keyword yang berulang, rata-rata panjang judul. |
| O7 | Data pantauan hanya di browser. | Database + cek terjadwal (roadmap) agar riwayat harian akurat dan lintas perangkat. |

## 4. Batasan data yang perlu diingat

- Download adalah **total sepanjang masa**; kecepatan jual (dl/bln) adalah perkiraan.
- Sampel maks. 300 aset per pencarian dan diurutkan oleh Adobe, bukan seluruh pasar.
- Tidak ada data supply (jumlah total aset per keyword) dan penghasilan.
- "Kenapa laku" adalah pola statistik dari keyword/format/kategori, bukan analisis visual gambar.

## 5. Status

- ✅ **O1 + O2**: dl/bln jadi metrik utama dan urutan default; keyword berbobot aset ≤2 tahun dengan tren ▲/▼.
- ✅ **P1 Brief Konten**: kartu pertama di Riset Niche → Ringkasan.
- ❌ **P2 Portofolio Saya**: sempat dibuat, lalu dihapus atas permintaan pemilik produk. Evaluasi portofolio sendiri tetap bisa lewat Lacak Kontributor.
- ⏳ P3 Daftar Ide, O3–O6, O7.

## 6. Usulan urutan pengerjaan (awal)

1. **O1 + O2**: metrik dl/bln jadi utama, keyword berbobot aset baru. Kecil, dampak langsung ke semua halaman.
2. **P1 Brief Konten**: dampak terbesar ke tujuan "aset yang laku".
3. **P2 Portofolio Saya**: menjadikan aplikasi alat harian, bukan alat sesekali.
4. **P3 Daftar Ide**, **O3–O6**.
5. **O7**: database dan pengecekan terjadwal (fondasi SaaS).
