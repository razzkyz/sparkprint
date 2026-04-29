# 🔍 DEBUG: Status Tidak Update Otomatis

## Masalah
- Status tidak berubah dari PENDING ke PAID saat user bayar
- Frontend polling tidak detect perubahan

## 🧪 Test 1: Simulasi Webhook (Tanpa Bayar)

### Step 1: Buat Order Test
```bash
# Gunakan browser di https://print.sparkstage55.com
# Upload 1 foto (sudah di-limit ke 1 saja)
# Isi nama, email, nomor urut
# JANGAN KLIK BAYAR DULU
# Ambil doku_order_id dari console (F12)
```

### Step 2: Simulasi Webhook Sukses
```bash
curl -X POST http://localhost:3000/api/admin/doku-webhook-test \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{
    "doku_order_id": "SP-XXXXXXXXX-XXXXX",
    "status": "SUCCESS"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Order updated from PENDING to PAID",
  "order": {
    "status": "PAID",
    "paid_at": "2024-XX-XXT12:34:56.123Z"
  }
}
```

### Step 3: Cek Status di Frontend
```bash
# Polling otomatis berjalan setelah order dibuat
# Jika webhook berhasil → status langsung jadi PAID
# Frontend akan reload dan tampil "Pembayaran Berhasil"
```

---

## 🔴 Debug Jika Test Endpoint Fail

### Error: "order_not_found"
- ✅ Pastikan `doku_order_id` **EXACT MATCH** dengan yang di database
- ✅ Cek di Supabase: https://supabase.com/dashboard → SQL Editor
  ```sql
  SELECT id, doku_order_id, status FROM print_orders ORDER BY created_at DESC LIMIT 5;
  ```

### Error: "unauthorized"
- ✅ Pastikan `x-admin-password` header = `password123` (dari .env)

---

## 📋 Test 2: Webhook dari DOKU (Saat Bayar)

### Cara Lihat Webhook Dipanggil
1. Buka: https://supabase.com/dashboard/project/hogzjapnkvsihvvbgcdb/functions
2. Klik `doku-webhook` di sidebar
3. Lihat tab **Invocations**
4. Klik invocation paling baru → lihat **Logs**

### Tanda Webhook Berhasil
```
[DOKU Webhook] Received notification: { 
  clientId: "BRN-0286-1776865015547",
  requestId: "...",
  signature: "HMACSHA256=..."
}
[DOKU] Signature verified ✓
[DOKU] ✅ Order updated successfully: {
  orderId: "...",
  invoiceNumber: "SP-...",
  newStatus: "PAID",
  paidAtSet: true
}
```

### Tanda Webhook Fail
- **"Missing authorization header"** → Edge function JWT masih ON
  - Fix: Deploy dengan `--no-verify-jwt`
  - Done di versi sebelumnya ✅
  
- **"invalid_signature"** → DOKU_SERVER_KEY tidak match
  - Cek: `supabase secrets list --project-ref hogzjapnkvsihvvbgcdb`
  - Verifikasi: `DOKU_SERVER_KEY = SK-Gp2Zhi0NyawJpQG1DAsq`

- **"order_not_found"** → invoice_number tidak match
  - Pastikan saat DOKU bayar, kirim `invoice_number` = `doku_order_id` order
  - Check di [app/api/print-orders/route.ts](app/api/print-orders/route.ts#L115)

---

## 🚀 Test Workflow

```
1. Frontend upload foto (1 saja ✅)
   ↓
2. POST /api/print-orders
   → Buat order dengan status = PENDING
   → Return doku_order_id (SP-xxx)
   ↓
3. Polling dimulai (3 detik interval)
   → Cek /api/orders/[id] status
   ↓
4. User bayar (atau simulasi dengan test endpoint)
   → DOKU webhook POST ke edge function
   → Edge function update: status = PAID, paid_at = now()
   ↓
5. Polling detect status = PAID
   → Frontend reload
   → Show success page ✅
```

---

## 📊 Checklist

- [ ] Upload foto cuma 1 (error 413 fixed) ✅
- [ ] Test endpoint berhasil ubah status → PAID
- [ ] Webhook logs ada di Supabase dashboard
- [ ] Signature verification ✓
- [ ] Order status change terdeteksi polling
- [ ] Frontend show success page

---

## 📞 Kalau Masih Error

1. **Cek di Supabase Logs:**
   - https://supabase.com/dashboard/project/hogzjapnkvsihvvbgcdb/functions/doku-webhook

2. **Cek di Vercel Logs:**
   - https://vercel.com → Dashboard → sparkfinal-project → Logs

3. **Cek Database:**
   - Pastikan order `status` column ada
   - SELECT * FROM print_orders LIMIT 1;

4. **Browser Console (F12):**
   - Search "[POLL]" di console
   - Lihat apakah polling berjalan setiap 3 detik

