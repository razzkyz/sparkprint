import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

/**
 * Debug endpoint untuk melihat semua order dengan doku_order_id
 * Membantu troubleshoot webhook issues
 */
export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("print_orders")
    .select("id, doku_order_id, customer_name, customer_email, status, created_at, paid_at, amount")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    total: data?.length || 0,
    orders: data || [],
    debug_info: {
      webhook_url: "https://print.sparkstage55.com/api/doku/webhook",
      note: "Check if above URL is registered in DOKU Dashboard as callback URL",
      instructions: [
        "1. Login ke https://jokul.doku.com",
        "2. Buka Settings > Webhook Configuration",
        "3. Pastikan callback URL terdaftar dengan benar",
        "4. Periksa logs di DOKU dashboard untuk melihat status webhook"
      ]
    }
  });
}
