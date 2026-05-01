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

    if (!orderId) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    // Check order in database
    const { data: order, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, doku_order_id, customer_name, customer_email, image_urls, size, qty, amount, queue_number, paid_at")
      .eq("doku_order_id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Auto-update to PAID if requested and status is still PENDING
    if (autoMarkPaid && order.status === "PENDING" && !order.paid_at) {
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
