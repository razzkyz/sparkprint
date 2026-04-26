import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const { id } = await params;

    // Update status to PRINTED
    const { data, error } = await supabaseAdmin
      .from("print_orders")
      .update({
        status: "PRINTED",
        printed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "PAID") // Ensure it's still PAID to prevent double update
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Order not found or already printed" }, { status: 404 });
    }

    return NextResponse.json({ success: true, order: data[0] });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}