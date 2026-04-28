# Doku Webhook - Supabase Edge Function Setup

## ✅ Fitur Keamanan yang Sudah Diimplementasi

### 1. **Signature Verification (HMAC-SHA256)**
- Verifikasi setiap request menggunakan DOKU_SERVER_KEY
- Mencegah request dari sumber tidak sah
- Algoritma: HMAC-SHA256(rawString, secretKey)

### 2. **Timestamp Validation**
- Validasi timestamp request (toleransi ±5 menit)
- Mencegah replay attacks

### 3. **Duplicate Request Prevention**
- Track request IDs yang sudah diproses
- Mencegah double-charging dari request duplikat

### 4. **Rate Limiting**
- Max 100 requests per minute
- Mencegah DDoS attacks

### 5. **Request Validation**
- Validasi field yang wajib: invoice_number, transaction_status
- Error handling yang proper

---

## 🚀 Deployment Steps

### Step 1: Install Supabase CLI
```bash
npm install -g supabase
```

### Step 2: Authenticate dengan Supabase
```bash
supabase login
```

### Step 3: Setup Environment Variables
Di `.env.local` atau `.env`, pastikan sudah ada:
```bash
SUPABASE_URL=https://hogzjapnkvsihvvbgcdb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DOKU_SERVER_KEY=SK-Gp2Zhi0NyawJpQG1DAsq
```

### Step 4: Deploy Edge Function
```bash
supabase functions deploy doku-webhook --project-ref hogzjapnkvsihvvbgcdb
```

Atau jika sudah setup project:
```bash
supabase functions deploy doku-webhook
```

### Step 5: Verify Deployment
```bash
supabase functions list --project-ref hogzjapnkvsihvvbgcdb
```

---

## 📝 Update DOKU Webhook URL

Di DOKU Payment Gateway Dashboard, ubah webhook URL menjadi:
```
https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
```

---

## 🧪 Testing Edge Function

### Test dengan cURL (Local Development):
```bash
supabase functions start
```

Kemudian di terminal lain:
```bash
curl -X POST http://localhost:54321/functions/v1/doku-webhook \
  -H "Content-Type: application/json" \
  -H "Client-Id: TEST" \
  -H "Request-Id: test-123" \
  -H "Request-Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  -H "Signature: HMACSHA256=test" \
  -d '{"order":{"invoice_number":"SP-TEST","amount":10000},"transaction":{"status":"SUCCESS"}}'
```

### Test dengan Postman:
1. Method: POST
2. URL: `https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook`
3. Headers:
   - `Client-Id`: BRN-0286-1776865015547
   - `Request-Id`: unique-id-123
   - `Request-Timestamp`: 2024-04-27T10:30:00Z
   - `Signature`: (lihat script test di bawah)

### Generate Valid Signature (untuk testing):
```javascript
import crypto from 'crypto';

function generateSignature(rawBody, secretKey) {
  const clientId = 'BRN-0286-1776865015547';
  const requestId = 'test-123';
  const requestTimestamp = new Date().toISOString();
  const requestTarget = '/functions/v1/doku-webhook';

  // Generate digest
  const digest = crypto.createHash('sha256').update(rawBody).digest('base64');

  // Build raw string
  const rawString = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:${requestTarget}`,
    `Digest:${digest}`,
  ].join('\n');

  // Calculate HMAC
  const hmac = crypto.createHmac('sha256', secretKey).update(rawString).digest('base64');
  return `HMACSHA256=${hmac}`;
}

const payload = {
  order: { invoice_number: 'SP-TEST', amount: 10000 },
  transaction: { status: 'SUCCESS' }
};

const rawBody = JSON.stringify(payload);
const signature = generateSignature(rawBody, 'SK-Gp2Zhi0NyawJpQG1DAsq');
console.log('Signature:', signature);
```

---

## 📊 Monitoring & Logs

### View Logs:
```bash
supabase functions log doku-webhook --project-ref hogzjapnkvsihvvbgcdb
```

### Di Supabase Dashboard:
1. Go to: https://supabase.com/dashboard
2. Select project
3. Go to: Edge Functions > doku-webhook
4. View Logs tab

---

## 🔄 Database Flow

1. DOKU Payment Gateway → Kirim webhook
2. Edge Function → Verifikasi signature
3. Edge Function → Cek timestamp (prevent replay)
4. Edge Function → Cek duplicate request
5. Edge Function → Update `print_orders` status di database
6. Edge Function → Trigger auto-print function (jika PAID)

---

## ⚠️ Troubleshooting

### Error: "invalid_signature"
- Pastikan `DOKU_SERVER_KEY` benar di Supabase Secrets
- Pastikan raw body tidak di-parse sebelum signature check

### Error: "rate_limit_exceeded"
- Hanya bisa 100 requests per menit
- Hubungi DOKU jika ada issue dengan webhook retry

### Error: "invalid_timestamp"
- Pastikan server time sinkron dengan NTP
- Tolerance ±5 menit

### Order tidak ter-update
- Pastikan `invoice_number` di DOKU sama dengan `doku_order_id` di database
- Cek logs di Supabase

---

## 📝 Environment Variables yang Diperlukan

Tambahkan ke Supabase Secrets:

```bash
supabase secrets set DOKU_SERVER_KEY="SK-Gp2Zhi0NyawJpQG1DAsq" \
  --project-ref hogzjapnkvsihvvbgcdb
```

Atau di Supabase Dashboard:
1. Settings > Edge Functions
2. Secrets
3. Add: `DOKU_SERVER_KEY` = `SK-Gp2Zhi0NyawJpQG1DAsq`

---

## 🛡️ Security Checklist

- ✅ Signature verification (HMAC-SHA256)
- ✅ Timestamp validation (prevent replay)
- ✅ Duplicate request prevention
- ✅ Rate limiting (100 req/min)
- ✅ Request validation
- ✅ Error handling yang proper
- ✅ Logging untuk audit trail
- ✅ Secure secrets management (Supabase Secrets)

---

## 🔗 Referensi

- [DOKU Signature Component - Non-SNAP](https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [HMAC-SHA256 Verification](https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header)
