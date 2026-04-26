import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoPrintOrder } from "@/lib/autoPrintService";

/**
 * TEST ENDPOINT - Simulate DOKU payment success
 * Usage: GET /api/test/simulate-payment?orderId=xxx
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  try {
    console.log("[TEST] Looking for order:", orderId);

    // Find order by doku_order_id first (string column)
    let { data: order, error: selErr } = await supabaseAdmin
      .from("print_orders")
      .select("*")
      .eq("doku_order_id", orderId)
      .maybeSingle();

    console.log("[TEST] Search by doku_order_id:", { found: !!order, error: selErr });

    // If not found by doku_order_id, try by id (UUID column)
    if (!order) {
      const result = await supabaseAdmin
        .from("print_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      order = result.data;
      selErr = result.error;
      console.log("[TEST] Search by id (UUID):", { found: !!order, error: selErr });
    }

    if (selErr) {
      console.error("[TEST] Query error:", selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    if (!order) {
      console.error("[TEST] Order not found in database");
      // List all orders for debugging
      const { data: allOrders } = await supabaseAdmin
        .from("print_orders")
        .select("id, doku_order_id, status")
        .limit(5);
      console.log("[TEST] Recent orders:", allOrders);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Update order status to PAID
    const { error: updateErr } = await supabaseAdmin
      .from("print_orders")
      .update({
        status: "PAID",
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(`[TEST] Payment simulated for order ${order.id}`);

    // Trigger auto-print
    autoPrintOrder(order.id).catch((err) => {
      console.error(`[TEST] Auto-print failed for ${order.id}:`, err);
    });

    return NextResponse.json({
      success: true,
      message: "Payment simulated successfully",
      order_id: order.id, // UUID for polling
      doku_order_id: order.doku_order_id, // SP-xxx format
    });
  } catch (error) {
    console.error("[TEST] Simulate payment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
