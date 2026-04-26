# 🖨️ AUTO PRINT SETUP GUIDE - Spark Print

## Daftar Isi
1. [Instalasi Dependencies](#instalasi-dependencies)
2. [Setup QZ Tray](#setup-qz-tray)
3. [Konfigurasi Environment](#konfigurasi-environment)
4. [Testing Auto-Print](#testing-auto-print)
5. [Deployment ke Device dengan Printer](#deployment-ke-device-dengan-printer)
6. [Troubleshooting](#troubleshooting)

---

## Instalasi Dependencies

### 1. Install NPM Packages
Setelah update `package.json`, jalankan:
```bash
npm install
```

Library baru yang ditambahkan:
- **jimp**: Library untuk image processing dan resizing
  - Digunakan untuk resize foto ke ukuran 2x6 atau 4x6
  - Memastikan foto sesuai dengan dimensi printer
  - Support berbagai format: JPG, PNG, WebP, dll

---

## Setup QZ Tray

QZ Tray adalah bridge antara browser dan printer lokal (tidak bisa langsung via browser).

### Requirement
- **Windows**: QZ Tray (version 2.1.0+)
- **Printer**: DHS RX 1 atau printer thermal lainnya
- **Connection**: QZ Tray harus running di device yang sama dengan printer

### Instalasi QZ Tray

1. **Download** dari: https://qz.io/download/
2. **Install** QZ Tray di device yang punya printer
3. **Start** QZ Tray (biasanya auto-start setelah install)
4. **Configure Certificate**:
   - Buka QZ Tray Settings
   - Go ke "Certificates" tab
   - Jika pakai localhost: tidak perlu certificate
   - Jika pakai domain: setup certificate
   - Add domain ke allowed list

### Verifikasi QZ Tray
- QZ Tray harus running di system tray
- Icon akan menunjukkan connection status
- Jika error: check di console QZ Tray untuk detail

---

## Konfigurasi Environment

Tidak ada perubahan environment variable baru yang perlu ditambahkan saat ini. Sistem sudah menggunakan:
- `DOKU_SERVER_KEY`: Untuk verifikasi webhook (coming soon)
- `ADMIN_PASSWORD`: Untuk admin endpoints
- `RESEND_API_KEY`: Untuk kirim email

---

## Workflow Auto-Print

### Skenario 1: Payment via E-Wallet (Doku - Coming Soon)
```
Customer Input Nama & Upload Foto
    ↓
Pilih Size (2x6 atau 4x6) & Quantity
    ↓
Generate Payment Link
    ↓
Customer Bayar via E-Wallet ← DOKU (to be implemented)
    ↓
Doku Webhook → PAID Status
    ↓
🖨️ AUTO-PRINT TRIGGERED (Image Resized & Printed)
    ↓
Status: PAID → Ready untuk diambil
```

### Skenario 2: Payment via Cashier (Langsung Bayar Tunai)
```
Customer Input Nama & Upload Foto
    ↓
Pilih Size (2x6 atau 4x6) & Quantity
    ↓
Bayar Cash ke Kasir
    ↓
Admin tekan "Mark as PAID"
    ↓
🖨️ AUTO-PRINT TRIGGERED
    ↓
Status: PAID → Ready untuk diambil
```

---

## Testing Auto-Print

### Test 1: Check Printer Connection
**Endpoint**: `GET /api/admin/printer-status`

```bash
curl -H "x-admin-password: YOUR_ADMIN_PASSWORD" \
  http://localhost:3000/api/admin/printer-status
```

**Response Success**:
```json
{
  "printer": {
    "connected": true,
    "printers": ["DHS RX 1", "Canon MX920"]
  },
  "queue": [],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Response Error (Printer Not Connected)**:
```json
{
  "printer": {
    "connected": false,
    "printers": [],
    "error": "QZ Tray is not connected..."
  }
}
```

### Test 2: Manual Print Order
**Endpoint**: `POST /api/admin/manual-print`

```bash
curl -X POST -H "x-admin-password: YOUR_ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id": "order-id-here"}' \
  http://localhost:3000/api/admin/manual-print
```

### Test 3: Mark as Paid & Auto-Print
**Endpoint**: `POST /api/admin/mark-paid`

```bash
curl -X POST -H "x-admin-password: YOUR_ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id": "order-id-here"}' \
  http://localhost:3000/api/admin/mark-paid
```

---

## Deployment ke Device dengan Printer

### Opsi 1: Running Next.js App pada Device Printer (Recommended)

**Advantage**:
- Auto-print langsung bisa jalan
- Tidak perlu config network complex
- Print lebih cepat

**Steps**:

1. **Copy project ke device printer**:
   ```bash
   # Dari laptop Anda
   scp -r . username@device-ip:/path/to/spark-print
   
   # Atau gunakan USB drive
   ```

2. **Install dependencies di device**:
   ```bash
   cd /path/to/spark-print
   npm install
   ```

3. **Setup Environment** (buat `.env.local` di device):
   ```
   ADMIN_PASSWORD=your_secure_password
   RESEND_API_KEY=your_key
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
   # Add Doku configuration when ready
   # DOKU_SERVER_KEY=your_key
   ```

4. **Ensure QZ Tray is Running** pada device:
   ```bash
   # Windows
   # Buka QZ Tray dari Start Menu atau System Tray
   
   # Linux
   sudo service qz-tray start
   ```

5. **Start Next.js App**:
   ```bash
   npm run dev
   # atau untuk production
   npm run build && npm start
   ```

6. **Access from Tablet/Device**:
   ```
   http://device-ip:3000
   ```

### Opsi 2: Remote Print via Laptop (Untuk Testing)

Jika printer sudah terhubung ke device dengan IP, Anda bisa:

1. Setup **SSH tunneling** ke device:
   ```bash
   ssh -L 9000:localhost:9000 username@device-ip
   ```

2. Run QZ Tray di device dengan port 9000

3. Update `printService.ts` untuk connect ke remote QZ Tray:
   ```typescript
   // Change this line:
   await (qz.websocket as any).connect('ws://localhost:9000');
   ```

**Note**: Remote printing lebih slow dan less reliable. Gunakan Opsi 1 untuk production.

---

## Features yang Sudah Di-Implement

### ✅ Image Resizing
- Foto otomatis di-resize ke ukuran 2x6 atau 4x6
- Maintain aspect ratio (tidak distort)
- Centered dengan white background jika perlu
- Optimized untuk DHS RX 1 printer (300 DPI)

### ✅ Auto-Print Workflow
- Payment status langsung trigger printing
- Support beide QRIS dan Cashier payment
- Print queue untuk prevent duplicate printing
- Background print (tidak block user interface)

### ✅ Admin Controls
- Manual print endpoint (untuk reprint)
- Printer status check
- Print queue status monitoring
- Admin authentication

### ✅ Error Handling
- Auto-retry logic
- Detailed error logging
- Graceful fallback jika printer tidak connected
- Order status tetap PAID meski print gagal (admin bisa retry)

---

## Print Settings untuk DHS RX 1

Current settings yang sudah optimal untuk DHS RX 1:

```typescript
{
  size: { width: 2, height: 6 },      // untuk 2x6
  // atau
  size: { width: 4, height: 6 },      // untuk 4x6
  units: "in",                         // inches
  density: 300,                        // DPI untuk photo quality
  margins: {                           // No margins
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  }
}
```

Jika result tidak bagus, bisa adjust:
- **DPI**: 200 (faster but lower quality) atau 300 (slower but better)
- **Margins**: Tambah kalau ada white space yang tidak perlu
- **Stretch**: Change dari `"fill"` ke `"fit"` jika perlu aspect ratio original

---

## Troubleshooting

### ❌ "QZ Tray is not connected"
**Solusi**:
1. Pastikan QZ Tray application sudah running
2. Check QZ Tray icon di system tray
3. Restart QZ Tray application
4. Cek domain di QZ Tray settings → Certificates

### ❌ "No printers found"
**Solusi**:
1. Pastikan DHS RX 1 sudah di-install sebagai printer Windows
2. Test print dari Notepad untuk verify printer working
3. Cek di Settings → Devices → Printers & Scanners
4. Restart device jika printer baru saja di-connect

### ❌ Photo print out blur atau distorted
**Solusi**:
1. Check foto source quality (minimum 1200x1800 untuk 4x6)
2. Adjust DPI di printService.ts (try 200 or 250)
3. Verify photo format (JPEG recommended)

### ❌ Print terlalu cepat / ada gap antar kertas
**Solusi**:
1. Increase delay di printService.ts:
   ```typescript
   await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second
   ```
2. Check DHS RX 1 print speed settings di printer settings

### ❌ Auto-print tidak trigger setelah pembayaran
**Solusi**:
1. Check webhook logs (dari Doku dashboard - ketika sudah terintegrasi)
2. Verify Doku configuration di .env.local
3. Ensure signature validation pass (check console logs)
4. Manual test dengan endpoint `/api/admin/manual-print`

### ✅ Print successful tapi image upside down
**Solusi**: 
- Buka printService.ts dan tambah rotate:
```typescript
// Sebelum print, rotate image:
canvas = canvas.rotate(180);
```

---

## Next Steps

1. **Install dependencies**: `npm install`
2. **Setup QZ Tray** di device yang punya printer
3. **Test printer connection**: Call `/api/admin/printer-status`
4. **Create test order** dan check auto-print
5. **Deploy ke device** dengan printer untuk production

---

## Support

Jika ada masalah:
1. Check console logs (browser DevTools + server logs)
2. Test printer manually dari Windows Notepad
3. Verify QZ Tray connection status
4. Check network firewall (port 9000 untuk QZ Tray)

Good luck! 🎉
