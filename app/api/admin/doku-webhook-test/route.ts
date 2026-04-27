import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Test endpoint untuk simulate webhook dari DOKU
 * Membantu test payment flow tanpa harus bayar sebenarnya
 * 
 * Usage: 
 * POST /api/admin/doku-webhook-test
 * {
 *   "doku_order_id": "SP-1234567890-ABCD",
 *   "status": "SUCCESS"  // atau "FAILED"
 * }
 */
export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const doku_order_id = String(body?.doku_order_id ?? "").trim();
  const status = String(body?.status ?? "SUCCESS").toUpperCase();

  if (!doku_order_id) {
    return NextResponse.json({ error: "doku_order_id required" }, { status: 400 });
  }

  if (!["SUCCESS", "FAILED"].includes(status)) {
    return NextResponse.json({ error: "status must be SUCCESS or FAILED" }, { status: 400 });
  }

  console.log("[TEST WEBHOOK] Simulating DOKU payment:", { doku_order_id, status });

  try {
    // Find order by doku_order_id
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("print_orders")
      .select("id, status, paid_at, customer_email")
      .eq("doku_order_id", doku_order_id)
      .maybeSingle();

    if (selErr) {
      console.error("[TEST WEBHOOK] Query error:", selErr);
      return NextResponse.json({ error: "Database query error" }, { status: 500 });
    }

    if (!existing) {
      console.warn("[TEST WEBHOOK] Order not found:", doku_order_id);
      return NextResponse.json({ 
        error: "order_not_found", 
        hint: "Pastikan doku_order_id sudah benar dan order sudah dibuat"
      }, { status: 404 });
    }

    // Determine new status
    let newStatus: string;
    if (status === "SUCCESS") {
      newStatus = "PAID";
    } else {
      newStatus = "FAILED";
    }

    // Only set paid_at once (avoid overwriting if already processed)
    const shouldSetPaidAt = status === "SUCCESS" && !existing.paid_at;

    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (shouldSetPaidAt) {
      updatePayload.paid_at = new Date().toISOString();
    }

    // Update order status in database
    const { error: updateErr, data: updated } = await supabaseAdmin
      .from("print_orders")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[TEST WEBHOOK] Update error:", updateErr);
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    console.log("[TEST WEBHOOK] Order updated:", {
      id: existing.id,
      oldStatus: existing.status,
      newStatus: newStatus,
      paid_at: shouldSetPaidAt ? updatePayload.paid_at : "unchanged",
    });

    return NextResponse.json({
      ok: true,
      message: `Order updated from ${existing.status} to ${newStatus}`,
      order: {
        id: existing.id,
        doku_order_id,
        status: newStatus,
        paid_at: updated?.paid_at || existing.paid_at,
        customer_email: existing.customer_email,
      }
    });

  } catch (error) {
    console.error("[TEST WEBHOOK] Unexpected error:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );
  }
}
