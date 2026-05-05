import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";

// ============================================================================
// DOKU WEBHOOK - Supabase Edge Function
// URL: https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook
// ============================================================================

const DOKU_CLIENT_ID = Deno.env.get("DOKU_CLIENT_ID") || "";
const DOKU_SECRET_KEY = Deno.env.get("DOKU_SECRET_KEY") || Deno.env.get("DOKU_SERVER_KEY") || "";
const DOKU_WEBHOOK_REQUEST_TARGET = Deno.env.get("DOKU_WEBHOOK_REQUEST_TARGET") || "/functions/v1/doku-webhook";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

// Rate limiting: store webhook signatures we've already processed (prevent duplicates)
const processedSignatures = new Set<string>();

// Rate limiting config
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;
const requestTimes: number[] = [];

// Timestamp tolerance: allow requests within ±5 minutes of server time
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Generate SHA256 digest from raw body
 */
async function generateDigest(rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawBody);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(hashHex.match(/.{1,2}/g)?.join("") || "");
}

/**
 * Convert hex string to base64
 */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Verify DOKU Non-SNAP Signature
 *
 * Algorithm:
 * 1. Create rawString = "Client-Id:X\nRequest-Id:X\nRequest-Timestamp:X\nRequest-Target:X\nDigest:X"
 * 2. Calculate HMAC-SHA256(rawString, secretKey) in base64
 * 3. Compare with "HMACSHA256=" + calculated_hmac
 */
async function verifyDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  rawBody: string,
  secretKey: string,
  receivedSignature: string
): Promise<boolean> {
  try {
    // Generate digest (SHA256 of raw body in base64)
    const digest = await generateDigest(rawBody);

    // Build raw string for signature
    const rawString = [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${requestTimestamp}`,
      `Request-Target:${requestTarget}`,
      `Digest:${digest}`,
    ].join("\n");

    // Calculate HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(rawString);

    const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureHex = signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Convert to base64
    const calculatedSignature = "HMACSHA256=" + hexToBase64(signatureHex);

    console.log("[DOKU] Signature verification:", {
      received: receivedSignature.substring(0, 20) + "...",
      calculated: calculatedSignature.substring(0, 20) + "...",
      match: receivedSignature === calculatedSignature,
    });

    return receivedSignature === calculatedSignature;
  } catch (error) {
    console.error("[DOKU] Signature verification error:", error);
    return false;
  }
}

/**
 * Check rate limit
 */
function checkRateLimit(): boolean {
  const now = Date.now();

  // Remove old requests outside the window
  while (requestTimes.length > 0 && requestTimes[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimes.shift();
  }

  // Check if we've exceeded the limit
  if (requestTimes.length >= MAX_REQUESTS_PER_WINDOW) {
    console.warn("[DOKU] Rate limit exceeded:", {
      requests: requestTimes.length,
      limit: MAX_REQUESTS_PER_WINDOW,
      window: `${RATE_LIMIT_WINDOW_MS / 1000}s`,
    });
    return false;
  }

  requestTimes.push(now);
  return true;
}

/**
 * Validate timestamp to prevent replay attacks
 */
function validateTimestamp(requestTimestamp: string): boolean {
  try {
    const timestamp = new Date(requestTimestamp).getTime();
    const now = Date.now();
    const diff = Math.abs(now - timestamp);

    if (diff > TIMESTAMP_TOLERANCE_MS) {
      console.warn("[DOKU] Timestamp validation failed:", {
        received: requestTimestamp,
        serverTime: new Date(now).toISOString(),
        diffMs: diff,
        toleranceMs: TIMESTAMP_TOLERANCE_MS,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DOKU] Timestamp parsing error:", error);
    return false;
  }
}

/**
 * Main webhook handler
 */
async function handleWebhook(req: Request): Promise<Response> {
  try {
    // ========== STEP 1: RATE LIMITING ==========
    if (!checkRateLimit()) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ========== STEP 2: READ RAW BODY ==========
    const rawBody = await req.text();

    // ========== STEP 3: EXTRACT HEADERS ==========
    const clientId = req.headers.get("Client-Id") || req.headers.get("client-id") || "";
    const requestId = req.headers.get("Request-Id") || req.headers.get("request-id") || "";
    const requestTimestamp =
      req.headers.get("Request-Timestamp") || req.headers.get("request-timestamp") || "";
    const receivedSignature = req.headers.get("Signature") || req.headers.get("signature") || "";
    const requestTarget = DOKU_WEBHOOK_REQUEST_TARGET;

    console.log("[DOKU Webhook] Received notification:", {
      clientId,
      requestId,
      requestTimestamp,
      signature: receivedSignature.substring(0, 30) + "...",
      requestTarget,
      rawBodyLength: rawBody.length,
      rawBodyPreview: rawBody.substring(0, 200),
    });

    // ========== STEP 4: VALIDATE CLIENT ID ==========
    if (DOKU_CLIENT_ID && clientId !== DOKU_CLIENT_ID) {
      console.warn("[DOKU] ❌ CLIENT ID MISMATCH", {
        expected: DOKU_CLIENT_ID,
        received: clientId,
      });
      return new Response(JSON.stringify({ error: "invalid_client_id" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ========== STEP 5: VALIDATE TIMESTAMP ==========
    if (!validateTimestamp(requestTimestamp)) {
      return new Response(JSON.stringify({ error: "invalid_timestamp" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ========== STEP 6: PARSE PAYLOAD ==========
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[DOKU] Failed to parse JSON:", rawBody);
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ========== STEP 7: VERIFY SIGNATURE ==========
    let isValidSignature = true;
    if (DOKU_SECRET_KEY && receivedSignature) {
      isValidSignature = await verifyDokuSignature(
        clientId,
        requestId,
        requestTimestamp,
        requestTarget,
        rawBody,
        DOKU_SECRET_KEY,
        receivedSignature
      );

      if (!isValidSignature) {
        console.warn("[DOKU] ❌ SIGNATURE VERIFICATION FAILED", {
          invoiceNumber: payload?.order?.invoice_number,
          receivedSig: receivedSignature.substring(0, 30) + "...",
        });
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log("[DOKU] ✅ Signature verified successfully");
    } else if (!DOKU_SECRET_KEY) {
      console.warn("[DOKU] ⚠️ DOKU_SECRET_KEY not configured - SKIPPING signature verification");
    }

    // ========== STEP 8: DUPLICATE CHECK ==========
    if (processedSignatures.has(requestId)) {
      console.log("[DOKU] Duplicate request (already processed):", requestId);
      return new Response(JSON.stringify({ ok: true, msg: "duplicate_request" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Add to processed list (prevent double-processing)
    processedSignatures.add(requestId);

    // Clear old entries from memory periodically (keep last 1000)
    if (processedSignatures.size > 1000) {
      const arr = Array.from(processedSignatures);
      arr.splice(0, arr.length - 500);
      processedSignatures.clear();
      arr.forEach((sig) => processedSignatures.add(sig));
    }

    // ========== STEP 9: EXTRACT FIELDS ==========
    const invoiceNumber: string = payload?.order?.invoice_number;
    const amount: number = payload?.order?.amount;
    const transactionStatus: string = payload?.transaction?.status; // "SUCCESS" | "FAILED"

    if (!invoiceNumber || !transactionStatus) {
      console.warn("[DOKU] Missing required fields:", { invoiceNumber, transactionStatus });
      return new Response(JSON.stringify({ ok: true, msg: "missing_fields" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[DOKU] Processing payment notification:", {
      invoiceNumber,
      amount,
      transactionStatus,
    });

    // ========== STEP 9: INITIALIZE SUPABASE CLIENT ==========
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ========== STEP 11: MAP STATUS & UPDATE DATABASE ==========
    const isPaid = transactionStatus === "SUCCESS";
    let orderStatus: string;

    if (isPaid) {
      orderStatus = "PAID";
    } else if (
      transactionStatus === "FAILED" ||
      transactionStatus === "EXPIRED" ||
      transactionStatus === "CANCELLED"
    ) {
      orderStatus = "FAILED";
    } else {
      orderStatus = "PENDING";
    }

    // Determine table based on invoice_number prefix
    let tableName = "print_orders";
    let idColumn = "doku_order_id";
    if (!invoiceNumber.startsWith("SP-")) {
      tableName = "orders"; // Project 1 uses 'orders' table
      idColumn = "order_number"; // Project 1 uses 'order_number' column
    }

    console.log(`[DOKU] Using table: ${tableName}, column: ${idColumn} for invoice: ${invoiceNumber}`);

    // Find existing order
    const { data: existing, error: queryError } = await supabase
      .from(tableName)
      .select("id, paid_at, status")
      .eq(idColumn, invoiceNumber)
      .limit(1)
      .single();

    if (queryError) {
      console.error("[DOKU] Database query error:", queryError);
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!existing) {
      console.warn("[DOKU] Order not found:", invoiceNumber);
      return new Response(JSON.stringify({ ok: true, msg: "order_not_found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check idempotency - prevent duplicate webhook processing
    const { data: existingLog } = await supabase
      .from("webhook_logs")
      .select("id")
      .eq("order_number", invoiceNumber)
      .eq("event_type", `doku_status:${orderStatus}`)
      .eq("success", true)
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      console.log(
        `[DOKU] ℹ️  Webhook already processed for order ${invoiceNumber} with status ${orderStatus}, skipping duplicate update`
      );
      return new Response(JSON.stringify({
        ok: true,
        msg: "already_processed",
        idempotent: true,
        orderId: existing.id,
        invoiceNumber,
        currentStatus: existing.status,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only set paid_at once
    const shouldSetPaidAt = isPaid && !existing.paid_at;
    const updatePayload: Record<string, unknown> = { status: orderStatus };

    if (shouldSetPaidAt) {
      updatePayload.paid_at = new Date().toISOString();
    }

    // Update order
    const { error: updateError } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateError) {
      console.error("[DOKU] Failed to update order:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[DOKU] ✅ Order updated successfully:", {
      orderId: existing.id,
      invoiceNumber,
      newStatus: orderStatus,
      paidAtSet: shouldSetPaidAt,
      timestamp: new Date().toISOString(),
    });

    // Log webhook event to webhook_logs table
    try {
      await supabase
        .from("webhook_logs")
        .insert({
          order_number: invoiceNumber,
          event_type: `doku_status:${orderStatus}`,
          payload: payload,
          success: true,
          processed_at: new Date().toISOString(),
        });
      console.log("[DOKU] ✅ Webhook logged to webhook_logs table");
    } catch (logError) {
      console.error("[DOKU] Failed to log to webhook_logs:", logError);
      // Don't fail the webhook if logging fails
    }

    // ========== STEP 12: RETURN SUCCESS ==========
    // Note: Auto-print is triggered via admin panel or manual API call
    // because Vercel Edge Functions cannot access local TCP printers
    return new Response(JSON.stringify({ 
      ok: true, 
      orderId: existing.id,
      invoiceNumber,
      status: orderStatus,
      message: "Payment processed. Status updated to PAID. Use admin panel to trigger printing."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[DOKU] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "internal_server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ============================================================================
// SERVER START
// ============================================================================
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Client-Id, Request-Id, Request-Timestamp, Signature, Authorization",
      },
    });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle the webhook - no Supabase auth required, DOKU signature is the security
  return await handleWebhook(req);
});
