import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoPrintOrder } from "@/lib/autoPrintService";

const DOKU_CLIENT_KEY = process.env.DOKU_CLIENT_KEY!;
const DOKU_SERVER_KEY = process.env.DOKU_SERVER_KEY!;

/**
 * Generate Digest: Base64(SHA256(rawBody))
 */
function generateDigest(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("base64");
}

/**
 * Verify DOKU Non-SNAP Signature from notification header
 *
 * DOKU sends these headers: Client-Id, Request-Id, Request-Timestamp, Signature
 * We must verify the signature using the same algorithm:
 *   rawString = "Client-Id:<v>\nRequest-Id:<v>\nRequest-Timestamp:<v>\nRequest-Target:<path>\nDigest:<digest>"
 *   expectedSig = "HMACSHA256=" + Base64(HMAC-SHA256(rawString, secretKey))
 *
 * Ref: https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header
 */
function verifyDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  rawBody: string,
  secretKey: string,
  receivedSignature: string
): boolean {
  const digest = generateDigest(rawBody);

  const rawString = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:${requestTarget}`,
    `Digest:${digest}`,
  ].join("\n");

  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(rawString)
    .digest("base64");

  const expectedSignature = `HMACSHA256=${hmac}`;

  return receivedSignature === expectedSignature;
}

/**
 * DOKU JOKUL Checkout Webhook / HTTP Notification Handler
 *
 * DOKU sends POST to this URL when payment status changes.
 * Notification body format (Non-SNAP):
 * {
 *   "service": { "id": "QRIS" },
 *   "acquirer": { "id": "..." },
 *   "channel": { "id": "QRIS" },
 *   "transaction": {
 *     "status": "SUCCESS",   // or "FAILED"
 *     "date": "2021-01-27T03:24:23Z",
 *     "original_request_id": "..."
 *   },
 *   "order": {
 *     "invoice_number": "SP-...",  // our doku_order_id
 *     "amount": 10000
 *   }
 * }
 *
 * Ref: https://developers.doku.com/get-started-with-doku-api/notification/http-notification-sample-non-snap
 */
export async function POST(req: Request) {
  // Read raw body text first (critical: must not parse JSON yet, for digest calculation)
  const rawBody = await req.text();

  // Extract DOKU signature headers
  const clientId = req.headers.get("Client-Id") || req.headers.get("client-id") || "";
  const requestId = req.headers.get("Request-Id") || req.headers.get("request-id") || "";
  const requestTimestamp =
    req.headers.get("Request-Timestamp") || req.headers.get("request-timestamp") || "";
  const receivedSignature =
    req.headers.get("Signature") || req.headers.get("signature") || "";

  // The request target for notifications = path of our notification URL
  const requestTarget = "/api/doku/webhook";

  console.log("[DOKU Webhook] Received notification:", {
    clientId,
    requestId,
    requestTimestamp,
    receivedSignature: receivedSignature.substring(0, 30) + "...",
  });

  // Verify signature if SERVER_KEY is configured
  // Temporarily disabled for debugging - will re-enable after confirming webhook works
  /*
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
      console.warn("[DOKU Webhook] Signature mismatch - rejecting notification");
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  } else if (!DOKU_SERVER_KEY) {
    // Log warning but allow through during development if key not set
    console.warn("[DOKU Webhook] DOKU_SERVER_KEY not set - skipping signature verification");
  }
  */
  // ========== VERIFY SIGNATURE ==========
  // Only verify if SERVER_KEY is configured
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
      console.warn("[DOKU Webhook] ❌ SIGNATURE VERIFICATION FAILED", {
        invoiceNumber: JSON.parse(rawBody)?.order?.invoice_number,
        expectedSig: `HMACSHA256=...`,
        receivedSig: receivedSignature.substring(0, 30) + "...",
      });
      // Return 401 to tell DOKU we rejected it
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    console.log("[DOKU Webhook] ✅ Signature verified successfully");
  } else if (!DOKU_SERVER_KEY) {
    // Log warning but allow through (useful for testing/development)
    console.warn(
      "[DOKU Webhook] ⚠️ DOKU_SERVER_KEY not configured - SKIPPING signature verification"
    );
    console.warn(
      "[DOKU Webhook] 🔐 For production: Set DOKU_SERVER_KEY in .env.local"
    );
  }

  // Parse the raw body
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[DOKU Webhook] Failed to parse JSON body:", rawBody);
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Extract fields from DOKU Non-SNAP notification format
  const invoiceNumber: string = payload?.order?.invoice_number;
  const amount: number = payload?.order?.amount;
  const transactionStatus: string = payload?.transaction?.status; // "SUCCESS" | "FAILED"

  if (!invoiceNumber || !transactionStatus) {
    console.warn("[DOKU Webhook] Missing required fields:", { invoiceNumber, transactionStatus, payload });
    // Return 200 to prevent DOKU retry (but log the issue)
    return NextResponse.json({ ok: true, msg: "missing_fields" });
  }

  console.log("[DOKU Webhook] Processing notification:", {
    invoiceNumber,
    amount,
    transactionStatus,
  });

  // Map DOKU transaction status to our order status
  const isPaid = transactionStatus === "SUCCESS";
  let order_status: string;

  if (isPaid) {
    order_status = "PAID";
  } else if (transactionStatus === "FAILED" || transactionStatus === "EXPIRED" || transactionStatus === "CANCELLED") {
    order_status = "FAILED";
  } else {
    order_status = "PENDING";
  }

  try {
    // Determine table based on invoice_number prefix
    let tableName = "print_orders";
    let idColumn = "doku_order_id";
    if (!invoiceNumber.startsWith("SP-")) {
      tableName = "orders"; // Project 1 uses 'orders' table
      idColumn = "order_number"; // Project 1 uses 'order_number' column
    }

    console.log(`[DOKU Webhook] Using table: ${tableName}, column: ${idColumn} for invoice: ${invoiceNumber}`);

    // Find order by appropriate column
    const { data: existing, error: selErr } = await supabaseAdmin
      .from(tableName)
      .select("id, paid_at, status")
      .eq(idColumn, invoiceNumber)
      .maybeSingle();

    if (selErr) {
      console.error("[DOKU Webhook] Database query error:", selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    if (!existing) {
      console.warn("[DOKU Webhook] ⚠️ Order not found for invoice_number:", invoiceNumber);
      console.warn(
        "[DOKU Webhook] This might mean: (1) Order not created yet, (2) Wrong Supabase project, (3) Invoice number mismatch"
      );
      // Return 200 to prevent DOKU retry for unknown orders
      return NextResponse.json({ ok: true, msg: "order_not_found" });
    }

    // Check idempotency - prevent duplicate webhook processing
    const { data: existingLog } = await supabaseAdmin
      .from("webhook_logs")
      .select("id")
      .eq("order_number", invoiceNumber)
      .eq("event_type", `doku_status:${order_status}`)
      .eq("success", true)
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      console.log(
        `[DOKU Webhook] ℹ️  Webhook already processed for order ${invoiceNumber} with status ${order_status}, skipping duplicate update`
      );
      return NextResponse.json({
        ok: true,
        msg: "already_processed",
        idempotent: true,
        debug: {
          orderId: existing.id,
          invoiceNumber,
          currentStatus: existing.status,
          eventType: `doku_status:${order_status}`,
        },
      });
    }

    // Check if already processed (prevent duplicate status updates)
    const isAlreadyPaid = existing.status === "PAID" && existing.paid_at;
    if (isAlreadyPaid && transactionStatus === "SUCCESS") {
      console.log(
        `[DOKU Webhook] ℹ️  Order already marked as PAID at ${existing.paid_at}, skipping duplicate update`
      );
      return NextResponse.json({
        ok: true,
        msg: "already_paid",
        debug: {
          orderId: existing.id,
          invoiceNumber,
          currentStatus: existing.status,
          paidAt: existing.paid_at,
        },
      });
    }

    // Only set paid_at once (avoid overwriting if already processed)
    const shouldSetPaidAt = isPaid && !existing.paid_at;

    const updatePayload: Record<string, unknown> = { status: order_status };
    if (shouldSetPaidAt) {
      updatePayload.paid_at = new Date().toISOString();
    }

    // Update order status in database
    const { error: updateErr } = await supabaseAdmin
      .from(tableName)
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateErr) {
      console.error("[DOKU Webhook] Failed to update order:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log("[DOKU Webhook] ✅ Order updated successfully:", {
      orderId: existing.id,
      dokuOrderId: invoiceNumber,
      previousStatus: existing.status,
      newStatus: order_status,
      paidAt: shouldSetPaidAt ? updatePayload.paid_at : "unchanged",
    });

    // Log webhook event to webhook_logs table
    try {
      await supabaseAdmin
        .from("webhook_logs")
        .insert({
          order_number: invoiceNumber,
          event_type: `doku_status:${order_status}`,
          payload: payload,
          success: true,
          processed_at: new Date().toISOString(),
        });
      console.log("[DOKU Webhook] ✅ Webhook logged to webhook_logs table");
    } catch (logError) {
      console.error("[DOKU Webhook] Failed to log to webhook_logs:", logError);
      // Don't fail the webhook if logging fails
    }

    // Trigger auto-print if payment just confirmed as successful
    if (isPaid && shouldSetPaidAt) {
      console.log(`[DOKU Webhook] 🖨️  Payment confirmed for order ${existing.id} - triggering auto-print`);
      autoPrintOrder(existing.id).catch((err) => {
        console.error(`[DOKU Webhook] Auto-print failed for ${existing.id}:`, err);
      });
    }

    // Always respond 200 OK to DOKU (prevents retry)
    return NextResponse.json({
      ok: true,
      debug: {
        orderId: existing.id,
        invoiceNumber,
        status: order_status,
        paidAt: shouldSetPaidAt ? updatePayload.paid_at : null,
      },
    });
  } catch (error) {
    console.error("[DOKU Webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );
  }
}
