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
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();

      console.log('✅ QZ Connected');
    }
  } catch (error) {
    console.error('❌ QZ Connection Error:', error);
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
    if (qz.websocket.isActive()) {
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
FUNGSI AUTO PRINT FOTO
========================================================
PARAMETER:
- imageUrl = link gambar hasil photobooth
- size = 4x6 atau 2x6
- copies = jumlah print

CONTOH:
await printPhoto(photoUrl, '4x6', 1);

========================================================
*/

export async function printPhoto(
  imageUrl: string,
  size: '4x6' | '2x6' = '4x6',
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
    DOWNLOAD & CONVERT IMAGE TO BASE64
    ============================================
    QZ Tray needs base64 data to avoid CORS issues
    ============================================
    */

    console.log(`[PRINT] Downloading image: ${imageUrl}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const blob = await response.blob();

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    console.log(`[PRINT] Image converted to base64, size: ${base64Data.length} chars`);

    /*
    ============================================
    SET UKURAN PRINT
    ============================================
    */

    let dimensions;

    if (size === '2x6') {
      dimensions = {
        width: 2,
        height: 6
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
      size: dimensions,
      units: 'in',
      copies,
      scaling: 'fill' // Full photo without border
    });

    /*
    ============================================
    DATA GAMBAR YANG AKAN DIPRINT
    ============================================
    */

    const data = [
      {
        type: 'image',
        format: 'base64',
        data: base64Data
      }
    ];

    /*
    ============================================
    PRINT
    ============================================
    */

    await (qz as any).print(config, data);

    console.log(`✅ PRINT SUCCESS (${size})`);
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

    const size = order.print_size || '4x6';

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

    await printPhoto(photoUrl, size, qty);

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
