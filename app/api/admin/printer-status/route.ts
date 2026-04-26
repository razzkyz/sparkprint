// app/api/admin/printer-status/route.ts
import { NextResponse } from "next/server";
import { checkPrinterStatus, getPrintQueueStatus } from "@/lib/autoPrintService";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const printerStatus = await checkPrinterStatus();
    const printQueue = getPrintQueueStatus();

    return NextResponse.json({
      printer: printerStatus,
      queue: printQueue,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check printer status" },
      { status: 500 }
    );
  }
}
