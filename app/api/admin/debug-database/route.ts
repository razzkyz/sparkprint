import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Deep database inspection for webhook debugging
 * Shows exact doku_order_id values in database vs what DOKU sends
 */
export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const searchId = url.searchParams.get("search_id");

  try {
    if (searchId) {
      // Search for order - try multiple ways
      console.log("[DB] Searching for:", searchId);

      // Method 1: Exact match on doku_order_id
      let byDokuOrderId = null;
      try {
        const result = await supabaseAdmin
          .from("print_orders")
          .select("*")
          .eq("doku_order_id", searchId)
          .single();
        byDokuOrderId = result.data;
      } catch {
        byDokuOrderId = null;
      }

      // Method 2: Partial match (case-insensitive)
      let byPartial = null;
      try {
        const result = await supabaseAdmin
          .from("print_orders")
          .select("*")
          .ilike("doku_order_id", `%${searchId}%`);
        byPartial = result.data;
      } catch {
        byPartial = null;
      }

      // Method 3: Search by id (UUID)
      let byId = null;
      try {
        const result = await supabaseAdmin
          .from("print_orders")
          .select("*")
          .eq("id", searchId)
          .single();
        byId = result.data;
      } catch {
        byId = null;
      }

      return NextResponse.json({
        ok: true,
        search_query: searchId,
        matches: {
          exact_doku_order_id: byDokuOrderId ? { found: true, ...byDokuOrderId } : { found: false },
          partial_doku_order_id: byPartial ? { found: true, ...byPartial } : { found: false },
          by_uuid_id: byId ? { found: true, ...byId } : { found: false },
        },
        recommendation:
          byDokuOrderId || byPartial || byId
            ? "✅ Order found"
            : "❌ Order not found - doku_order_id value may be different from what you're searching",
      });
    }

    // List all orders with ALL their fields (for debugging)
    const { data: allOrders, error: allError } = await supabaseAdmin
      .from("print_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (allError) {
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }

    // Group by status
    const byStatus = {
      PENDING: allOrders?.filter(o => o.status === "PENDING") || [],
      PAID: allOrders?.filter(o => o.status === "PAID") || [],
      PRINTED: allOrders?.filter(o => o.status === "PRINTED") || [],
      FAILED: allOrders?.filter(o => o.status === "FAILED") || [],
    };

    // Show pending orders (most important for debugging)
    const pendingOrders = byStatus.PENDING.map(o => ({
      id: o.id,
      doku_order_id: o.doku_order_id,
      status: o.status,
      amount: o.amount,
      created_at: o.created_at,
      paid_at: o.paid_at,
      customer_email: o.customer_email,
    }));

    // Check webhook logs for these pending orders
    const pendingDokuIds = pendingOrders.map(o => o.doku_order_id);
    let webhookLogs: { order_number: string; event_type: string; success: boolean; processed_at: string }[] = [];
    try {
      const result = await supabaseAdmin
        .from("webhook_logs")
        .select("order_number, event_type, success, processed_at")
        .in("order_number", pendingDokuIds);
      webhookLogs = result.data || [];
    } catch {
      webhookLogs = [];
    }

    const webhooksByOrder: Record<string, { order_number: string; event_type: string; success: boolean; processed_at: string }[]> = {};
    pendingDokuIds.forEach(id => {
      webhooksByOrder[id] = webhookLogs?.filter((log) => log.order_number === id) || [];
    });

    return NextResponse.json({
      ok: true,
      summary: {
        total_orders: allOrders?.length || 0,
        pending_count: byStatus.PENDING.length,
        paid_count: byStatus.PAID.length,
        printed_count: byStatus.PRINTED.length,
        failed_count: byStatus.FAILED.length,
      },
      pending_orders: pendingOrders.map(o => ({
        ...o,
        webhook_logs_received: webhooksByOrder[o.doku_order_id].length,
        webhook_details: webhooksByOrder[o.doku_order_id],
      })),
      analysis: {
        total_pending: byStatus.PENDING.length,
        of_pending_with_webhook_logs: byStatus.PENDING.filter(
          o => webhooksByOrder[o.doku_order_id]?.length > 0
        ).length,
        issue: byStatus.PENDING.filter(
          o => webhooksByOrder[o.doku_order_id]?.length === 0
        ).length > 0
          ? `⚠️ ${byStatus.PENDING.filter(
              o => webhooksByOrder[o.doku_order_id]?.length === 0
            ).length} orders are PENDING and have NO webhook logs received`
          : "✅ All pending orders have webhook logs",
      },
      debug_instructions: [
        "If pending_orders is empty: All orders already PAID ✅",
        "If pending_orders has items but no webhook_logs_received: Webhook not reaching Edge Function ❌",
        "If pending_orders has webhook_logs_received but still PENDING: Edge Function received but failed to update ❌",
        "",
        "Use query param ?search_id=SP-XXX to search for specific order",
      ],
      all_orders_sample: (allOrders || []).slice(0, 5).map(o => ({
        doku_order_id: o.doku_order_id,
        status: o.status,
        created_at: o.created_at,
      })),
    });
  } catch (error) {
    console.error("[DB] Error:", error);
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}
