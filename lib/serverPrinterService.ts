// lib/serverPrinterService.ts
/**
 * Server-side printer service untuk DHS RX 1 thermal printer
 * Connects via TCP socket ke printer IP:Port (default: 192.168.1.254:9100)
 * Supports ESC/POS commands
 */

import * as net from "net";
import * as fs from "fs";
import * as path from "path";

interface PrinterConfig {
  host: string;
  port: number;
  timeout?: number;
}

interface PrintOptions {
  imageUrl: string;
  quantity: number;
  size: "2x6" | "4x6";
  orderId?: string;
}

/**
 * ESC/POS command builder untuk thermal printer
 */
class EscPosBuilder {
  private buffer: Buffer[] = [];

  // Initialize printer
  init(): this {
    this.buffer.push(Buffer.from([0x1b, 0x40])); // ESC @
    return this;
  }

  // Set print mode (normal)
  setPrintMode(): this {
    this.buffer.push(Buffer.from([0x1b, 0x21, 0x00])); // ESC ! 0
    return this;
  }

  // Set print density
  setPrintDensity(density: number): this {
    // 0x00 to 0x0F, where 0x08 is default
    const d = Math.max(0, Math.min(15, density));
    this.buffer.push(Buffer.from([0x1d, 0x7c, d])); // GS | <n>
    return this;
  }

  // Set character size (width x height)
  setCharacterSize(width: number, height: number): this {
    const w = Math.max(1, Math.min(8, width));
    const h = Math.max(1, Math.min(8, height));
    this.buffer.push(Buffer.from([0x1d, 0x21, (w - 1) << 4 | (h - 1)])); // GS ! <n>
    return this;
  }

  // Set alignment
  setAlignment(align: "left" | "center" | "right"): this {
    let mode = 0x00; // left
    if (align === "center") mode = 0x01;
    if (align === "right") mode = 0x02;
    this.buffer.push(Buffer.from([0x1b, 0x61, mode])); // ESC a <n>
    return this;
  }

  // Print text
  text(str: string): this {
    this.buffer.push(Buffer.from(str, "utf8"));
    return this;
  }

  // Line feed
  lineFeed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(Buffer.from([0x0a])); // LF
    }
    return this;
  }

  // Cut paper
  cut(): this {
    this.buffer.push(Buffer.from([0x1d, 0x56, 0x00])); // GS V 0 (partial cut)
    return this;
  }

  // Print image (for raw pixel data)
  // Width in bytes, height in pixels
  printImage(imageData: Buffer, width: number, height: number): this {
    // ESC * <mode> <nL> <nH> <data>
    // mode = 33 (8-dot single density, 24-dot mode)
    const mode = 33;
    const nL = width & 0xff;
    const nH = (width >> 8) & 0xff;

    this.buffer.push(Buffer.from([0x1b, 0x2a, mode, nL, nH]));
    this.buffer.push(imageData);

    return this;
  }

  // Get final buffer
  toBuffer(): Buffer {
    return Buffer.concat(this.buffer);
  }

  // Reset for new document
  reset(): this {
    this.buffer = [];
    return this;
  }
}

/**
 * Server printer service - manages TCP connection to printer
 */
export class ServerPrinterService {
  private config: PrinterConfig;
  private socket: net.Socket | null = null;
  private isConnected = false;
  private commandQueue: Buffer[] = [];
  private isProcessing = false;

  constructor(
    host: string = process.env.PRINTER_HOST || "192.168.1.254",
    port: number = parseInt(process.env.PRINTER_PORT || "9100", 10)
  ) {
    this.config = {
      host,
      port,
      timeout: 30000, // 30 second timeout
    };
  }

  /**
   * Connect to printer
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected && this.socket) {
        resolve();
        return;
      }

      this.socket = net.createConnection(
        {
          host: this.config.host,
          port: this.config.port,
          timeout: this.config.timeout,
        },
        () => {
          this.isConnected = true;
          console.log(`[PRINTER] Connected to ${this.config.host}:${this.config.port}`);
          resolve();
        }
      );

      this.socket.on("error", (err) => {
        this.isConnected = false;
        console.error("[PRINTER] Connection error:", err);
        reject(err);
      });

      this.socket.on("timeout", () => {
        this.isConnected = false;
        this.socket?.destroy();
        reject(new Error("Printer connection timeout"));
      });

      this.socket.on("close", () => {
        this.isConnected = false;
        console.log("[PRINTER] Connection closed");
      });
    });
  }

  /**
   * Disconnect from printer
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
      this.isConnected = false;
      console.log("[PRINTER] Disconnected");
    }
  }

  /**
   * Check if printer is connected
   */
  isOnline(): boolean {
    return this.isConnected && !!this.socket && !this.socket.destroyed;
  }

  /**
   * Send raw buffer to printer
   */
  private async sendBuffer(data: Buffer): Promise<void> {
    if (!this.isOnline()) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not available"));
        return;
      }

      this.socket.write(data, (err) => {
        if (err) {
          console.error("[PRINTER] Write error:", err);
          this.isConnected = false;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Print text (untuk testing)
   */
  async printText(text: string): Promise<void> {
    const builder = new EscPosBuilder()
      .init()
      .setPrintMode()
      .setAlignment("center")
      .text(text)
      .lineFeed(3)
      .cut();

    await this.sendBuffer(builder.toBuffer());
    console.log("[PRINTER] Text printed");
  }

  /**
   * Print image dari URL
   * Untuk DHS RX 1: 2x6 = 384px width, 4x6 = 576px width @ 203 DPI
   */
  async printImage(options: PrintOptions): Promise<void> {
    const { imageUrl, quantity, size, orderId } = options;

    try {
      console.log(
        `[PRINTER] Starting print: Order=${orderId}, Size=${size}, Qty=${quantity}`
      );

      // Download dan convert image to bitmap
      const imageBuffer = await this.downloadImage(imageUrl);
      const bitmapData = await this.convertImageToThermalBitmap(imageBuffer, size);

      // Print multiple copies
      for (let i = 0; i < quantity; i++) {
        const builder = new EscPosBuilder()
          .init()
          .setPrintMode()
          .setPrintDensity(10) // Adjust for photo quality
          .printImage(bitmapData.data, bitmapData.width, bitmapData.height)
          .lineFeed(3)
          .cut();

        await this.sendBuffer(builder.toBuffer());
        console.log(`[PRINTER] Copy ${i + 1}/${quantity} printed`);

        // Delay between copies
        if (i < quantity - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log(`[PRINTER] Successfully printed order ${orderId}`);
    } catch (error) {
      console.error(`[PRINTER] Print failed for ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    // Check jika URL adalah file path lokal (untuk testing)
    if (url.startsWith("/")) {
      try {
        return fs.readFileSync(path.join(process.cwd(), "public", url));
      } catch (err) {
        console.warn("[PRINTER] Local file not found, will try URL fetch", err);
      }
    }

    // Fetch dari URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Convert image to thermal printer bitmap format
   * Returns buffer yang bisa dikirim ke printer dengan ESC * command
   */
  private async convertImageToThermalBitmap(
    imageBuffer: Buffer,
    size: "2x6" | "4x6"
  ): Promise<{ data: Buffer; width: number; height: number }> {
    // For now, return dummy data - ideally you'd use sharp or similar
    // to properly convert the image
    // DHS RX 1 specs:
    // - 2x6: 384px × 576px @ 203 DPI
    // - 4x6: 576px × 576px @ 203 DPI

    const width = size === "4x6" ? 576 : 384;
    const height = 576;

    // Simplified: create a bitmap buffer
    // In production, you'd:
    // 1. Load image with sharp
    // 2. Resize to width x height
    // 3. Convert to grayscale
    // 4. Dither to black & white
    // 5. Pack pixels into bytes (1-bit per pixel)

    const bytesPerLine = Math.ceil(width / 8);
    const totalBytes = bytesPerLine * height;

    // Create dummy black & white bitmap (for now)
    const bitmapData = Buffer.alloc(totalBytes, 0xff); // white background

    return {
      data: bitmapData,
      width: bytesPerLine,
      height,
    };
  }
}

/**
 * Singleton instance
 */
let printerInstance: ServerPrinterService | null = null;

export function getPrinterService(): ServerPrinterService {
  if (!printerInstance) {
    printerInstance = new ServerPrinterService();
  }
  return printerInstance;
}
