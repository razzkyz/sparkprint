import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Debug endpoint untuk melihat order yang ada di database
 * dengan doku_order_id untuk trace webhook status
 */
export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dokuOrderId = url.searchParams.get("doku_order_id");

  try {
    if (dokuOrderId) {
      // Query specific order by doku_order_id
      const { data, error } = await supabaseAdmin
        .from("print_orders")
        .select("*")
        .eq("doku_order_id", dokuOrderId)
        .single();

      if (error) {
        return NextResponse.json({ 
          error: error.message,
          hint: "Order not found. Check if doku_order_id is correct."
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        order: data,
        webhook_status: data?.status === "PAID" ? "✅ Webhook received and processed" : "⏳ Waiting for webhook",
        debug: {
          doku_order_id: data?.doku_order_id,
          status: data?.status,
          paid_at: data?.paid_at,
          created_at: data?.created_at,
          message: data?.status === "PAID" 
            ? "Webhook successfully updated status to PAID" 
            : "Order still PENDING - webhook may not have been received yet"
        }
      });
    }

    // List all orders with status breakdown
    const { data: allOrders, error: allError } = await supabaseAdmin
      .from("print_orders")
      .select("id, doku_order_id, status, paid_at, created_at, customer_name, payment_method")
      .order("created_at", { ascending: false })
      .limit(100);

    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }

    const statusCounts = {
      PENDING: allOrders?.filter(o => o.status === "PENDING").length ?? 0,
      PAID: allOrders?.filter(o => o.status === "PAID").length ?? 0,
      PRINTED: allOrders?.filter(o => o.status === "PRINTED").length ?? 0,
      FAILED: allOrders?.filter(o => o.status === "FAILED").length ?? 0,
    };

    return NextResponse.json({
      ok: true,
      summary: {
        total: allOrders?.length ?? 0,
        ...statusCounts
      },
      recent_orders: allOrders?.slice(0, 10).map(o => ({
        doku_order_id: o.doku_order_id,
        status: o.status,
        paid_at: o.paid_at,
        created_at: o.created_at,
        customer_name: o.customer_name,
        payment_method: o.payment_method,
      })) ?? [],
      webhook_check: {
        url: "https://print.sparkstage55.com/api/doku/webhook",
        note: "✅ If order status is PAID, webhook was successfully received",
        note2: "⏳ If order status is PENDING, webhook may not have been received or processed yet",
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_server_error", details: String(error) },
      { status: 500 }
    );
  }
}
