import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendOrderEmail } from "@/lib/email";
import crypto from "crypto";

type SizeKey = "4x6" | "2x6";

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Generate Digest: Base64(SHA256(requestBody))
 * Required component for DOKU Non-SNAP signature
 */
function generateDigest(requestBody: string): string {
  return crypto
    .createHash("sha256")
    .update(requestBody)
    .digest("base64");
}

/**
 * Generate DOKU Non-SNAP Signature
 * Format:
 *   rawString = "Client-Id:<v>\nRequest-Id:<v>\nRequest-Timestamp:<v>\nRequest-Target:<path>\nDigest:<digest>"
 *   signature = HMACSHA256(rawString, secretKey) → Base64
 *   header value = "HMACSHA256=" + signature
 *
 * Ref: https://developers.doku.com/get-started-with-doku-api/signature-component/non-snap/signature-component-from-request-header
 */
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
 * Generate UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Create Doku JOKUL Checkout payment transaction via API
 * Ref: https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration
 */
async function createDokuTransaction(
  orderId: string,
  amount: number,
  customerName: string,
  customerEmail: string,
  size: SizeKey,
  qty: number
): Promise<string | null> {
  try {
    const isProduction = process.env.DOKU_IS_PRODUCTION === "true";
    const apiUrl = isProduction
      ? "https://api.doku.com/checkout/v1/payment"
      : "https://api-sandbox.doku.com/checkout/v1/payment";

    const clientId = process.env.DOKU_CLIENT_KEY!;
    const serverKey = process.env.DOKU_SERVER_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://print.sparkstage55.com";

    if (!clientId) {
      console.error("[DOKU] DOKU_CLIENT_KEY not configured");
      return null;
    }
    if (!serverKey) {
      console.error("[DOKU] DOKU_SERVER_KEY not configured");
      return null;
    }

    console.log("[DOKU] Config:", { isProduction, apiUrl, clientId, serverKey: serverKey.substring(0, 10) + "..." });

    // Request metadata
    // Generate Request-Id with minimum 10 characters (DOKU requirement)
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    // DOKU requires UTC timestamp in ISO8601 format
    const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    // Request target is the path of the DOKU API endpoint
    const requestTarget = "/checkout/v1/payment";

    // Build request body
    const bodyObj = {
      order: {
        amount: amount,
        invoice_number: orderId,
        currency: "IDR",
        callback_url: `https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook`,
        language: "ID",
        auto_redirect: false,
        line_items: [
          {
            id: "001",
            name: `Photo Print ${size}`,
            quantity: qty,
            price: Math.floor(amount / qty),
            sku: `PRINT-${size}`,
            category: "photo-printing",
            type: "PRODUCT",
          },
        ],
      },
      payment: {
        payment_due_date: 60,
      },
      customer: {
        id: `CUST-${Date.now()}`,
        name: customerName,
        email: customerEmail,
        country: "ID",
      },
    };

    const requestBody = JSON.stringify(bodyObj);

    // Generate DOKU Non-SNAP signature
    const signature = generateDokuSignature(
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      requestBody,
      serverKey
    );

    console.log("[DOKU] Sending payment request:", {
      orderId,
      amount,
      apiUrl,
      clientId,
      requestId,
      requestIdLength: requestId.length,
      requestTimestamp,
      signature: signature.substring(0, 20) + "...",
      signatureLength: signature.length,
    });

    // Call DOKU Checkout API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Id": clientId,
        "Request-Id": requestId,
        "Request-Timestamp": requestTimestamp,
        "Signature": signature,
      },
      body: requestBody,
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("[DOKU] API error:", {
        status: response.status,
        statusText: response.statusText,
        response: responseData,
      });
      return null;
    }

    console.log("[DOKU] Payment created:", responseData);

    // Extract payment URL from response
    const paymentUrl =
      responseData?.response?.payment?.url ||
      responseData?.payment?.url ||
      responseData?.data?.payment?.url ||
      responseData?.data?.url ||
      responseData?.url;

    if (!paymentUrl) {
      console.error("[DOKU] No payment URL in response:", responseData);
      return null;
    }

    return paymentUrl;
  } catch (error) {
    console.error("[DOKU] Transaction creation error:", error);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    console.log("[API] Received print order request");

    // Parse JSON (image URLs already uploaded to Supabase by client)
    const body = await req.json();
    console.log("[API] Request body keys:", Object.keys(body));

    const imageUrls: string[] = body.imageUrls || [];
    const qty = Number(body.qty ?? 1);
    const size = String(body.size ?? "4x6") as SizeKey;
    const queue_number = Number(body.queue_number ?? 0);
    const customer_name = String(body.customer_name ?? "").trim().slice(0, 40);
    const customer_email = String(body.customer_email ?? "").trim().toLowerCase().slice(0, 120);
    const payment_method = "qris"; // Always use QRIS/E-Wallet via Doku

    console.log("[API] Image URLs received:", imageUrls.length);

    // Validate inputs
    if (!customer_name) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }
    if (!customer_email || !isValidEmail(customer_email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (imageUrls.length === 0) {
      return NextResponse.json({ error: "At least 1 image URL is required" }, { status: 400 });
    }
    if (qty < 1 || qty > 100) {
      return NextResponse.json({ error: "Quantity must be between 1-100" }, { status: 400 });
    }
    if (!["4x6", "2x6"].includes(size)) {
      return NextResponse.json({ error: "Invalid size" }, { status: 400 });
    }
    if (queue_number < 1 || queue_number > 999) {
      return NextResponse.json({ error: "Queue number must be between 1-999" }, { status: 400 });
    }

    // Calculate amount
    const unitPrice = 10000; // Same price for both sizes
    const amount = unitPrice * qty;

    // Generate order ID (invoice_number for DOKU)
    const doku_order_id = `SP-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    // Create order in database with PENDING status
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .insert({
        doku_order_id,
        customer_name,
        customer_email,
        fotoshare_token: "",
        image_urls: imageUrls, // Array of public URLs from Supabase
        size,
        qty,
        amount,
        status: "PENDING", // Wait for Doku webhook confirmation
        queue_number,
        payment_method,
        created_at: new Date().toISOString(),
        paid_at: null, // Will be updated by webhook
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Create payment via DOKU API
    console.log("[API] Creating Doku payment transaction...");
    const payment_url = await createDokuTransaction(
      doku_order_id,
      amount,
      customer_name,
      customer_email,
      size,
      qty
    );

    if (!payment_url) {
      console.error("[API] Failed to create Doku payment");
      // Order was created but payment failed - customer can retry or admin can mark as paid manually
    } else {
      console.log("[API] Doku payment created:", payment_url);
    }

    // Send confirmation email
    try {
      await sendOrderEmail({
        to: customer_email,
        name: customer_name,
        orderId: doku_order_id,
        amount,
        items: [
          {
            name: `Photo Print ${size} (${qty}x)`,
            qty: qty,
            price: unitPrice,
          },
        ],
        type: "ORDER_PLACED",
        queueNumber: queue_number,
      });
    } catch (emailError) {
      console.error("Email error:", emailError);
      // Don't fail the order if email fails
    }

    return NextResponse.json({
      order_id: orderData.id,
      doku_order_id,
      payment_url,
      image_url: imageUrls[0] || null,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
