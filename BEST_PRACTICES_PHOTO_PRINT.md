# ✅ BEST PRACTICES - PHOTO PRINT WEBSITE

## 📊 COMPLETE FLOW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER JOURNEY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. UPLOAD                                                        │
│     Customer upload foto → Supabase Storage (public bucket)      │
│     ✅ File saved: /photos/uuid.jpg                              │
│     ✅ Get public URL                                            │
│     ✅ Return URL to frontend                                    │
│                                                                   │
│  2. CREATE ORDER                                                  │
│     Customer select size (2x6 / 4x6) + qty → API POST            │
│     ✅ Create order di print_orders table                        │
│     ✅ Status = PENDING                                          │
│     ✅ Generate unique invoice_number = SP-{timestamp}-{random}  │
│     ✅ Return invoice_number + payment amount                    │
│                                                                   │
│  3. PAYMENT (DOKU QRIS)                                          │
│     Customer scan QRIS / click \"Pay\" → DOKU payment gateway    │
│     ✅ Payment success di DOKU                                   │
│     ✅ DOKU kirim webhook ke /api/doku/webhook                  │
│                                                                   │
│  4. WEBHOOK PROCESSING                                           │
│     /api/doku/webhook menerima notification:                     │
│     ✅ Verify signature (HMAC-SHA256)                            │
│     ✅ Check order exists (by invoice_number)                    │
│     ✅ Check not already processed (idempotency)                 │
│     ✅ Update status: PENDING → PAID                             │
│     ✅ Set paid_at = current timestamp                           │
│     ✅ Trigger auto-print (if enabled)                          │
│                                                                   │
│  5. ADMIN PRINT                                                   │
│     Admin login → view orders (status = PAID)                    │
│     ✅ Click tombol \"Print\"                                    │
│     ✅ Fetch image dari Supabase                                │
│     ✅ Wait untuk image load completely                         │
│     ✅ Open print window dengan CSS page size                   │
│     ✅ Trigger window.print()                                    │
│     ✅ Mark order as PRINTED                                     │
│     ✅ Update status: PAID → PRINTED                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 DATABASE SCHEMA OPTIMIZATION

### Current Schema (Good ✅)
```sql
CREATE TABLE print_orders (
  id UUID PRIMARY KEY,
  doku_order_id TEXT UNIQUE NOT NULL,  -- Invoice number (unique)
  queue_number INTEGER,
  customer_name TEXT,
  customer_email TEXT,
  image_urls TEXT[],  -- Array of URLs
  size TEXT,  -- '4x6' atau '2x6'
  qty INTEGER,
  amount INTEGER,  -- IDR
  status TEXT,  -- PENDING | PAID | PRINTED | FAILED
  payment_method TEXT,
  created_at TIMESTAMP,
  paid_at TIMESTAMP  -- Set saat webhook processed
);

-- Indexes (good for query performance)
CREATE INDEX idx_status ON print_orders(status);
CREATE INDEX idx_paid_at ON print_orders(paid_at);
CREATE INDEX idx_doku_id ON print_orders(doku_order_id);
```

### Recommended Additions (Optional)
```sql
-- Track payment retries
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS payment_retry_count INT DEFAULT 0;
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP;
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS webhook_signature TEXT;  -- For idempotency

-- Track print history
CREATE TABLE print_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES print_orders(id),
  printed_at TIMESTAMP DEFAULT now(),
  printed_by TEXT,  -- admin username
  page_count INT,
  print_success BOOLEAN,
  printer_name TEXT,
  notes TEXT
);

-- RLS Policy untuk print_history
ALTER TABLE print_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage print history"
  ON print_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

---

## 🔐 SECURITY BEST PRACTICES

### 1. Webhook Signature Verification
```typescript
// ✅ DO: Always verify signature
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
  return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
}

// ❌ DON'T: Skip verification in production
// if (process.env.NODE_ENV === 'production') {
//   // Still verify!
// }
```

### 2. Idempotency Check
```typescript
// ✅ DO: Prevent duplicate updates
const isAlreadyPaid = existing.status === "PAID" && existing.paid_at;
if (isAlreadyPaid && transactionStatus === "SUCCESS") {
  return NextResponse.json({ ok: true, msg: "already_processed" });
}

// ❌ DON'T: Update status every time webhook called
// This will overwrite paid_at timestamp
```

### 3. Environment Variables
```bash
# ✅ DO: Use .env.local for secrets
DOKU_SERVER_KEY=your_secret_key_here

# ❌ DON'T: Commit .env.local to git
# ❌ DON'T: Put secrets in code

# Ensure .gitignore contains:
.env.local
.env.*.local
```

### 4. Admin Authentication
```typescript
// ✅ DO: Verify admin password / JWT token
// Current implementation checks \"x-admin-password\" header
const authHeader = req.headers.get("x-admin-password");
if (authHeader !== process.env.ADMIN_PASSWORD) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// ❌ DON'T: Use plaintext password in header (use JWT or OAuth)
// IMPROVEMENT: Use JWT or Supabase Auth for admin

// Future improvement:
// const token = req.headers.get("Authorization");
// const verified = await verifyJWT(token);
// if (!verified.isAdmin) throw new Error("Unauthorized");
```

### 5. RLS (Row Level Security)
```sql
-- ✅ DO: Enable RLS untuk semua sensitive tables
ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;

-- Allow customers to see their own orders
CREATE POLICY "Users can view own orders"
  ON print_orders
  FOR SELECT
  USING (
    customer_email = current_user_email()
    OR auth.role() = 'service_role'
  );

-- Allow only service role to update
CREATE POLICY "Service role can update orders"
  ON print_orders
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

### 6. Rate Limiting
```typescript
// ✅ DO: Implement rate limiting
const MAX_REQUESTS_PER_MINUTE = 100;
const requests = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  const times = requests.get(ip) || [];
  const recentRequests = times.filter(t => t > oneMinuteAgo);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  recentRequests.push(now);
  requests.set(ip, recentRequests);
  return true;
}

// In webhook handler:
if (!checkRateLimit(req.ip)) {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
```

---

## 🛡️ ERROR HANDLING & RETRIES

### Webhook Retry Strategy
```typescript
// ✅ DO: Implement exponential backoff
async function retryWebhook(
  orderId: string,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Process webhook
      const result = await processWebhook(orderId);
      if (result.success) return true;
    } catch (error) {
      // Calculate backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`[RETRY] Attempt ${attempt + 1} failed, retry in ${delayMs}ms`);
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // Log failure untuk manual debugging
  console.error(`[RETRY] All ${maxRetries} attempts failed`);
  // Send alert email to admin
  return false;
}
```

### Print Error Handling
```typescript
// ✅ DO: Graceful error handling
try {
  // Preload images
  const loadedImages = await Promise.allSettled(
    imageUrls.map(url => loadImage(url))
  );
  
  // Handle partial failures
  const successful = loadedImages
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<string>).value);
  
  if (successful.length === 0) {
    throw new Error('No images loaded successfully');
  }
  
  console.warn(`[PRINT] Loaded ${successful.length}/${imageUrls.length} images`);
  
} catch (error) {
  console.error('[PRINT] Error:', error);
  // Show error to user, don't auto-close
  document.querySelector('#loading').textContent = 
    'Error loading images. Please try again.';
}
```

---

## 📊 LOGGING & MONITORING

### Structured Logging
```typescript
// ✅ DO: Log dengan context
interface WebhookLog {
  timestamp: string;
  invoiceNumber: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  paidAt: string | null;
  success: boolean;
  errorMessage?: string;
}

const log: WebhookLog = {
  timestamp: new Date().toISOString(),
  invoiceNumber,
  orderId: existing.id,
  previousStatus: existing.status,
  newStatus: order_status,
  paidAt: shouldSetPaidAt ? updatePayload.paid_at : null,
  success: !updateErr,
  errorMessage: updateErr?.message,
};

console.log('[WEBHOOK]', JSON.stringify(log));

// Optional: Send to logging service (Sentry, LogRocket, etc)
// logService.info('[WEBHOOK]', log);
```

### Debug Mode
```typescript
// ✅ DO: Add debug logging in development
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG] Full webhook payload:', payload);
  console.log('[DEBUG] Signature verification:', {
    clientId,
    requestId,
    digest,
    rawString,
    calculatedSig,
    receivedSig,
  });
}

// ❌ DON'T: Log sensitive data in production
if (process.env.NODE_ENV === 'production') {
  // Don't log full payload with customer info
}
```

---

## 🚀 PERFORMANCE OPTIMIZATION

### 1. Image Optimization
```typescript
// ✅ DO: Compress images before storage
// Use sharp or similar
import sharp from 'sharp';

const optimized = await sharp(imageBuffer)
  .resize(1200, 1800, { 
    fit: 'cover',
    position: 'center'
  })
  .jpeg({ quality: 85, progressive: true })
  .toBuffer();

// ❌ DON'T: Store original huge images
```

### 2. Database Query Optimization
```typescript
// ✅ DO: Use proper indexes
CREATE INDEX idx_status_created ON print_orders(status, created_at DESC);

// ✅ DO: Limit result set
.select('*')
.eq('status', 'PAID')
.order('created_at', { ascending: false })
.limit(50);  // Don't fetch all orders

// ❌ DON'T: N+1 queries
// If fetching orders + their details separately
```

### 3. Print Window Optimization
```typescript
// ✅ DO: Convert images to data URLs for offline printing
const imageData = await fetch(url)
  .then(r => r.blob())
  .then(b => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(b);
  }));

// Images sudah embedded, print window bisa berdiri sendiri

// ❌ DON'T: Use image URLs langsung
// <img src="https://external-cdn.com/image.jpg" />
// Jika network off → print fail
```

---

## 🧪 TESTING CHECKLIST

### Unit Tests
```typescript
// Test webhook signature verification
describe('DOKU Webhook', () => {
  test('should verify valid signature', () => {
    const valid = verifyDokuSignature(
      'client-123',
      'req-123',
      '2026-04-28T10:00:00Z',
      '/api/doku/webhook',
      '{"order": {"amount": 50000}}',
      'secret-key',
      'HMACSHA256=xyz'
    );
    expect(valid).toBe(true);
  });

  test('should reject invalid signature', () => {
    const valid = verifyDokuSignature(...);
    expect(valid).toBe(false);
  });

  test('should prevent duplicate payment update', () => {
    // Test idempotency
  });
});
```

### Integration Tests
```typescript
// Test full flow: Payment → Webhook → Status Update
describe('Payment Flow', () => {
  test('should update order status to PAID after webhook', async () => {
    // 1. Create order
    const order = await db.insert('print_orders', {...});
    
    // 2. Simulate webhook
    const res = await fetch('/api/doku/webhook', {
      method: 'POST',
      body: JSON.stringify({
        order: { invoice_number: order.doku_order_id },
        transaction: { status: 'SUCCESS' }
      })
    });
    
    // 3. Verify response
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    
    // 4. Check database
    const updated = await db.select('print_orders').eq('id', order.id);
    expect(updated.status).toBe('PAID');
  });
});
```

### End-to-End Tests (E2E)
```bash
# Use Playwright / Cypress for E2E
# Test full customer journey:
# 1. Upload photo
# 2. Select size
# 3. Payment
# 4. Webhook processing
# 5. Admin print
# 6. Status change to PRINTED
```

---

## 📈 SCALING & DEPLOYMENT

### Production Checklist
- [ ] ✅ Enable all signature verifications
- [ ] ✅ Set up logging aggregation (Sentry, LogRocket)
- [ ] ✅ Set up monitoring/alerts for webhook failures
- [ ] ✅ Set up database backups
- [ ] ✅ Configure CDN for image delivery
- [ ] ✅ Set up auto-scaling for traffic spikes
- [ ] ✅ Enable caching for static assets
- [ ] ✅ Set up CI/CD pipeline
- [ ] ✅ Load testing before launch
- [ ] ✅ Security audit

### Deployment
```bash
# Environment variables
DOKU_CLIENT_ID=prod_client_id
DOKU_CLIENT_KEY=prod_client_key
DOKU_SERVER_KEY=prod_server_key (set in Vercel secrets)

# Database
NEXT_PUBLIC_SUPABASE_URL=production_url
SUPABASE_SERVICE_ROLE_KEY=production_key (set in Vercel secrets)

# Admin
ADMIN_PASSWORD=strong_password (set in Vercel secrets)
```

---

## 🔄 FUTURE IMPROVEMENTS

### Phase 2 (Next Steps)
- [ ] SMS/Email notification saat payment success
- [ ] Real-time status update (WebSocket)
- [ ] Queue management (FIFO, priority)
- [ ] Print template customization
- [ ] Watermark / branding
- [ ] Batch printing
- [ ] Print history dashboard

### Phase 3 (Advanced)
- [ ] Image editing before print (crop, filters)
- [ ] Multiple payment methods (credit card, e-wallet)
- [ ] Subscription / monthly prints
- [ ] Mobile app
- [ ] Multi-location support
- [ ] Loyalty program

---

## 📞 TROUBLESHOOTING GUIDE

### Webhook tidak diterima
1. Check callback URL di DOKU dashboard
2. Verify HTTPS (bukan HTTP)
3. Tunggu 60 detik (DOKU queue)
4. Check ngrok active (jika testing locally)

### Status tidak berubah ke PAID
1. Check webhook logs di Next.js console
2. Query database: SELECT * FROM print_orders WHERE status='PENDING'
3. Check DOKU webhook history
4. Verify doku_order_id format (SP-xxx)

### Print halaman blank
1. Check image URLs valid
2. Check CORS headers
3. Check loading indicator (tunggu sampai disappear)
4. Check browser console for errors
5. Try print to PDF dulu

### Admin page lambat
1. Reduce limit (current: 200 orders)
2. Add pagination
3. Filter by date range
4. Check database indexes

---

## 📚 REFERENCES

- [DOKU API Documentation](https://developers.doku.com)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Web Print API](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)
- [CSS Print Styles](https://developer.mozilla.org/en-US/docs/Web/CSS/Paged_media)
