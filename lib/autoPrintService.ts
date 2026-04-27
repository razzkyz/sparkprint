// lib/autoPrintService.ts
import { printService } from "./printService";
import { getPrinterService } from "./serverPrinterService";
import { supabaseAdmin } from "./supabaseAdmin";

interface OrderToPrint {
  id: string;
  image_urls: string[];
  size: "2x6" | "4x6";
  qty: number;
  customer_name: string;
  status: string;
}

// Track orders currently being printed to prevent duplicates
const printingQueue = new Map<string, Promise<void>>();

/**
 * Automatically print an order when payment is received
 * This is called from the Doku webhook when payment status = PAID
 */
export async function autoPrintOrder(orderId: string): Promise<void> {
  // Prevent duplicate printing of same order
  if (printingQueue.has(orderId)) {
    console.log(`[AUTO-PRINT] Order ${orderId} already in print queue, skipping`);
    return;
  }

  const printPromise = (async () => {
    try {
      console.log(`[AUTO-PRINT] Starting auto-print for order: ${orderId}`);

      // Fetch order details
      const { data: order, error } = await supabaseAdmin
        .from("print_orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (error || !order) {
        console.error(`[AUTO-PRINT] Order ${orderId} not found:`, error);
        return;
      }

      const orderData = order as OrderToPrint;

      // Check if order is paid
      if (orderData.status !== "PAID") {
        console.log(`[AUTO-PRINT] Order ${orderId} status is ${orderData.status}, skipping print`);
        return;
      }

      console.log(
        `[AUTO-PRINT] Printing order: ${orderId} | Customer: ${orderData.customer_name} | Size: ${orderData.size} | Qty: ${orderData.qty}`
      );

      // Get image URL
      const imageUrl = orderData.image_urls?.[0];
      if (!imageUrl) {
        console.error(`[AUTO-PRINT] No image URL found for order ${orderId}`);
        return;
      }

      // Attempt to print with fallback strategy
      let printSuccess = false;
      let lastError: Error | null = null;

      // Strategy 1: Try server printer (DHS RX 1 via TCP)
      try {
        console.log(`[AUTO-PRINT] Trying server printer (TCP)...`);
        const serverPrinter = getPrinterService();
        await serverPrinter.printImage({
          imageUrl,
          quantity: orderData.qty,
          size: orderData.size,
          orderId,
        });
        printSuccess = true;
        console.log(`[AUTO-PRINT] ✅ Successfully printed via server printer`);
      } catch (serverPrintError) {
        lastError = serverPrintError instanceof Error ? serverPrintError : new Error(String(serverPrintError));
        console.warn(`[AUTO-PRINT] Server printer failed, trying QZ Tray fallback...`, lastError);
      }

      // Strategy 2: Fallback to QZ Tray (if server printer failed)
      if (!printSuccess) {
        try {
          console.log(`[AUTO-PRINT] Trying QZ Tray client printer...`);
          await printService.printImage({
            imageUrl,
            quantity: orderData.qty,
            size: orderData.size,
            orderId,
          });
          printSuccess = true;
          console.log(`[AUTO-PRINT] ✅ Successfully printed via QZ Tray`);
        } catch (qzError) {
          lastError = qzError instanceof Error ? qzError : new Error(String(qzError));
          console.error(`[AUTO-PRINT] QZ Tray also failed`, lastError);
        }
      }

      if (printSuccess) {
        console.log(`[AUTO-PRINT] Successfully printed order ${orderId}`);
        // Optionally update order status to PRINTED automatically
        // Uncomment the following lines if you want to auto-mark as printed
        // await supabaseAdmin
        //   .from("print_orders")
        //   .update({ status: "PRINTED" })
        //   .eq("id", orderId);
      } else {
        console.error(
          `[AUTO-PRINT] Failed to print order ${orderId} with all strategies:`,
          lastError?.message
        );
        // Log to database for admin to see
        // You can send email notification here about print failure
      }
    } catch (error) {
      console.error(`[AUTO-PRINT] Error processing order ${orderId}:`, error);
    } finally {
      // Remove from queue after completion
      printingQueue.delete(orderId);
    }
  })();

  // Add to printing queue
  printingQueue.set(orderId, printPromise);

  // Don't await here - print happens in background
  // This allows webhook to return quickly
  printPromise.catch(err => {
    console.error(`[AUTO-PRINT] Unhandled error in print queue for ${orderId}:`, err);
  });
}

/**
 * Get print queue status (for debugging)
 */
export function getPrintQueueStatus(): { orderId: string; isPrinting: boolean }[] {
  return Array.from(printingQueue.entries()).map(([orderId, promise]) => ({
    orderId,
    isPrinting: !!promise,
  }));
}

/**
 * Check printer connection status
 */
export async function checkPrinterStatus(): Promise<{
  connected: boolean;
  printers: string[];
  error?: string;
}> {
  try {
    const connected = printService.isConnected() || (await printService.checkConnection());
    const printers = connected ? await printService.getPrinters() : [];
    return { connected, printers };
  } catch (error) {
    return {
      connected: false,
      printers: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
