# 🚀 WEBHOOK DEPLOYMENT CHECKLIST

**Status**: Siap untuk production

## ✅ Yang Sudah Done:
- ✅ Webhook edge function (doku-webhook) - simplified, no auto-print crash
- ✅ Manual print endpoint tersedia (`/api/admin/manual-print`)
- ✅ Callback URL sudah benar di print-orders
- ✅ Database schema ready

## 🔧 HARUS DI-SETUP:

### 1️⃣ Deploy Edge Function ke Supabase
```bash
cd c:\sparkfinal
supabase functions deploy doku-webhook --project-ref hogzjapnkvsihvvbgcdb
```

### 2️⃣ Set DOKU_SERVER_KEY sebagai Secret
```bash
supabase secrets set DOKU_SERVER_KEY="SK-Gp2Zhi0NyawJpQG1DAsq" --project-ref hogzjapnkvsihvvbgcdb
```

### 3️⃣ Verify Secret Sudah Set
```bash
supabase secrets list --project-ref hogzjapnkvsihvvbgcdb
```
Harusnya ada:
```
DOKU_SERVER_KEY          <hidden>
SUPABASE_URL             https://hogzjapnkvsihvvbgcdb.supabase.co
SUPABASE_SERVICE_ROLE_KEY <hidden>
```

## 📋 Testing Flow

### Test 1: Payment Status Update
1. Buat order baru di https://print.sparkstage55.com
2. Ambil `doku_order_id` dari response
3. Simulasi webhook (jika testing):
```bash
curl -X POST https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook \
  -H "Content-Type: application/json" \
  -H "Client-Id: BRN-0286-1776865015547" \
  -H "Request-Id: test-001" \
  -H "Request-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -d '{
    "order": {
      "invoice_number": "SP-YOUR-ORDER-ID",
      "amount": 1000
    },
    "transaction": {
      "status": "SUCCESS"
    }
  }'
```

### Test 2: Actual Payment
1. User bayar dengan QRIS di checkout
2. Check Supabase logs (Edge Functions tab)
3. Cek database - order status harusnya jadi `PAID`

### Test 3: Manual Print
1. Dari admin panel, trigger manual print
2. Cek apakah TCP ke printer berhasil

## 🔍 Debug Logs

**Edge Function Logs:**
- https://supabase.com/dashboard → Functions → doku-webhook → Logs

**Frontend Logs:**
- Open browser DevTools → Console
- Cek polling status interval

**Backend (Next.js):**
- Vercel dashboard → Logs
- Cek `/api/print-orders` response

## ⚙️ Production Settings

| Setting | Value |
|---------|-------|
| Webhook URL | `https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook` |
| Callback Method | POST |
| Signature | HMACSHA256 |
| Server Key | SK-Gp2Zhi0NyawJpQG1DAsq |
| Frontend | print.sparkstage55.com (Vercel) |

## 🎯 Expected Behavior

| Event | Expected Result |
|-------|-----------------|
| User buat order | Order created dengan status `PENDING` |
| User bayar (DOKU sukses) | Webhook dipanggil → Status berubah jadi `PAID` |
| Status = PAID | Frontend polling detect → show "Terima kasih" |
| Admin trigger print | TCP printer menerima print job |

## 🐛 Common Issues

| Issue | Solusi |
|-------|--------|
| Webhook tidak dipanggil | Cek `DOKU_SERVER_KEY` sudah set di Supabase secrets |
| Signature verification fail | Pastikan timestamp server & DOKU server sinkron |
| Print tidak jalan | Edge Function tidak bisa akses TCP - gunakan manual print dari admin |
| Order not found | Pastikan `doku_order_id` di order = `invoice_number` di webhook |

