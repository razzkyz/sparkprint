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
Console: "Print job queued" ← Ini normal!
    ↓
Lihat console logs → cari [PRINTER] output
    ↓
Printer cetak (dalam 3-5 detik)
    ↓
Console: "✅ Successfully printed..."
    ↓
Button berubah jadi "✅ Done"
```

### ⚠️ "Print job queued" artinya:

- ✅ Request terima OK
- ✅ Print trigger berhasil
- **⏳ Tunggu 3-5 detik untuk lihat hasil**
- ✅ Cek console logs untuk verify printer processing

**Bukan berarti printer sudah cetak!** Lihat logs untuk confirm.

---

### Lihat Console Logs untuk Confirm

Buka DevTools → Console tab → lihat logs:

**Jika berhasil:**
```
[PRINTER] Downloaded image: 12345 bytes
[PRINTER] Resized to: 384x576
[PRINTER] Bitmap converted: 27648 bytes
[PRINTER] Sent 27691 bytes to printer
[PRINTER] ✅ Successfully printed
```

**Jika gagal:**
```
[PRINTER] Connection refused
[PRINTER] Cannot connect to printer
```

Kalau gagal → lihat [PRINTER_DEBUG.md](PRINTER_DEBUG.md) untuk solusi.

---

## 🧪 Troubleshooting (60 Detik)

### ❌ Muncul "Print job queued" tapi tidak cetak

**Ini NORMAL! Artinya:**
1. Server terima request ✅
2. Print triggered ✅
3. **Tunggu 3-5 detik** ⏳
4. Lihat console logs untuk detail

**Untuk verify:**

Buka DevTools (F12) → Console → Cari logs:

❌ **Jika lihat:**
```
[PRINTER] Error: connect ECONNREFUSED 192.168.1.254:9100
```
→ Printer tidak online atau port 9100 tidak accessible

✅ **Jika lihat:**
```
[PRINTER] Sent 27691 bytes to printer
[PRINTER] ✅ Successfully printed
```
→ Berhasil! Cek printer → keluar kertas

---

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

## 📊 Monitoring & Logs

### Lihat Print Activity

**Local (npm run dev):**
```
Terminal output harus ada [PRINTER] logs:

[PRINTER] Connected to 192.168.1.254:9100
[PRINTER] Downloaded image: 12345 bytes
[PRINTER] Resized to: 384x576
[PRINTER] Bitmap converted: 27648 bytes
[PRINTER] Sent 27691 bytes to printer
[PRINTER] Copy 1/3 printed
[PRINTER] ✅ Successfully printed order-123
```

**Production (Vercel/Railway):**
- Dashboard → Logs tab
- Filter search: `[PRINTER]`
- Check for success or error messages

### Detailed Debugging

Check full logs → lihat [PRINTER_DEBUG.md](PRINTER_DEBUG.md)

Includes:
- Network connection troubleshooting
- Port configuration
- Image conversion issues
- Performance optimization

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
