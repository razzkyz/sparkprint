// lib/printService.ts
import qz from "qz-tray";
import { renderImageToCanvas, getPrintDimensions, getQZTrayConfig } from "./canvasPrintRenderer";

let qzConnected = false;

type PrintSize = "2R" | "4R" | "4x6";

interface PrintOptions {
  imageUrl: string;
  quantity: number;
  size: PrintSize;
  orderId?: string;
}

const PRINTER_NAME = "DS-RX1";

export const printService = {
  async connect(): Promise<void> {
    if (qzConnected) return;

    try {
      // Set promise type for QZ Tray
      (qz.api as any).setPromiseType(function promise(resolver: any) {
        return new Promise(resolver);
      });

      // Set WebSocket type
      (qz.api as any).setWebSocketType(function ws(url: string) {
        return new WebSocket(url);
      });

      // Connect to QZ Tray
      await (qz.websocket as any).connect();

      // Wait a bit for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      qzConnected = true;
      console.log("[PRINT] ✅ Connected to QZ Tray");
    } catch (error) {
      console.error("[PRINT] ❌ QZ Tray connection failed:", error);
      qzConnected = false;
      throw new Error(
        "QZ Tray connection failed. Please ensure:\n" +
        "1. QZ Tray application is running\n" +
        "2. Certificate is configured (Settings → Certificates)\n" +
        "3. Domain is allowed in certificate settings\n" +
        "4. Using HTTPS in production"
      );
    }
  },

  async disconnect(): Promise<void> {
    if (qzConnected) {
      try {
        await qz.websocket.disconnect();
        qzConnected = false;
        console.log("Disconnected from QZ Tray");
      } catch (error) {
        console.error("Error disconnecting from QZ Tray:", error);
      }
    }
  },

  async getPrinters(): Promise<string[]> {
    await this.connect();
    const printers = await (qz.printers as any).find();
    return Array.isArray(printers) ? printers : [printers];
  },

  /**
   * Get dimensions for print size
   * 2R (2x6 inches)  = portrait strip
   * 4R (10x15 cm)    = 3.94 x 5.91 inches (landscape)
   * 4x6 (4x6 inches) = standard portrait
   * DPI = 300 for photo quality
   */
  getPrintDimensions(size: PrintSize): { width: number; height: number; dpi: number } {
    const dpi = 300; // DPI for DHS RX 1
    const dimensions: Record<PrintSize, { width: number; height: number }> = {
      '2R': { width: 2, height: 6 },      // 2 x 6 inches (strip portrait)
      '4R': { width: 3.94, height: 5.91 }, // 10 x 15 cm (landscape)
      '4x6': { width: 4, height: 6 },    // 4 x 6 inches (portrait)
    };
    const dim = dimensions[size] || dimensions['4x6'];
    return { width: dim.width, height: dim.height, dpi };
  },

  /**
   * Resize and optimize image for printing
   * This ensures the photo fits perfectly in 4x6 format
   */
  async prepareImageForPrint(imageUrl: string, size: PrintSize): Promise<string> {
    try {
      // Load image from URL and convert to base64
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.status}`);
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error preparing image:", error);
      throw error;
    }
  },

  async printImage(options: PrintOptions): Promise<void> {
    const { imageUrl, quantity, size, orderId } = options;

    // Ensure connection before printing
    await this.connect();

    // Double check connection status
    if (!qzConnected || !qz.websocket.isActive()) {
      throw new Error("QZ Tray is not connected. Please check QZ Tray is running and certificate is configured.");
    }

    try {
      // Get default printer
      const printers = await this.getPrinters();
      if (printers.length === 0) {
        throw new Error("No printers found");
      }

      const printer = printers[0];
      const dimensions = this.getPrintDimensions(size);
      console.log(`[${orderId || "PRINT"}] Paper size: ${size} (${dimensions.width}\" x ${dimensions.height}\" @ ${dimensions.dpi}DPI)`);

      console.log(`[${orderId || "PRINT"}] Using printer: ${printer}, Size: ${size}, Quantity: ${quantity}`);

      // Prepare image (resize and optimize)
      const imageData = await this.prepareImageForPrint(imageUrl, size);

      // Create print configuration for DHS RX 1
      const config = (qz.configs as any).create(printer, {
        size: { width: dimensions.width, height: dimensions.height },
        units: "in",
        density: dimensions.dpi,
        margins: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
      });

      // Print multiple copies
      for (let i = 0; i < quantity; i++) {
        try {
          const printData = [
            {
              type: "pixel",
              format: "image",
              data: imageData,
              options: {
                width: dimensions.width,
                height: dimensions.height,
                stretch: "fill",
              },
            },
          ] as any;

          await (qz as any).print(config, printData);
          console.log(`[${orderId || "PRINT"}] Printed copy ${i + 1}/${quantity}`);

          // Small delay between copies to prevent queue overflow
          if (i < quantity - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (copyError) {
          console.error(`[${orderId || "PRINT"}] Error printing copy ${i + 1}:`, copyError);
          throw copyError;
        }
      }

      console.log(`[${orderId || "PRINT"}] All copies printed successfully`);
    } catch (error) {
      console.error(`[${orderId || "PRINT"}] Print failed:`, error);
      throw error;
    }
  },

  async loadImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.status}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  isConnected(): boolean {
    return qzConnected && (qz.websocket as any).isActive();
  },

  async checkConnection(): Promise<boolean> {
    try {
      if (!qzConnected) return false;
      return await (qz.websocket as any).isActive();
    } catch {
      return false;
    }
  },
};