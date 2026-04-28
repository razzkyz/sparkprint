# 🏗️ Webhook Architecture & Security Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOKU PAYMENT GATEWAY                         │
│              Sends POST to webhook on payment status             │
└──────────────────────────────┬──────────────────────────────────┘
                              │
                              │ HTTP POST
                              │ Headers: Client-Id, Request-Id, 
                              │          Request-Timestamp, Signature
                              │ Body: JSON payload
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │     SUPABASE EDGE FUNCTION (Deno Runtime)          │
        │  URL: /functions/v1/doku-webhook                   │
        ├─────────────────────────────────────────────────────┤
        │                                                      │
        │  1. Rate Limit Check                                │
        │     └─→ Max 100 requests/min                        │
        │                                                      │
        │  2. Read Raw Body (critical for digest)             │
        │     └─→ No JSON parsing yet!                        │
        │                                                      │
        │  3. Extract Headers                                 │
        │     └─→ Client-Id, Request-Id, Request-Timestamp,   │
        │         Signature                                   │
        │                                                      │
        │  4. Timestamp Validation                            │
        │     └─→ ±5 minutes tolerance (prevent replay)       │
        │                                                      │
        │  5. Signature Verification (HMAC-SHA256)            │
        │     └─→ Secret: DOKU_SERVER_KEY                     │
        │         Algorithm: HMACSHA256(rawString, secretKey)  │
        │                                                      │
        │  6. Duplicate Prevention                            │
        │     └─→ Track Request-Id (prevent double-charge)    │
        │                                                      │
        │  7. Parse JSON & Validate Fields                    │
        │     └─→ Extract: invoice_number, transaction_status │
        │                                                      │
        └──────────────┬───────────────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────────────┐
        │      SUPABASE DATABASE (PostgreSQL)                │
        ├─────────────────────────────────────────────────────┤
        │                                                      │
        │  Find order by doku_order_id (= invoice_number)     │
        │  Update: status, paid_at                            │
        │                                                      │
        └──────────────┬───────────────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────────────┐
        │   AUTO-PRINT TRIGGER (if PAID & first time)        │
        │   Calls: /functions/v1/auto-print-order             │
        └─────────────────────────────────────────────────────┘
```

---

## Security Flow (Detail)

### Step 1: Rate Limiting
```
Request comes in
    │
    ▼
Check: requests_in_last_60_seconds < 100?
    │
    ├─ YES → Continue
    │
    └─ NO → Return 429 Too Many Requests
```

### Step 2: Read Raw Body
```
⚠️ CRITICAL: Read rawBody first, DO NOT parse JSON yet!
   This is needed for signature verification.

Why? Because signature is calculated from raw bytes.
If we parse JSON first, whitespace/formatting changes
affect the digest.
```

### Step 3: Extract Headers
```
From DOKU webhook request:
├─ Client-Id: BRN-0286-1776865015547
├─ Request-Id: unique-id-per-request
├─ Request-Timestamp: 2024-04-27T10:30:00Z
└─ Signature: HMACSHA256=base64_encoded_hmac
```

### Step 4: Timestamp Validation
```
Now = Server current time
Received = Request-Timestamp from header

Check: |Now - Received| <= 5 minutes?
    │
    ├─ YES → Continue (legitimate request)
    │
    └─ NO → Return 400 Bad Request
            (prevent replay attacks)
```

### Step 5: Signature Verification (MOST IMPORTANT)
```
Build rawString:
┌─────────────────────────────────┐
│ Client-Id:BRN-0286-...          │
│ Request-Id:unique-id-123        │
│ Request-Timestamp:2024-04-27... │
│ Request-Target:/functions/v1/... │
│ Digest:base64(sha256(body))     │
└─────────────────────────────────┘
    │
    ▼
Calculate: HMAC-SHA256(rawString, DOKU_SERVER_KEY)
    │
    ▼
Expected Signature = "HMACSHA256=" + base64_encoded_hmac
    │
    ▼
Compare: Expected == Received?
    │
    ├─ YES → Signature valid ✓
    │
    └─ NO → Return 401 Unauthorized
            (request not from DOKU)
```

### Step 6: Duplicate Prevention
```
Store Request-Id in memory set:
    │
    ├─ Already seen → Return 200 OK (already processed)
    │
    └─ New → Add to set and continue
```

### Step 7: Parse & Validate
```
Try parse JSON
    │
    ├─ Success → Extract fields
    │
    └─ Fail → Return 400 Bad Request

Check required fields:
├─ invoice_number (must exist)
└─ transaction_status (must exist)

If missing → Return 200 OK (don't retry)
```

### Step 8: Database Update
```
SELECT * FROM print_orders 
WHERE doku_order_id = invoice_number

    │
    ├─ Found → UPDATE status & paid_at
    │
    └─ Not found → Return 200 OK (order not in system)
```

### Step 9: Trigger Auto-Print
```
IF status == "PAID" AND paid_at was just set:
    │
    └─→ POST /functions/v1/auto-print-order
        (async, non-blocking)
```

---

## Signature Verification Algorithm

### Example Calculation

**Given:**
```
DOKU_SERVER_KEY = "SK-Gp2Zhi0NyawJpQG1DAsq"
Client-Id = "BRN-0286-1776865015547"
Request-Id = "webhook-123"
Request-Timestamp = "2024-04-27T10:30:00Z"
Request-Target = "/functions/v1/doku-webhook"
Raw Body = '{"order":{"invoice_number":"SP-001","amount":10000},"transaction":{"status":"SUCCESS"}}'
```

**Step 1: Generate Digest**
```
SHA256(rawBody) 
= SHA256('{"order":{"invoice_number":"SP-001","amount":10000},"transaction":{"status":"SUCCESS"}}')
= 0a1b2c3d... (hex)
= "ChssJ..." (base64)
```

**Step 2: Build Raw String**
```
Client-Id:BRN-0286-1776865015547
Request-Id:webhook-123
Request-Timestamp:2024-04-27T10:30:00Z
Request-Target:/functions/v1/doku-webhook
Digest:ChssJ...
```

**Step 3: Calculate HMAC**
```
HMAC-SHA256(rawString, DOKU_SERVER_KEY)
= HMAC-SHA256(
    "Client-Id:BRN-...\nRequest-Id:...",
    "SK-Gp2Zhi0NyawJpQG1DAsq"
  )
= 5e6f7g8h... (hex)
= "Xm94aI..." (base64)
```

**Step 4: Build Final Signature**
```
HMACSHA256=Xm94aI...
```

**Step 5: Compare**
```
Expected: HMACSHA256=Xm94aI...
Received: HMACSHA256=Xm94aI... ✓

Match? YES → Valid signature!
```

---

## Security Threats & Mitigations

| Threat | Attack | Mitigation |
|--------|--------|-----------|
| **Forged Requests** | Attacker sends fake webhook | Signature verification (HMAC-SHA256) |
| **Replay Attacks** | Attacker replays old webhook | Timestamp validation (±5 min) |
| **Duplicate Charges** | Same webhook processed twice | Request ID tracking |
| **DDoS** | Too many requests | Rate limiting (100/min) |
| **Data Tampering** | Attacker modifies payload | Digest in signature includes raw body |
| **Timing Attack** | Guess signature | Use constant-time comparison (built-in) |

---

## Configuration

### Secrets (Supabase)
```
DOKU_SERVER_KEY = "SK-Gp2Zhi0NyawJpQG1DAsq"
SUPABASE_SERVICE_ROLE_KEY = "..."
```

### Constants
```
RATE_LIMIT_WINDOW_MS = 60 * 1000 (1 minute)
MAX_REQUESTS_PER_WINDOW = 100
TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 (±5 minutes)
```

---

## Monitoring Points

**Log what to check:**
```
✅ "[DOKU] Signature verified ✓" 
   → Request is authentic

❌ "[DOKU] Signature verification FAILED"
   → Request rejected

⚠️  "[DOKU] Rate limit exceeded"
   → Too many requests

⚠️  "[DOKU] Timestamp validation failed"
   → Possible replay attack or clock skew

📊 "[DOKU] Order updated successfully"
   → Payment processed

🔔 "[DOKU] Triggering auto-print"
   → Print job queued
```

---

## Testing Locally

```bash
# Start local edge function
supabase functions start

# In another terminal, run test with valid signature
node supabase/functions/doku-webhook/test-webhook.mjs
# Copy curl command and run

# Check logs
supabase functions log doku-webhook
```

---

## References

- [DOKU API Documentation](https://developers.doku.com)
- [DOKU Signature Component (Non-SNAP)](https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header)
- [HMAC Algorithm](https://en.wikipedia.org/wiki/HMAC)
- [Replay Attack](https://en.wikipedia.org/wiki/Replay_attack)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
