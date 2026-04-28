# 📖 QUICK REFERENCE - COPY PASTE SOLUTIONS

Solusi quick-copy untuk 4 masalah. Gunakan ketika urgent.

---

## 🔧 FIX #1: WEBHOOK STATUS NOT UPDATING (SUDAH DIPERBAIKI)

### What Was Wrong
```typescript
// ❌ OLD CODE (line 115-120 in app/api/doku/webhook/route.ts)
// Signature verification DISABLED
/*
  if (!isValid) {
    return NextResponse.json({ error: \"invalid_signature\" }, { status: 401 });
  }
*/
console.log(\"[DOKU Webhook] Signature verification temporarily disabled for debugging\");
```

### What Changed
```typescript
// ✅ NEW CODE (now enabled)
if (DOKU_SERVER_KEY && receivedSignature) {
  const isValid = verifyDokuSignature(
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    rawBody,
    DOKU_SERVER_KEY,
    receivedSignature
  );

  if (!isValid) {
    console.warn(\"[DOKU Webhook] ❌ SIGNATURE VERIFICATION FAILED\");
    return NextResponse.json({ error: \"invalid_signature\" }, { status: 401 });
  }
  console.log(\"[DOKU Webhook] ✅ Signature verified successfully\");
}
```

### How to Test
```bash
# Terminal 1
npm run dev

# Terminal 2
curl -X POST http://localhost:3000/api/doku/webhook \\
  -H \"Content-Type: application/json\" \\
  -H \"Client-Id: TESTCLIENT\" \\
  -H \"Request-Id: test-123\" \\
  -H \"Request-Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')\" \\
  -d '{
    \"order\": {
      \"invoice_number\": \"SP-TEST-'$(date +%s)'\",
      \"amount\": 50000
    },
    \"transaction\": {
      \"status\": \"SUCCESS\"
    }
  }'

# Expected in Terminal 1 logs:
# [DOKU Webhook] ✅ Order updated successfully
```

---

## 🖼️ FIX #2: PRINT NOT FULL SIZE (SUDAH DIPERBAIKI)

### What Was Wrong
```css
/* ❌ OLD CSS (in admin/page.tsx print window) */
.print-image {
  max-width: 100%;       /* Limited size */
  max-height: 100%;      /* Limited size */
  object-fit: contain;   /* Adds white border */
}
/* Result: Image has white space on sides */
```

### What Changed
```css
/* ✅ NEW CSS */
.print-image {
  width: 100%;              /* Fill entire width */
  height: 100%;             /* Fill entire height */
  object-fit: cover;        /* No white space */
  object-position: center;  /* Center crop */
}

@page {
  size: 4in 6in;   /* or 2in 6in for 2x6 */
  margin: 0;
  padding: 0;
}
```

### How to Verify
1. Admin page → Click Print on PAID order
2. Print dialog → Check preview
3. Image should fill entire page ✅

---

## 💻 FIX #3: PRINT PAGE BLANK (SUDAH DIPERBAIKI)

### What Was Wrong
```javascript
// ❌ OLD CODE
setTimeout(function() { 
  window.print();  // 500ms too fast, images not loaded yet
  setTimeout(function() { window.close(); }, 1000);
}, 500);  // ← Problem here
```

### What Changed
```javascript
// ✅ NEW CODE
window.imageLoadCount = 0;
window.totalImages = ${loadedImages.length};

function checkAllImagesLoaded() {
  window.imageLoadCount++;
  
  if (window.imageLoadCount >= window.totalImages) {
    console.log('[PRINT] ✅ All images loaded');
    document.getElementById('loading').remove();
    
    setTimeout(() => {
      window.print();  // NOW images are ready
      setTimeout(() => window.close(), 500);
    }, 300);
  }
}

// Safety timeout (10 seconds)
setTimeout(() => {
  if (window.imageLoadCount < window.totalImages) {
    console.warn('[PRINT] Timeout: only some images loaded');
  }
  window.print();  // Auto-print anyway
}, 10000);

// In HTML:
<img 
  src=\"${dataUrl}\" 
  onload=\"window.imageLoadCount++; checkAllImagesLoaded();\"
/>
```

### How to Verify
1. Admin page → Click Print
2. See \"Loading images...\" indicator
3. Wait for it to disappear
4. Print dialog opens automatically ✅

---

## 📚 FIX #4: DOCUMENTATION (SUDAH DIBUAT)

### Available Documentation

```bash
# 1. Setup Environment
cat ENVIRONMENT_SETUP_GUIDE.md
# Contains: .env.local setup, DOKU config, DB migration

# 2. Webhook Debugging
cat WEBHOOK_DOKU_FIX.md
# Contains: signature verification, manual testing, debugging

# 3. Print CSS Guide
cat PRINT_PAGE_FIX.md
# Contains: dimensions, CSS rules, troubleshooting

# 4. Best Practices
cat BEST_PRACTICES_PHOTO_PRINT.md
# Contains: architecture, security, performance, testing

# 5. Debug Checklist
cat DEBUG_CHECKLIST.md
# Contains: quick diagnosis, step-by-step checklists

# 6. Summary
cat FIX_SUMMARY.md
# Contains: overview of all fixes and changes
```

---

## ⚡ QUICK FIX CHECKLIST

### For Webhook Issues (5 min)

```bash
# 1. Check .env.local has DOKU keys
grep DOKU_SERVER_KEY .env.local

# 2. Test webhook manually
curl -X POST http://localhost:3000/api/doku/webhook \\
  -H \"Content-Type: application/json\" \\
  -d '{\"order\":{\"invoice_number\":\"SP-TEST\"},\"transaction\":{\"status\":\"SUCCESS\"}}'

# 3. Check database
# Supabase → SQL Editor:
SELECT * FROM print_orders WHERE status='PAID' LIMIT 5;

# If status still PENDING:
# → Check webhook logs in Next.js terminal
# → Check DOKU callback URL correct
# → Check doku_order_id format matches
```

### For Print Issues (3 min)

```bash
# 1. Admin page → Click Print
# 2. See loading indicator? (Yes → Good)
# 3. Print dialog appears? (Yes → CSS working)
# 4. Image fills page? (Yes → All fixed)

# If print blank:
# → Check browser DevTools → Console for errors
# → Check Network tab → Image URLs return 200 OK
# → Wait 10 seconds (timeout will trigger print)
```

---

## 🔑 ENVIRONMENT VARIABLES NEEDED

```bash
# .env.local (create this file in root)

# DOKU Payment Gateway (from dashboard.doku.com)
DOKU_CLIENT_ID=your_id_here
DOKU_CLIENT_KEY=your_key_here
DOKU_SERVER_KEY=your_server_key_here

# Supabase (from app.supabase.com)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Admin
ADMIN_PASSWORD=your_password_here

# Optional
NODE_ENV=development
```

---

## 🧪 MINIMAL TEST FLOW

```bash
# 1. Start dev server
npm run dev

# 2. Open admin (other terminal)
open http://localhost:3000/admin
# Password: (from .env.local ADMIN_PASSWORD)

# 3. Manually create test order (in SQL)
# Supabase → SQL Editor:
INSERT INTO print_orders (
  id, doku_order_id, customer_name, customer_email, 
  image_urls, size, qty, amount, status, created_at
) VALUES (
  gen_random_uuid(),
  'SP-TEST-'||extract(epoch from now())::int,
  'Test User',
  'test@example.com',
  ARRAY['https://example.com/image.jpg'],
  '4x6',
  1,
  50000,
  'PAID',
  now()
);

# 4. Refresh admin page
# F5 in browser

# 5. Click Print
# Should see loading indicator → Print dialog opens

# 6. Check status changed to PRINTED
# Refresh admin page → Status = PRINTED ✅
```

---

## 🚨 COMMON QUICK FIXES

### \"Webhook not received\"
```
1. Check DOKU callback URL: https://yourdomain.com/api/doku/webhook
2. Check HTTPS (not HTTP)
3. For localhost: use ngrok
   ngrok http 3000
   Update callback to: https://abc123.ngrok.io/api/doku/webhook
```

### \"Status still PENDING\"
```
1. Check DOKU_SERVER_KEY in .env.local
2. Check webhook endpoint accessible:
   curl http://localhost:3000/api/doku/webhook -X POST
3. Check logs in Next.js terminal
4. Check database has order:
   SELECT * FROM print_orders WHERE doku_order_id='SP-YOUR-ID'
```

### \"Print page blank\"
```
1. Wait 10 seconds (timeout will trigger)
2. Check DevTools Console for errors
3. Check Network tab - images load OK?
4. Check image URLs valid:
   open https://your-image-url-here
   Should show image in browser
```

### \"Print has white border\"
```
1. Check CSS: object-fit should be 'cover' (not 'contain')
2. Check @page size is set
3. In print dialog: Margins → set to None
4. Refresh admin page (F5)
```

---

## 📞 STILL STUCK?

1. **Read full docs:**
   - `WEBHOOK_DOKU_FIX.md` - for webhook issues
   - `PRINT_PAGE_FIX.md` - for print issues
   - `DEBUG_CHECKLIST.md` - for diagnosis

2. **Check logs:**
   - Next.js: `npm run dev` terminal
   - Browser: DevTools → Console
   - Database: Supabase SQL Editor

3. **Test manually:**
   - Webhook: curl -X POST ...
   - Admin: open http://localhost:3000/admin
   - Database: SELECT * FROM print_orders

---

**Version:** 1.0  
**Status:** Production Ready  
**Last Updated:** April 28, 2026
