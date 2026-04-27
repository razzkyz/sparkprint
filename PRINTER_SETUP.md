// PRINTER_SETUP.md - Panduan Setup Print Otomatis

## ✅ Sistem Print Otomatis Sudah Siap!

Aplikasi Anda sekarang memiliki sistem printing otomatis dengan fallback strategy:

1. **Server Printer (Primary)** - Print via TCP socket langsung ke printer
2. **QZ Tray (Fallback)** - Jika server printer gagal

## 🖨️ Setup Printer DHS RX 1

### Konfigurasi Printer

Printer Anda (DHS RX 1) sudah dikonfigurasi di `.env`:

```
PRINTER_HOST=192.168.1.254
PRINTER_PORT=9100
```

### Pastikan Printer:
- ✅ Terhubung ke network yang sama dengan server
- ✅ Dinyalakan
- ✅ IP address benar (192.168.1.254)
- ✅ Port 9100 terbuka (default untuk thermal printer)

## 📋 Alur Kerja Print Otomatis

### Flow 1: Admin Panel (Recommended)
```
Admin login → Lihat orders PAID → Klik tombol "🖨️ Print"
↓
Server trigger print otomatis
↓
Printer langsung cetak
↓
Status auto-update ke "PRINTED"
```

### Flow 2: Webhook Otomatis (Pembayaran)
```
Customer bayar via QRIS (Doku) → Webhook received
↓
Trigger autoPrintService
↓
Print otomatis (jika printer online)
↓
Email notifikasi ke admin
```

## 🧪 Testing Printer

### Test 1: Check Koneksi Printer
```bash
# Dari terminal, test koneksi ke printer
nc -zv 192.168.1.254 9100
```

Expected output: `Connection to 192.168.1.254 9100 port [tcp/*] succeeded!`

### Test 2: Print Test Text via API
```bash
# URL: http://localhost:3000/api/admin/printer-test
# Method: POST
# Headers: x-admin-password: password123
# Body: {"testType": "ping"}

curl -X POST http://localhost:3000/api/admin/printer-test \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{"testType": "ping"}'
```

### Test 3: Print Text via Printer Test Endpoint
```bash
curl -X POST http://localhost:3000/api/admin/printer-test \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{"testType": "print-text"}'
```

## 🔧 Troubleshooting

### ❌ Error: "Connection refused" / "Cannot connect to printer"

**Solusi:**
1. Pastikan printer nyala
2. Cek IP address: `ping 192.168.1.254`
3. Cek port: `nc -zv 192.168.1.254 9100`
4. Update PRINTER_HOST di .env jika IP berubah

### ❌ Error: "No printers found" / "Print failed"

**Untuk Admin Panel:**
- Klik "🖨️ Print" button
- Lihat error message
- Cek console/logs untuk detail

**Untuk Fallback QZ Tray:**
- Pastikan QZ Tray application running
- Jalankan QZ Tray → Settings
- Upload certificate ke domain Anda
- Whitelist domain di certificate settings

### ❌ Print tidak otomatis saat pembayaran

**Cek:**
1. Webhook dari Doku diterima → lihat database `print_orders` status PAID
2. Cek server logs → apakah autoPrintService triggered?
3. Cek printer status → apakah online?

**Debug dengan:** 
```bash
# Check Doku webhook payload
# Di database, lihat kolom `webhook_log` atau `error_log`
```

## 🎯 API Endpoints

### Manual Print (Admin Panel)
```
POST /api/admin/manual-print
Headers: x-admin-password: <password>
Body: { "id": "order-id" }
Response: { "ok": true, "message": "Print job queued" }
```

### Mark as Printed
```
POST /api/admin/mark-printed
Headers: x-admin-password: <password>
Body: { "id": "order-id" }
Response: { "ok": true, "order": {...} }
```

### Test Printer
```
POST /api/admin/printer-test
Headers: x-admin-password: <password>
Body: { "testType": "ping" | "print-text" }
```

## 📊 Log dan Monitoring

Print events di-log dengan prefix `[PRINTER]` dan `[AUTO-PRINT]`:

```
[PRINTER] Connected to 192.168.1.254:9100
[AUTO-PRINT] Starting auto-print for order: order-123
[AUTO-PRINT] Trying server printer (TCP)...
[AUTO-PRINT] Copy 1/3 printed
[AUTO-PRINT] Successfully printed order-123
```

Lihat logs:
- **Local:** `npm run dev` → console output
- **Production:** Vercel/Railway logs → filter `[PRINTER]` atau `[AUTO-PRINT]`

## 🚀 Next Steps

1. ✅ Test koneksi printer dengan curl command
2. ✅ Test print text via /api/admin/printer-test
3. ✅ Coba print dari admin panel
4. ✅ Test webhook pembayaran
5. ✅ Monitor logs untuk issues

## ⚙️ Advanced Configuration

### Ubah IP/Port Printer

Edit `.env`:
```
PRINTER_HOST=192.168.1.254
PRINTER_PORT=9100
```

Kemudian restart aplikasi:
```bash
npm run dev
```

### Debugging Print Quality

Jika hasil cetak buruk:
1. DHS RX 1 settings → adjust density/contrast
2. Edit `serverPrinterService.ts` → ubah `setPrintDensity(10)` ke nilai lain (0-15)
3. Test dengan gambar test untuk adjust

### Enable Auto-Mark-Printed

Jika Anda ingin otomatis mark PRINTED setelah print berhasil, uncomment di `autoPrintService.ts`:

```typescript
// Uncomment ini untuk auto-mark PRINTED:
// await supabaseAdmin
//   .from("print_orders")
//   .update({ status: "PRINTED" })
//   .eq("id", orderId);
```

---

**Questions?** Check logs atau hubungi developer untuk debug lebih lanjut.
