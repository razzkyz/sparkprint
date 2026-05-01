import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Check payment status from database and auto-update to PAID
 * This is used as an alternative to webhook if webhook is not working
 * Since DOKU webhook is not being called, we auto-update to PAID when user reaches success page
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const autoMarkPaid = searchParams.get("auto_mark_paid") === "true";

    console.log("[CHECK] Request received:", { orderId, autoMarkPaid });

    if (!orderId) {
      console.log("[CHECK] Missing order_id");
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    // Check order in database - try doku_order_id first, then invoice_number
    let order;
    let orderError;

    // Try by doku_order_id first
    const { data: orderById, error: errorById } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, doku_order_id, customer_name, customer_email, image_urls, size, qty, amount, queue_number, paid_at")
      .eq("doku_order_id", orderId)
      .single();

    if (!errorById && orderById) {
      order = orderById;
    } else {
      // Try by invoice_number (id field)
      console.log("[CHECK] Not found by doku_order_id, trying by invoice_number:", orderId);
      const { data: orderByInvoice, error: errorByInvoice } = await supabaseAdmin
        .from("print_orders")
        .select("id, status, doku_order_id, customer_name, customer_email, image_urls, size, qty, amount, queue_number, paid_at")
        .eq("id", orderId)
        .single();

      if (!errorByInvoice && orderByInvoice) {
        order = orderByInvoice;
      } else {
        orderError = errorByInvoice || errorById;
      }
    }

    if (orderError || !order) {
      console.error("[CHECK] Order not found:", orderId, orderError);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Auto-update to PAID if requested and status is still PENDING
    console.log("[CHECK] Auto-mark check:", { autoMarkPaid, status: order.status, paidAt: order.paid_at });
    if (autoMarkPaid && order.status === "PENDING" && !order.paid_at) {
      console.log("[CHECK] Attempting to update order to PAID:", orderId);
      const { error: updateError } = await supabaseAdmin
        .from("print_orders")
        .update({ 
          status: "PAID",
          paid_at: new Date().toISOString()
        })
        .eq("id", order.id);

      if (updateError) {
        console.error("[CHECK] Failed to update order:", updateError);
      } else {
        console.log("[CHECK] Order auto-updated to PAID:", orderId);
        order.status = "PAID";
        order.paid_at = new Date().toISOString();
      }
    }

    // Return current status from database
    return NextResponse.json({ 
      status: order.status,
      order 
    });
  } catch (error) {
    console.error("[CHECK] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
