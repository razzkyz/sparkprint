# 🚨 FIX: Order Stuck PENDING - Payment Already Paid

**Status:** Invoice SP-1777859502663-DR3G7P tidak update ke PAID padahal sudah bayar

---

## 🎯 Immediate Fix (Opsi Cepat)

### Opsi 1: Gunakan Debug Endpoint untuk Verifikasi
Pertama cek apakah webhook menerima notifikasi:

```bash
# Verify order status & webhook logs
curl "https://print.sparkstage55.com/api/admin/webhook-status?invoice_number=SP-1777859502663-DR3G7P" \
  -H "x-admin-password: password123"
```

**Jika webhook_logs kosong → Webhook tidak diterima, daftarkan di DOKU Dashboard**
**Jika webhook_logs ada tapi error → Ada masalah di processing**

### Opsi 2: Force Update Ke PAID (Emergency)
Langsung update order status menjadi PAID dan trigger print:

```bash
curl -X POST "https://print.sparkstage55.com/api/admin/manual-payment-update" \
  -H "Content-Type: application/json" \
  -H "x-admin-password: password123" \
  -d '{
    "doku_order_id": "SP-1777859502663-DR3G7P",
    "trigger_print": true
  }'
```

✅ Order akan langsung:
- Status diubah ke PAID
- `paid_at` timestamp diset
- Auto-print triggered (jika printer tersedia)

---

## 🔧 Permanent Fix (Daftarkan Webhook di DOKU)

Untuk mencegah masalah ini terjadi lagi:

1. **Login ke DOKU Dashboard:** https://jokul.doku.com
2. **Pergi ke Settings → Webhook Configuration**
3. **Daftarkan webhook URL:**
   ```
   https://print.sparkstage55.com/api/doku/webhook
   ```
4. **Ensure events selected:**
   - ✅ Payment Success
   - ✅ Payment Failed  
   - ✅ Payment Expired
5. **Save & Enable**

**Lihat dokumentasi lengkap:** [WEBHOOK_SETUP_GUIDE.md](WEBHOOK_SETUP_GUIDE.md)

---

## 📊 Status Orders Sekarang

Gunakan endpoint ini untuk lihat semua order dan status:

```bash
curl "https://print.sparkstage55.com/api/admin/debug-orders" \
  -H "x-admin-password: password123"
```

Akan show:
- Total orders
- Pending payments
- Ready to print  
- Order details dengan status

---

## 🔍 Debugging Info

**Webhook Endpoints (kedua-duanya available):**
- Next.js: `https://print.sparkstage55.com/api/doku/webhook`
- Edge Function: `https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook`

**DOKU Configuration:**
- Client Key: `BRN-0286-1776865015547`
- Server Key: Set di environment
- Mode: **PRODUCTION** (`DOKU_IS_PRODUCTION=true`)

**Emergency Endpoints Created:**
- Debug webhook status: `GET /api/admin/webhook-status`
- Manual payment update: `POST /api/admin/manual-payment-update`
- Orders list: `GET /api/admin/debug-orders`

---

## ✅ Next Steps

1. **Immediate:** Use manual-payment-update endpoint to fix SP-1777859502663-DR3G7P
2. **Short-term:** Register webhook URL di DOKU Dashboard
3. **Verify:** Test webhook setup menggunakan debug endpoint
4. **Monitor:** Use webhook-status endpoint untuk future orders

**Tanya user kalau dia masih blocked di mana.**
