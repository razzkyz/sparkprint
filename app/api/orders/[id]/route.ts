import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Get order status by ID
 * Usage: GET /api/orders/<order_id>
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  console.log("[ORDERS] Fetching order:", id);

  try {
    // Try by id first (UUID)
    let { data: order, error } = await supabaseAdmin
      .from("print_orders")
      .select("status, doku_order_id, paid_at")
      .eq("id", id)
      .maybeSingle();

    // If not found by id, try by doku_order_id (SP-xxx format)
    if (!order || error) {
      console.log("[ORDERS] Not found by id, trying doku_order_id:", id);
      const result = await supabaseAdmin
        .from("print_orders")
        .select("status, doku_order_id, paid_at")
        .eq("doku_order_id", id)
        .maybeSingle();
      order = result.data;
      error = result.error;
    }

    if (error) {
      console.error("[ORDERS] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!order) {
      console.log("[ORDERS] Order not found:", id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    console.log("[ORDERS] Found order:", order.status);
    return NextResponse.json(order);
  } catch (error) {
    console.error("[ORDERS] Get order error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
