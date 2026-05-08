'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendOrderEmail } from "@/lib/email";
import crypto from "crypto";

type SizeKey = "2R" | "4R";

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.com$/i.test(email);
}

/**
 * Generate Digest: Base64(SHA256(requestBody))
 */
function generateDigest(requestBody: string): string {
  return crypto
    .createHash("sha256")
    .update(requestBody)
    .digest("base64");
}

/**
 * Generate DOKU Non-SNAP Signature
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

    if (!clientId) {
      console.error("[DOKU] DOKU_CLIENT_KEY not configured");
      return null;
    }
    if (!serverKey) {
      console.error("[DOKU] DOKU_SERVER_KEY not configured");
      return null;
    }

    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const requestTarget = "/checkout/v1/payment";

    const bodyObj = {
      order: {
        amount: amount,
        invoice_number: orderId,
        currency: "IDR",
        finish_redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-success?invoice_number=${orderId}&order_id=${orderId}`,
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

    const signature = generateDokuSignature(
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      requestBody,
      serverKey
    );

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

export async function createPrintOrder(formData: FormData) {
  try {
    console.log("[Server Action] Received print order request");

    const photoFiles: File[] = [];
    formData.forEach((value, key) => {
      if (key === "photos" && value instanceof File) {
        photoFiles.push(value);
      }
    });

    console.log("[Server Action] Photo files received:", photoFiles.length);

    if (photoFiles.length === 0) {
      return { error: "Photo files are required", status: 400 };
    }

    if (photoFiles.length > 5) {
      return { error: "Maksimal 5 gambar", status: 400 };
    }

    // Validate file sizes (max 5MB per file, max 25MB total for 5 images)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB
    let totalSize = 0;

    for (const photoFile of photoFiles) {
      if (photoFile.size > MAX_FILE_SIZE) {
        return {
          error: `File ${photoFile.name} terlalu besar. Maksimal 5MB per file.`,
          status: 413
        };
      }
      totalSize += photoFile.size;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return {
        error: `Total ukuran file terlalu besar. Maksimal 25MB.`,
        status: 413
      };
    }

    const photoSizesJson = String(formData.get("photo_sizes") ?? "[]");
    let photoSizes: SizeKey[] = [];
    try {
      photoSizes = JSON.parse(photoSizesJson) as SizeKey[];
    } catch (e) {
      console.error("Failed to parse photo_sizes:", e);
      return { error: "Invalid photo_sizes format", status: 400 };
    }

    if (photoSizes.length !== photoFiles.length) {
      return { error: "Photo sizes count mismatch", status: 400 };
    }

    if (!photoSizes.every(size => ["2R", "4R"].includes(size))) {
      return { error: "Invalid size in photo_sizes", status: 400 };
    }

    const queue_number = Number(formData.get("queue_number") ?? 0);
    const customer_name = String(formData.get("customer_name") ?? "").trim().slice(0, 40);
    const customer_email = String(formData.get("customer_email") ?? "").trim().toLowerCase().slice(0, 120);
    const payment_method = "qris";

    if (!customer_name) {
      return { error: "Customer name is required", status: 400 };
    }
    if (!customer_email || !isValidEmail(customer_email)) {
      return { error: "Valid email is required", status: 400 };
    }
    if (queue_number < 1 || queue_number > 999) {
      return { error: "Queue number must be between 1-999", status: 400 };
    }

    const imageUrls: string[] = [];
    const filePaths: string[] = [];

    console.log("[Server Action] Starting upload of", photoFiles.length, "photos...");

    for (const photoFile of photoFiles) {
      const fileExt = photoFile.name.split(".").pop() || "webp";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log("[Server Action] Uploading file:", fileName, "Size:", photoFile.size);

      const { error: uploadError } = await supabaseAdmin.storage
        .from("photos")
        .upload(filePath, photoFile, {
          contentType: photoFile.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        if (filePaths.length > 0) {
          await supabaseAdmin.storage.from("photos").remove(filePaths);
        }
        return {
          error: `Failed to upload photo: ${uploadError.message}`,
          status: 500
        };
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from("photos").getPublicUrl(filePath);

      imageUrls.push(publicUrl);
      filePaths.push(filePath);
      console.log("[Server Action] File uploaded successfully:", publicUrl);
    }

    console.log("[Server Action] All files uploaded. Total:", imageUrls.length);

    const SIZE_PRICES: Record<SizeKey, number> = {
      '2R': 15000,
      '4R': 15000,
    };
    const amount = photoSizes.reduce((sum, size) => sum + SIZE_PRICES[size], 0);

    const doku_order_id = `SP-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .insert({
        doku_order_id,
        customer_name,
        customer_email,
        fotoshare_token: "",
        image_urls: imageUrls,
        photo_sizes: photoSizes,
        qty: photoFiles.length,
        size: photoSizes[0] || "4R",
        amount,
        status: "PENDING",
        queue_number,
        payment_method,
        created_at: new Date().toISOString(),
        paid_at: null,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      await supabaseAdmin.storage.from("photos").remove(filePaths);
      return { error: "Failed to create order", status: 500 };
    }

    console.log("[Server Action] Creating Doku payment transaction...");
    const payment_url = await createDokuTransaction(
      doku_order_id,
      amount,
      customer_name,
      customer_email,
      photoSizes[0] || "4R",
      photoFiles.length
    );

    if (!payment_url) {
      console.error("[Server Action] Failed to create Doku payment - URL is null");
    }

    try {
      const items = photoSizes.map((size, idx) => ({
        name: `Photo ${idx + 1} (${size})`,
        qty: 1,
        price: SIZE_PRICES[size],
      }));

      await sendOrderEmail({
        to: customer_email,
        name: customer_name,
        orderId: doku_order_id,
        amount,
        items,
        type: "ORDER_PLACED",
        queueNumber: queue_number,
      });
    } catch (emailError) {
      console.error("Email error:", emailError);
    }

    revalidatePath('/');

    return {
      order_id: orderData.id,
      doku_order_id,
      payment_url,
      image_url: imageUrls[0] || null,
      status: 200
    };
  } catch (error) {
    console.error("Server Action error:", error);
    return { error: "Internal server error", status: 500 };
  }
}
