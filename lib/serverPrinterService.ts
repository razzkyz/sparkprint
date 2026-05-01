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
  size: "4x6";
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
      console.log("[PRINTER] Printer not online, attempting reconnection...");
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not available"));
        return;
      }

      // Set timeout for this write operation
      const writeTimeout = setTimeout(() => {
        this.isConnected = false;
        this.socket?.destroy();
        reject(new Error("Write timeout - printer may be offline"));
      }, 5000);

      this.socket.write(data, (err) => {
        clearTimeout(writeTimeout);
        
        if (err) {
          console.error("[PRINTER] Write error:", err);
          this.isConnected = false;
          reject(err);
        } else {
          console.log(`[PRINTER] Sent ${data.length} bytes`);
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
   * Untuk DHS RX 1: 4x6 = 576px width @ 203 DPI
   */
  async printImage(options: PrintOptions): Promise<void> {
    const { imageUrl, quantity, size, orderId } = options;

    try {
      console.log(
        `[PRINTER] Starting print: Order=${orderId}, Size=${size}, Qty=${quantity}, URL=${imageUrl}`
      );

      // Download dan convert image to bitmap
      const imageBuffer = await this.downloadImage(imageUrl);
      console.log(`[PRINTER] Downloaded image: ${imageBuffer.length} bytes`);

      const bitmapData = await this.convertImageToThermalBitmap(imageBuffer, size);
      console.log(
        `[PRINTER] Bitmap converted: ${bitmapData.data.length} bytes, ${bitmapData.width}x${bitmapData.height}`
      );

      // Print multiple copies
      for (let i = 0; i < quantity; i++) {
        try {
          const builder = new EscPosBuilder()
            .init()
            .setPrintMode()
            .setPrintDensity(10); // Adjust for photo quality

          // Print the image
          builder.printImage(bitmapData.data, bitmapData.width, bitmapData.height);

          // Add spacing and cut
          builder.lineFeed(3).cut();

          const printBuffer = builder.toBuffer();
          console.log(
            `[PRINTER] Sending ${printBuffer.length} bytes to printer (copy ${i + 1}/${quantity})`
          );

          await this.sendBuffer(printBuffer);
          console.log(`[PRINTER] Copy ${i + 1}/${quantity} sent successfully`);

          // Delay between copies
          if (i < quantity - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Increase delay
          }
        } catch (copyError) {
          console.error(`[PRINTER] Error printing copy ${i + 1}:`, copyError);
          throw copyError;
        }
      }

      console.log(`[PRINTER] ✅ Successfully printed order ${orderId}`);
    } catch (error) {
      console.error(`[PRINTER] ❌ Print failed for ${orderId}:`, error);
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
    size: "4x6"
  ): Promise<{ data: Buffer; width: number; height: number }> {
    // Dynamic import sharp (optional dependency)
    let sharp;
    try {
      sharp = require("sharp");
    } catch (e) {
      console.warn("[PRINTER] sharp not installed, using fallback");
      // Fallback: return basic bitmap
      return this.createFallbackBitmap(size);
    }

    try {
      // DHS RX 1 specs:
      // - 4x6: 576px width × 576px height @ 203 DPI
      const width = 576;
      const height = 576;

      // Step 1: Load image
      const image = sharp(imageBuffer);
      
      // Step 2: Get metadata
      const metadata = await image.metadata();
      console.log(`[PRINTER] Image size: ${metadata.width}x${metadata.height}`);

      // Step 3: Resize to printer dimensions (maintain aspect ratio, letterbox)
      const resized = await image
        .resize(width, height, {
          fit: "contain", // maintain aspect ratio
          background: { r: 255, g: 255, b: 255 }, // white background
        })
        .grayscale() // convert to grayscale
        .raw() // get raw pixel data
        .toBuffer({ resolveWithObject: true });

      const { data: pixelData, info } = resized;
      const { width: imgWidth, height: imgHeight, channels } = info;

      console.log(
        `[PRINTER] Resized to: ${imgWidth}x${imgHeight}, channels: ${channels}`
      );

      // Step 4: Dither & convert to 1-bit (black & white)
      const ditheredBitmap = this.ditherImage(pixelData, imgWidth, imgHeight);

      // Step 5: Pack into ESC/POS bitmap format
      // ESC * format: width in bytes, height in dots
      const bytesPerLine = Math.ceil(imgWidth / 8);
      console.log(`[PRINTER] Bitmap: ${bytesPerLine} bytes per line, ${imgHeight} lines`);

      return {
        data: ditheredBitmap,
        width: bytesPerLine,
        height: imgHeight,
      };
    } catch (error) {
      console.error("[PRINTER] Error converting image:", error);
      // Fallback ke basic bitmap kalau ada error
      return this.createFallbackBitmap(size);
    }
  }

  /**
   * Floyd-Steinberg dithering untuk convert grayscale ke 1-bit
   */
  private ditherImage(
    pixelData: Buffer,
    width: number,
    height: number
  ): Buffer {
    const bytesPerLine = Math.ceil(width / 8);
    const totalBytes = bytesPerLine * height;
    const bitmap = Buffer.alloc(totalBytes, 0);

    // Grayscale conversion (assume pixelData is already grayscale)
    const grayscale = Buffer.alloc(width * height);
    
    // If channels = 1 (already grayscale)
    if (pixelData.length === width * height) {
      pixelData.copy(grayscale);
    } else {
      // If channels > 1, convert to grayscale (R*0.299 + G*0.587 + B*0.114)
      for (let i = 0; i < width * height; i++) {
        const r = pixelData[i * 3] || 0;
        const g = pixelData[i * 3 + 1] || 0;
        const b = pixelData[i * 3 + 2] || 0;
        grayscale[i] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      }
    }

    // Floyd-Steinberg dithering
    const error = Buffer.alloc(width * height, 0);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const gray = grayscale[idx] + (error[idx] || 0);
        
        // Threshold at 128
        const bit = gray > 128 ? 1 : 0;
        
        // Set pixel in bitmap
        const byteIdx = y * bytesPerLine + Math.floor(x / 8);
        const bitPos = 7 - (x % 8);
        bitmap[byteIdx] |= (bit << bitPos);
        
        // Distribute error
        const err = gray - (bit ? 255 : 0);
        if (x + 1 < width) error[idx + 1] = (error[idx + 1] || 0) + (err * 7) / 16;
        if (y + 1 < height) {
          if (x - 1 >= 0) error[idx + width - 1] = (error[idx + width - 1] || 0) + (err * 3) / 16;
          error[idx + width] = (error[idx + width] || 0) + (err * 5) / 16;
          if (x + 1 < width) error[idx + width + 1] = (error[idx + width + 1] || 0) + (err * 1) / 16;
        }
      }
    }

    return bitmap;
  }

  /**
   * Fallback bitmap untuk testing (simple striped pattern)
   */
  private createFallbackBitmap(size: "4x6"): { data: Buffer; width: number; height: number } {
    const width = 576;
    const height = 576;
    const bytesPerLine = Math.ceil(width / 8);
    const totalBytes = bytesPerLine * height;

    // Create alternating pattern untuk test
    const bitmap = Buffer.alloc(totalBytes);
    for (let i = 0; i < totalBytes; i++) {
      bitmap[i] = i % 2 === 0 ? 0xaa : 0x55; // Alternating pattern
    }

    return {
      data: bitmap,
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
