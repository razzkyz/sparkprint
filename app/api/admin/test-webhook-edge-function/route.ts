import { NextResponse } from "next/server";
import crypto from "crypto";

const DOKU_CLIENT_KEY = process.env.DOKU_CLIENT_KEY!;
const DOKU_SERVER_KEY = process.env.DOKU_SERVER_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

function generateDigest(rawBody: string): string {
  return crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("base64");
}

function generateDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  requestBody: string,
  secretKey: string
): string {
  const digest = generateDigest(requestBody);

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

  return `HMACSHA256=${hmac}`;
}

/**
 * Test webhook by sending simulated DOKU notification to Edge Function
 * Helps diagnose why real webhooks are not working
 * 
 * Usage:
 * curl -X POST "http://localhost:3000/api/admin/test-webhook-edge-function" \
 *   -H "Content-Type: application/json" \
 *   -H "x-admin-password: password123" \
 *   -d '{"doku_order_id": "SP-1777859502663-DR3G7P", "amount": 30000}'
 */
export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { doku_order_id, amount, transaction_status } = await req.json();

    if (!doku_order_id) {
      return NextResponse.json(
        { error: "doku_order_id required" },
        { status: 400 }
      );
    }

    console.log("[TEST] Simulating webhook for order:", doku_order_id);

    // Build DOKU webhook payload (same format as real DOKU sends)
    const testPayload = {
      service: { id: "QRIS" },
      acquirer: { id: "QRIS" },
      channel: { id: "QRIS" },
      transaction: {
        status: transaction_status || "SUCCESS",
        date: new Date().toISOString(),
        original_request_id: `test-${Date.now()}`,
      },
      order: {
        invoice_number: doku_order_id,
        amount: amount || 30000,
      },
    };

    const rawBody = JSON.stringify(testPayload);

    // Generate headers like DOKU would
    const requestId = `REQ-${Date.now()}`;
    const requestTimestamp = new Date().toISOString();
    const requestTarget = "/functions/v1/doku-webhook";

    const signature = generateDokuSignature(
      DOKU_CLIENT_KEY,
      requestId,
      requestTimestamp,
      requestTarget,
      rawBody,
      DOKU_SERVER_KEY
    );

    console.log("[TEST] Sending to Edge Function:", {
      url: `${SUPABASE_URL}/functions/v1/doku-webhook`,
      clientId: DOKU_CLIENT_KEY,
      requestId,
      timestamp: requestTimestamp,
      signature: signature.substring(0, 30) + "...",
      payload: testPayload,
    });

    // Call Edge Function
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/doku-webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Id": DOKU_CLIENT_KEY,
          "Request-Id": requestId,
          "Request-Timestamp": requestTimestamp,
          "Signature": signature,
        },
        body: rawBody,
      }
    );

    const responseData = await response.json();

    console.log("[TEST] Edge Function response:", {
      status: response.status,
      data: responseData,
    });

    // Analyze result
    let analysis = "";
    if (response.status === 200 && responseData.ok) {
      analysis = "✅ Webhook processed successfully";
    } else if (responseData.msg === "order_not_found") {
      analysis = "❌ Edge Function: Order not found in database. Check if doku_order_id matches.";
    } else if (responseData.msg === "missing_fields") {
      analysis = "❌ Edge Function: Missing required fields (invoice_number or transactionStatus)";
    } else if (responseData.error === "invalid_signature") {
      analysis = "❌ Edge Function: Signature verification failed. Check DOKU_SERVER_KEY.";
    } else if (response.status === 500) {
      analysis = "❌ Edge Function: Internal server error. Check Edge Function logs.";
    } else {
      analysis = "⚠️ Edge Function: Unexpected response. Check details.";
    }

    return NextResponse.json({
      ok: true,
      message: "Test webhook sent to Edge Function",
      test_details: {
        order_id: doku_order_id,
        amount: amount || 30000,
        transaction_status: transaction_status || "SUCCESS",
        timestamp: new Date().toISOString(),
      },
      edge_function_response: {
        status: response.status,
        body: responseData,
      },
      analysis,
      next_steps: [
        response.status === 200 && responseData.ok
          ? "✅ Edge Function is working! Check your order status in dashboard."
          : "❌ Edge Function is NOT working. Details above show the issue.",
        responseData.msg === "order_not_found"
          ? "Action: Verify doku_order_id is correct and exists in database"
          : "",
        responseData.error === "invalid_signature"
          ? "Action: Ensure DOKU_SERVER_KEY is set correctly in Supabase secrets"
          : "",
      ].filter(x => x),
      debug_info: {
        edge_function_url: `${SUPABASE_URL}/functions/v1/doku-webhook`,
        client_key: DOKU_CLIENT_KEY.substring(0, 10) + "...",
        server_key_set: !!DOKU_SERVER_KEY,
        payload_sent: testPayload,
      },
    });
  } catch (error) {
    console.error("[TEST] Error:", error);
    return NextResponse.json(
      {
        error: "test_failed",
        details: String(error),
        message:
          "Failed to test webhook. Check if Edge Function URL is accessible.",
      },
      { status: 500 }
    );
  }
}
