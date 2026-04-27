// PRINTER_DEBUG.md - Debugging Guide

## 🔍 Checklist Debugging

### ❌ "Print job queued" tapi tidak cetak

Ini artinya:
- ✅ Server menerima request
- ✅ Auto-print triggered  
- ❌ **Tapi printer tidak menerima/process data**

Langkah debugging:

### Step 1: Cek Koneksi Printer (2 min)

```bash
# Windows
ping 192.168.1.254

# Jika ping successful → printer online ✅
# Jika timeout → printer offline ❌
```

Jika offline:
- Cek printer power
- Cek network cable
- Cek printer network settings di menu

### Step 2: Cek Port 9100 (2 min)

```bash
# Windows - Test if port 9100 accessible
Test-NetConnection 192.168.1.254 -Port 9100

# Output harus TcpTestSucceeded : True
```

Jika failed:
- Printer tidak setting port 9100?
- Firewall block?
- Port configuration salah di .env?

### Step 3: Lihat Console Logs (5 min)

Ketika print, lihat output di console. Harus ada logs seperti ini:

```
[PRINTER] Starting print: Order=xxx, Size=2x6, Qty=1, URL=https://...
[PRINTER] Downloaded image: 12345 bytes
[PRINTER] Image size: 800x600
[PRINTER] Resized to: 384x576, channels: 3
[PRINTER] Bitmap converted: 27648 bytes, 48x576
[PRINTER] Sending 27691 bytes to printer (copy 1/1)
[PRINTER] ✅ Successfully printed order xxx
```

**Jika lihat:**
- ✅ Semua log di atas → Berarti data terkirim ke printer! Kemungkinan printer setting perlu adjust
- ❌ "Connection refused" → Port 9100 tidak accessible
- ❌ "Cannot load image" → Image URL invalid
- ❌ "Connection timeout" → Printer tidak respond

### Step 4: Monitor Network (Advanced)

```bash
# Lihat network packets ke printer
tcpdump -i eth0 host 192.168.1.254 and port 9100

# atau Windows:
Wireshark → capture eth0 → filter: tcp.addr eq 192.168.1.254
```

Harus ada data terkirim dari server ke printer.

---

## 🛠️ Common Issues & Solutions

### Issue 1: "Connection refused"

**Symptoms:**
```
[PRINTER] Error: connect ECONNREFUSED 192.168.1.254:9100
```

**Solutions:**
1. **Printer port setting salah?**
   - Di printer menu → Network → Port Setting
   - Pastikan port = 9100
   - Atau update `.env` dengan port yang benar

2. **Port 9100 di-block?**
   ```bash
   # Try different port
   Test-NetConnection 192.168.1.254 -Port 515   # LPD
   Test-NetConnection 192.168.1.254 -Port 631   # CUPS
   Test-NetConnection 192.168.1.254 -Port 9100  # ESC/POS
   ```

3. **Firewall?**
   - Pastikan Windows Firewall allow port 9100
   - Atau disable firewall untuk test

### Issue 2: "Connection timeout"

**Symptoms:**
```
[PRINTER] Error: Write timeout - printer may be offline
```

**Solutions:**
1. Printer offline saat print mulai
2. Printer process lama → timeout terlalu pendek
3. Network latency tinggi

**Debug:**
```bash
# Test latency
ping 192.168.1.254 -n 5
# Lihat response time (harus < 100ms)
```

### Issue 3: Image tidak sempurna / garbled output

**Symptoms:**
```
Print keluar tapi:
- Gambar kecil/tidak full
- Warna/contrast tidak bagus  
- Garbled/noise
```

**Solutions:**

1. **Adjust print density:**
   
Edit `lib/serverPrinterService.ts`:
```typescript
// Line ~200, dalam printImage()
.setPrintDensity(10)  ← ubah 10 ke 0-15
```

Test values:
- `5` = ringan, terang
- `10` = normal (default)
- `15` = gelap, saturated

2. **Check image quality:**
   - Source image resolution minimum 384x576 (untuk 2x6)
   - Format: JPEG/PNG
   - Preferably: grayscale atau high contrast

3. **Check printer maintenance:**
   - Head printer kotor?
   - Thermal film quality ok?
   - Printer head setting di menu?

### Issue 4: Print successful tapi lambat

**Symptoms:**
```
[PRINTER] Copy 1/5 printed
[PRINTER] Copy 2/5 printed
...
(wait 5+ seconds per copy)
```

**Normal atau Slow?**
- Normal: 1-2 second per copy ✅
- Slow: >3 second per copy ❌

**Solutions:**
1. Printer hardware slow:
   - Check printer status lamp
   - Restart printer
   
2. Network latency:
   - Check ping response time
   - Printer on WiFi? → connect LAN cable

3. Image too large:
   - Large image file = slow conversion
   - Pre-process/compress image

---

## 📊 Detailed Logging

### Enable verbose logging

Edit `lib/serverPrinterService.ts`, tambah logging:

```typescript
// In sendBuffer()
console.log(`[PRINTER] Buffer size: ${data.length}`);
console.log(`[PRINTER] First 20 bytes:`, data.slice(0, 20).toString('hex'));

// In connect()
console.log(`[PRINTER] Attempting connection to ${this.config.host}:${this.config.port}`);
```

### Check database logs

Jika ada print failure, bisa log di database:

```typescript
// Di autoPrintService.ts, tambah:
if (!printSuccess) {
  await supabaseAdmin
    .from("print_log")
    .insert({
      order_id: orderId,
      status: "FAILED",
      error_message: lastError?.message,
      timestamp: new Date(),
    });
}
```

---

## 🧪 Test Commands

### Test 1: Ping printer

```bash
ping 192.168.1.254
```

### Test 2: Telnet to port

```bash
# Windows PowerShell
Test-NetConnection 192.168.1.254 -Port 9100

# Result: TcpTestSucceeded : True
```

### Test 3: API test via curl

```bash
# Test server connection
curl -X POST http://localhost:3000/api/admin/printer-test \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{"testType": "ping"}'

# Expected: {"ok":true,"message":"Printer connected...","host":"192.168.1.254","port":"9100"}
```

### Test 4: Manual print via API

```bash
# Create order dulu di database (status = PAID)
# Kemudian trigger print:

curl -X POST http://localhost:3000/api/admin/manual-print \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{"id": "order-uuid-here"}'
```

---

## 📞 Report Template

Jika masih stuck, kirim ini info:

1. **Error message:**
   ```
   [PRINTER] Error: ...
   ```

2. **Printer info:**
   - Model: DHS RX 1
   - IP: 192.168.1.254
   - Port: 9100

3. **Network test:**
   ```
   ping 192.168.1.254 → [result]
   Test-NetConnection ... -Port 9100 → [result]
   ```

4. **Console logs:**
   ```
   [Copy full console output dari print attempt]
   ```

5. **What you tried:**
   ```
   [List of troubleshooting steps already done]
   ```

---

**Good luck debugging! 🚀**
