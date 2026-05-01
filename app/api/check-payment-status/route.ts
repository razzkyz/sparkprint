import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Check payment status from database
 * This is used as an alternative to webhook if webhook is not working
 * Since DOKU webhook is not being called, we rely on manual status updates
 * or the user to mark as paid in admin panel
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    // Check order in database
    const { data: order, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, doku_order_id, customer_name, customer_email, image_urls, size, qty, amount, queue_number")
      .eq("doku_order_id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
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
