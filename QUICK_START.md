# 🚀 Quick Start - Auto-Print

## TL;DR Setup (5 Minutes)

### Step 1: Install Library
```bash
npm install
```

### Step 2: Setup QZ Tray (di device dengan printer)
1. Download dari https://qz.io/download/
2. Install & jalankan QZ Tray
3. Leave it running di background

### Step 3: Test Printer Connection
```bash
# Ganti localhost dengan device IP jika remote
curl -H "x-admin-password: YOUR_ADMIN_PASSWORD" \
  http://localhost:3000/api/admin/printer-status
```

Expected response:
```json
{
  "printer": {
    "connected": true,
    "printers": ["DHS RX 1"]
  }
}
```

### Step 4: Done! ✅
- Auto-print otomatis jalan saat pembayaran
- Admin bisa manual print dari panel
- Check `/api/admin/printer-status` anytime

---

## Understanding Untuk Anda

### Q: Apakah laptop dan printer bisa jadi satu device?
**A**: Ya! Jika printer sudah terhubung ke PC/laptop:
- Saat ini: bisa pakai laptop untuk testing
- Production: pindahkan semua code ke PC/laptop dengan printer
- QZ Tray harus running di device yang punya printer

### Q: Bagaimana cara deploy ke device?
**A**: Ada di `AUTO_PRINT_SETUP.md` - bagian "Deployment ke Device dengan Printer"

### Q: Kapan print otomatis trigger?
**A**: Langsung saat pembayaran berhasil (PAID status):
- Doku: Webhook dari Doku (coming soon)
- Tunai: Saat admin klik "Mark as Paid"

### Q: Bisa manual print ulang?
**A**: Ya! Gunakan endpoint `/api/admin/manual-print` (documented di setup guide)

---

## File Structure

```
app/
  api/
    admin/
      mark-paid/
        route.ts              ← Updated: trigger auto-print
      manual-print/
        route.ts              ← NEW: manual print trigger
      printer-status/
        route.ts              ← NEW: check printer status
    doku/
      webhook/
        route.ts              ← TODO: auto-print on Doku payment

lib/
  printService.ts             ← Updated: image resizing
  autoPrintService.ts         ← NEW: auto-print logic
  
AUTO_PRINT_SETUP.md          ← Full documentation
QUICK_START.md               ← This file
```

---

## Checklist Sebelum Production

- [ ] `npm install` sudah dijalankan
- [ ] QZ Tray installed di device dengan printer
- [ ] Test printer connection dengan `/api/admin/printer-status`
- [ ] Create test order dan verify auto-print works
- [ ] Setup HTTPS jika pakai domain (QZ Tray requirement)
- [ ] Move code ke device dengan printer
- [ ] Setup environment variables di device
- [ ] Test QRIS payment flow (end-to-end)
- [ ] Test Cashier payment flow (mark-paid)

---

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| "QZ Tray not connected" | Start QZ Tray application |
| "No printers found" | Add DHS RX 1 ke Windows Printers |
| Print blurry | Check image quality, adjust DPI |
| Auto-print tidak trigger | Check webhook logs, verify Doku webhook configuration |
| Print upside down | Rotate image di printService.ts |

---

## Need More Help?

See `AUTO_PRINT_SETUP.md` for:
- Detailed installation steps
- QZ Tray setup guide
- Full API documentation
- Deployment instructions
- Complete troubleshooting guide

---

Happy printing! 🎉
