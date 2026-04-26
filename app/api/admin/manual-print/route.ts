// app/api/admin/manual-print/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoPrintOrder } from "@/lib/autoPrintService";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch order
  const { data: order, error } = await supabaseAdmin
    .from("print_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }

  if (order.status !== "PAID") {
    return NextResponse.json({ error: `order status is ${order.status}, only PAID orders can be printed` }, { status: 409 });
  }

  try {
    // Trigger auto-print
    await autoPrintOrder(id);
    return NextResponse.json({ ok: true, message: "Print job queued" });
  } catch (err) {
    console.error("Manual print error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Print failed" }, { status: 500 });
  }
}
