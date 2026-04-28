# 🚀 QUICK START - Deploy DOKU Webhook Edge Function

## Persyaratan
- ✅ Supabase CLI terinstall (`npm install -g supabase`)
- ✅ Sudah login ke Supabase (`supabase login`)
- ✅ Git repository sudah push

---

## 1️⃣ DEPLOY (2 menit)

```bash
# Pastikan di root directory project
cd c:\sparkfinal

# Deploy edge function
supabase functions deploy doku-webhook --project-ref hogzjapnkvsihvvbgcdb

# Lihat status
supabase functions list --project-ref hogzjapnkvsihvvbgcdb
```

✅ Selesai! Edge function sudah live di:
```
https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
```

---

## 2️⃣ TEST (5 menit)

### Generate Test Signature
```bash
node supabase/functions/doku-webhook/test-webhook.mjs
```

Ini akan generate:
- ✅ Valid DOKU signature
- ✅ Test payload (SUCCESS & FAILED)
- ✅ cURL command siap pakai

### Run cURL Command
Copy output dari test script dan jalankan di terminal.

**Expected Response:**
```json
{
  "ok": true,
  "orderId": "..."
}
```

---

## 3️⃣ UPDATE DOKU WEBHOOK URL

Di DOKU Payment Gateway Dashboard:

**Old URL:**
```
https://print.sparkstage55.com/api/doku/webhook
```

**New URL:**
```
https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
```

---

## 4️⃣ MONITOR

### View Real-time Logs
```bash
supabase functions log doku-webhook --project-ref hogzjapnkvsihvvbgcdb
```

### Di Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Select project: `hogzjapnkvsihvvbgcdb`
3. Edge Functions → `doku-webhook` → Logs tab

---

## ⚠️ PENTING - Set DOKU_SERVER_KEY Secret

```bash
supabase secrets set DOKU_SERVER_KEY="SK-Gp2Zhi0NyawJpQG1DAsq" \
  --project-ref hogzjapnkvsihvvbgcdb
```

✅ Secret sudah tersimpan aman di Supabase.

---

## ❌ COMMON ISSUES

### ❌ "DOKU_SERVER_KEY not configured"
```bash
# Set secret
supabase secrets set DOKU_SERVER_KEY="SK-Gp2Zhi0NyawJpQG1DAsq" --project-ref hogzjapnkvsihvvbgcdb
```

### ❌ "invalid_signature" saat test
- Pastikan raw body tidak di-parse dulu
- Gunakan test-webhook.mjs untuk generate signature yang benar

### ❌ "rate_limit_exceeded"
- Wait 1 minute atau reduce request frequency
- Max 100 requests per minute

### ❌ Order tidak ter-update di database
- Check logs untuk error message
- Pastikan `doku_order_id` di database sesuai dengan `invoice_number` dari DOKU

---

## 🎯 NEXT STEPS

1. ✅ Run deploy command
2. ✅ Test dengan test-webhook.mjs
3. ✅ Update DOKU webhook URL
4. ✅ Monitor logs 24 jam pertama
5. ✅ Done! 🎉

---

## 📞 SUPPORT

Untuk troubleshooting lebih detail, baca:
- [`supabase/functions/doku-webhook/README.md`](./supabase/functions/doku-webhook/README.md)
- [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md)

---

## 📊 Fitur Keamanan yang Aktif

✅ **Signature Verification** - HMAC-SHA256 setiap request
✅ **Timestamp Validation** - Prevent replay attacks  
✅ **Duplicate Prevention** - Track processed requests
✅ **Rate Limiting** - 100 req/min max
✅ **Error Handling** - Proper logging & monitoring

🛡️ **Production Ready!**
