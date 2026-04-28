# ⚙️ ENVIRONMENT SETUP GUIDE

Copy & paste ready-to-use configuration untuk semua 4 masalah.

---

## 🔐 STEP 1: Setup Environment Variables

### Create `.env.local` di root project

```bash
# Copy paste ke file .env.local (di root, sebelah package.json)
# Edit nilai dengan milik Anda

# ============================================
# DOKU PAYMENT GATEWAY
# ============================================
# Ambil dari: https://dashboard.doku.com → Settings → API Keys
DOKU_CLIENT_ID=your_client_id_from_doku_dashboard
DOKU_CLIENT_KEY=your_client_key_from_doku_dashboard
DOKU_SERVER_KEY=your_server_key_from_doku_dashboard

# ============================================
# SUPABASE
# ============================================
# Ambil dari: https://app.supabase.com → Project Settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# ============================================
# ADMIN AUTH
# ============================================
# Pasword untuk admin panel
ADMIN_PASSWORD=your_secure_password_here

# ============================================
# EMAIL (Optional - untuk notification)
# ============================================
RESEND_API_KEY=your_resend_api_key_if_using_email

# ============================================
# PRINTER (Optional - untuk auto-print)
# ============================================
PRINTER_HOST=192.168.1.100
PRINTER_PORT=9100
PRINTER_NAME=DHS_RX_1

# ============================================
# NODE ENV
# ============================================
NODE_ENV=development
NEXT_PUBLIC_ENV=development
```

### Setup untuk Production (Vercel)

1. **Buka:** https://vercel.com → Project → Settings → Environment Variables

2. **Add secrets (jangan commit ke git):**
   ```
   DOKU_SERVER_KEY = your_server_key (production)
   SUPABASE_SERVICE_ROLE_KEY = your_service_role_key (production)
   ADMIN_PASSWORD = your_strong_password
   ```

3. **Redeploy:**
   ```bash
   git push origin main
   # Vercel will auto-deploy dengan env vars baru
   ```

---

## 🛠️ STEP 2: Configure DOKU Dashboard

### Setting Callback URL

1. **Login ke DOKU Dashboard:**
   https://dashboard.doku.com

2. **Navigate to:**
   Settings → Webhook → HTTP Notification

3. **Set Notification URL:**
   ```
   https://yourdomain.com/api/doku/webhook
   ```

   **Contoh:**
   - Production: https://spark-print.com/api/doku/webhook
   - Staging: https://staging-spark.com/api/doku/webhook

4. **Save & Test:**
   - DOKU mungkin akan test webhook secara otomatis
   - Check console logs di Next.js
   - Seharusnya ada log: `[DOKU Webhook] Received notification`

### Test dengan ngrok (localhost)

```bash
# 1. Install ngrok
choco install ngrok  # Windows
# atau
brew install ngrok   # Mac

# 2. Start ngrok tunnel
ngrok http 3000

# 3. Copy forwarding URL
# Forwarding: https://abc123.ngrok.io → http://localhost:3000

# 4. Update di DOKU dashboard:
# Notification URL: https://abc123.ngrok.io/api/doku/webhook

# 5. Keep ngrok running (jangan close terminal)
```

---

## 🗄️ STEP 3: Setup Supabase Database

### Run Migration

1. **Buka:** https://app.supabase.com → Your Project → SQL Editor

2. **Create new query:**
   - Click \"New query\"
   - Copy dari file: `supabase-setup.sql`
   - Click \"Run\"

3. **Verify tables created:**
   ```sql
   -- Check if tables exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema='public';
   
   -- Should show: print_orders, storage.objects, etc
   ```

### Enable RLS (Row Level Security)

```sql
-- Supabase SQL Editor

-- Enable RLS on print_orders
ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY \"Anyone can insert orders\"
  ON public.print_orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY \"Service role can update orders\"
  ON public.print_orders FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY \"Users can view own orders\"
  ON public.print_orders FOR SELECT
  USING (
    customer_email = current_user_email()
    OR auth.role() = 'service_role'
  );
```

---

## 📱 STEP 4: Test Setup

### Test 1: Webhook Endpoint Accessible

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Test webhook
curl -X POST http://localhost:3000/api/doku/webhook \
  -H \"Content-Type: application/json\" \
  -H \"Client-Id: TEST\" \
  -H \"Request-Id: test-123\" \
  -H \"Request-Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')\" \
  -d '{
    \"order\": {
      \"invoice_number\": \"SP-TEST-'$(date +%s)'\",
      \"amount\": 50000
    },
    \"transaction\": {
      \"status\": \"SUCCESS\"
    }
  }'

# Expected response:
# { \"ok\": true, \"debug\": {...} }
```

### Test 2: Database Connection

```bash
# Supabase SQL Editor
SELECT COUNT(*) as total_orders FROM print_orders;

# Should return: total_orders = 0 or more (not error)
```

### Test 3: Admin Page

```bash
# Browser: http://localhost:3000/admin
# Login with ADMIN_PASSWORD dari .env.local
# Should see: \"Load failed\" atau \"0 QRIS orders\"

# If see error: check .env.local ADMIN_PASSWORD matches input
```

---

## 🚀 STEP 5: Verify All Fixes

### Checklist Webhook Fix

```javascript
// Terminal: npm run dev
// Should see logs like:
[DOKU Webhook] Received notification: { clientId: '...' }
[DOKU Webhook] ✅ Signature verified successfully
[DOKU Webhook] ✅ Order updated successfully: {
  orderId: '...',
  status: 'PAID',
  paidAt: '2026-04-28T10:00:00Z'
}

// If not seeing these:
// 1. Check DOKU_SERVER_KEY in .env.local
// 2. Check order exists in database
// 3. Check webhook URL correct di DOKU dashboard
```

### Checklist Print Page Fix

```javascript
// Browser: http://localhost:3000/admin
// 1. Click Print button on PAID order
// 2. Should see: \"Loading images...\"
// 3. Wait 3-5 seconds
// 4. Print dialog should auto-open
// 5. Check preview: image should fill entire page
// 6. If white border appears: CSS still using object-fit: contain
```

### Checklist All Fixes

- [ ] `.env.local` created with all DOKU keys
- [ ] DOKU callback URL set to `/api/doku/webhook`
- [ ] Supabase table `print_orders` exists
- [ ] RLS policies enabled
- [ ] Webhook test returns 200 OK
- [ ] Admin page loads without password error
- [ ] Print dialog opens when clicking Print
- [ ] Image fills entire page (no white border)
- [ ] Order status updates to PAID after webhook
- [ ] Order status updates to PRINTED after print

---

## 📝 FILES MODIFIED

### App Files Changed

```
app/api/doku/webhook/route.ts
├── ✅ Enabled signature verification
├── ✅ Added detailed logging
├── ✅ Implemented idempotency check
└── ✅ Improved error messages

app/admin/page.tsx
├── ✅ Fixed print window CSS (object-fit: cover)
├── ✅ Added image loading tracking
├── ✅ Added loading indicator
├── ✅ Added timeout fallback (10 seconds)
└── ✅ Improved error handling
```

### New Documentation Files

```
WEBHOOK_DOKU_FIX.md
├── Webhook setup guide
├── Signature verification explained
├── Debugging webhook issues
├── Manual test dengan curl
└── Common problems & solutions

PRINT_PAGE_FIX.md
├── CSS print guide
├── Correct dimensions (2x6, 4x6)
├── Image loading flow
├── Troubleshooting blank pages
└── Best practices

BEST_PRACTICES_PHOTO_PRINT.md
├── Complete architecture
├── Security best practices
├── Performance optimization
├── Testing strategies
└── Scaling guidelines

DEBUG_CHECKLIST.md
├── Quick diagnosis steps
├── Issue-by-issue checklists
├── Enable debug mode
└── Final verification

ENVIRONMENT_SETUP_GUIDE.md (ini)
├── .env.local setup
├── DOKU configuration
├── Supabase migration
└── Verification tests
```

---

## 🔍 VERIFICATION COMMANDS

### Verify Environment Setup

```bash
# 1. Check .env.local exists
test -f .env.local && echo \"✅ .env.local exists\" || echo \"❌ .env.local missing\"

# 2. Check required variables
grep -E \"DOKU_|SUPABASE_\" .env.local | wc -l
# Should output: 5 (minimum 5 env vars)

# 3. Check no secrets in git
git log --all --oneline | grep -i env
# Should return: (nothing)

# 4. Check app builds
npm run build
# Should complete without TypeScript errors
```

### Verify Database Setup

```sql
-- Supabase SQL Editor

-- 1. Check table exists
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name='print_orders';

-- 2. Check columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name='print_orders';

-- 3. Check indexes
SELECT * FROM pg_indexes 
WHERE tablename = 'print_orders';

-- 4. Check RLS enabled
SELECT relrowsecurity FROM pg_class 
WHERE relname = 'print_orders';
-- Should return: true
```

### Verify Webhook Signature

```bash
# 1. Extract DOKU_SERVER_KEY
DOKU_KEY=$(grep DOKU_SERVER_KEY .env.local | cut -d= -f2)

# 2. Test webhook signature calculation
# (Implement dalam test file atau use HMAC tool online)
```

---

## 🎯 PRODUCTION DEPLOYMENT

### Pre-Deployment Checklist

- [ ] `.env.local` NOT committed to git
- [ ] All tests passing: `npm run build && npm run lint`
- [ ] Database backup created
- [ ] Webhook tested with real DOKU payment
- [ ] Admin password strong (12+ chars, mixed case)
- [ ] DOKU callback URL uses production domain
- [ ] Supabase project settings locked down
- [ ] Error logging configured (Sentry, LogRocket)
- [ ] Monitoring alerts set up
- [ ] Load test passed (100+ concurrent users)

### Deploy to Vercel

```bash
# 1. Push to production branch
git push origin main

# 2. Vercel auto-deploys
# (Wait for build to complete)

# 3. Set environment variables in Vercel:
# https://vercel.com → Project → Settings → Environment Variables

# 4. Redeploy with env vars:
# Click \"Redeploy\" atau push to git lagi

# 5. Verify:
# https://yourdomain.com/admin
# Should work with production credentials
```

### Post-Deployment Verification

```bash
# 1. Test webhook
curl -X POST https://yourdomain.com/api/doku/webhook \
  -H \"Content-Type: application/json\" \
  -d '{...}'

# 2. Check admin page
# https://yourdomain.com/admin

# 3. Test real payment (small amount)
# Go through full payment flow

# 4. Monitor logs
# Check Vercel logs for errors
# Check Sentry for crashes
```

---

## 🆘 COMMON SETUP ERRORS

### Error: \"Cannot find module 'next'\"
```bash
# Solution:
npm install
npm run dev
```

### Error: \"DOKU_SERVER_KEY is undefined\"
```bash
# Solution:
# 1. Create .env.local in root
# 2. Add: DOKU_SERVER_KEY=your_key
# 3. Restart dev server: npm run dev
```

### Error: \"Supabase project not found\"
```bash
# Solution:
# 1. Check NEXT_PUBLIC_SUPABASE_URL
# 2. Should be: https://your-project.supabase.co
# 3. Not: https://app.supabase.com
```

### Error: \"RLS policy error\"
```bash
# Solution:
# Run in Supabase SQL Editor:
ALTER TABLE public.print_orders DISABLE ROW LEVEL SECURITY;
# Then check if query works
# If works: RLS policy too restrictive
# If still fails: different issue
```

---

## 📚 QUICK REFERENCE

| Issue | File | Fix |
|-------|------|-----|
| Webhook status not update | app/api/doku/webhook/route.ts | Enable signature verification + add logging |
| Print blank page | app/admin/page.tsx | Add image loading tracking + loading indicator |
| Print has white border | app/admin/page.tsx | Change object-fit: contain → cover |
| CORS error | Supabase settings | Enable CORS di storage bucket |
| Webhook not received | DOKU dashboard | Check callback URL correct (HTTPS) |
| Order not created | app/api/orders/route.ts | Check image_urls format |

---

## 📞 SUPPORT

Jika masih ada masalah setelah setup:

1. **Check logs:**
   ```bash
   npm run dev  # Terminal 1: lihat semua logs
   ```

2. **Check database:**
   ```sql
   -- Supabase SQL Editor
   SELECT * FROM print_orders ORDER BY created_at DESC LIMIT 5;
   ```

3. **Check browser:**
   - DevTools → Console: ada error?
   - DevTools → Network: request success?

4. **Read documentation:**
   - `WEBHOOK_DOKU_FIX.md` - untuk webhook issues
   - `PRINT_PAGE_FIX.md` - untuk print issues
   - `DEBUG_CHECKLIST.md` - untuk diagnosis

5. **Ask for help:**
   - Include error message (full)
   - Include .env.local (tanpa secrets)
   - Include screenshot dari error
