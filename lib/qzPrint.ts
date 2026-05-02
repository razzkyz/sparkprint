/*
========================================================
QZ TRAY + DS-RX1 AUTO PRINT SYSTEM
UNTUK WEBSITE ONLINE print.sparkstage55.com
========================================================

FUNGSI:
- Connect otomatis ke QZ Tray
- Detect printer DS-RX1
- Auto print 4x6
- Auto print 2x6
- Trigger print setelah payment sukses
- Reconnect otomatis jika QZ disconnect

CARA PAKAI:
1. npm install qz-tray
2. Install QZ Tray di PC printer
3. Jalankan QZ Tray
4. Tambahkan domain:
   https://print.sparkstage55.com

   di:
   QZ Tray → Advanced → Site Manager

5. Import file ini ke project React/Vite kamu

========================================================
*/

import qz from 'qz-tray';
import { renderPhotobooth4Pose, type PaperSize as CanvasPaperSize } from './canvasPrintRenderer';

// Re-export PaperSize for convenience
export type PaperSize = CanvasPaperSize;

/*
========================================================
SETTING DEFAULT
========================================================
*/

const PRINTER_NAME = 'DS-RX1';

/*
========================================================
FUNGSI CONNECT KE QZ TRAY
========================================================
Fungsi ini untuk connect website ke aplikasi QZ Tray
yang ada di PC printer
========================================================
*/

export async function connectQZ() {
  try {
    console.log('[QZ] Starting connection...');

    // Set promise type only (QZ Tray uses built-in WebSocket)
    (qz.api as any).setPromiseType(function promise(resolver: any) {
      return new Promise(resolver);
    });

    console.log('[QZ] Promise type set');

    // Cek connection status
    const isActive = (qz.websocket as any).isActive();
    console.log('[QZ] Connection active:', isActive);

    if (isActive) {
      console.log('✅ QZ Already connected');
      return;
    }

    // Connect
    console.log('[QZ] Connecting to QZ Tray...');
    await (qz.websocket as any).connect();

    // Wait for stabilization
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('✅ QZ Connected');
  } catch (error) {
    console.error('❌ QZ Connection Error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

/*
========================================================
FUNGSI DISCONNECT QZ
========================================================
Optional
Dipakai jika ingin disconnect manual
========================================================
*/

export async function disconnectQZ() {
  try {
    if ((qz.websocket as any).isActive()) {
      await qz.websocket.disconnect();
      console.log('🔌 QZ Disconnected');
    }
  } catch (error) {
    console.error(error);
  }
}

/*
========================================================
FUNGSI CEK PRINTER
========================================================
Untuk melihat printer yang terbaca QZ Tray
========================================================
*/

export async function checkPrinters() {
  try {
    await connectQZ();

    const printers = await qz.printers.find();

    console.log('🖨️ Available Printers:', printers);

    return printers;
  } catch (error) {
    console.error(error);
  }
}

/*
========================================================
FUNGSI RESIZE GAMBAR KE UKURAN PRINT
========================================================
Resize gambar ke resolusi yang tepat untuk kertas 4x6
dengan proper aspect ratio handling (cover mode)
Mendukung orientation: portrait (4x6) atau landscape (6x4)
========================================================
*/

export type PrintOrientation = 'portrait' | 'landscape';

async function resizeImageForPrint(imageUrl: string, orientation: PrintOrientation = 'portrait'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // FORCE LANDSCAPE ONLY: Always use 1800x1200px (4x6 landscape @ 300 DPI)
        const targetWidth = 1800;
        const targetHeight = 1200;

        console.log(`[RESIZE] FORCED LANDSCAPE: ${targetWidth}x${targetHeight}px, Original: ${img.width}x${img.height}`);

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Maximum quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // STRETCH MODE: Force image to fill entire canvas (no white space, may distort aspect ratio)
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Export to base64 with MAXIMUM quality (1.0)
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        console.log(`[RESIZE] Image cropped to ${targetWidth}x${targetHeight}px (cover mode, full bleed), original: ${img.width}x${img.height}`);
        resolve(base64);
      } catch (error) {
        console.error('[RESIZE] Error:', error);
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = imageUrl;
  });
}

/*
========================================================
FUNGSI AUTO PRINT FOTO
========================================================
PARAMETER:
- imageUrl = link gambar hasil photobooth
- orientation = portrait (4x6) atau landscape (6x4)
- copies = jumlah print

CONTOH:
await printPhoto(photoUrl, 'portrait', 1);

========================================================
*/

export async function printPhoto(
  imageUrl: string,
  orientation: PrintOrientation = 'portrait',
  copies: number = 1
) {
  try {
    /*
    ============================================
    AUTO CONNECT
    ============================================
    */

    await connectQZ();

    /*
    ============================================
    RESIZE IMAGE TO PROPER DIMENSIONS
    ============================================
    Resize ke resolusi yang tepat untuk kertas (cover mode)
    ============================================
    */

    console.log(`[PRINT] Resizing image for landscape print: ${imageUrl}`);
    const imageData = await resizeImageForPrint(imageUrl, orientation);

    /*
    ============================================
    SET UKURAN PRINT (INCHES + DPI)
    ============================================
    FORCE LANDSCAPE: Always 6x4 inches
    */

    const dpi = 300; // DPI for photo quality
    const dimensions = {
      width: 6,
      height: 4
    };

    /*
    ============================================
    CONFIG PRINTER
    ============================================
    Disable printer scaling to print exact canvas size
    */

    const config = (qz.configs as any).create(PRINTER_NAME, {
      size: { width: dimensions.width, height: dimensions.height },
      units: 'in',
      density: dpi,
      margins: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    /*
    ============================================
    DATA GAMBAR YANG AKAN DIPRINT
    ============================================
    */

    const printData = [
      {
        type: 'pixel',
        format: 'image',
        data: imageData,
      },
    ] as any;

    /*
    ============================================
    PRINT
    ============================================
    */

    console.log(`[PRINT] Printing with dimensions: ${dimensions.width}x${dimensions.height}in at ${dpi} DPI`);

    // Print multiple copies
    for (let i = 0; i < copies; i++) {
      try {
        await (qz as any).print(config, printData);
        console.log(`[PRINT] Printed copy ${i + 1}/${copies}`);

        // Small delay between copies
        if (i < copies - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (copyError) {
        console.error(`[PRINT] Error printing copy ${i + 1}:`, copyError);
        throw copyError;
      }
    }

    console.log(`✅ PRINT SUCCESS (${orientation})`);
  } catch (error) {
    console.error('❌ PRINT ERROR:', error);
    throw error;
  }
}

/*
========================================================
FUNGSI PRINT PHOTOBOOTH 4 POSE
========================================================
PARAMETER:
- imageUrls = array 4 URL gambar
- paperSize = '4x6' | '4R' | 'A4'
- copies = jumlah print

CONTOH:
await printPhotobooth4Pose([url1, url2, url3, url4], '4R', 1);

========================================================
*/

export async function printPhotobooth4Pose(
  imageUrls: string[],
  paperSize: PaperSize = '4x6',
  copies: number = 1
) {
  try {
    if (imageUrls.length !== 4) {
      throw new Error('Photobooth requires exactly 4 images');
    }

    /*
    ============================================
    AUTO CONNECT
    ============================================
    */

    await connectQZ();

    /*
    ============================================
    RENDER 4-POSE LAYOUT WITH SMART ADAPTIVE FIT
    ============================================
    */

    console.log(`[PHOTOBOOTH] Rendering 4-pose layout (${paperSize})...`);
    const imageData = await renderPhotobooth4Pose(imageUrls, { paperSize });

    /*
    ============================================
    SET UKURAN PRINT (INCHES + DPI)
    ============================================
    */

    const dpi = 300; // DPI for photo quality
    let dimensions;

    // Convert paper size to inches
    if (paperSize === '4R') {
      dimensions = { width: 4.02, height: 5.98 }; // 10.2 x 15.2 cm
    } else if (paperSize === 'A4') {
      dimensions = { width: 8.27, height: 11.69 }; // 21 x 29.7 cm
    } else {
      dimensions = { width: 6, height: 4 }; // 4x6 inches
    }

    /*
    ============================================
    CONFIG PRINTER
    ============================================
    */

    const config = (qz.configs as any).create(PRINTER_NAME, {
      size: { width: dimensions.width, height: dimensions.height },
      units: 'in',
      density: dpi,
      margins: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    });

    /*
    ============================================
    DATA GAMBAR YANG AKAN DIPRINT
    ============================================
    */

    const printData = [
      {
        type: 'pixel',
        format: 'image',
        data: imageData,
      },
    ] as any;

    /*
    ============================================
    PRINT
    ============================================
    */

    console.log(`[PHOTOBOOTH] Printing 4-pose layout: ${dimensions.width}x${dimensions.height}in at ${dpi} DPI`);

    // Print multiple copies
    for (let i = 0; i < copies; i++) {
      try {
        await (qz as any).print(config, printData);
        console.log(`[PHOTOBOOTH] Printed copy ${i + 1}/${copies}`);

        // Small delay between copies
        if (i < copies - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (copyError) {
        console.error(`[PHOTOBOOTH] Error printing copy ${i + 1}:`, copyError);
        throw copyError;
      }
    }

    console.log(`✅ PHOTOBOOTH PRINT SUCCESS`);
  } catch (error) {
    console.error('❌ PHOTOBOOTH PRINT ERROR:', error);
    throw error;
  }
}

/*
========================================================
FUNGSI AUTO PRINT BERDASARKAN ORDER
========================================================
Fungsi ini cocok untuk payment webhook / realtime
========================================================

CONTOH DATA ORDER:

const order = {
  payment_status: 'PAID',
  print_size: '2x6',
  photo_url: 'https://website.com/photo.jpg',
  qty: 2
};

========================================================
*/

export async function handlePaidOrder(order: any) {
  try {
    /*
    ============================================
    CEK STATUS PAYMENT
    ============================================
    */

    if (order.payment_status !== 'PAID') {
      console.log('⏳ Waiting payment...');

      return;
    }

    /*
    ============================================
    AMBIL DATA ORDER
    ============================================
    */

    const photoUrl = order.photo_url;

    const qty = order.qty || 1;

    /*
    ============================================
    VALIDASI FOTO
    ============================================
    */

    if (!photoUrl) {
      console.error('❌ Photo URL kosong');

      return;
    }

    /*
    ============================================
    AUTO PRINT
    ============================================
    */

    await printPhoto(photoUrl, qty);

    console.log('🎉 ORDER PRINTED');
  } catch (error) {
    console.error(error);
  }
}

/*
========================================================
FUNGSI AUTO RECONNECT
========================================================
Jika QZ disconnect maka otomatis connect lagi
========================================================
*/

export function startQZAutoReconnect() {
  setInterval(async () => {
    try {
      if (!(qz.websocket as any).isActive()) {
        console.log('🔄 Reconnecting QZ...');

        await qz.websocket.connect();

        console.log('✅ QZ Reconnected');
      }
    } catch (error) {
      console.error(error);
    }
  }, 5000);
}
