# 📊 HIGH QUALITY IMAGE OPTIMIZATION FOR PRINT

**Updated: Use HIGH quality (JPEG 0.95) instead of aggressive WebP compression**

## Per Photo Optimization:
- **Original:** ~5MB (typical phone photo)
- **After optimization (quality 0.95 JPEG):** ~1.2-2MB
- **Max resize:** 2000x2400px (suitable for all paper sizes)

## Paper Sizes @ 300 DPI:
- **2R** (2"×6"): 600×1800px
- **4R** (3.94"×5.91"): 1182×1773px
- **4x6** (4"×6"): 1200×1800px

## Example untuk 3 foto dengan HIGH quality:
```
Foto 1: 5MB → 1.5MB (HIGH quality)
Foto 2: 5MB → 1.6MB (HIGH quality)  
Foto 3: 5MB → 1.4MB (HIGH quality)
────────────────────
Total: ~4.5MB FormData payload
```

**Max limit upload Next.js/Vercel:** 4.5MB ⚠️ (might need increase for 3 photos)
**Typical payload dengan 3 foto:** ~4.5MB (borderline)
**Recommended:** Consider increasing limit or optimize further if needed

---

## 🔧 Optimization Settings:
```javascript
canvas.toBlob(
  callback,
  "image/jpeg",     // High quality format
  0.95              // HIGH quality (not aggressive)
)
```

| Format | Quality | Visual Quality | File Size | Usage |
|--------|---------|---|---|---|
| JPEG | 0.95 | Excellent (print-ready) | ~1.5MB | ✅ Upload |
| JPEG | 0.85 | Very Good | ~1MB | - |
| WebP | 0.85 | Good but blurry | ~0.9MB | ❌ Avoid |
| WebP | 0.6 | Fair/Blurry | ~0.6MB | ❌ DO NOT USE |

**0.95 JPEG recommended** = Best quality for print without extreme file sizes

---

## ✅ Canvas Optimization:

```javascript
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;          // ✅ Enable smoothing
ctx.imageSmoothingQuality = "high";        // ✅ Use high quality
ctx.drawImage(img, 0, 0, width, height);   // Draw with smoothing
```

---

## 📌 Testing Checklist:

- [ ] Upload 1 foto - check no blur ✅
- [ ] Upload 2 foto - check no blur ✅
- [ ] Upload 3 foto - may need to increase upload limit
- [ ] Check print quality - should be crisp
- [ ] Verify file sizes in console - should be ~1.5-2MB per photo



