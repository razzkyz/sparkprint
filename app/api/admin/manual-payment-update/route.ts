import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoPrintOrder } from "@/lib/autoPrintService";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Manual endpoint untuk update payment status ke PAID
 * Digunakan sebagai emergency fix jika webhook tidak bekerja
 * 
 * Usage:
 * curl -X POST http://localhost:3000/api/admin/manual-payment-update \
 *   -H "Content-Type: application/json" \
 *   -H "x-admin-password: password123" \
 *   -d '{"doku_order_id": "SP-1777859502663-DR3G7P"}'
 */
export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { doku_order_id, trigger_print } = await req.json();

    if (!doku_order_id) {
      return NextResponse.json(
        { error: "doku_order_id required" },
        { status: 400 }
      );
    }

    console.log("[MANUAL UPDATE] Processing:", {
      doku_order_id,
      trigger_print: trigger_print ?? true
    });

    // Find order
    const { data: order, error: findError } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, doku_order_id, paid_at")
      .eq("doku_order_id", doku_order_id)
      .single();

    if (findError || !order) {
      return NextResponse.json(
        { error: "order_not_found", details: String(findError) },
        { status: 404 }
      );
    }

    // Check if already PAID
    if (order.status === "PAID") {
      console.log("[MANUAL UPDATE] Order already PAID, skipping update");
      return NextResponse.json({
        ok: true,
        message: "Order sudah berstatus PAID",
        order: {
          id: order.id,
          doku_order_id: order.doku_order_id,
          status: order.status,
          paid_at: order.paid_at
        }
      });
    }

    // Update to PAID
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("print_orders")
      .update({
        status: "PAID",
        paid_at: now
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("[MANUAL UPDATE] Update failed:", updateError);
      return NextResponse.json(
        { error: "update_failed", details: String(updateError) },
        { status: 500 }
      );
    }

    console.log("[MANUAL UPDATE] ✅ Order updated to PAID:", doku_order_id);

    // Log this manual update
    try {
      await supabaseAdmin
        .from("webhook_logs")
        .insert({
          order_number: doku_order_id,
          event_type: "manual_payment_update",
          payload: { manual: true, triggered_at: now },
          success: true,
          processed_at: now
        });
    } catch (logErr) {
      console.error("[MANUAL UPDATE] Failed to log:", logErr);
    }

    // Trigger auto-print if requested
    if (trigger_print ?? true) {
      console.log("[MANUAL UPDATE] 🖨️ Triggering auto-print for:", order.id);
      autoPrintOrder(order.id).catch((err) => {
        console.error("[MANUAL UPDATE] Auto-print failed:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      message: "✅ Payment status updated to PAID",
      order: {
        id: order.id,
        doku_order_id: order.doku_order_id,
        status: "PAID",
        paid_at: now
      },
      auto_print_triggered: trigger_print ?? true
    });

  } catch (error) {
    console.error("[MANUAL UPDATE] Error:", error);
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}
