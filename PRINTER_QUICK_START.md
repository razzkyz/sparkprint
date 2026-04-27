// PRINTER_QUICK_START.md - Setup Cepat (5 Menit)

## ✨ Print Otomatis Sudah Ready!

Sistem ini support **2 mode print:**
1. **Admin Panel** - Klik tombol print (manual trigger)
2. **Auto Print** - Saat customer bayar, langsung cetak

---

## 📋 Checklist Setup (3 Langkah)

### ✅ Step 1: Cek Printer IP (1 min)

Printer Anda: `DHS RX 1`
IP/Port: `192.168.1.254:9100`

**Verifikasi:**
```
Windows: ping 192.168.1.254
Mac/Linux: ping 192.168.1.254
```

Jika reply → ✅ Printer online
Jika timeout → ❌ Ganti IP di `.env` file

### ✅ Step 2: Update .env (1 min)

File: `c:\sparkfinal\.env`

Pastikan ini ada:
```
PRINTER_HOST=192.168.1.254
PRINTER_PORT=9100
```

Jika IP berubah, update nilai ini.

### ✅ Step 3: Deploy & Test (3 min)

**Local Testing:**
```bash
npm run dev
```

Buka: http://localhost:3000/admin

Test print dengan order PAID:
- Klik tombol "🖨️ Print"
- Tunggu 3-5 detik
- Cek printer → kalau cetak keluar ✅

**Production (Vercel/Railway):**
1. Push perubahan ke git
2. Deploy automatic
3. Test di production URL
4. Monitor logs untuk errors

---

## 🚀 Bagaimana Cara Kerjanya?

### 1️⃣ Admin Panel Print (Manual)

```
Admin login → Filter "Butuh print saja"
    ↓
Admin klik "🖨️ Print" button di order
    ↓
Server connect ke printer DHS RX 1
    ↓
Print langsung, no wait
    ↓
Button berubah jadi "✅ Done"
    ↓
Order status → PRINTED
```

### 2️⃣ Auto Print (Saat Pembayaran)

```
Customer scan QRIS
    ↓
Bayar via Doku
    ↓
Doku webhook → Server
    ↓
Order status → PAID
    ↓
Server trigger auto-print
    ↓
Printer cetak automatic
```

---

## 🧪 Troubleshooting (60 Detik)

### ❌ Tombol Print tidak working

**Debug:**
1. Admin panel login OK?
2. Order status = PAID?
3. Tombol "🖨️ Print" enabled?

**Cek Console:**
- Open DevTools (F12)
- Console tab
- Cek error message
- Report di logs

### ❌ Printer tidak cetak

**Cek 1: Printer online?**
```
ping 192.168.1.254
```

**Cek 2: Port 9100 accessible?**
```
Windows: Test-NetConnection 192.168.1.254 -Port 9100
Mac: nc -zv 192.168.1.254 9100
```

**Cek 3: Verify IP di .env**
```
PRINTER_HOST=192.168.1.254  ← pastikan sama dengan printer
```

**Cek 4: Printer settings**
- Pastikan DHS RX 1 dinyalakan
- Cek network connection di printer menu
- Cek port 9100 tidak di-block

### ❌ "Print queued" tapi tidak cetak

Ini normal! Print berjalan background.
- Check logs untuk status
- Tunggu 5-10 detik
- Cek manual print button → print-status

---

## 📊 Monitoring & Logs

### Lihat Print Activity

**Local (npm run dev):**
```
Lihat console output:
[PRINTER] Connected to 192.168.1.254:9100
[AUTO-PRINT] Starting auto-print for order: order-123
[AUTO-PRINT] Successfully printed order-123
```

**Production (Vercel/Railway):**
- Dashboard → Logs
- Filter: `[PRINTER]` atau `[AUTO-PRINT]`
- Track print success/failures

---

## 🔧 Update Printer IP (Kalau Ada Perubahan)

1. Edit `.env`:
```
PRINTER_HOST=192.168.x.x  ← update IP baru
PRINTER_PORT=9100
```

2. Restart:
```bash
npm run dev
```

3. Test lagi

---

## 📞 Support

Jika ada issues:

1. **Check logs** → cari error message
2. **Test koneksi** → ping printer
3. **Restart server** → `npm run dev`
4. **Contact developer** → share error logs

---

**Setup selesai! Siap print otomatis! 🎉**
