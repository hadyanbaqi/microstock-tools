# Studio Motion

Editor HTML/CSS/JS → video untuk stock footage. Semua dirender di browser (tanpa upload, tanpa API key).

- **Code editor** satu tempat: tulis, paste, atau import file `.html`.
- **Live preview** dengan Play / Pause / Restart, memakai jam virtual yang sama dengan render.
- **Pengaturan video**: durasi bebas, 24/25/30/50/60 FPS, 1920×1080 · 1080×1920 · 1080×1080 · 4K · Custom, latar Transparan (alpha) atau Solid.
- **Export**: MP4 (H.264, WebCodecs) dan MOV (ProRes 4444 dengan alpha asli, ffmpeg.wasm di Web Worker).
- **Prompt template**: susun prompt untuk ChatGPT / Gemini / Claude, tempel kode hasilnya ke editor.

## Jalankan

```bash
npm install   # postinstall menyalin ffmpeg-core ke public/ffmpeg (tidak di-commit)
npm run dev
```

Catatan ProRes: dibuat di browser, ±0,3 dtk per frame 1080p (4K ≈ 4×) dan file besar (≈150 Mbps di 1080p30); klip 4K yang panjang bisa kehabisan memori.
