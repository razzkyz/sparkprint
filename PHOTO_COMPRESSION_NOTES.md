# 📊 COMPRESSION ESTIMATE

**Saat upload 3 foto dengan compression aggressive:**

## Per Photo:
- **Original:** ~5MB (typical phone photo)
- **After compression (quality 0.6):** ~400-600KB
- **WebP format benefit:** -30-40% vs JPEG

## Example untuk 3 foto:
```
Foto 1: 5MB → 450KB (compressed)
Foto 2: 5MB → 480KB (compressed)  
Foto 3: 5MB → 520KB (compressed)
────────────────────
Total: ~1.5MB FormData payload
```

**Max limit upload Next.js/Vercel:** 4.5MB ✅
**Typical payload dengan 3 foto:** ~1.5MB ✅
**Safety margin:** 3MB ✅

---

## 🔧 Compression Settings:
```javascript
canvas.toBlob(
  callback,
  "image/webp",  // Format kecil
  0.6            // Quality aggressive
)
```

| Quality | Size | Quality Visual |
|---------|------|----------------|
| 0.9 | 2.5MB | Excellent |
| 0.7 | 1.2MB | Very Good |
| 0.6 | 0.9MB | Good ✅ |
| 0.4 | 0.6MB | Fair |

**0.6 recommended** = Best balance antara size & quality

---

## ✅ Error 413 Prevention:

### Sebelumnya (1 foto):
```
5MB × 1 = 5MB → Payload ~5MB (borderline)
```

### Sekarang (3 foto optimal):
```
(5MB × 3) compressed = ~1.5MB → Payload ~2MB ✅
Safe dari error 413!
```

---

## 📌 Testing Checklist:

- [ ] Upload 1 foto - should work ✅
- [ ] Upload 2 foto - should work ✅
- [ ] Upload 3 foto - should work ✅
- [ ] Upload 4 foto - should error "max 3" ✅
- [ ] Check admin: photo_sizes show untuk setiap foto
- [ ] Print: sesuai ukuran masing-masing foto

