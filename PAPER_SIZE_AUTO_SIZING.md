# 📄 Paper Size Auto-Sizing Guide

## Overview
Sistem print telah diupdate untuk **otomatis menyesuaikan ukuran gambar** sesuai dengan ukuran kertas yang dipilih. Tidak perlu manual resize lagi!

---

## ✅ Supported Paper Sizes

| Size | Dimensions | Use Case | Pixels @ 300 DPI |
|------|------------|----------|------------------|
| **2R** | 2" × 6" | Strip/carousel photos | 600 × 1800px |
| **4R** | 3.94" × 5.91" (10×15cm) | Standard landscape | 1182 × 1773px |
| **4x6** | 4" × 6" | Standard portrait | 1200 × 1800px |

---

## 🔧 How It Works

### 1. **Image Processing Flow**
```
Order dengan size -> Print Service -> Canvas Renderer -> Printer
                                       ↓
                            Otomatis resize ke:
                            - Width: sesuai ukuran kertas
                            - Height: sesuai ukuran kertas
                            - Maintain aspect ratio (contain mode)
                            - White background jika perlu
```

### 2. **Automatic Sizing**
- **Contain Mode**: Full image visible, tidak ada cropping
- **Center**: Gambar centered dengan white background
- **Quality**: 300 DPI untuk foto berkualitas tinggi

### 3. **Server-side Processing**
- Menggunakan `sharp` library untuk fast image processing
- Fallback ke basic bitmap jika sharp tidak tersedia
- Floyd-Steinberg dithering untuk 1-bit conversion

---

## 💾 Database Schema

Table `print_orders` mendukung:

```sql
-- Ukuran kertas (pilih salah satu: '2R', '4R', '4x6')
size TEXT NOT NULL DEFAULT '4x6'

-- Array ukuran untuk multiple photos (opsional)
photo_sizes TEXT[] -- ['2R', '4R', '4x6']
```

---

## 🚀 Usage Examples

### Contoh 1: Order dengan 4x6 paper
```typescript
const order = {
  id: "order-123",
  image_urls: ["https://...photo1.jpg"],
  size: "4x6",  // ← Auto-size ke 4x6
  qty: 2,
  customer_name: "John"
};

await autoPrintOrder(order.id);
// Gambar otomatis resize ke 1200×1800px
```

### Contoh 2: Order dengan 2R strip
```typescript
const order = {
  id: "order-456",
  image_urls: ["https://...photo_strip.jpg"],
  size: "2R",  // ← Auto-size ke 2x6
  qty: 1,
  customer_name: "Jane"
};

await autoPrintOrder(order.id);
// Gambar otomatis resize ke 600×1800px (portrait strip)
```

### Contoh 3: Multiple photos dengan sizes berbeda (future)
```typescript
const order = {
  id: "order-789",
  image_urls: [
    "https://...photo1.jpg",
    "https://...photo2.jpg"
  ],
  photo_sizes: ["4x6", "2R"],  // Setiap photo beda ukuran
  qty: 1,
  customer_name: "Alex"
};
```

---

## 🎯 Implementation Details

### File Changes:
1. **`lib/printService.ts`**
   - Updated `PrintSize` type: `"2R" | "4R" | "4x6"`
   - Enhanced `getPrintDimensions()` to accept size parameter

2. **`lib/autoPrintService.ts`**
   - Updated `OrderToPrint` interface to support all sizes
   - Passes correct size to print services

3. **`lib/serverPrinterService.ts`**
   - Updated `convertImageToThermalBitmap()` for all sizes
   - Calculates correct pixel dimensions per size:
     - 2R: 406×1218px @ 203 DPI
     - 4R: ~800×1200px @ 203 DPI
     - 4x6: ~816×1224px @ 203 DPI

4. **`lib/canvasPrintRenderer.ts`**
   - Enhanced `getPrintDimensions()` to accept size parameter
   - Updated `getQZTrayConfig()` for size support
   - Maintains existing contain-mode rendering logic

---

## 🖨️ Print Quality Settings

### Recommended Quality Settings:

```typescript
// Canvas Renderer (client-side)
const config: CanvasRenderConfig = {
  paperSize: "4x6",        // Paper size
  quality: 1.0,            // JPEG quality (0-1)
  smoothing: true,         // Image smoothing
  smoothingQuality: "high" // low | medium | high
};

// QZ Tray Config
getQZTrayConfig(printer, "4x6") // Auto-configures for size

// Server Printer Config
convertImageToThermalBitmap(imageBuffer, "4x6") // Auto-resizes
```

---

## 📊 Size Selection Logic

### How to Select Size for Customer:

1. **2R Strip**: Untuk photobooth 4-pose strips
   - Ukuran: 2 inches wide (portrait)
   - Cocok untuk: Polaroid-style, event photos

2. **4R**: Untuk standard photo printing
   - Ukuran: 10×15cm (landscape)
   - Cocok untuk: Snapshot, social media

3. **4x6**: Default size
   - Ukuran: 4×6 inches (portrait)
   - Cocok untuk: Wedding, portrait, studio

---

## 🔍 Troubleshooting

### Image comes out wrong size?
- Check `size` field in database order
- Verify image aspect ratio
- Check printer configuration

### Cropping issues?
- System uses **contain mode** (no cropping)
- White background added if needed
- Aspect ratio always maintained

### Print quality low?
- Verify image source quality
- Check `smoothingQuality: "high"`
- Ensure JPEG quality at 1.0

---

## 📝 Logging

Semua sizing operations di-log untuk debugging:

```
[PRINTER] Converting image for 4x6 (816x1224px @ 203DPI)
[PRINTER] Original image size: 3000x2000
[PRINTER] Resized to: 816x1224, channels: 1
[CANVAS] Rendered 1200x1800px (CONTAIN MODE)
```

---

## ✨ Benefits

✅ **No Manual Resizing** - Image auto-sized based on paper  
✅ **Quality Preserved** - 300 DPI maintain quality  
✅ **No Cropping** - Full image always visible  
✅ **Centered Layout** - Professional appearance  
✅ **Multi-size Support** - One system handles all sizes  
✅ **Automatic** - Webhook triggers auto-print dengan correct size  

---

## 🚧 Future Enhancements

- [ ] Multiple photos with different sizes per order
- [ ] Custom size selection UI
- [ ] Size recommendations based on image aspect ratio
- [ ] Batch printing with mixed sizes
- [ ] Size templates for events

---

## ❓ FAQ

**Q: Berapa DPI yang digunakan?**  
A: 300 DPI untuk file (canvas), 203 DPI untuk printer thermal  

**Q: Gambar akan di-crop?**  
A: Tidak. System menggunakan contain mode - full image selalu visible  

**Q: Bisa pilih size saat order?**  
A: Ya. Ubah field `size` di database ke "2R", "4R", atau "4x6"  

**Q: Support size lain?**  
A: Mudah ditambah. Tambah entry ke PAPER_SIZES di canvasPrintRenderer.ts  

---

Generated: 2026-05-04  
Last Updated: Latest multi-size implementation
