# 🔧 DEBUG CHECKLIST & QUICK START

Gunakan checklist ini untuk cepat mengidentifikasi dan memperbaiki masalah.

---

## 📋 ISSUE #1: STATUS PEMBAYARAN TIDAK BERUBAH KE PAID

### Quick Diagnosis (5 menit)

```bash
# 1. Check webhook endpoint accessible
curl -X POST http://localhost:3000/api/doku/webhook \
  -H "Content-Type: application/json" \
  -H "Client-Id: TEST" \
  -H "Request-Id: test-123" \
  -H "Request-Timestamp: 2026-04-28T10:00:00Z" \
  -d '{
    "order": {"invoice_number": "SP-TEST-001", "amount": 50000},
    \"transaction": {\"status\": \"SUCCESS\"}
  }'

# Expected: { "ok": true, ... }
```

### Checklist

- [ ] **Step 1: Environment Variables**
  ```bash
  grep DOKU .env.local
  # Should show:
  # DOKU_CLIENT_KEY=...
  # DOKU_SERVER_KEY=...
  ```
  ❌ Tidak ada? → Create .env.local dan add DOKU keys

- [ ] **Step 2: Callback URL di DOKU Dashboard**
  Dashboard DOKU → Settings → Webhook
  ```
  Seharusnya: https://yourdomain.com/api/doku/webhook
  Bukan: http://localhost/api/doku/webhook
  Bukan: /api/doku/webhook-unified
  ```
  ❌ Salah? → Update di DOKU dashboard

- [ ] **Step 3: Database Credentials**
  ```bash
  grep SUPABASE .env.local
  # Should show:
  # NEXT_PUBLIC_SUPABASE_URL=...
  # SUPABASE_SERVICE_ROLE_KEY=...
  ```
  ❌ Tidak ada / salah? → Check Supabase dashboard

- [ ] **Step 4: Table Exists**
  Supabase SQL Editor:
  ```sql
  SELECT * FROM print_orders LIMIT 1;
  ```
  ❌ Error? → Run supabase-setup.sql

- [ ] **Step 5: Test Order Exist**
  Create order manually:
  ```bash
  curl http://localhost:3000/api/orders \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "customer_email": "test@example.com",
      "customer_name": "Test",
      "image_urls": ["https://example.com/image.jpg"],
      "size": "4x6",
      "qty": 1,
      "amount": 50000
    }'
  ```
  Save the `doku_order_id` dari response

- [ ] **Step 6: Simulate Webhook**
  ```bash
  curl -X POST http://localhost:3000/api/doku/webhook \
    -H "Content-Type: application/json" \
    -H "Client-Id: TEST" \
    -H "Request-Id: test-123" \
    -H "Request-Timestamp: 2026-04-28T10:00:00Z" \
    -d '{
      "order": {"invoice_number": "SP-YOUR-ID-HERE", "amount": 50000},
      "transaction": {"status": "SUCCESS"}
    }'
  ```
  ❌ Response bukan { "ok": true }? → Check Next.js logs

- [ ] **Step 7: Check Database Updated**
  Supabase SQL Editor:
  ```sql
  SELECT id, status, paid_at FROM print_orders 
  WHERE doku_order_id = 'SP-YOUR-ID-HERE';
  ```
  ❌ Status masih PENDING? → Check Next.js console logs untuk error message

### Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Wrong callback URL | Webhook never received | Update di DOKU dashboard |
| Missing env vars | 401 / undefined key | Create .env.local dengan DOKU keys |
| Wrong database | Order not found | Check SUPABASE_URL correct |
| RLS policy blocked | Update fails silently | Run supabase-setup.sql untuk enable service_role |
| Signature mismatch | 401 unauthorized | Check DOKU_SERVER_KEY correct |

---

## 📋 ISSUE #2: PRINT HASIL TIDAK FULL SIZE

### Quick Diagnosis (2 menit)

```bash
# 1. Open admin page
# 2. Create test order dengan status PAID
# 3. Click Print button
# 4. Check preview di print dialog
```

### Checklist

- [ ] **Step 1: Print Dialog Opens**
  - Click Print → Window opens?
  - ✅ Ya → Continue
  - ❌ Tidak → Check browser popup blocker

- [ ] **Step 2: Loading Indicator**
  - See \"Loading images...\"?
  - ✅ Yes → Continue
  - ❌ No → Images langsung tampil

- [ ] **Step 3: Check Image Size**
  - Print dialog → Settings
  - Margins set ke \"None\" / 0mm?
  - ✅ Yes → Continue
  - ❌ No → Set manually

- [ ] **Step 4: Check Preview**
  - Image fill entire page?
  - ✅ Yes → Printing issue
  - ❌ No (white border) → CSS issue

### CSS Issue? → Fix in app/admin/page.tsx

```typescript
// Find: confirmedMarkPrinted() function
// Change this:
.print-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;  // ← PROBLEM
}

// To this:
.print-image {
  width: 100%;
  height: 100%;
  object-fit: cover;    // ← FIXED
}
```

---

## 📋 ISSUE #3: HALAMAN PRINT BLANK / KOSONG

### Quick Diagnosis (3 menit)

```bash
# 1. Click Print
# 2. Check browser DevTools → Console
# 3. See error messages?
```

### Checklist

- [ ] **Step 1: Network Check**
  - DevTools → Network tab
  - Filter: XHR/Fetch
  - See image requests?
  - ✅ Yes, 200 status → Continue
  - ❌ No or 404/CORS error → Image URL problem

- [ ] **Step 2: Console Errors**
  - DevTools → Console
  - See red errors?
  - ✅ No errors → Continue
  - ❌ CORS error → Supabase CORS headers
  - ❌ 404 error → Image URL expired/wrong

- [ ] **Step 3: Image Loading**
  - Print window appears
  - Loading indicator visible?
  - ✅ Yes, shows \"Loading images...\" → Continue
  - ❌ No → Script error

- [ ] **Step 4: Wait Time**
  - Wait 10 seconds
  - Loading indicator disappear?
  - ✅ Yes, print dialog opens → Image loaded OK
  - ❌ No, print dialog doesn't open → Image load timeout

### Still Blank? → Troubleshoot

```javascript
// Add to browser console (DevTools)
// Check if images are loaded
fetch('https://your-image-url.com/image.jpg')
  .then(r => r.blob())
  .then(b => console.log('Image OK, size:', b.size))
  .catch(e => console.error('Image failed:', e));

// Check CORS
fetch('https://your-image-url.com/image.jpg', { mode: 'cors' })
  .then(r => console.log('CORS OK'))
  .catch(e => console.error('CORS blocked:', e));
```

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| CORS blocked | Mixed content warning | Enable CORS di Supabase storage |
| Image URL expired | 404 in network tab | Regenerate image URL |
| Script error | Console error | Check browser version (ES6+) |
| Timeout | No print after 10s | Check image size (should be < 2MB) |

---

## 🚀 QUICK START - TEST ALL FIXES

### Setup (10 menit)

```bash
# 1. Terminal: Start dev server
npm run dev

# 2. Browser: Open admin
# http://localhost:3000/admin

# 3. Create test order
# - Click \"Create Order\" (atau mock via API)
# - Set status to PAID
```

### Test Payment Flow (5 menit)

```bash
# Terminal 2: Test webhook
curl -X POST http://localhost:3000/api/doku/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "invoice_number": "SP-TEST-'"$(date +%s)"'",
      "amount": 50000
    },
    "transaction": {
      "status": "SUCCESS"
    }
  }'

# Check Next.js terminal:
# Should see: [DOKU Webhook] ✅ Order updated successfully
```

### Test Print (3 menit)

```bash
# 1. Admin page → Refresh (F5)
# 2. See order status = PAID?
# 3. Click Print button
# 4. Wait for loading to finish
# 5. Print dialog should auto-open
# 6. Click \"Cancel\" (test purpose)
# 7. Check admin page → Status = PRINTED?
```

### Success Indicators ✅

- [ ] Webhook test curl returns `{ "ok": true }`
- [ ] Next.js logs show `[DOKU Webhook] ✅ Order updated successfully`
- [ ] Admin page shows order with status = PAID
- [ ] Print button works (no error)
- [ ] Print dialog opens automatically
- [ ] Admin page updates to status = PRINTED

---

## 🐛 ENABLE DEBUG MODE

### Next.js Debug Logs

```bash
# Run with debug flag
DEBUG=* npm run dev

# Or add to .env.local
DEBUG=next:*
```

### Browser Console Debug

```javascript
// Add to window to monitor webhook
window.webhookLog = {
  requests: 0,
  responses: []
};

// Patch fetch to log webhook calls
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0].includes('/api/doku/webhook')) {
    window.webhookLog.requests++;
    console.log('[WEBHOOK REQUEST]', args);
  }
  return originalFetch.apply(this, args)
    .then(r => {
      r.clone().json().then(j => {
        console.log('[WEBHOOK RESPONSE]', j);
        window.webhookLog.responses.push(j);
      });
      return r;
    });
};

// View logs
window.webhookLog
```

### Database Query Debug

```sql
-- Supabase SQL Editor
-- Check webhook processing
SELECT 
  id, 
  doku_order_id, 
  status, 
  paid_at, 
  created_at 
FROM print_orders 
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'print_orders';
```

---

## 📊 LOGGING DURING TEST

### Recommended Setup

```typescript
// app/api/doku/webhook/route.ts
// Already has detailed logging, check:
// - [DOKU Webhook] Received notification
// - [DOKU Webhook] ✅ Signature verified
// - [DOKU Webhook] ✅ Order updated successfully
// - [DOKU Webhook] ⚠️ Order not found
```

### Monitor in Real Time

**Terminal 1 (Next.js):**
```bash
npm run dev
# Watch for [DOKU Webhook] logs
```

**Terminal 2 (Test Webhook):**
```bash
# Send test requests
while true; do
  curl -X POST http://localhost:3000/api/doku/webhook \
    -H "Content-Type: application/json" \
    -d '{"order":{"invoice_number":"SP-TEST-'$(date +%s)'"},"transaction":{"status":"SUCCESS"}}'
  sleep 5
done
```

---

## 🔍 VERIFICATION STEPS

### After Each Fix, Verify:

- [ ] Compile without errors: `npm run build`
- [ ] No TypeScript errors: `npm run lint`
- [ ] Webhook test returns 200 OK
- [ ] Database updated with status PAID
- [ ] Admin page loads without error
- [ ] Print button works
- [ ] Status changes to PRINTED

### Before Production:

- [ ] All environment variables set
- [ ] DOKU callback URL correct
- [ ] Database backups working
- [ ] Logs aggregation set up
- [ ] Monitoring alerts configured
- [ ] Load test passed (100+ rps)
- [ ] Security audit completed

---

## 🎯 FINAL CHECKLIST

```
WEBHOOK ISSUES:
✅ Signature verification enabled
✅ Idempotency check implemented
✅ Detailed logging added
✅ Error handling improved
✅ Callback URL correct

PRINT ISSUES:
✅ CSS changed to object-fit: cover
✅ Image loading tracking implemented
✅ Loading indicator added
✅ Timeout fallback added
✅ Page dimensions calculated correctly

BEST PRACTICES:
✅ RLS policies secured
✅ Environment variables protected
✅ Error handling comprehensive
✅ Logging structured
✅ Database schema optimized
```

---

## 📞 STILL STUCK?

1. **Check the documentation files:**
   - `WEBHOOK_DOKU_FIX.md` - Detailed webhook guide
   - `PRINT_PAGE_FIX.md` - Print CSS guide
   - `BEST_PRACTICES_PHOTO_PRINT.md` - Architecture guide

2. **Monitor logs:**
   - Next.js: `npm run dev` (check terminal)
   - Browser: DevTools → Console
   - Database: Supabase SQL Editor

3. **Test with sample data:**
   - Use curl to send webhook
   - Use admin page to create orders
   - Use DevTools Network tab to check requests

4. **Common solutions:**
   - Clear browser cache (Ctrl+Shift+Del)
   - Restart Next.js dev server (kill + npm run dev)
   - Check image URLs accessible in browser
   - Verify .env.local file exists and has all keys
