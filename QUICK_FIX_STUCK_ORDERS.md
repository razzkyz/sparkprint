# 🚨 QUICK FIX - Order Stuck PENDING

**Problem:** Order paid but status tetap PENDING

**Solution:** Gunakan salah satu endpoint berikut

---

## ⚡ Quick Way (No Deploy Needed)

### Step 1: Check Order Status

Ganti `SP-1777863050248-TF7ANS` dengan order ID Anda:

```bash
curl "http://localhost:3000/api/admin/quick-fix?order_id=SP-1777863050248-TF7ANS" \
  -H "x-admin-password: password123"
```

**Response akan show:**
- ✅ Order details
- ✅ Webhook logs
- ✅ Apa yang harus dilakukan next

### Step 2: Manually Fix Order

Jika status masih PENDING:

```bash
curl -X POST "http://localhost:3000/api/admin/quick-fix" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{"order_id": "SP-1777863050248-TF7ANS"}'
```

**Response:**
```json
{
  "ok": true,
  "message": "✅ Order updated to PAID",
  "order": {
    "status": "PAID",
    "paid_at": "2026-05-04T..."
  }
}
```

---

## 📝 Available Endpoints (After Deploy)

### 1. Quick Fix (Simplest)
- **URL:** `GET /api/admin/quick-fix?order_id=SP-XXX`
- **Purpose:** Check order + webhook logs
- **Then:** `POST /api/admin/quick-fix` dengan `{"order_id": "SP-XXX"}` to fix

### 2. Manual Payment Update
- **URL:** `POST /api/admin/manual-payment-update`
- **Body:** `{"doku_order_id": "SP-XXX", "trigger_print": true}`
- **Purpose:** Update payment + trigger print

### 3. Webhook Status Debug
- **URL:** `GET /api/admin/webhook-status?invoice_number=SP-XXX`
- **Purpose:** Check detailed webhook status

### 4. Database Debug
- **URL:** `GET /api/admin/debug-database?search_id=SP-XXX`
- **Purpose:** Check database + all orders status

### 5. Test Webhook
- **URL:** `POST /api/admin/test-webhook-edge-function`
- **Purpose:** Send test webhook to verify connectivity

### 6. Webhook Diagnostic
- **URL:** `GET /api/admin/webhook-diagnostic`
- **Purpose:** Full diagnostic report

---

## 🔧 Development Mode (No Deploy)

Jalankan di terminal dalam folder project:

```bash
npm run dev
```

Lalu akses endpoints dengan `http://localhost:3000/api/admin/quick-fix`

---

## 🚀 Production Mode (After Deploy)

Pastikan sudah:
1. ✅ Deploy ke Vercel atau hosting
2. ✅ Update DOKU webhook URL ke `https://print.sparkstage55.com/api/doku/webhook`
3. ✅ Test dengan order baru

Kemudian akses endpoints dengan `https://print.sparkstage55.com/api/admin/quick-fix`

---

## 🎯 Next Steps

1. **Immediate:** Fix stuck order dengan POST /api/admin/quick-fix
2. **Short-term:** Check why webhook tidak update (GET /api/admin/quick-fix)
3. **Root cause:** 
   - Webhook URL incorrect?
   - Signature verification failing?
   - Database error?
4. **Re-test:** Buat order baru, verifikasi update otomatis

---

## 📊 Expected Behavior After Fix

1. Order created → Status: PENDING
2. User bayar
3. DOKU send webhook
4. Webhook handler update → Status: PAID
5. Auto-print triggered

Jika step 3-5 tidak terjadi:
- Check webhook logs via GET /api/admin/quick-fix
- Check DOKU dashboard untuk webhook delivery status
- Manual fix dengan POST /api/admin/quick-fix sebagai workaround
