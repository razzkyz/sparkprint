import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Simple webhook test endpoint without signature verification
 * Untuk debug why webhook tidak update ke PAID
 * 
 * This is a temporary debugging endpoint - signature verification disabled
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[DEBUG WEBHOOK] Failed to parse JSON:", rawBody);
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const invoiceNumber = payload?.order?.invoice_number;
    const transactionStatus = payload?.transaction?.status;
    const amount = payload?.order?.amount;

    console.log("[DEBUG WEBHOOK] Received:", {
      invoiceNumber,
      transactionStatus,
      amount,
      rawBody: rawBody.substring(0, 500),
    });

    if (!invoiceNumber) {
      console.error("[DEBUG WEBHOOK] Missing invoice_number");
      return NextResponse.json(
        { error: "missing_invoice_number", payload },
        { status: 400 }
      );
    }

    // Find order
    console.log("[DEBUG WEBHOOK] Looking for order:", invoiceNumber);
    const { data: order, error: queryError } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, doku_order_id, paid_at")
      .eq("doku_order_id", invoiceNumber)
      .single();

    if (queryError) {
      console.error("[DEBUG WEBHOOK] Order query error:", queryError);
      return NextResponse.json(
        {
          error: "order_query_error",
          invoice: invoiceNumber,
          db_error: queryError.message,
        },
        { status: 404 }
      );
    }

    if (!order) {
      console.error("[DEBUG WEBHOOK] Order not found:", invoiceNumber);
      return NextResponse.json(
        { error: "order_not_found", invoice: invoiceNumber },
        { status: 404 }
      );
    }

    console.log("[DEBUG WEBHOOK] Order found:", order);

    // Update status
    const isPaid = transactionStatus === "SUCCESS";
    const newStatus = isPaid ? "PAID" : "FAILED";
    const now = new Date().toISOString();

    console.log("[DEBUG WEBHOOK] Updating order to:", newStatus);

    const { error: updateError } = await supabaseAdmin
      .from("print_orders")
      .update({
        status: newStatus,
        paid_at: isPaid && !order.paid_at ? now : order.paid_at,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("[DEBUG WEBHOOK] Update failed:", updateError);
      return NextResponse.json(
        {
          error: "update_failed",
          details: updateError.message,
          order_id: order.id,
        },
        { status: 500 }
      );
    }

    console.log("[DEBUG WEBHOOK] ✅ Order updated successfully:", {
      orderId: order.id,
      newStatus,
      invoiceNumber,
    });

    return NextResponse.json({
      ok: true,
      message: "Order updated successfully",
      order: {
        id: order.id,
        doku_order_id: invoiceNumber,
        status: newStatus,
        updated_at: now,
      },
    });
  } catch (error) {
    console.error("[DEBUG WEBHOOK] Unexpected error:", error);
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}
