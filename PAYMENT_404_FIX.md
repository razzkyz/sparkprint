# 🔧 DOKU Payment 404 Error - Diagnosis & Fix

## Masalah yang Dilaporkan

```
POST https://checkout.doku.com/checkout/v1/payment/693da14…/check-status 404 (Not Found)
```

Error ini terjadi ketika DOKU JavaScript SDK mencoba memverifikasi status pembayaran dengan endpoint yang mengembalikan 404.

---

## Root Cause Analysis

### Kemungkinan Penyebab:

1. **Payment ID Format Salah**
   - DOKU API mengembalikan payment URL dengan ID yang tidak valid
   - Format ID mungkin berubah di versi SDK terbaru

2. **Pembayaran Belum Terciptakan dengan Benar**
   - Request ke DOKU API berhasil (200) tapi pembayaran belum real di sistem DOKU
   - Payment URL mungkin incomplete atau malformed

3. **SDK Version Mismatch**
   - DOKU SDK versi lama tidak compatible dengan API endpoint terbaru
   - Endpoint `check-status` mungkin tidak lagi didukung

---

## Solusi yang Diimplementasikan

### 1. Enhanced Error Handling
```javascript
// App menangkap error 404 dari DOKU SDK dan tidak rethrow
const handleDokuError = (event: ErrorEvent) => {
  if (event.message?.includes("404") || event.filename?.includes("checkout.doku.com")) {
    console.warn("[DOKU SDK] Non-critical error caught:", event.message);
    return true; // Don't rethrow
  }
};
```

### 2. Robust Backend Polling
- Frontend terus polling `/api/orders/{order_id}` setiap 3 detik
- Max 100 polling attempts (5 menit total)
- Fallback ke `doku_order_id` jika query by UUID gagal
- **Tidak bergantung pada DOKU SDK check-status endpoint**

### 3. Improved Logging
Backend sekarang log:
- Full DOKU API response (entire JSON structure)
- Payment URL preview dan suffix
- Payment ID dari response
- Response paths yang dicoba

---

## Cara Debug Jika Masih Error

### Step 1: Check Browser Console

1. Buka DevTools (F12)
2. Lihat tab "Console" untuk logs:
   ```
   [PAYMENT] Payment URL received: https://checkout.doku.com...
   [DOKU] Loading DOKU Jokul Checkout...
   [POLL] Attempt 1/100 - Checking order: [uuid]
   [POLL] Order status from DB: PENDING
   ```

### Step 2: Check Server Logs

```bash
# View Next.js server logs (if local development)
# Or check deployment logs (Vercel, etc.)

# Cari yang berikut:
# [DOKU] Full API response: { ... }
# [DOKU] No payment URL in response:
# [API] Final response being sent:
```

### Step 3: Database Check

```sql
-- Check order status di database
SELECT id, doku_order_id, status, paid_at, created_at 
FROM print_orders 
ORDER BY created_at DESC 
LIMIT 5;

-- Cek specific order
SELECT * FROM print_orders WHERE doku_order_id = 'SP-1234567890-ABCDEF';
```

### Step 4: DOKU Payment Status Check

1. Cek di DOKU Payment Gateway Dashboard
2. Cari invoice dengan nama: `SP-{timestamp}-{randomstring}`
3. Lihat status pembayaran di DOKU

---

## Expected Behavior Setelah Fix

### ✅ Scenario: Pembayaran Berhasil
```
1. User klik tombol bayar
2. DOKU checkout modal terbuka
3. User scan QRIS dan bayar
4. Frontend polling deteksi status berubah menjadi PAID
5. Page auto-refresh dan tampil success page
```

### ⚠️ Scenario: DOKU SDK Error (sebelumnya gagal, sekarang OK)
```
1. DOKU SDK 404 error tetap muncul di console (non-blocking)
2. Frontend polling masih bekerja normal
3. Jika payment berhasil, status update di database
4. Page tetap auto-refresh ke success
```

### ❌ Scenario: Pembayaran Gagal/Belum Selesai
```
1. Polling akan berhenti setelah 5 menit
2. User bisa tutup modal dan coba lagi
3. Order tetap tersimpan dengan status PENDING
4. Admin bisa view di admin panel
```

---

## Monitoring Checklist

- [ ] Payment URL valid (bukan empty atau null)
- [ ] Payment URL URL length minimal ~100 karakter
- [ ] DOKU modal terbuka dengan benar
- [ ] Polling menerima response status PENDING
- [ ] Setelah pembayaran, status berubah ke PAID
- [ ] Page auto-refresh ke success
- [ ] Email notifikasi terkirim

---

## Jika Masih Bermasalah

### Kemungkinan 1: DOKU API Down/Maintenance
- Check DOKU status page
- Coba test dengan DOKU sandbox environment

### Kemungkinan 2: Invalid DOKU Credentials
```bash
# Verify di .env
DOKU_CLIENT_KEY=PK_xxxxxxxxxxxx  # Check prefix PK_
DOKU_SERVER_KEY=SK_xxxxxxxxxxxx  # Check prefix SK_
DOKU_IS_PRODUCTION=false          # Test dengan sandbox dulu
```

### Kemungkinan 3: Payment URL Malformed
- Lihat log `[DOKU] No payment URL in response:`
- Check response paths yang tidak match
- Mungkin butuh update extraction logic

---

## Quick Troubleshooting Command

```bash
# 1. Check order status in database
# In Supabase dashboard → SQL Editor

# 2. Test manually jika perlu
curl -X GET "http://localhost:3000/api/orders/{order_id}"

# 3. Check webhook setup
# WEBHOOK URL harus benar di DOKU dashboard

# 4. Monitor real-time logs
supabase functions log doku-webhook --project-ref hogzjapnkvsihvvbgcdb
```

---

## Summary

✅ **Yang diperbaiki:**
- Error handler untuk DOKU SDK 404 (non-blocking)
- Backend polling tetap bekerja independently
- Enhanced logging untuk debugging
- Retry logic dengan max attempts

✅ **Hasil:**
- User experience tidak terganggu meski DOKU SDK error
- Order tetap tercatat dan status terupdate dari webhook
- Admin bisa view order di admin panel
- Auto-print tetap trigger otomatis saat payment confirmed

🔍 **Next Step:**
- Monitor logs setelah deploy
- Test dengan real payment flow
- Jika masih error, check DOKU credentials & API endpoint compatibility
