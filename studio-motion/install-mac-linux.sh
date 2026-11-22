#!/usr/bin/env bash
# StockScope: instal & jalankan di macOS/Linux.  Jalankan:  bash install-mac-linux.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js belum terpasang. Unduh versi LTS di https://nodejs.org, lalu jalankan skrip ini lagi."
  exit 1
fi
major=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$major" -lt 18 ]; then
  echo "[!] Versi Node.js $(node -v) terlalu lama. Butuh 18.18 atau lebih baru: https://nodejs.org"
  exit 1
fi
echo "[ok] Node.js $(node -v)"

if [ ! -d node_modules ]; then
  echo "Menginstal dependensi, butuh 1-3 menit..."
  npm install --no-audit --no-fund
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "[ok] File .env.local dibuat. Isi APIFY_TOKEN di file itu untuk data asli; kosong = mode demo."
fi

echo
echo "Menjalankan StockScope di http://localhost:3000  (Ctrl+C untuk berhenti)"
( sleep 8; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true ) &
npm run dev
