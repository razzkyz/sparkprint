# ✅ WEBHOOK DOKU - SETUP & DEBUGGING GUIDE

## 🔴 MASALAH YANG SUDAH DIPERBAIKI

### 1. Signature Verification Disabled
**Status:** ✅ FIXED
- File: `app/api/doku/webhook/route.ts`
- Sebelumnya: Signature verification di-comment out (line ~116)
- Sekarang: Signature verification aktif, dengan fallback untuk development

### 2. Missing Detailed Logging
**Status:** ✅ FIXED
- Ditambahkan logging untuk setiap step
- ✅ Signature verified
- ✅ Order updated successfully
- ⚠️ Order not found (debugging info)
- ❌ Signature mismatch (detail error)

### 3. Duplicate Payment Processing
**Status:** ✅ FIXED
- Ditambahkan idempotency check
- Jika order sudah PAID, webhook diabaikan (tidak update 2x)

---

## 🛠️ SETUP CHECKLIST

### Step 1: Set Environment Variables
Create `.env.local` (root project):
```env
# Doku Payment Gateway
DOKU_CLIENT_ID=your_client_id_here
DOKU_CLIENT_KEY=your_client_key_here
DOKU_SERVER_KEY=your_server_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Cara dapat key:**
1. Buka https://dashboard.doku.com
2. Settings → API Keys
3. Copy Client Key, Client ID, Server Key
4. SIMPAN DI `.env.local` (jangan commit ke git!)

### Step 2: Verifikasi URL Callback di DOKU Dashboard
1. Dashboard DOKU → Settings → Webhook
2. Notification URL harus:
   ```
   https://yourdomain.com/api/doku/webhook
   ```
   **PENTING:**
   - ✅ Gunakan HTTPS (bukan HTTP)
   - ✅ Jika localhost: gunakan ngrok atau tunnel
   - ✅ Sesuaikan domain dengan yang di dashboard

### Step 3: Test Webhook di Development
**Option A: Menggunakan ngrok (recommended)**
```bash
# Install ngrok
choco install ngrok  # Windows
# atau brew install ngrok  # Mac

# Buka tunnel ke localhost:3000
ngrok http 3000

# Output akan berisi:
# Forwarding https://abc123.ngrok.io -> http://localhost:3000

# Update callback URL di DOKU dashboard:
# https://abc123.ngrok.io/api/doku/webhook
```

**Option B: Supabase Edge Function (alternative)**
- Webhook juga ada di: `supabase/functions/doku-webhook/index.ts`
- URL: `https://YOUR_PROJECT.supabase.co/functions/v1/doku-webhook`

---

## 🧪 DEBUGGING WEBHOOK ISSUES

### ❌ MASALAH: Status Tetap PENDING (Payment Success tapi tidak update)

#### Cek 1: Webhook Diterima?
```bash
# Lihat browser console di admin page
# Buka DevTools → Network → Filter "api/doku"
# Seharusnya ada POST request ke /api/doku/webhook
```

**Jika tidak ada request:**
- ❌ Callback URL salah di DOKU dashboard
- ❌ HTTPS/domain mismatch
- ❌ DOKU belum kirim webhook (check DOKU webhook history)

#### Cek 2: Database Query Error
```javascript
// Lihat console log Next.js:
[DOKU Webhook] Database query error: ...
```

**Solusi:**
- ✅ Verifikasi Supabase credentials di .env.local
- ✅ Pastikan table `print_orders` sudah dibuat (jalankan supabase-setup.sql)
- ✅ Pastikan RLS policy mengizinkan service_role untuk update

#### Cek 3: Order Not Found
```javascript
[DOKU Webhook] Order not found for invoice_number: SP-xxxxx
```

**Kemungkinan:**
1. **Invoice number mismatch** - order dibuat dengan format berbeda
2. **Database project berbeda** - dev vs production pakai database berbeda
3. **Order belum dibuat** - customer upload foto tapi order belum tersimpan

**Solusi:**
```sql
-- Check di Supabase SQL Editor
SELECT * FROM print_orders 
WHERE doku_order_id LIKE 'SP-%' 
ORDER BY created_at DESC 
LIMIT 10;
```

#### Cek 4: Signature Verification Failed
```javascript
[DOKU Webhook] Signature Verification Failed
expectedSig: HMACSHA256=...
receivedSig: HMACSHA256=...
```

**Penyebab:**
- ❌ DOKU_SERVER_KEY salah/tidak match
- ❌ Raw body dikonsumsi 2x (hanya bisa dibaca sekali)
- ❌ Timestamp terlalu jauh dari server time

**Solusi:**
```bash
# Verifikasi SERVER_KEY di .env.local
grep DOKU_SERVER_KEY .env.local

# Cek jam server vs DOKU (max diff 5 menit)
date  # Seharusnya sync dengan server DOKU
```

---

## 📝 MANUAL WEBHOOK TEST (Postman / curl)

### Menggunakan Postman

**1. Import Collection:**
```json
{
  "info": {
    "name": "DOKU Webhook Test",
    "description": "Test webhook signature verification"
  },
  "item": [
    {
      "name": "Test Webhook - SUCCESS",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Client-Id",
            "value": "TESTCLIENT"
          },
          {
            "key": "Request-Id",
            "value": "req-12345"
          },
          {
            "key": "Request-Timestamp",
            "value": "{{current_timestamp}}"
          },
          {
            "key": "Signature",
            "value": "HMACSHA256=test_signature"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"service\": { \"id\": \"QRIS\" },\n  \"channel\": { \"id\": \"QRIS\" },\n  \"transaction\": {\n    \"status\": \"SUCCESS\",\n    \"date\": \"2026-04-28T10:00:00Z\",\n    \"original_request_id\": \"req-12345\"\n  },\n  \"order\": {\n    \"invoice_number\": \"SP-1234567890-ABC\",\n    \"amount\": 50000\n  }\n}"
        },
        "url": {
          "raw": "http://localhost:3000/api/doku/webhook",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "doku", "webhook"]
        }
      }
    }
  ]
}
```

**2. Test tanpa signature verification:**
```bash
# Untuk development, signature verification bisa disabled sementara
# Edit app/api/doku/webhook/route.ts line ~115-120 untuk disable

curl -X POST http://localhost:3000/api/doku/webhook \
  -H "Content-Type: application/json" \
  -H "Client-Id: TEST" \
  -H "Request-Id: test-123" \
  -H "Request-Timestamp: 2026-04-28T10:00:00Z" \
  -d '{
    "service": { "id": "QRIS" },
    "order": {
      "invoice_number": "SP-TEST-001",
      "amount": 50000
    },
    "transaction": {
      "status": "SUCCESS"
    }
  }'
```

**3. Verifikasi response:**
```javascript
// Expected 200 OK response:
{
  "ok": true,
  "debug": {
    "orderId": "uuid-here",
    "invoiceNumber": "SP-TEST-001",
    "status": "PAID",
    "paidAt": "2026-04-28T10:00:00Z"
  }
}
```

---

## 🔍 DEBUGGING STEP-BY-STEP

### Step 1: Cek Environment Variables
```bash
# Terminal - jangan jalankan, hanya check
cat .env.local | grep DOKU
```

### Step 2: Cek Database Connection
```bash
# Supabase Dashboard → SQL Editor
SELECT COUNT(*) as total_orders FROM print_orders;
```

### Step 3: Monitor Webhook di Real Time
```bash
# Terminal 1: Jalankan Next.js dev server
npm run dev

# Terminal 2: Monitor logs
# Lihat output dari Terminal 1 saat webhook dikirim
```

### Step 4: Trigger Test Payment
1. Buka http://localhost:3000
2. Upload foto → pilih size → klik Bayar
3. Simulasi pembayaran di DOKU test environment
4. Lihat status berubah dari PENDING → PAID di admin page

---

## 📊 WEBHOOK RESPONSE FORMAT

### Success Response (Status Code: 200 OK)
```json
{
  "ok": true,
  "debug": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "invoiceNumber": "SP-1234567890-ABC",
    "status": "PAID",
    "paidAt": "2026-04-28T10:30:45.123Z"
  }
}
```

### Duplicate Processing (Status Code: 200 OK)
```json
{
  "ok": true,
  "msg": "already_processed",
  "debug": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "invoiceNumber": "SP-1234567890-ABC",
    "currentStatus": "PAID",
    "paidAt": "2026-04-28T10:30:45.123Z"
  }
}
```

### Order Not Found (Status Code: 200 OK)
```json
{
  "ok": true,
  "msg": "order_not_found",
  "debug": {
    "invoiceNumber": "SP-1234567890-ABC",
    "foundOrders": 0
  }
}
```

### Signature Verification Failed (Status Code: 401)
```json
{
  "error": "invalid_signature"
}
```

---

## 🚀 PRODUCTION CHECKLIST

- [ ] Set `DOKU_SERVER_KEY` di .env production
- [ ] Update callback URL ke production domain HTTPS
- [ ] Test dengan real payment (small amount)
- [ ] Monitor webhook logs untuk 24 jam pertama
- [ ] Buat alert jika webhook fail (email admin)
- [ ] Enable signature verification (uncomment line ~115)
- [ ] Add database backup untuk print_orders
- [ ] Add retry mechanism jika webhook fail (coming soon)

---

## 🎯 NEXT IMPROVEMENTS

- [ ] Add webhook signature logging to database
- [ ] Add retry mechanism for failed webhooks
- [ ] Add webhook rate limiting (done: 100 req/min)
- [ ] Add email notification on payment success
- [ ] Add admin dashboard for webhook history
- [ ] Add timestamp tolerance validation (done: ±5 min)

---

## 📞 SUPPORT

Jika webhook masih tidak bekerja:

1. **Check logs:**
   ```bash
   npm run dev  # Lihat console output
   ```

2. **Check database:**
   ```sql
   SELECT * FROM print_orders 
   WHERE status = 'PENDING' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

3. **Check DOKU:**
   - Dashboard → Webhook History
   - Lihat response dari server Anda
   - Verifikasi signature di DOKU documentation

4. **Enable debug mode:**
   - Set `DOKU_SERVER_KEY=""` (kosongkan)
   - Jalankan webhook test dengan curl
   - Check logs di Next.js terminal
