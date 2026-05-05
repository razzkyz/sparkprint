# 🔧 WEBHOOK SETUP GUIDE - DOKU Payment Gateway

**Masalah**: Payment berhasil tapi status order tetap PENDING
**Penyebab**: Webhook URL tidak terdaftar di DOKU Dashboard

---

## 📋 Step-by-Step Setup Webhook di DOKU

### Step 1: Login ke DOKU Dashboard
1. Buka https://jokul.doku.com
2. Login dengan akun merchant Anda
3. Pilih merchant yang sesuai

### Step 2: Pergi ke Webhook Settings
1. Klik **Settings** (⚙️) di sidebar
2. Cari **Webhook Configuration** atau **Notification Settings**
3. Atau buka langsung: https://jokul.doku.com/settings/webhook

### Step 3: Tambah Webhook URL
Pada form webhook configuration, daftarkan URL berikut:

**Option A: Gunakan Next.js Endpoint (Recommended)**
```
https://print.sparkstage55.com/api/doku/webhook
```

**Option B: Gunakan Supabase Edge Function**
```
https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
```

### Step 4: Pilih Event Types
Pastikan webhook akan dikirim untuk event:
- ✅ **Payment Success** (Pembayaran Berhasil)
- ✅ **Payment Failed** (Pembayaran Gagal)
- ✅ **Payment Expired** (Pembayaran Expired)

### Step 5: Enable dan Save
1. Centang **Enable Webhook**
2. Klik **Save** atau **Update**

---

## ✅ Verify Webhook Setup

### Via DOKU Dashboard
1. Di halaman Webhook Settings, ada tab **Webhook Logs** atau **Event History**
2. Cari order terakhir Anda dan lihat apakah webhook terkirim
3. Periksa status: **Delivered**, **Failed**, atau **Pending**

### Via Aplikasi (Debug Endpoint)
Gunakan endpoint debug untuk melihat webhook logs:

```bash
curl "https://print.sparkstage55.com/api/admin/webhook-status?invoice_number=SP-1777859502663-DR3G7P" \
  -H "x-admin-password: password123"
```

Response akan menunjukkan:
```json
{
  "ok": true,
  "order": {
    "status": "PENDING",
    "doku_order_id": "SP-1777859502663-DR3G7P"
  },
  "webhook_logs": [],
  "analysis": {
    "webhook_received": false,
    "issue": "❌ Order masih PENDING. Webhook tidak diproses atau tidak diterima."
  }
}
```

Jika `webhook_logs` kosong → **Webhook tidak menerima notifikasi dari DOKU**
Jika ada log tapi `success: false` → **Webhook menerima tapi gagal memproses**

---

## 🚨 Emergency Fix - Update Payment Manually

Jika order tetap PENDING, gunakan endpoint manual untuk force update:

```bash
curl -X POST "https://print.sparkstage55.com/api/admin/manual-payment-update" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{
    "doku_order_id": "SP-1777859502663-DR3G7P",
    "trigger_print": true
  }'
```

Response:
```json
{
  "ok": true,
  "message": "✅ Payment status updated to PAID",
  "order": {
    "status": "PAID",
    "paid_at": "2026-05-04T12:34:56.789Z"
  },
  "auto_print_triggered": true
}
```

---

## 🔍 Troubleshooting

### Problem: Webhook masih tidak dipanggil
**Solusi:**
1. Pastikan domain `print.sparkstage55.com` bisa diakses dari internet
2. Test URL secara manual:
   ```bash
   curl -X GET https://print.sparkstage55.com/health
   ```
3. Periksa firewall/security rules
4. Contact DOKU support jika masih bermasalah

### Problem: Webhook dipanggil tapi gagal (status 500)
**Solusi:**
1. Periksa logs di Vercel atau server
2. Kemungkinan database error atau signature mismatch
3. Ensure DOKU_SERVER_KEY sudah dikonfigurasi di environment

### Problem: Signature Verification Failed
**Solusi:**
1. Verify `DOKU_SERVER_KEY` di .env:
   ```
   DOKU_SERVER_KEY=SK-Gp2Zhi0NyawJpQG1DAsq
   ```
2. Restart server/deployment
3. Cek di DOKU Dashboard apakah Client Key dan Server Key sudah benar

---

## 📊 Monitoring Webhook Status

### Check Recent Orders dan Webhook Status
```bash
curl "https://print.sparkstage55.com/api/admin/debug-orders" \
  -H "x-admin-password: password123"
```

Akan menampilkan:
```
Total: 23
Menunggu Pembayaran: 1
Perlu Print: 1
Orders yang sudah PAID akan terlihat dengan status "PAID"
```

### Real-time Webhook Logs
Subscribe ke webhook logs table di Supabase untuk monitoring real-time:
1. Buka Supabase Dashboard
2. Pilih Table: `webhook_logs`
3. Lihat recent entries untuk semua webhook notifications

---

## ⚙️ Configuration Files

### Next.js Webhook Endpoint
**File:** `app/api/doku/webhook/route.ts`
- Handles incoming webhook dari DOKU
- Verify signature
- Update order status
- Log events

### Supabase Edge Function (Backup)
**File:** `supabase/functions/doku-webhook/index.ts`
- Alternative webhook endpoint
- Run on Supabase servers
- Needed if Vercel endpoint down

### Manual Update Endpoint
**File:** `app/api/admin/manual-payment-update/route.ts`
- Emergency fix untuk stuck orders
- Manually mark order as PAID
- Trigger auto-print

---

## 📞 Support

**Jika webhook masih bermasalah:**

1. Gunakan endpoint debug:
   ```
   /api/admin/webhook-status?invoice_number=SP-XXX
   ```

2. Gunakan emergency fix manual:
   ```
   POST /api/admin/manual-payment-update
   ```

3. Check DOKU dashboard webhook logs untuk melihat delivery status

4. Contact DOKU support: https://support.doku.com
