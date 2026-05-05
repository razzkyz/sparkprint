import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Complete webhook diagnostic
 * Checks:
 * 1. Edge Function connectivity
 * 2. Database state
 * 3. Webhook logs
 * 4. Configuration
 */
export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/doku-webhook`;

    console.log("[DIAG] Starting webhook diagnostic...");

    // ========== TEST 1: Edge Function Connectivity ==========
    console.log("[DIAG] Test 1: Checking Edge Function connectivity...");
    let edgeFunctionAccessible = false;
    let edgeFunctionError = "";
    try {
      const testResponse = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      edgeFunctionAccessible = true;
      console.log("[DIAG] Edge Function is accessible (status:", testResponse.status, ")");
    } catch (error) {
      edgeFunctionAccessible = false;
      edgeFunctionError = String(error);
      console.error("[DIAG] Edge Function not accessible:", error);
    }

    // ========== TEST 2: Database Orders ==========
    console.log("[DIAG] Test 2: Checking database orders...");
    const { data: allOrders, error: ordersError } = await supabaseAdmin
      .from("print_orders")
      .select("id, doku_order_id, status, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(20);

    const orderStats = {
      total: allOrders?.length || 0,
      pending: allOrders?.filter(o => o.status === "PENDING").length || 0,
      paid: allOrders?.filter(o => o.status === "PAID").length || 0,
      other: (allOrders?.length || 0) - (allOrders?.filter(o => o.status === "PENDING").length || 0) - (allOrders?.filter(o => o.status === "PAID").length || 0),
    };

    console.log("[DIAG] Orders found:", orderStats);

    // ========== TEST 3: Webhook Logs ==========
    console.log("[DIAG] Test 3: Checking webhook logs...");
    const { data: webhookLogs, error: logsError } = await supabaseAdmin
      .from("webhook_logs")
      .select("*")
      .order("processed_at", { ascending: false })
      .limit(20);

    const webhookStats = {
      total_logs: webhookLogs?.length || 0,
      successful: webhookLogs?.filter(log => log.success).length || 0,
      failed: webhookLogs?.filter(log => !log.success).length || 0,
      event_types: [...new Set(webhookLogs?.map(log => log.event_type) || [])],
    };

    console.log("[DIAG] Webhook logs found:", webhookStats);

    // ========== TEST 4: Latest Pending Orders vs Webhook Logs ==========
    console.log("[DIAG] Test 4: Matching pending orders with webhook logs...");
    const pendingOrders = allOrders?.filter(o => o.status === "PENDING") || [];
    const pendingWithWebhook = pendingOrders.filter(order =>
      webhookLogs?.some(log => log.order_number === order.doku_order_id)
    );

    console.log("[DIAG] Pending orders:", pendingOrders.length);
    console.log("[DIAG] Pending with webhook logs:", pendingWithWebhook.length);

    // ========== TEST 5: Configuration ==========
    console.log("[DIAG] Test 5: Checking configuration...");
    const config = {
      supabase_url: supabaseUrl ? "✅ Set" : "❌ Not set",
      doku_client_key: process.env.DOKU_CLIENT_KEY ? "✅ Set" : "❌ Not set",
      doku_server_key: process.env.DOKU_SERVER_KEY ? "✅ Set in .env" : "❌ Not set (might be in Supabase secrets)",
      admin_password: process.env.ADMIN_PASSWORD ? "✅ Set" : "❌ Not set",
    };

    // ========== Build Report ==========
    const report = {
      timestamp: new Date().toISOString(),
      
      connectivity: {
        edge_function_url: edgeFunctionUrl,
        edge_function_accessible: edgeFunctionAccessible,
        edge_function_error: edgeFunctionError || "none",
      },

      database: {
        orders: orderStats,
        webhook_logs: webhookStats,
      },

      analysis: {
        issue_description: "",
        root_cause: "",
        recommendation: "",
      },

      configuration: config,

      recent_orders: pendingOrders.slice(0, 5).map(o => ({
        doku_order_id: o.doku_order_id,
        status: o.status,
        created_at: o.created_at,
        webhook_received: pendingWithWebhook.some(ow => ow.doku_order_id === o.doku_order_id),
      })),

      recent_webhook_logs: webhookLogs?.slice(0, 5) || [],
    };

    // Determine issue
    if (!edgeFunctionAccessible) {
      report.analysis.issue_description =
        "❌ Edge Function is not accessible from Next.js server";
      report.analysis.root_cause =
        "Network issue or Edge Function down/not deployed";
      report.analysis.recommendation =
        "1. Check if Edge Function is deployed: supabase functions list\n2. Check Supabase logs in dashboard\n3. Verify SUPABASE_URL is correct";
    } else if (orderStats.pending > 0 && pendingWithWebhook.length === 0) {
      report.analysis.issue_description =
        `❌ ${orderStats.pending} pending orders but NO webhook logs received`;
      report.analysis.root_cause =
        "DOKU is not sending webhook notifications to Edge Function";
      report.analysis.recommendation =
        "1. Log in to DOKU Dashboard\n2. Check Webhook Settings - verify URL and events\n3. Check DOKU webhook logs to see if delivery failed\n4. Manually test webhook from DOKU dashboard";
    } else if (orderStats.pending > 0 && pendingWithWebhook.length > 0) {
      const failedLogs = webhookLogs?.filter(
        log =>
          log.order_number &&
          pendingOrders.some(o => o.doku_order_id === log.order_number) &&
          !log.success
      ) || [];

      if (failedLogs.length > 0) {
        report.analysis.issue_description =
          `⚠️ Webhook received but ${failedLogs.length} had errors`;
        report.analysis.root_cause = "Edge Function received webhook but failed processing";
        report.analysis.recommendation =
          "Check Edge Function logs:\n1. Supabase Dashboard → Functions → doku-webhook → Logs\n2. Look for error messages\n3. Common issues: signature verification, database permission, DOKU_SERVER_KEY not set";
      } else {
        report.analysis.issue_description = "✅ Webhooks received and processed";
        report.analysis.root_cause = "None - system working";
        report.analysis.recommendation = "No action needed";
      }
    } else {
      report.analysis.issue_description = "✅ All orders processed";
      report.analysis.root_cause = "None - system working";
      report.analysis.recommendation = "No action needed";
    }

    console.log("[DIAG] Diagnostic complete");

    return NextResponse.json(report);
  } catch (error) {
    console.error("[DIAG] Error:", error);
    return NextResponse.json(
      { error: "diagnostic_failed", details: String(error) },
      { status: 500 }
    );
  }
}
