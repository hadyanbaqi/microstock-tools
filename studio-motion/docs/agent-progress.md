# Agent AI: catatan progres (27 Okt 2026)

## Sudah dibuat (tahap 1, BELUM di-build/dites: npm install gagal di sandbox, jalankan `npm run build` dulu)
- `supabase/migrations/20261027_agent_foundation.sql`: accounts (owner), ai_providers (key terenkripsi), ai_settings,
  ai_usage, credit_ledger, ai_jobs, prompt_packs, prompts, assets, exports. Semua punya account_id (siap langganan).
- `lib/account.js` (selalu "owner" sekarang), `lib/plans.js` (owner/free/pro + quotaError).
- `lib/ai/providers.js` (OpenRouter, Ciora, custom; daftar tugas), `lib/ai/store.js` (Supabase/.cache, enkripsi key,
  settings, usage), `lib/ai/models.js` (/models + /videos/models, harga, caps, preset pickModel),
  `lib/ai/client.js` (runTask: resolve model per tugas, cek kuota & budget, JSON + validasi + 1x retry, catat biaya;
  testModel), `lib/ai/http.js`.
- API: `/api/ai/providers` (GET/POST key di header x-ai-key/PATCH/DELETE), `/api/ai/models?provider=`, `/api/ai/settings`
  (GET/PUT), `/api/ai/test`, `/api/ai/usage`.
- UI: `app/components/AgentSettings.js` (modal: penyedia, preset Hemat/Seimbang/Kualitas, model per tugas + Tes, batas
  biaya, riwayat) + tombol "Agent AI" di topbar (`app/page.js`), CSS di akhir `app/globals.css`.

## Langkah berikutnya
1. `npm install && npm run build`, perbaiki error bila ada.
2. Jalankan migration di Supabase; isi env OPENROUTER_API_KEY (opsional, atau tambah lewat UI; butuh MCP_SECRET).
3. Tes: tambah OpenRouter, pilih preset Seimbang, Tes tiap tugas, Simpan.
4. Update CLAUDE.md (bagian Agent AI) dan Guide.js.
5. Tahap 2: Prompt Studio (riset → konsep → prompt image/video, kode P<pack>-<n>, salin bulk untuk Digen).
6. Tahap 3: upload hasil → cek kualitas → metadata otomatis (aturan aset.js: judul ≤70 tanpa koma, ≥5 kata, tepat 40
   keyword, nama file ≤30, tanpa merek, label AI, Shutterstock '-') → CSV/ZIP per platform.
7. Tahap 4 (opsional): generate gambar/video lewat OpenRouter. Tahap 5: auth + paket + pembayaran.

## Keputusan pemilik
- Generate utama manual di Digen (unlimited); agent di StockScope untuk prompt + semua pasca-generate.
- Penyedia agent bisa dipilih: OpenRouter (utama), Ciora (cadangan), custom. Dipakai sendiri dulu, struktur siap langganan.
