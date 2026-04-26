import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data: orders, error } = await supabaseAdmin
      .from("print_orders")
      .select("id, queue_number, customer_name, customer_email, image_urls, size, qty, amount, status, created_at, paid_at, doku_order_id, payment_method")
      .eq("status", "PAID")
      .order("paid_at", { ascending: false })
      .limit(10); // Get up to 10 ready orders

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(orders || []);
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}