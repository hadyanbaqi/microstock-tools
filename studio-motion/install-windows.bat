@echo off
REM StockScope: instal & jalankan di Windows. Klik dua kali file ini.
cd /d "%~dp0"
title StockScope

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js belum terpasang.
  echo     Unduh versi LTS di https://nodejs.org, instal, lalu klik dua kali file ini lagi.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo [!] Versi Node.js terlalu lama. Butuh versi 18.18 atau lebih baru. Unduh LTS di https://nodejs.org
  pause
  exit /b 1
)
echo [ok] Node.js terpasang:
node -v

if not exist node_modules (
  echo.
  echo Menginstal dependensi, butuh 1-3 menit...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [!] npm install gagal. Periksa koneksi internet lalu coba lagi.
    pause
    exit /b 1
  )
)

if not exist .env.local (
  copy .env.example .env.local >nul
  echo [ok] File .env.local dibuat. Isi APIFY_TOKEN di file itu untuk data asli; kosong = mode demo.
)

echo.
echo Menjalankan StockScope di http://localhost:3000  (tutup jendela ini untuk berhenti)
start "" cmd /c "timeout /t 8 >nul && start http://localhost:3000"
call npm run dev
pause
