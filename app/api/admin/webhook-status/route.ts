import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Debug endpoint untuk melihat webhook logs dan status order
 * Membantu troubleshoot mengapa webhook tidak mengupdate status
 */
export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const invoiceNumber = url.searchParams.get("invoice_number");

  if (!invoiceNumber) {
    return NextResponse.json({ error: "invoice_number required" }, { status: 400 });
  }

  try {
    // Get order by invoice number
    const { data: order, error: orderError } = await supabaseAdmin
      .from("print_orders")
      .select("*")
      .eq("doku_order_id", invoiceNumber)
      .single();

    if (orderError) {
      return NextResponse.json({
        error: "order_not_found",
        message: "Order tidak ditemukan untuk invoice: " + invoiceNumber
      }, { status: 404 });
    }

    // Get webhook logs for this invoice
    const { data: webhookLogs, error: logsError } = await supabaseAdmin
      .from("webhook_logs")
      .select("*")
      .eq("order_number", invoiceNumber)
      .order("processed_at", { ascending: false });

    if (logsError) {
      console.error("Webhook logs query error:", logsError);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        doku_order_id: order.doku_order_id,
        customer_name: order.customer_name,
        amount: order.amount,
        status: order.status,
        paid_at: order.paid_at,
        created_at: order.created_at,
      },
      webhook_logs: webhookLogs || [],
      analysis: {
        webhook_received: (webhookLogs && webhookLogs.length > 0),
        webhook_successful: webhookLogs?.some(log => log.success) ?? false,
        order_status: order.status,
        is_paid: order.status === "PAID",
        is_pending: order.status === "PENDING",
        issue: order.status === "PENDING" 
          ? "❌ Order masih PENDING. Webhook tidak diproses atau tidak diterima."
          : "✅ Order sudah diupdate. Status: " + order.status,
      },
      debug_info: {
        webhook_url_next: "https://print.sparkstage55.com/api/doku/webhook",
        webhook_url_edge_function: "https://hogzjapnkvsihvvbgcdb.supabase.co/functions/v1/doku-webhook",
        doku_client_key: process.env.DOKU_CLIENT_KEY?.substring(0, 10) + "...",
        server_key_set: !!process.env.DOKU_SERVER_KEY,
        instructions: {
          if_webhook_empty: "Webhook tidak menerima notifikasi dari DOKU. Periksa di DOKU Dashboard apakah callback URL sudah terdaftar.",
          if_pending: "1. Login https://jokul.doku.com → Settings → Webhook Configuration",
          if_pending_2: "2. Pastikan URL callback: https://print.sparkstage55.com/api/doku/webhook (atau gunakan Edge Function URL)",
          if_pending_3: "3. Jika sudah terdaftar, coba test webhook dari DOKU dashboard",
          if_pending_4: "4. Jika tetap tidak berhasil, cek Network tab di browser untuk melihat request dari DOKU"
        }
      },
      recommendation: webhookLogs && webhookLogs.length > 0 
        ? "✅ Webhook sudah menerima notifikasi. Cek log untuk melihat error details."
        : "⚠️ Webhook tidak menerima notifikasi. Daftarkan webhook URL di DOKU Dashboard."
    });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", details: String(error) },
      { status: 500 }
    );
  }
}
