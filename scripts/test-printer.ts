// scripts/test-printer.ts
/**
 * Manual printer testing script
 * Run: npx ts-node scripts/test-printer.ts
 */

import { getPrinterService } from "../lib/serverPrinterService";

async function main() {
  const printer = getPrinterService();

  console.log("=== Printer Connection Test ===\n");

  try {
    // Test 1: Connect
    console.log("1️⃣ Testing connection...");
    await printer.connect();
    console.log("✅ Connected!\n");

    // Test 2: Print text
    console.log("2️⃣ Printing test text...");
    await printer.printText("=== TEST PRINT ===\nIf you see this,\nprinter is working!\n");
    console.log("✅ Text printed!\n");

    // Test 3: Print dummy image
    console.log("3️⃣ Printing test pattern...");
    
    // Create a simple test buffer (placeholder)
    const testImage = Buffer.alloc(1024 * 100, 0xaa);
    
    await printer.printImage({
      imageUrl: "", // dummy
      quantity: 1,
      size: "4x6",
      orderId: "TEST-001",
    });
    console.log("✅ Test pattern printed!\n");

    console.log("=== All tests passed! ===");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

main();
