"use client";
import { useEffect, useRef, useState } from "react";

// Guide content per feature. `go` = the page the "Buka" button opens.
const TOPICS = [
  {
    id: "home", title: "Beranda", go: "home",
    intro: "Titik awal. Satu kotak cari yang mengenali sendiri apa yang Anda ketik.",
    steps: [
      "Ketik **keyword** (mis. “ramadan background”) untuk membuka Cari Aset.",
      "Tempel **ID atau link aset** Adobe Stock untuk melihat jumlah download aset itu.",
      "Tempel **link profil kontributor** (…/contributor/123…) untuk membedah portofolionya.",
      "**Mulai dalam 3 langkah** memandu pengguna baru; centang otomatis saat langkahnya selesai, dan bisa disembunyikan.",
      "**Ide niche siap pakai**: 16 kategori keyword yang paling banyak dicari di microstock (bisnis, teknologi, latar, makanan, …). Klik nama kategori untuk mencari keyword utamanya, atau klik **sub-keyword** untuk pencarian yang lebih spesifik dan biasanya lebih sedikit pesaingnya. Tanda ✓ = sudah tersimpan, dibuka gratis.",
      "Ide musiman (Natal, Ramadan, Black Friday, …) ada di halaman **Kalender**.",
      "**Terakhir (gratis)** di bawah kotak cari membuka hasil yang sudah tersimpan tanpa mengambil data lagi.",
      "**Keyword lagi naik** diambil dari tren tersimpan (gratis); klik untuk mencari asetnya.",
      "**Paling cepat laku** menampilkan 6 aset tercepat dari pencarian terakhir Anda.",
    ],
  },
  {
    id: "agent", title: "Agent", go: "motion",
    intro: "Tab Agent di Studio Motion. Satu perintah → riset live → ide → kode HTML → antrean → metadata. Memakai AI Ciora dan data Apify.",
    steps: [
      "Sekali saja: buka **Koneksi**, lalu di kartu **AI** tempel API key Ciora. Model terbaik dipilih otomatis; **Ganti model** kalau mau memilih sendiri.",
      "Tulis perintah, mis. “riset gold particles, buat 5 video loop background luxury”, lalu **Jalankan agent** (Ctrl+Enter).",
      "Agent menunjukkan **Rencana**: keyword riset, jenis aset, jumlah video, rasio, durasi, dan perkiraan biaya (Apify + Ciora). Ubah bila perlu, lalu **Jalankan**. Belum ada biaya sebelum tombol ini ditekan.",
      "**Riset** mengambil data baru dari Adobe Stock lewat Apify. Kalau keyword yang sama baru saja dicari dan datanya masih baru, data dari database dipakai (gratis).",
      "Agent menulis **insight** pasar dan ide yang jelas berbeda, lalu kode HTML tiap ide (2 sekaligus). Kode yang gagal dicek ditulis ulang otomatis sekali. Setelah itu **metadata SEO** (judul + 40 keyword dari riset).",
      "Tiap video langsung masuk **antrean** begitu kodenya jadi, jadi **Berhenti** tidak membuang yang sudah dibayar. Rasio dan durasi rencana otomatis menjadi Pengaturan video. Lalu **Pratinjau**, **Render**, dan **CSV**.",
      "Boleh pindah halaman saat agent bekerja; **Berhenti** membatalkan langkah yang sedang jalan.",
    ],
  },
  {
    id: "niche", title: "Cari Aset", go: "niche",
    intro: "Fitur utama. Menjawab: aset seperti apa yang laku untuk keyword ini, dan apa yang harus saya buat?",
    steps: [
      "Ketik keyword, pilih **Jenis konten**, **Urutkan**, **AI generatif**, dan **Jumlah aset**, lalu tekan tombol panah. Jenis default **Vektor**, dan jenis terakhir yang dipakai diingat. Hindari **Semua jenis**: di data asli sering hanya mengembalikan foto.",
      "Kalau hasilnya belum pernah dicari, muncul **konfirmasi** berisi perkiraan biaya sebelum data diambil. Kalau sudah pernah dibayar, konfirmasi menawarkan **Buka yang tersimpan (gratis)**.",
      "**Tersimpan (gratis)** di bawah kotak cari: semua pencarian berbayar disimpan permanen. **Semua & pulihkan dari Apify** juga bisa menarik kembali hasil pencarian lama dari akun Apify Anda (± 7 hari terakhir) tanpa biaya.",
      "**Aset** (tab pertama): galeri aset yang **paling cepat laku** (dl/bln). Saring lagi menurut format, orientasi, AI, umur, kategori, atau kontributor tanpa biaya. Klik kartu untuk detail dan semua keyword.",
      "**Ringkasan:** **Brief konten** (apa yang harus dibuat), skor peluang 0–100, insight, dan **Tren kategori**: Peta kategori (luas kotak = porsi penjualan, hijau = memanas, merah = mendingin) atau Per waktu upload (peta panas).",
      "**Keyword:** keyword terlaris berbobot aset ≤2 tahun (▲ naik / ▼ turun), **keyword emas**, dan **Ide konten**. Panel **Metadata siap pakai** memberi 3 saran judul SEO (≤70 karakter, tanpa koma, tanpa merek) dan tombol **Salin 40 keyword** untuk CSV.",
      "**Bandingkan niche** (di baris Tersimpan): pilih 2–6 pencarian tersimpan, termasuk hasil riset lewat Claude, lalu lihat berdampingan skor peluang, dl/bulan semua aset dan aset ≤12 bulan, jumlah aset baru, dominasi kontributor, porsi AI, format terbaik dan keyword teratas. Nilai terbaik tiap baris berwarna hijau. Gratis.",
      "**Kompetisi:** seberapa dikuasai 5 kontributor teratas. “Lacak →” membuka portofolio mereka.",
    ],
    tips: [
      "Urutan “Sedang naik” = aset terbaru yang paling cepat laku: cocok untuk tren baru.",
      "Tren kategori: klik sebuah kotak atau baris untuk langsung melihat aset di kategori itu.",
      "Hasil yang tersimpan tidak pernah hilang. Data dianggap “segar” selama 48 jam; setelah itu Anda bisa memilih membuka yang tersimpan (gratis) atau mengambil data baru.",
    ],
  },
  {
    id: "trends", title: "Tren Keyword", go: "trends",
    intro: "Menjawab: keyword apa yang sedang naik di Adobe Stock, dan mana yang sebaiknya dihindari?",
    steps: [
      "Halaman ini menampilkan **tren tersimpan** (gratis). Data baru hanya diambil saat Anda klik **Perbarui tren** dan menyetujui konfirmasinya.",
      "Satu pembaruan memindai **15 tema** × 120 aset (40 terbaru + 40 terlaris + 40 paling relevan agar aset baru yang laku ikut terbaca), ± 7–10 menit, ± $1,10. Hasilnya disimpan dan dilihat semua pengguna.",
      "Setiap keyword diberi label: **🔥 Naik daun**, **🌱 Celah**, **📈 Laku stabil**, atau **⚠️ Jenuh**.",
      "Angka di bawahnya: **Laku** (median dl/bln aset terlaris ≤1 tahun), **Naik** (kecepatan aset terlaris baru ÷ lama), **Dipakai % aset terlaris** (permintaan), **% upload baru** (keramaian), dan **% AI**.",
      "▲/▼ = perubahan peringkat dibanding pembaruan sebelumnya. Klik **Cari aset →** untuk analisis lengkap keyword itu.",
    ],
    tips: [
      "Mulai dari 🔥 dan 🌱 dengan AI < 30% bila Anda membuat konten non-AI.",
      "“Salin keyword set” menyalin keyword beserta pasangannya untuk metadata.",
      "Ini perkiraan dari sampel, bukan data resmi Adobe.",
    ],
  },
  {
    id: "calendar", title: "Kalender", go: "calendar",
    intro: "Menjawab: konten musiman apa yang harus saya buat dan upload sekarang?",
    steps: [
      "**Upload sekarang**: acara yang jendela upload-nya sedang terbuka, urut dari yang paling dekat, lengkap dengan sisa hari dan batas upload (sebulan sebelum hari H).",
      "Label: **Upload sekarang** (masih sempat), **Mepet** (kurang dari sebulan, pembeli sudah banyak yang membeli), **Nanti** (belum waktunya), **Lewat**.",
      "**12 bulan ke depan**: semua acara per bulan. Klik sebuah acara untuk melihat kapan mulai menyiapkan, batas upload, dan keyword yang disarankan.",
      "**Cari aset →** membuka Cari Aset untuk acara itu; kalau pernah dicari, datanya terbuka gratis dan angkanya tampil di kartu.",
      "Saring per kategori: hari raya, belanja & promo, hari peringatan, musim, budaya & festival, Indonesia.",
    ],
    tips: [
      "Tanggal dihitung otomatis setiap hari, termasuk Ramadan, Idul Fitri, dan Imlek yang berpindah tiap tahun.",
      "Pembeli mencari konten musiman 1–3 bulan sebelum hari H: upload sedini mungkin.",
    ],
  },
  {
    id: "contributor", title: "Lacak Kontributor", go: "contributor",
    intro: "Menjawab: apa yang membuat kontributor ini sukses, dan bisakah Anda belajar darinya?",
    steps: [
      "**Portofolio saya:** simpan Creator ID Anda sekali, lalu klik **Vektor terbaru**, **Video terbaru** atau **Ilustrasi/PNG terbaru**. Panel **Aset saya yang mulai laku** menunjukkan upload ≤6 bulan yang sudah laku (urut dl/bulan), berapa persen yang belum laku, dan keyword yang sering ada di aset yang laku.",
      "Tempel **link profil** kontributor Adobe Stock atau **Creator ID**-nya, lalu tekan tombol panah.",
      "“Ambil aset”: **Terlaris dulu** untuk karya terbaik, **Terbaru dulu** untuk melihat ritme upload.",
      "**Ringkasan:** total download, download/bulan, hit rate (aset ≥100 download), distribusi performa, format, dan kategori.",
      "**Terlaris** & **Sedang naik**, **Niche & keyword** andalan (klik untuk riset), dan **Semua aset**.",
      "Klik **+ Pantau**. Setiap kali dicek lagi, pertumbuhan download-nya tercatat.",
    ],
    tips: [
      "Belum tahu ID-nya? Di Cari Aset → tab Kompetisi, klik “Lacak →”.",
      "Analisis memakai maks. 300 aset teratas, bukan seluruh portofolio.",
    ],
  },
  {
    id: "motion", title: "Studio Motion", go: "motion",
    intro: "Membuat video stock dari kode HTML animasi: tempel kodenya (dari Claude atau AI lain), cek per frame, lalu render jadi MP4 di browser. MOV ProRes dengan alpha tidak bisa dibuat di browser (tidak ada encodernya); pakai latar Transparan + luma matte.",
    steps: [
      "Pilih sumbernya: **Ide teks** (tulis idenya), **Ide gambar** (unggah/tempel screenshot video yang laku sebagai referensi) atau **Kode HTML** (tempel kode jadi).",
      "**Kirim ke Claude** menyimpan ide/gambar sebagai permintaan (pakai langganan Claude, tanpa API key). Lalu bilang ke Claude di chat \"buatkan video dari permintaan\": Claude menulis kode HTML-nya dan kode itu otomatis terbuka di editor (status dicek tiap 10 detik). **Salin prompt** memberi aturan untuk AI lain.",
      "Di tab Kode HTML: **Import .html** atau **Tempel kode** (atas), **Contoh**, **Simpan .html**, **Kosongkan**, **Jalankan** (Ctrl/Cmd+Enter; dengan **Auto** pratinjau diperbarui sendiri).",
      "Pratinjau memakai jam yang sama dengan render: **Play/Pause**, **Ulang**, geser **timeline**, **−1F/+1F** untuk maju-mundur satu frame, **Grid** untuk garis safe area.",
      "Atur **durasi & FPS** (24–60), **resolusi** (Full HD, vertikal, persegi, 4K, atau custom), **latar** dan **bitrate**, lalu **Render**: jendela progres menunjukkan frame, persen, waktu berjalan dan sisa waktu, lalu tombol unduh.",
      "HTML yang memakai `window.STUDIO` **mengikuti pengaturan**: ukuran/rasio, panjang loop dan latar transparan berubah sesuai Pengaturan video di bawah pratinjau (editor menampilkan ✓). HTML lama yang mengunci angkanya sendiri tetap bisa dirender, tapi rasio, durasi loop dan latarnya ikut kode. **Salin prompt AI** dan Kirim ke Claude sudah meminta AI memakai `window.STUDIO`.",
      "Latar: **Sesuai kode** (latar dari HTML), **Transparan** (video di atas hitam + file **-matte.mp4**: putih = terlihat, abu = semi transparan; Shutterstock menerima luma matte), atau **Warna solid** (mis. green screen #00FF00).",
      "Yang tidak ikut terekam hanya animasi SVG SMIL (<animate>); editor memberi peringatan bila menemukannya. **CSS 3D ikut terekam** (perspective, rotateX/Y, kubus, kartu berputar, backface-visibility): sisi-sisinya diurutkan depan-belakang tiap frame. Hindari bidang 3D yang saling menembus.",
      "**Render cepat ⚡**: halaman yang isinya satu canvas layar penuh (yang diminta prompt) direkam dengan menyalin pikselnya langsung, jauh lebih cepat daripada halaman HTML/SVG biasa.",
      "**Cek loop otomatis**: setelah render, frame di detik terakhir dibandingkan dengan frame pertama. **✓ Loop mulus** berarti sambungannya rapi; **Loop patah** berarti video meloncat saat diulang (minta AI memakai siklus utuh dari STUDIO.u atau samakan durasi).",
      "**Permintaan ke Claude**: ide yang dikirim lewat **Kirim ke Claude** muncul di sini (dicek tiap 10 detik). Begitu Claude selesai, kode HTML-nya otomatis terbuka di editor, tinggal **Render**.",
      "**Tiga cara masuk** di atas pratinjau: **Agent** (otomatis dari riset), **Manual** (satu HTML), **Bulk** (banyak file). Semuanya berakhir di **Antrean** yang sama.",
      "**Bulk**: pilih atau seret banyak file **.html**, atau pilih beberapa file lewat **Import .html**. Bisa juga lewat AI lain: tulis brief lalu pilih **Satu ide → variasi** (isi jumlahnya, maks 50) atau **Daftar ide** (satu ide per baris). **Salin prompt** ke AI mana pun; AI menulis tiap HTML di antara penanda `VIDEO n/N · nama-file`. Tempel seluruh jawabannya lalu **Pecah & tambahkan**. Kalau AI berhenti di tengah, pakai **Salin pesan lanjut** di chat yang sama dan tempel lagi. Antrean tersimpan di browser ini.",
      "**Antrean**: **Pratinjau** membuka video di pratinjau besar. Centang **Juga render ke** untuk rasio tambahan, **Pilih folder simpan** supaya file langsung masuk ke satu folder tanpa ditanya berkali-kali, lalu **Render**. **Yang gagal** memilih ulang video yang gagal.",
      "**Pilih tempat simpan**: di antrean, **Pilih folder simpan** menentukan folder untuk semua hasil render, **Simpan semua video** menyalin semua hasil sesi ini ke folder lain, dan tombol **Simpan … ke…** di tiap video membuka jendela simpan untuk satu file (bisa ganti nama dan lokasi). Di jendela hasil render Manual ada **Simpan … ke…** dan **Simpan semua ke folder…**. Ini hanya ada di Chrome/Edge; browser lain mengunduh ke folder Unduhan.",
    ],
    tips: [
      "Alur dengan Claude: minta riset video, lalu minta dibuatkan. Claude mengirim kode HTML, Anda klik Render, taruh MP4 di folder batch, lalu Claude membuat CSV dan mengisi folder platform.",
      "Stock video: 5–60 detik, minimal 1920×1080 untuk Adobe, tanpa audio, tanpa logo atau teks merek.",
    ],
  },
  {
    id: "token", title: "Token & biaya",
    intro: "Data asli Adobe Stock diambil lewat Apify. Tanpa token, aplikasi berjalan dalam mode demo dengan data contoh.",
    steps: [
      "Buat akun di apify.com, lalu ambil token di **Console → Settings → API & Integrations**.",
      "Klik tombol **Token Apify** di kanan atas. Di **Kantong token**, tempel token, beri nama (opsional), lalu **+ Tambah**. Ulangi untuk token lain.",
      "Setiap pencarian memakai token dengan **sisa kredit terbanyak**. Bila kredit habis, token ditolak, atau memori akun penuh, pencarian pindah otomatis ke token berikutnya tanpa biaya dobel.",
      "Token di kantong disimpan terenkripsi di server, jadi berlaku di semua perangkat dan juga dipakai Claude (MCP).",
    ],
    tips: [
      "Perkiraan biaya: ≈ $0,06 per 100 aset per pencarian. Setiap hasil disimpan permanen, jadi tidak perlu membayar dua kali.",
      "**Cek kredit** membaca ulang sisa kredit dari Apify (gratis). Sisa kredit juga diperbarui otomatis tiap ±10 menit.",
      "**Matikan** sebuah token untuk berhenti memakainya tanpa menghapusnya.",
      "Dengan beberapa token, **Perbarui tren** menjalankan lebih banyak tema sekaligus (batas memori dihitung per akun Apify).",
      "Token di browser ini saja tetap bisa dipakai; urutannya sesudah kantong token. Matikan “Ingat di browser ini” di komputer umum.",
    ],
  },
  {
    id: "terms", title: "Istilah",
    intro: "Arti angka-angka yang muncul di StockScope.",
    terms: [
      ["Download", "Total download aset sepanjang masa, dari Adobe Stock."],
      ["Dl/bln (kecepatan jual)", "Total download dibagi umur aset dalam bulan. Metrik utama StockScope karena aset lama selalu unggul di total download. Ini perkiraan: API hanya memberi total sepanjang masa."],
      ["Brief konten", "Ringkasan “apa yang harus dibuat”, dihitung dari 25% aset paling cepat laku di sebuah niche."],
      ["Performa (0–100)", "Skala log dari dl/bln: ~10/bln ≈ 35, ~100/bln ≈ 67, 1.000+/bln = 100."],
      ["Skor peluang", "Gabungan permintaan, momentum aset baru, ruang aset baru, dan keterbukaan, dikurangi porsi konten AI."],
      ["Keyword emas", "Dipakai ≤25% aset teratas, tapi asetnya terjual lebih cepat dari rata-rata niche."],
      ["Dominasi top 5", "Porsi download yang dikuasai 5 kontributor terbesar. Tinggi = niche tertutup."],
      ["Hit rate", "Persentase aset dengan ≥100 download."],
      ["Konversi", "Download per 100 views (bila data views tersedia)."],
      ["Label tren keyword", "🔥 Naik daun: aset baru sudah masuk daftar terlaris · 🌱 Celah: banyak dicari, jarang di-upload · 📈 Laku stabil: selalu dicari · ⚠️ Jenuh: banyak di-upload, jarang terlaris."],
      ["Memanas / mendingin", "Aset ≤12 bulan di kategori itu terjual ≥1,5× lebih cepat / ≤0,6× lebih lambat daripada aset lama. Angka “2,1×” = rasionya."],
    ],
  },
];

// **bold** → <b>
const rich = (t) => t.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));

export default function Guide({ mode, onGo }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("home");
  const closeRef = useRef(null);

  function show() {
    setTopic(TOPICS.some((t) => t.id === mode) ? mode : "home");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open]);

  const t = TOPICS.find((x) => x.id === topic) ?? TOPICS[0];

  return (
    <>
      <button type="button" className="help-fab" onClick={show} aria-label="Buka panduan" title="Panduan">?</button>

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal panel guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(e) => e.stopPropagation()}>
            <button ref={closeRef} type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Tutup">×</button>
            <nav className="guide-nav" aria-label="Topik panduan">
              <span className="field-label">Panduan</span>
              {TOPICS.map((x) => (
                <button key={x.id} type="button" className={x.id === topic ? "on" : ""} aria-current={x.id === topic ? "true" : undefined} onClick={() => setTopic(x.id)}>
                  {x.title}
                </button>
              ))}
            </nav>
            <article className="guide-body">
              <h2 id="guide-title">{t.title}</h2>
              <p className="guide-intro">{t.intro}</p>
              {t.steps && (
                <ol className="guide-steps">{t.steps.map((s, i) => <li key={i}>{rich(s)}</li>)}</ol>
              )}
              {t.tips && (
                <div className="guide-tips">
                  <span className="field-label">Tips</span>
                  <ul>{t.tips.map((s, i) => <li key={i}>{rich(s)}</li>)}</ul>
                </div>
              )}
              {t.terms && (
                <dl className="guide-terms">{t.terms.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              )}
              {t.go && t.go !== mode && (
                <button type="button" className="primary" onClick={() => { setOpen(false); onGo(t.go); }}>Buka {t.title} →</button>
              )}
            </article>
          </div>
        </div>
      )}
    </>
  );
}
