# Panduan Migrasi: Next.js API Routes → Supabase Edge Functions

## 📊 Perbandingan

| Aspek | Next.js API Routes | Supabase Edge Functions |
|-------|-------------------|----------------------|
| **Runtime** | Node.js | Deno |
| **Deployment** | Vercel / Self-hosted | Supabase (Deno Deploy) |
| **Startup Time** | Lebih lambat | ⚡ Sangat cepat (cold start) |
| **Costs** | Pay per request | Included in Supabase plan |
| **Security** | Manual setup | Built-in secrets management |
| **Scaling** | Automatic | Automatic |
| **Monitoring** | Via Vercel logs | Via Supabase dashboard |
| **Database Access** | Direct connection | Supabase SDK |

## 🔄 Status Saat Ini

### ✅ Sudah Dibuat
- **Supabase Edge Function**: `supabase/functions/doku-webhook/index.ts`
- **Next.js API Route**: `app/api/doku/webhook/route.ts` (masih ada, belum aktif)

### 🎯 Rekomendasi

**Option 1: Full Migration (Recommended)**
```
Disable Next.js route → Gunakan hanya Supabase Edge Function
✓ Lebih secure
✓ Lebih cepat
✓ Lebih mudah maintenance
```

**Option 2: Dual Implementation**
```
Keep keduanya → Gunakan Supabase Edge Function sebagai primary
✓ Backward compatible
✓ Fallback jika ada issue
⚠️ Lebih kompleks
```

---

## 📋 Checklist Deployment

### ✅ Phase 1: Prepare
- [ ] Supabase CLI sudah terinstall
- [ ] Sudah authenticate: `supabase login`
- [ ] Repository sudah di-push ke git

### ✅ Phase 2: Deploy Edge Function
```bash
# Deploy edge function
supabase functions deploy doku-webhook

# Verify
supabase functions list
```

### ✅ Phase 3: Test
```bash
# Generate test payload dengan valid signature
node supabase/functions/doku-webhook/test-webhook.mjs

# Run local test (optional)
supabase functions start
curl ... # dari test script
```

### ✅ Phase 4: Update DOKU Webhook URL
Di DOKU Dashboard:
```
Old: https://print.sparkstage55.com/api/doku/webhook
New: https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
```

### ✅ Phase 5: Monitor
```bash
# View logs
supabase functions log doku-webhook

# Or di dashboard:
# Supabase > Edge Functions > doku-webhook > Logs
```

### ✅ Phase 6: Disable Old Route (Optional)
Di `app/api/doku/webhook/route.ts`:
```typescript
export async function POST(req: Request) {
  return NextResponse.json(
    { error: "This endpoint has been deprecated. Use Supabase Edge Function." },
    { status: 410 } // Gone
  );
}
```

---

## 🔐 Security Improvements

### Next.js Route (Lama)
```
❌ Signature verification: DISABLED
❌ Rate limiting: NO
❌ Timestamp validation: NO
❌ Duplicate prevention: NO
⚠️ TIDAK AMAN UNTUK PRODUCTION
```

### Supabase Edge Function (Baru)
```
✅ Signature verification: HMAC-SHA256 (ENABLED)
✅ Rate limiting: 100 req/min
✅ Timestamp validation: ±5 menit tolerance
✅ Duplicate prevention: Request ID tracking
✅ PRODUCTION READY
```

---

## 🛠️ Troubleshooting

### Error: "DOKU_SERVER_KEY not configured"
```bash
# Set secret
supabase secrets set DOKU_SERVER_KEY="SK-..." --project-ref hogzjapnkvsihvvbgcdb

# Verify
supabase secrets list --project-ref hogzjapnkvsihvvbgcdb
```

### Error: "Invalid signature"
- Pastikan DOKU_SERVER_KEY benar
- Pastikan timestamp sesuai
- Check logs: `supabase functions log doku-webhook`

### Edge Function tidak di-trigger
- Pastikan URL di DOKU Dashboard benar
- Pastikan webhook URL di-update
- Check DOKU webhook delivery status

### Performance Issues
- Edge functions cold start: ~100-200ms pertama kali
- Tidak ada masalah untuk webhook (async)
- Check rate limit jika banyak requests

---

## 📡 Testing dengan DOKU Simulator

DOKU menyediakan test environment. Untuk test:

1. Login ke DOKU Dashboard
2. Enable "Test Mode"
3. Gunakan kredensial test
4. Trigger test payment

Atau gunakan manual test dengan curl:
```bash
node supabase/functions/doku-webhook/test-webhook.mjs
# Copy curl command dan jalankan
```

---

## 📊 Monitoring Dashboard

Akses logs di:
```
https://supabase.com/dashboard
→ Select Project
→ Edge Functions
→ doku-webhook
→ View Logs
```

Fields yang penting:
- `[DOKU] Signature verified ✓` = OK
- `[DOKU] Database query error` = Issue dengan database
- `[DOKU] Rate limit exceeded` = Terlalu banyak requests
- `[DOKU] Order updated successfully` = Sukses ✓

---

## 🔄 Rollback Plan

Jika ada issue dengan Edge Function:

1. **Temporarily disable DOKU webhook**
   - Go to DOKU Dashboard
   - Disable webhook notifications

2. **Switch back to Next.js route** (jika masih perlu)
   - Update DOKU webhook URL ke old endpoint
   - Enable Next.js route

3. **Debug Edge Function**
   - Check logs: `supabase functions log doku-webhook`
   - Check environment variables
   - Test locally: `supabase functions start`

4. **Re-deploy**
   ```bash
   supabase functions deploy doku-webhook --project-ref hogzjapnkvsihvvbgcdb
   ```

---

## 📚 Resources

- [DOKU API Docs](https://developers.doku.com)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [HMAC Signature Verification](https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap)
- [Deno Runtime Docs](https://docs.deno.com)

---

## 💡 Next Steps

1. ✅ Deploy edge function
2. ✅ Test dengan test-webhook.mjs
3. ✅ Update DOKU webhook URL
4. ✅ Monitor logs untuk 24 jam pertama
5. ✅ Disable Next.js route jika sudah stable
