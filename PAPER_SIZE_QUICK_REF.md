# 🚀 Paper Size Implementation - Quick Reference

## What Changed?

✅ **Print system now supports 3 paper sizes:**
- **2R** (2"×6") - Strip/carousel photos
- **4R** (3.94"×5.91") - Standard landscape  
- **4x6** (4"×6") - Standard portrait (default)

✅ **Images automatically resize** based on order size  
✅ **No cropping** - Full image always visible with white background  
✅ **Server & client** print fully support all sizes  

---

## 📂 Files Updated

| File | Changes |
|------|---------|
| `lib/printService.ts` | Type: `"2R" \| "4R" \| "4x6"`, getPrintDimensions() now accepts size |
| `lib/autoPrintService.ts` | OrderToPrint type updated for all sizes |
| `lib/serverPrinterService.ts` | convertImageToThermalBitmap() handles all sizes |
| `lib/canvasPrintRenderer.ts` | getPrintDimensions() & getQZTrayConfig() support sizes |
| **NEW:** `lib/paperSizeUtils.ts` | Helper utilities for size management |
| **NEW:** `PAPER_SIZE_AUTO_SIZING.md` | Full documentation |

---

## 🔧 Using in Code

### Option 1: Direct Import (Recommended)

```typescript
import { PaperSize, isValidPaperSize, formatSize } from '@/lib/paperSizeUtils';
import { autoPrintOrder } from '@/lib/autoPrintService';

// Validate size
if (isValidPaperSize(userInput)) {
  const size: PaperSize = userInput; // "2R" | "4R" | "4x6"
  console.log(`Size: ${formatSize(size)}`);
}

// Auto-print with correct size
await autoPrintOrder(orderId);
// Size automatically read from database
```

### Option 2: Size Selection UI

```typescript
import { getAllPaperSizes, getSizeLabel, getOrientation } from '@/lib/paperSizeUtils';

export function PaperSizeSelector() {
  const sizes = getAllPaperSizes();
  
  return (
    <select defaultValue="4x6">
      {sizes.map(size => (
        <option key={size.id} value={size.id}>
          {size.name} - {size.description}
        </option>
      ))}
    </select>
  );
}
```

### Option 3: Get Size Info

```typescript
import { getPaperSizeInfo, getScaleFactor } from '@/lib/paperSizeUtils';

const size2R = getPaperSizeInfo("2R");
console.log(size2R.inches);  // { width: 2, height: 6 }
console.log(size2R.pixels);   // { width: 600, height: 1800 }

const factor = getScaleFactor("4x6", "2R");
console.log(factor); // Area multiplier
```

---

## 📡 Database Updates

### When Creating Order:
```sql
INSERT INTO print_orders (
  id, 
  customer_name, 
  image_urls, 
  size,           -- ← Add size: '2R', '4R', or '4x6'
  qty,
  amount,
  status
) VALUES (
  gen_random_uuid(),
  'John Doe',
  '["https://...photo.jpg"]',
  '4x6',          -- ← Paper size
  2,
  150000,
  'PENDING'
);
```

### When Updating Order:
```sql
UPDATE print_orders
SET size = '2R'  -- Change to desired size
WHERE id = 'order-uuid';
```

### Current Schema:
```sql
CREATE TABLE print_orders (
  size TEXT NOT NULL DEFAULT '4x6',  -- Single size per order
  photo_sizes TEXT[],                 -- (Future) Array of sizes
  -- ... other fields
);
```

---

## 🖨️ API Endpoints

### Check Paper Sizes (optional endpoint)
```typescript
// GET /api/sizes
// Returns available paper sizes with info
[
  {
    id: "2R",
    name: "2R Strip",
    inches: { width: 2, height: 6 },
    pixels: { width: 600, height: 1800 }
  },
  // ... more sizes
]
```

### Print Order with Size
```typescript
// POST /api/print-orders/[id]/print
await printService.printImage({
  imageUrl: "https://...",
  quantity: 1,
  size: "4x6",  // ← Paper size
  orderId: "order-id"
});
```

---

## 🎯 Common Use Cases

### Photobooth Strip (2R)
```typescript
const order = {
  size: "2R",      // 2"×6" portrait strip
  image_urls: ["photobooth_4pose.jpg"],
  qty: 2
};
// Image auto-resizes to 600×1800px
```

### Instagram Print (4R)
```typescript
const order = {
  size: "4R",      // 10×15cm landscape
  image_urls: ["instagram_photo.jpg"],
  qty: 1
};
// Image auto-resizes to 1182×1773px
```

### Classic 4×6 (4x6)
```typescript
const order = {
  size: "4x6",     // 4"×6" portrait
  image_urls: ["family_photo.jpg"],
  qty: 5
};
// Image auto-resizes to 1200×1800px (DEFAULT)
```

---

## 🧪 Testing

### Test Image Resizing
```typescript
import { renderImageToCanvas } from '@/lib/canvasPrintRenderer';

// Test 4x6
const canvas4x6 = await renderImageToCanvas(imageUrl, {
  paperSize: "4x6"
});

// Test 2R
const canvas2R = await renderImageToCanvas(imageUrl, {
  paperSize: "2R"
});

// Test 4R
const canvas4R = await renderImageToCanvas(imageUrl, {
  paperSize: "4R"
});
```

### Test Server Printer
```typescript
import { getPrinterService } from '@/lib/serverPrinterService';

const printer = getPrinterService();
await printer.printImage({
  imageUrl: "test_image.jpg",
  quantity: 1,
  size: "4x6"  // Will auto-resize
});
```

---

## 📊 Size Comparison

```
┌─────────────────────────────────────────────────────────────┐
│  2R STRIP              4R                    4x6 PORTRAIT    │
│  ────────────────      ────────────────      ────────────────│
│  │    Width 2"    │    │ Width 3.94"  │    │  Width 4"  │   │
│  │               │    │             │    │            │   │
│  │               │    │             │    │            │   │
│  │H 6"           │    │ H 5.91"     │    │ H 6"       │   │
│  │               │    │             │    │            │   │
│  │               │    │             │    │            │   │
│  │               │    │             │    │            │   │
│  └───────────────┘    └─────────────┘    └────────────┘   │
│  Aspect: 1:3           Aspect: ~1:1.5     Aspect: 2:3     │
│  Pixels: 600×1800      Pixels: 1182×1773  Pixels: 1200×1800│
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | 2R | 4R | 4x6 |
|---------|----|----|-----|
| Auto-resize | ✅ | ✅ | ✅ |
| No cropping | ✅ | ✅ | ✅ |
| White background | ✅ | ✅ | ✅ |
| 300 DPI quality | ✅ | ✅ | ✅ |
| Server print | ✅ | ✅ | ✅ |
| QZ Tray client | ✅ | ✅ | ✅ |
| Thermal printer | ✅ | ✅ | ✅ |

---

## 🐛 Debugging

### Check Size in Logs
```
[PRINTER] Converting image for 4x6 (816x1224px @ 203DPI)
[CANVAS] Rendered 1200x1800px (CONTAIN MODE)
[AUTO-PRINT] Size: 4x6 | Qty: 2
```

### Validate Size Type
```typescript
import { isValidPaperSize } from '@/lib/paperSizeUtils';

const size = getUserInput();
if (!isValidPaperSize(size)) {
  console.error(`Invalid size: ${size}`);
  return; // Use default
}
```

---

## 🔄 Migration Path

### Step 1: Update existing orders
```sql
-- Ensure all orders have a size
UPDATE print_orders 
SET size = '4x6' 
WHERE size IS NULL;
```

### Step 2: Add to order form
- Add size selector to checkout UI
- Save size when creating order

### Step 3: Test each size
- Print 2R sample
- Print 4R sample
- Print 4x6 sample

### Step 4: Deploy
- Deploy code changes
- Update database schema if needed
- Monitor print logs for success

---

## 📚 References

- Full docs: [`PAPER_SIZE_AUTO_SIZING.md`](./PAPER_SIZE_AUTO_SIZING.md)
- Utilities: [`lib/paperSizeUtils.ts`](./lib/paperSizeUtils.ts)
- Canvas renderer: [`lib/canvasPrintRenderer.ts`](./lib/canvasPrintRenderer.ts)
- Print service: [`lib/printService.ts`](./lib/printService.ts)

---

**Generated:** 2026-05-04  
**Status:** ✅ Ready for production
