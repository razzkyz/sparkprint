// app/api/admin/printer-test/route.ts
import { NextResponse } from "next/server";
import { getPrinterService } from "@/lib/serverPrinterService";

function isAuthed(req: Request) {
  const got = req.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && got === expected;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { testType = "ping" } = body;

    const printer = getPrinterService();

    if (testType === "ping") {
      // Test connection
      await printer.connect();
      return NextResponse.json({
        ok: true,
        message: "Printer connected successfully",
        host: process.env.PRINTER_HOST,
        port: process.env.PRINTER_PORT,
      });
    } else if (testType === "print-text") {
      // Print test text
      await printer.printText("TEST PRINT\nFrom SparkStage\n");
      return NextResponse.json({
        ok: true,
        message: "Test text printed successfully",
      });
    } else {
      return NextResponse.json(
        { error: "Unknown test type" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[PRINTER-TEST] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
      },
      { status: 500 }
    );
  }
}
