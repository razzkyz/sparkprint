#!/usr/bin/env node

/**
 * Test script untuk DOKU Webhook Signature Verification
 * 
 * Usage:
 *   node test-webhook.mjs
 * 
 * Ini akan generate signature yang valid untuk testing
 */

import crypto from 'crypto';

const DOKU_SERVER_KEY = 'SK-Gp2Zhi0NyawJpQG1DAsq';
const DOKU_CLIENT_KEY = 'BRN-0286-1776865015547';

/**
 * Generate valid DOKU webhook signature
 */
function generateSignature(rawBody, secretKey, clientId, requestId, requestTimestamp) {
  const requestTarget = '/functions/v1/doku-webhook';

  // Step 1: Generate Digest (Base64 of SHA256 of raw body)
  const digest = crypto
    .createHash('sha256')
    .update(rawBody)
    .digest('base64');

  // Step 2: Build raw string
  const rawString = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:${requestTarget}`,
    `Digest:${digest}`,
  ].join('\n');

  console.log('[DEBUG] Raw String for signature:');
  console.log(rawString);
  console.log('');

  // Step 3: Calculate HMAC-SHA256 and convert to Base64
  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(rawString)
    .digest('base64');

  const signature = `HMACSHA256=${hmac}`;
  return { signature, digest, rawString };
}

/**
 * Generate test payload
 */
function generateTestPayload(status = 'SUCCESS', invoiceNumber = 'SP-TEST-001') {
  return {
    service: { id: 'QRIS' },
    acquirer: { id: 'AIRBNB' },
    channel: { id: 'QRIS' },
    transaction: {
      status: status,
      date: new Date().toISOString(),
      original_request_id: 'orig-req-' + Date.now(),
    },
    order: {
      invoice_number: invoiceNumber,
      amount: 10000,
    },
  };
}

/**
 * Generate cURL command for testing
 */
function generateCurlCommand(payload, signature, clientId, requestId, requestTimestamp) {
  const url = 'https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook';
  const rawBody = JSON.stringify(payload);

  const curlCommand = `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "Client-Id: ${clientId}" \\
  -H "Request-Id: ${requestId}" \\
  -H "Request-Timestamp: ${requestTimestamp}" \\
  -H "Signature: ${signature}" \\
  -d '${rawBody.replace(/'/g, "'\\''")}'`;

  return curlCommand;
}

/**
 * Main test function
 */
async function main() {
  console.log('═'.repeat(70));
  console.log('DOKU WEBHOOK SIGNATURE VERIFICATION TEST');
  console.log('═'.repeat(70));
  console.log('');

  // Test Case 1: SUCCESS payment
  console.log('📝 TEST CASE 1: SUCCESS Payment');
  console.log('-'.repeat(70));

  const requestId1 = `test-${Date.now()}-1`;
  const requestTimestamp1 = new Date().toISOString();
  const payload1 = generateTestPayload('SUCCESS', 'SP-TEST-001');
  const rawBody1 = JSON.stringify(payload1);

  const { signature: sig1, digest: digest1 } = generateSignature(
    rawBody1,
    DOKU_SERVER_KEY,
    DOKU_CLIENT_KEY,
    requestId1,
    requestTimestamp1
  );

  console.log('Headers:');
  console.log(`  Client-Id: ${DOKU_CLIENT_KEY}`);
  console.log(`  Request-Id: ${requestId1}`);
  console.log(`  Request-Timestamp: ${requestTimestamp1}`);
  console.log(`  Signature: ${sig1}`);
  console.log('');
  console.log('Payload:');
  console.log(JSON.stringify(payload1, null, 2));
  console.log('');

  const curlCmd1 = generateCurlCommand(payload1, sig1, DOKU_CLIENT_KEY, requestId1, requestTimestamp1);
  console.log('cURL Command:');
  console.log(curlCmd1);
  console.log('');

  // Test Case 2: FAILED payment
  console.log('\n');
  console.log('📝 TEST CASE 2: FAILED Payment');
  console.log('-'.repeat(70));

  const requestId2 = `test-${Date.now()}-2`;
  const requestTimestamp2 = new Date().toISOString();
  const payload2 = generateTestPayload('FAILED', 'SP-TEST-002');
  const rawBody2 = JSON.stringify(payload2);

  const { signature: sig2 } = generateSignature(
    rawBody2,
    DOKU_SERVER_KEY,
    DOKU_CLIENT_KEY,
    requestId2,
    requestTimestamp2
  );

  console.log('Headers:');
  console.log(`  Client-Id: ${DOKU_CLIENT_KEY}`);
  console.log(`  Request-Id: ${requestId2}`);
  console.log(`  Request-Timestamp: ${requestTimestamp2}`);
  console.log(`  Signature: ${sig2}`);
  console.log('');
  console.log('Payload:');
  console.log(JSON.stringify(payload2, null, 2));
  console.log('');

  const curlCmd2 = generateCurlCommand(payload2, sig2, DOKU_CLIENT_KEY, requestId2, requestTimestamp2);
  console.log('cURL Command:');
  console.log(curlCmd2);
  console.log('');

  // Instructions
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('HOW TO TEST');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Option 1: Deploy locally and test');
  console.log('  $ supabase functions start');
  console.log('  $ # Then run curl commands above in another terminal');
  console.log('');
  console.log('Option 2: Deploy to Supabase and test');
  console.log('  $ supabase functions deploy doku-webhook');
  console.log('  $ # Then run curl commands above');
  console.log('');
  console.log('Option 3: Use Postman');
  console.log('  POST https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook');
  console.log('  Copy headers and body from above');
  console.log('');
  console.log('═'.repeat(70));
}

main().catch(console.error);
