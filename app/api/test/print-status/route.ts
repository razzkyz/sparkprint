import { NextResponse } from "next/server";
import { getPrintQueueStatus, checkPrinterStatus } from "@/lib/autoPrintService";

/**
 * TEST ENDPOINT - Check print queue and printer status
 * Usage: GET /api/test/print-status
 */
export async function GET() {
  const queueStatus = getPrintQueueStatus();
  const printerStatus = await checkPrinterStatus();

  return NextResponse.json({
    printQueue: queueStatus,
    printer: printerStatus,
  });
}
