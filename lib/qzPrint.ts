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
        // Auto-detect orientation from image
        const imgAspect = img.width / img.height;
        const isImgLandscape = imgAspect > 1;

        // Target dimensions in pixels at 300 DPI
        // Portrait: 4x6 = 1200x1800px
        // Landscape: 6x4 = 1800x1200px
        let targetWidth, targetHeight;

        // Auto-rotate: if image is landscape and orientation is portrait, switch to landscape
        if (orientation === 'portrait' && isImgLandscape) {
          console.log(`[RESIZE] Auto-rotating to landscape based on image aspect ratio`);
          targetWidth = 1800;
          targetHeight = 1200;
        } else if (orientation === 'landscape' && !isImgLandscape) {
          console.log(`[RESIZE] Auto-rotating to portrait based on image aspect ratio`);
          targetWidth = 1200;
          targetHeight = 1800;
        } else {
          // Use specified orientation
          if (orientation === 'landscape') {
            targetWidth = 1800;
            targetHeight = 1200;
          } else {
            targetWidth = 1200;
            targetHeight = 1800;
          }
        }

        console.log(`[RESIZE] Target: ${targetWidth}x${targetHeight}px, Original: ${img.width}x${img.height}`);

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // High quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // CONTAIN MODE: Fit image within canvas without cropping
        // Logic: Portrait → fit based on height, Landscape → fit based on width
        const targetAspect = targetWidth / targetHeight;

        let drawWidth, drawHeight, drawX, drawY;

        if (orientation === 'portrait') {
          // Portrait: fit based on height
          drawHeight = targetHeight;
          drawWidth = targetHeight * imgAspect;
          drawX = (targetWidth - drawWidth) / 2;
          drawY = 0;
        } else {
          // Landscape: fit based on width
          drawWidth = targetWidth;
          drawHeight = targetWidth / imgAspect;
          drawX = 0;
          drawY = (targetHeight - drawHeight) / 2;
        }

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Draw image centered (contain mode - no crop, no stretch)
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Export to base64 with high quality
        const base64 = canvas.toDataURL('image/jpeg', 0.98);
        console.log(`[RESIZE] Image fitted to ${targetWidth}x${targetHeight}px (contain mode, no crop), original: ${img.width}x${img.height}`);
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

    console.log(`[PRINT] Resizing image for ${orientation} print: ${imageUrl}`);
    const imageData = await resizeImageForPrint(imageUrl, orientation);

    /*
    ============================================
    SET UKURAN PRINT (INCHES + DPI)
    ============================================
    */

    const dpi = 300; // DPI for photo quality
    let dimensions;

    if (orientation === 'landscape') {
      dimensions = {
        width: 6,
        height: 4
      };
    } else {
      dimensions = {
        width: 4,
        height: 6
      };
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
