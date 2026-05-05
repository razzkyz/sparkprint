import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Emergency endpoint untuk check dan fix stuck orders
 * 
 * GET: Check order status + webhook logs
 * POST: Manually update order to PAID
 * 
 * Usage:
 * Check: GET /api/admin/quick-fix?order_id=SP-XXX
 * Fix:   POST /api/admin/quick-fix
 *        {"order_id": "SP-XXX"}
 */

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json(
      { error: "order_id required", example: "?order_id=SP-1777863050248-TF7ANS" },
      { status: 400 }
    );
  }

  console.log("[QUICK FIX] Checking order:", orderId);

  try {
    // Find order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .select("*")
      .eq("doku_order_id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        {
          error: "order_not_found",
          order_id: orderId,
          detail: orderError?.message,
        },
        { status: 404 }
      );
    }

    // Get webhook logs
    const { data: logs } = await supabaseAdmin
      .from("webhook_logs")
      .select("*")
      .eq("order_number", orderId);

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        doku_order_id: order.doku_order_id,
        status: order.status,
        amount: order.amount,
        customer_name: order.customer_name,
        created_at: order.created_at,
        paid_at: order.paid_at,
      },
      webhook_logs: logs || [],
      analysis: {
        is_pending: order.status === "PENDING",
        is_paid: order.status === "PAID",
        webhook_received: (logs || []).length > 0,
        webhook_successful: (logs || []).some(log => log.success),
        recommendation:
          order.status === "PAID"
            ? "✅ Order sudah PAID"
            : (logs || []).length === 0
            ? "⚠️ No webhook received. Update DOKU webhook URL or manually fix."
            : (logs || []).some(log => !log.success)
            ? "⚠️ Webhook received tapi failed. Check logs."
            : "❌ Unknown issue",
      },
    });
  } catch (error) {
    console.error("[QUICK FIX] Error:", error);
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return NextResponse.json(
        { error: "order_id required" },
        { status: 400 }
      );
    }

    console.log("[QUICK FIX] Fixing order:", order_id);

    // Find order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .select("*")
      .eq("doku_order_id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "order_not_found", order_id },
        { status: 404 }
      );
    }

    // If already PAID, no need to update
    if (order.status === "PAID") {
      return NextResponse.json({
        ok: true,
        message: "Order sudah PAID",
        order: {
          id: order.id,
          status: order.status,
          paid_at: order.paid_at,
        },
      });
    }

    const now = new Date().toISOString();

    // Update to PAID
    const { error: updateError } = await supabaseAdmin
      .from("print_orders")
      .update({
        status: "PAID",
        paid_at: now,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("[QUICK FIX] Update failed:", updateError);
      return NextResponse.json(
        { error: "update_failed", details: updateError.message },
        { status: 500 }
      );
    }

    console.log("[QUICK FIX] ✅ Order updated:", order_id);

    // Log this action
    try {
      await supabaseAdmin
        .from("webhook_logs")
        .insert({
          order_number: order_id,
          event_type: "manual_fix_quick_endpoint",
          payload: { action: "manual_update_to_paid" },
          success: true,
          processed_at: now,
        });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json({
      ok: true,
      message: "✅ Order updated to PAID",
      order: {
        id: order.id,
        doku_order_id: order.doku_order_id,
        status: "PAID",
        paid_at: now,
      },
    });
  } catch (error) {
    console.error("[QUICK FIX] Error:", error);
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}
