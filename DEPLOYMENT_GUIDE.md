# 🖨️ Deployment Guide - PC + DHS RX 1

## Situasi
- ✅ Project sudah siap (testing done di laptop)
- ✅ Printer DHS RX 1 USB sudah connected ke PC
- 📦 Tinggal pindah project & setup di PC

---

## 📋 Requirement Sebelum Mulai

Pastikan PC punya:
- [ ] Node.js 18+ (download dari https://nodejs.org/)
- [ ] Printer DHS RX 1 USB connected
- [ ] Printer sudah ter-install di Windows Printers list
- [ ] Internet connection (untuk Supabase, Doku, etc)

---

## 🚀 Step-by-Step Deployment

### **Step 1: Copy Project ke PC**

**Option A: Menggunakan USB Drive**
1. Dari laptop, copy folder `d:\spark-print-main` ke USB drive
2. Paste ke PC (misal: `D:\spark-print-main` atau `C:\Users\Desktop\spark-print`)

**Option B: Menggunakan Shared Network (Jika same network)**
```bash
# Di PC, copy dari laptop shared folder
# Atau gunakan command:
net use Z: \\laptop-ip\shared-folder
```

---

### **Step 2: Install Dependencies di PC**

1. Buka **Command Prompt** atau **PowerShell** di PC
2. Navigate ke folder project:
   ```bash
   cd D:\spark-print-main
   # atau path sesuai dimana anda copy
   ```

3. Install npm dependencies:
   ```bash
   npm install
   ```
   Tunggu beberapa menit...

---

### **Step 3: Setup Environment Variables**

1. Buat file `.env.local` di folder project (same level dengan `package.json`):
   ```
   D:\spark-print-main\.env.local
   ```

2. Isi dengan environment variables:
   ```env
   # Doku
   DOKU_SERVER_KEY=your_doku_server_key_here
   DOKU_IS_PRODUCTION=false

   # Admin Security
   ADMIN_PASSWORD=choose_secure_password_here

   # Email (Resend)
   RESEND_API_KEY=your_resend_api_key_here

   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Ganti `your_*` dengan nilai yang sebenarnya dari:
   - Doku Dashboard
   - Resend Dashboard
   - Supabase Project Settings

---

### **Step 4: Install QZ Tray di PC**

QZ Tray adalah aplikasi yang memungkinkan website untuk print ke printer lokal.

1. **Download QZ Tray** dari: https://qz.io/download/
   - Pilih Windows version

2. **Install** aplikasi:
   - Double-click installer
   - Follow installation wizard
   - Restart PC jika diminta

3. **Verify instalasi**:
   - QZ Tray akan muncul di system tray (icon di taskbar)
   - Klik icon untuk open settings
   - Biarkan QZ Tray running di background

---

### **Step 5: Verify Printer Connection**

Sebelum start Next.js server:

1. Buka Windows **Settings** → **Devices** → **Printers & Scanners**
2. Pastikan **DHS RX 1** sudah tercantum di list
3. Test print dari Notepad untuk verify printer working:
   - Buka Notepad
   - Type sesuatu
   - Print (Ctrl+P)
   - Pilih DHS RX 1
   - Click Print

Jika print keluar, berarti printer OK ✅

---

### **Step 6: Start Next.js Server di PC**

Di PowerShell/Command Prompt yang sama:

```bash
npm run dev
```

Output yang diharapkan:
```
⚠ ▲ Next.js 16.1.5
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

✓ Ready in 5.7s
```

Server sekarang running! ✅

---

### **Step 7: Test Auto-Print di PC**

1. Buka terminal baru di PC
2. Test printer status:
   ```bash
   curl -H "x-admin-password: YOUR_ADMIN_PASSWORD" http://localhost:3000/api/admin/printer-status
   ```

   Ganti `YOUR_ADMIN_PASSWORD` dengan password yang Anda set di `.env.local`

3. Response yang diharapkan:
   ```json
   {
     "printer": {
       "connected": true,
       "printers": ["DHS RX 1"]
     },
     "queue": [],
     "timestamp": "2026-04-24T..."
   }
   ```

Jika terlihat `"connected": true` dan ada `"DHS RX 1"`, berarti semua setup OK! ✅

---

## 🌐 Access dari Tablet/Device Lain

Setelah server running di PC:

1. **Cari IP address PC**:
   ```bash
   ipconfig
   # Cari line "IPv4 Address: 192.168.x.x"
   ```

2. **Dari tablet/device yang sama network**:
   ```
   http://192.168.x.x:3000
   ```
   (Ganti 192.168.x.x dengan IP PC Anda)

3. Sekarang customer bisa input foto dari tablet, dan auto-print ke DHS RX 1 di PC!

---

## 🔧 Production Setup (Optional)

Jika mau permanent di PC (auto-start saat boot):

### **Option 1: Windows Service (Advanced)**
Gunakan `node-windows` untuk membuat Windows service

### **Option 2: Task Scheduler (Simpler)**
1. Buka Task Scheduler
2. Create Basic Task
3. Set trigger: "At startup"
4. Set action: 
   ```
   Program: C:\Program Files\nodejs\node.exe
   Arguments: D:\spark-print-main\node_modules\.bin\next start
   Start in: D:\spark-print-main
   ```

### **Option 3: Batch File (Simplest)**
Buat file `start-print-server.bat`:
```batch
@echo off
cd D:\spark-print-main
npm run build
npm start
pause
```

Double-click file ini untuk start server kapan saja.

---

## ✅ Checklist Deployment

- [ ] Project copied ke PC
- [ ] `npm install` selesai di PC
- [ ] `.env.local` dibuat dengan credentials yang benar
- [ ] QZ Tray installed & running
- [ ] DHS RX 1 printer test print OK
- [ ] Next.js server running (`npm run dev`)
- [ ] Printer status API return `"connected": true`
- [ ] Tablet bisa akses via `http://192.168.x.x:3000`

---

## 🐛 Troubleshooting

### ❌ "QZ Tray is not connected"
- Ensure QZ Tray application running (check system tray)
- Restart QZ Tray
- Check firewall not blocking port 9000

### ❌ "No printers found"
- Ensure DHS RX 1 installed di Windows Printers
- Restart PC
- Re-install printer driver jika perlu

### ❌ "Cannot connect from tablet"
- Ensure PC & tablet same network/WiFi
- Check PC firewall allow port 3000
- Use PC IP (ipconfig) instead of localhost

### ❌ npm install error
- Ensure Node.js 18+ installed
- Delete `node_modules` folder dan `.package-lock.json`
- Run `npm install` again

---

## 📞 Final Notes

- **Admin Password**: Ganti password default di `.env.local`
- **Server di-run di background**: Jangan close terminal, server akan stop
- **Auto-restart on reboot**: Setup task scheduler atau batch file (lihat Production Setup)
- **Security**: Untuk production, setup HTTPS jika pakai domain

---

Siap! Tinggal copy & follow step ini. Butuh bantuan? Tanyakan! 🚀
