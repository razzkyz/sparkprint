"use client";

import Script from "next/script";
import { useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    loadJokulCheckout: (url: string) => void;
  }
}

type SizeKey = "2R" | "4R";

const SIZE_OPTIONS: { key: SizeKey; label: string; desc: string; price: number }[] = [
  { key: "2R", label: "2R", desc: "Strip Portrait (2×6in)", price: 15000 },
  { key: "4R", label: "4R", desc: "Glossy (10×15cm)", price: 15000 },
];

function unitPrice(size: SizeKey) {
  return SIZE_OPTIONS.find((s) => s.key === size)?.price ?? 10000;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.com$/i.test(email);
}

const SUCCESS_MODAL_AUTO_CLOSE_MS = 3000;

export default function KioskPage() {
  // Customer info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [queueNumber, setQueueNumber] = useState("");

  // Photo upload (store File objects after compression)
  const [uploadedUrls, setUploadedUrls] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  // Per-photo size selection: one size per photo
  const [photoSizes, setPhotoSizes] = useState<SizeKey[]>([]);

  const [loading, setLoading] = useState(false);
  const [dokuReady, setDokuReady] = useState(false);

  const [status, setStatus] = useState<
    { kind: "idle" | "info" | "ok" | "warn" | "err"; text: string } | undefined
  >({ kind: "info", text: "Upload foto Anda, pilih ukuran dan jumlah cetak, lalu bayar dengan QRIS." });

  // Success modal state
  const [successOpen, setSuccessOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    doku_order_id: string;
    amount: number;
    email: string | null;
    name: string | null;
    queueNumber: number | null;
  } | null>(null);

  // Keep timeout id so we can clear on manual close
  const successTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Calculate total: sum of (price per size * 1 per photo)
  const total = useMemo(() => {
    return photoSizes.reduce((sum, size) => sum + unitPrice(size), 0);
  }, [photoSizes]);

  // NEXT_PUBLIC_ prefix required for client-side access in Next.js
  const dokuScriptUrl = process.env.NEXT_PUBLIC_DOKU_IS_PRODUCTION === "true"
    ? "https://jokul.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js"
    : "https://sandbox.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js";

  function clearSuccessTimer() {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }

  function resetForm() {
    setName("");
    setEmail("");
    setQueueNumber("");
    setUploadedUrls([]);
    setPreviewUrls([]);
    setPhotoSizes([]);
    setTimeout(() => fileInputRef.current?.focus(), 50);
  }

  // Optimize image for high-quality printing (NOT aggressive compression)
  async function compressImage(file: File, fileIndex: number = 0): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          try {
            const img = new Image();
            img.src = event.target?.result as string;
            
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                let { width, height } = img;

                // Paper size @ 300 DPI - don't resize below these minimums:
                // 2R (2"×6") = 600×1800px
                // 4R (3.94"×5.91") = 1182×1773px  
                // 4x6 (4"×6") = 1200×1800px
                // Scale only if MUCH larger than needed
                const maxWidth = 2000;
                const maxHeight = 2400;

                if (width > height) {
                  if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                  }
                } else {
                  if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                  }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  reject(new Error("Failed to get canvas context"));
                  return;
                }

                // Enable HIGH quality image smoothing for better rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                console.log(`[Compress] File ${fileIndex}: ${file.name}`, {
                  originalSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
                  originalDimensions: `${img.width}x${img.height}`,
                  targetDimensions: `${width}x${height}`,
                });

                ctx.drawImage(img, 0, 0, width, height);
                
                // Use JPEG with HIGH quality (0.95) for print - NOT WebP aggressive compression
                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      console.log(`[Compress] File ${fileIndex} optimized:`, {
                        originalSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
                        optimizedSize: (blob.size / 1024 / 1024).toFixed(2) + 'MB',
                        ratio: ((blob.size / file.size) * 100).toFixed(1) + '%',
                        format: 'JPEG',
                        quality: '95%',
                      });
                      resolve(blob);
                    } else {
                      reject(new Error(`Compression failed for file ${fileIndex}: blob is null`));
                    }
                  },
                  "image/jpeg",
                  0.95
                );
              } catch (error) {
                reject(new Error(`Canvas processing error for file ${fileIndex}: ${error instanceof Error ? error.message : String(error)}`));
              }
            };
            
            img.onerror = () => reject(new Error(`Failed to load image for file ${fileIndex}: ${file.name}`));
          } catch (error) {
            reject(new Error(`Image loading error for file ${fileIndex}: ${error instanceof Error ? error.message : String(error)}`));
          }
        };

        reader.onerror = () => reject(new Error(`Failed to read file ${fileIndex}: ${file.name}`));
      } catch (error) {
        reject(new Error(`Compression process error for file ${fileIndex}: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  // Handle photo upload
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Allow up to 3 photos per order (quality over quantity for high-res print)
    if (files.length > 3) {
      setStatus({ kind: "err", text: "Maksimal 3 foto per pesanan. Silakan pilih maksimal 3 foto." });
      e.target.value = "";
      return;
    }

    // Validate file types
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const invalidFiles = files.filter(f => !allowedTypes.includes(f.type));
    if (invalidFiles.length > 0) {
      setStatus({ kind: "err", text: "Format file tidak didukung. Gunakan PNG, JPG, atau WebP." });
      e.target.value = "";
      return;
    }

    // Validate file sizes (max 10MB per file)
    const maxSize = 10 * 1024 * 1024;
    const oversizedFiles = files.filter(f => f.size > maxSize);
    if (oversizedFiles.length > 0) {
      setStatus({ kind: "err", text: "Ukuran file terlalu besar. Maksimal 10MB per file." });
      e.target.value = "";
      return;
    }

    setStatus({ kind: "info", text: `Mengoptimasi foto untuk print (${files.length})...` });

    try {
      // Compress semua files dengan tracking index untuk debugging
      const compressedBlobs = await Promise.all(
        files.map((f, idx) => 
          compressImage(f, idx)
            .catch(err => {
              console.error(`[Upload] Compression failed for file ${idx + 1}:`, err);
              throw new Error(`File ${idx + 1} (${f.name}): ${err instanceof Error ? err.message : String(err)}`);
            })
        )
      );

      // Create previews using object URLs (lightweight)
      const newPreviews = compressedBlobs.map(blob => URL.createObjectURL(blob));

      // Create File objects from compressed blobs
      const compressedFiles = compressedBlobs.map((blob, idx) => {
        const originalName = files[idx].name.replace(/\.[^.]+$/, '.jpg');
        const fileObj = new File([blob], originalName, { type: 'image/jpeg' });
        console.log(`[Upload] Created File object ${idx + 1}:`, {
          name: fileObj.name,
          size: (fileObj.size / 1024 / 1024).toFixed(2) + 'MB',
          type: fileObj.type,
          quality: '95%',
        });
        return fileObj;
      });

      console.log('[Upload] All files optimized for printing:', 
        compressedFiles.map((f, i) => `${i + 1}. ${f.name} (${(f.size/1024/1024).toFixed(2)}MB, quality: 95%)`).join(', ')
      );

      setUploadedUrls(prev => [...prev, ...compressedFiles]);
      setPreviewUrls(prev => [...prev, ...newPreviews]);
      // Initialize size for each new photo as 4R
      setPhotoSizes(prev => [...prev, ...compressedFiles.map(() => "4R" as SizeKey)]);

      setStatus({
        kind: "ok",
        text: `${files.length} foto ditambahkan. Total: ${uploadedUrls.length + compressedFiles.length} foto.`,
      });
      e.target.value = "";
    } catch (err) {
      setStatus({
        kind: "err",
        text: `Error upload: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      e.target.value = "";
    }
  }

  function removePhoto(index: number) {
    setUploadedUrls(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setPhotoSizes(prev => prev.filter((_, i) => i !== index));
  }

  function closeSuccessAndReset() {
    clearSuccessTimer();
    setSuccessOpen(false);
    resetForm();
  }

  const queueNum = parseInt(queueNumber, 10);
  const isValidQueueNumber = !isNaN(queueNum) && queueNum >= 1 && queueNum <= 999;

  const canPay =
    !loading &&
    dokuReady &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    isValidEmail(email.trim()) &&
    isValidQueueNumber &&
    uploadedUrls.length > 0 &&
    photoSizes.length === uploadedUrls.length;

  async function pay() {
    if (!name.trim()) {
      setStatus({ kind: "warn", text: "Nama harus diisi." });
      return;
    }
    if (!email.trim()) {
      setStatus({ kind: "warn", text: "Email harus diisi." });
      return;
    }
    if (!isValidEmail(email.trim())) {
      setStatus({ kind: "warn", text: "Format email tidak valid." });
      return;
    }
    if (uploadedUrls.length === 0) {
      setStatus({ kind: "warn", text: "Foto belum diupload." });
      fileInputRef.current?.focus();
      return;
    }
    if (photoSizes.length !== uploadedUrls.length) {
      setStatus({ kind: "warn", text: "Pilih ukuran untuk semua foto." });
      return;
    }

    if (!isValidQueueNumber) {
      setStatus({ kind: "warn", text: "Nomor urut harus diisi (1-999)." });
      return;
    }

    setLoading(true);
    setStatus({ kind: "info", text: "Mengupload foto dan membuat pesanan..." });

    try {
      // Create FormData dengan compressed files
      const formData = new FormData();
      
      console.log("[PAYMENT] Preparing FormData with files:");
      uploadedUrls.forEach((file, idx) => {
        console.log(`[PAYMENT] File ${idx + 1}:`, {
          name: file.name,
          size: file.size,
          sizeInMB: (file.size / 1024 / 1024).toFixed(2),
          type: file.type,
          photoSize: photoSizes[idx],
        });
        formData.append("photos", file);
      });
      // Send per-photo sizes array as JSON string
      formData.append("photo_sizes", JSON.stringify(photoSizes));
      formData.append("queue_number", queueNum.toString());
      formData.append("customer_name", name.trim());
      formData.append("customer_email", email.trim());
      formData.append("payment_method", "qris");
      formData.append("user_agent", navigator.userAgent);

      console.log("[PAYMENT] Sending order to API route...");
      console.log("[PAYMENT] FormData photo count:", uploadedUrls.length);
      console.log("[PAYMENT] Photo sizes:", photoSizes);
      console.log("[PAYMENT] User agent:", navigator.userAgent);
      console.log("[PAYMENT] Total file size:", uploadedUrls.reduce((sum, f) => sum + f.size, 0));

      const r = await fetch("/api/print-orders", {
        method: "POST",
        body: formData,
      });

      console.log("[PAYMENT] API response status:", r.status);

      const j = await r.json().catch(() => ({}));

      console.log("[PAYMENT] API response data:", j);

      if (!r.ok) {
        throw new Error(j?.error ?? `Server error ${r.status}`);
      }

      const { doku_order_id, order_id, payment_url } = j as {
        payment_url?: string;
        doku_order_id: string;
        order_id: string;
      };

      // If no payment URL (auto-paid), show success directly
      if (!payment_url) {
        setSuccessInfo({
          doku_order_id,
          amount: total,
          email: email.trim() || null,
          name: name.trim() || null,
          queueNumber: queueNum,
        });
        setSuccessOpen(true);
        setStatus({ kind: "ok", text: "Pesanan berhasil dibuat. Pembayaran otomatis." });
        
        clearSuccessTimer();
        successTimerRef.current = window.setTimeout(() => {
          closeSuccessAndReset();
        }, SUCCESS_MODAL_AUTO_CLOSE_MS);
        return;
      }

      // Open Doku checkout if payment URL exists
      setStatus({ kind: "info", text: "Membuka halaman pembayaran DOKU..." });

      console.log("[PAYMENT] Payment URL received:", payment_url);
      console.log("[PAYMENT] Order ID (UUID):", order_id);
      console.log("[PAYMENT] DOKU Order ID (Invoice):", doku_order_id);

      // Reset form after order is created to prevent adding more photos to an existing order
      resetForm();

      // Add error handler for window errors (catches DOKU SDK 404 errors)
      const handleDokuError = (event: ErrorEvent) => {
        if (event.message?.includes("404") || event.filename?.includes("checkout.doku.com")) {
          console.warn("[DOKU SDK] Non-critical error caught:", event.message);
          // Don't rethrow - let polling handle status checking instead
          return true;
        }
      };

      window.addEventListener("error", handleDokuError);

      // Detect iOS - use direct redirect for better compatibility
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS) {
        console.log("[PAYMENT] iOS device detected - using direct redirect for better compatibility");
        window.location.href = payment_url;
      } else if (typeof window.loadJokulCheckout === "function") {
        try {
          console.log("[PAYMENT] Loading DOKU Jokul Checkout...");
          window.loadJokulCheckout(payment_url);
        } catch (err) {
          console.error("[PAYMENT] Failed to load DOKU Jokul Checkout:", err);
          // Fallback to direct redirect
          window.location.href = payment_url;
        }
      } else {
        console.warn("[PAYMENT] DOKU SDK not available, redirecting to URL directly");
        window.location.href = payment_url;
      }

      // Poll to check payment status from our backend (more reliable)
      let pollAttempts = 0;
      const maxPollAttempts = 100; // 5 minutes at 3-second intervals
      
      const pollInterval = setInterval(async () => {
        pollAttempts++;
        try {
          console.log(`[POLL] Attempt ${pollAttempts}/${maxPollAttempts} - Checking order:`, order_id);
          const checkRes = await fetch(`/api/orders/${order_id}`);
          if (checkRes.ok) {
            const orderData = await checkRes.json();
            console.log("[POLL] Order status from DB:", orderData.status);
            if (orderData.status === "PAID") {
              clearInterval(pollInterval);
              window.removeEventListener("error", handleDokuError);
              console.log("[POLL] ✓ Payment confirmed! Redirecting...");
              // Reload to show success page
              setTimeout(() => window.location.href = window.location.href, 500);
            }
          } else {
            console.log("[POLL] Order not found by ID, trying doku_order_id:", doku_order_id);
            // Fallback: try using doku_order_id
            const fallbackRes = await fetch(`/api/orders/${doku_order_id}`);
            if (fallbackRes.ok) {
              const orderData = await fallbackRes.json();
              console.log("[POLL] Found by doku_order_id, status:", orderData.status);
              if (orderData.status === "PAID") {
                clearInterval(pollInterval);
                window.removeEventListener("error", handleDokuError);
                console.log("[POLL] ✓ Payment confirmed via doku_order_id! Redirecting...");
                setTimeout(() => window.location.href = window.location.href, 500);
              }
            }
          }
        } catch (err) {
          console.error("[POLL] Error checking payment status:", err);
        }
        
        // Stop polling after max attempts
        if (pollAttempts >= maxPollAttempts) {
          clearInterval(pollInterval);
          window.removeEventListener("error", handleDokuError);
          console.warn("[POLL] Max polling attempts reached, stopping.");
        }
      }, 3000); // Check every 3 seconds

      // Stop polling after 5 minutes (also set as backup)
      setTimeout(() => {
        if (pollAttempts < maxPollAttempts) {
          clearInterval(pollInterval);
          window.removeEventListener("error", handleDokuError);
        }
        setStatus({
          kind: "warn",
          text: `Pembayaran pending. Order ID: ${doku_order_id}. Selesaikan pembayaran di halaman DOKU.`,
        });
        // Reset form after payment timeout so user can start fresh
      }, 300000);

    } catch (e: unknown) {
      console.error("Pay error:", e);
      setStatus({ kind: "err", text: (e as Error)?.message ?? "Error" });
    } finally {
      setLoading(false);
    }
  }

  const statusClasses =
    status?.kind === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status?.kind === "err"
        ? "border-red-200 bg-red-50 text-red-700"
        : status?.kind === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-pink-200 bg-pink-50 text-pink-700";

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/eruda"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).eruda) {
            ((window as unknown as Record<string, unknown>).eruda as { init: () => void }).init?.();
          }
        }}
      />
      <Script
        src={dokuScriptUrl}
        strategy="afterInteractive"
        onLoad={() => {
          console.log("[DOKU] Script loaded successfully");
          setDokuReady(true);
        }}
        onError={(e) => {
          console.error("[DOKU] Script failed to load:", e);
          setDokuReady(false);
        }}
      />

      {/* Success Modal */}
      {successOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeSuccessAndReset}
          />

          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl animate-[pop_180ms_ease-out]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Pembayaran Berhasil
                </div>
                <h3 className="mt-3 text-xl font-bold text-gray-900">
                   Terima kasih! 🎉
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Foto Anda sedang diproses. Tunggu panggilan untuk pengambilan.
                </p>
              </div>

              <button
                onClick={closeSuccessAndReset}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 border border-gray-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Order ID</span>
                <span className="font-mono text-gray-900 font-medium text-lg">{successInfo?.doku_order_id ?? "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Total</span>
                <span className="text-gray-900 font-semibold text-lg">Rp{formatIDR(successInfo?.amount ?? 0)}</span>
              </div>

              {successInfo?.name && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Nama</span>
                  <span className="text-gray-900">{successInfo.name}</span>
                </div>
              )}

              {successInfo?.queueNumber && (
                <div className="flex items-center justify-between gap-3 bg-pink-100 rounded-lg px-3 py-2 -mx-1">
                  <span className="text-pink-700 font-medium">🎫 Nomor Urut</span>
                  <span className="text-pink-700 font-bold text-lg">{successInfo.queueNumber}</span>
                </div>
              )}

              <div className="mt-1 rounded-xl bg-pink-50 border border-pink-100 p-3 text-xs text-pink-700">
                {successInfo?.email ? (
                  <>
                    📧 Receipt dikirim ke: <span className="font-semibold">{successInfo.email}</span>
                    <br />
                    Cek folder Inbox atau Spam jika belum menerima.
                  </>
                ) : (
                  <>
                    💡 Simpan <span className="font-semibold">Order ID</span> di atas sebagai bukti pesanan.
                  </>
                )}
              </div>
            </div>

            <style jsx>{`
              @keyframes pop {
                from {
                  transform: scale(0.96);
                  opacity: 0;
                }
                to {
                  transform: scale(1);
                  opacity: 1;
                }
              }
            `}</style>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-pink-50">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
          {/* Header */}
          <div className="text-center">
            {/* Logo - ganti src dengan logo asli */}
            <div className="flex justify-center mb-4">
              <img
                src="/logo.png"
                alt="Spark Stage Print Logo"
                className="h-16 w-auto object-contain"
                onError={(e) => {
                  // Fallback jika logo belum ada
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <img
              src="/you did great star-01.png"
              alt="You did great, Star!"
              className="mx-auto mb-4 w-full max-w-[280px] sm:max-w-[400px] h-auto object-contain"
            />
            <h2 className="text-lg font-bold text-[#ff4b86] sm:text-2xl text-balance">
              Your shoot is complete, your photos are ready to print.
            </h2>
            <p className="mt-2 text-xs text-gray-500 sm:text-sm">
              Prepare your Captured Final Take QR Code or link. <br /> Available on your last step screen on stage
            </p>
          </div>

          {/* Main Form */}
          <div className="mt-8">
            <div className="rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-gray-100 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900">Complete the form below:</h2>
              <p className="mt-1 text-sm text-gray-500">
                Upload foto Anda, pilih ukuran dan jumlah cetak, lalu bayar.
              </p>

              {/* Name */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700">
                  Nama <span className="text-red-500 font-normal">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Rani / Budi"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
              </div>

              {/* Email */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Email <span className="text-red-500">* (untuk e-receipt)</span>
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Contoh: rani@gmail.com"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
                {!isValidEmail(email.trim()) && email.trim() && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <span>⚠️</span> Format email tidak valid.
                  </div>
                )}
              </div>

              {/* Nomor Urut Tiket */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Masukan Nomor Urut Tiket <span className="text-red-500 font-normal">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={queueNumber}
                  onChange={(e) => setQueueNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="Masukkan nomor urut Anda yang ada di tiket"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#ff4b86] focus:ring-2 focus:ring-pink-500/20 focus:bg-white outline-none transition-all"
                />
                {queueNumber && !isValidQueueNumber && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <span>⚠️</span> Nomor urut harus antara 1-999
                  </div>
                )}
              </div>

              {/* Photo Upload */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Upload Foto <span className="text-red-500">*</span>
                </label>
                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-gray-700 hover:border-[#ff4b86] hover:bg-pink-50 transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">📷</span>
                      <span className="font-medium">Klik untuk upload foto</span>
                      <span className="text-sm text-gray-500">PNG, JPG, atau WebP (max 10MB per file, maks 3 foto)</span>
                      <span className="text-xs text-gray-400">Bisa pilih multiple file sekaligus</span>
                    </div>
                  </button>

                  {previewUrls.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-600">Preview ({previewUrls.length} foto):</p>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedUrls([]);
                            setPreviewUrls([]);
                            setPhotoSizes([]);
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Hapus semua
                        </button>
                      </div>
                      <div className="space-y-4">
                        {previewUrls.map((url, index) => (
                          <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="flex gap-4">
                              {/* Photo preview */}
                              <div className="relative group">
                                <img
                                  src={url}
                                  alt={`Preview ${index + 1}`}
                                  className="w-24 h-32 object-cover border border-gray-200 rounded-lg flex-shrink-0"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePhoto(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Size selection for this photo */}
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-700 mb-2">Foto {index + 1} - Ukuran:</div>
                                <div className="space-y-2">
                                  {SIZE_OPTIONS.map((opt) => (
                                    <label
                                      key={opt.key}
                                      className={[
                                        "flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 transition-all",
                                        photoSizes[index] === opt.key
                                          ? "border-[#ff4b86] bg-pink-50 shadow-sm"
                                          : "border-gray-200 bg-white hover:border-gray-300",
                                      ].join(" ")}
                                    >
                                      <input
                                        type="radio"
                                        name={`size-${index}`}
                                        value={opt.key}
                                        checked={photoSizes[index] === opt.key}
                                        onChange={() => {
                                          const newSizes = [...photoSizes];
                                          newSizes[index] = opt.key;
                                          setPhotoSizes(newSizes);
                                        }}
                                        className="h-4 w-4 text-[#ff4b86] accent-[#ff4b86]"
                                      />
                                      <div className="flex-1">
                                        <div className="text-xs font-semibold text-gray-900">{opt.label}</div>
                                        <div className="text-xs text-gray-500">{opt.desc}</div>
                                      </div>
                                      <div className="text-xs font-semibold text-gray-900">
                                        Rp{formatIDR(opt.price)}
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment summary */}
              {uploadedUrls.length > 0 && photoSizes.length === uploadedUrls.length && (
                <div className="mt-6 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 p-4">
                  <div className="grid gap-3">
                    {photoSizes.map((size, idx) => {
                      const opt = SIZE_OPTIONS.find(s => s.key === size) || SIZE_OPTIONS[0];
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">Foto {idx + 1}: <span className="font-medium">{opt.label}</span></span>
                          <span className="font-semibold text-gray-900">Rp{formatIDR(opt.price)}</span>
                        </div>
                      );
                    })}
                    <div className="border-t border-pink-200 pt-3 mt-2 flex items-center justify-between">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-lg font-bold text-[#ff4b86]">Rp{formatIDR(total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Method - Only QRIS/E-Wallet via Doku */}
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-600">
                  <span>Payment Method: E-Wallet / QRIS via Doku</span>
                  {!dokuReady && (
                    <span className="ml-2 text-xs text-gray-400 animate-pulse">
                      (memuat pembayaran...)
                    </span>
                  )}
                </div>

                <button
                  onClick={pay}
                  disabled={!canPay}
                  className={[
                    "w-full sm:w-auto rounded-xl px-8 py-4 text-base font-bold transition-all shadow-lg",
                    "bg-[#ff4b86] text-white",
                    "hover:bg-[#e63d75] hover:shadow-xl hover:shadow-pink-500/25",
                    "active:scale-[0.98]",
                    "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none",
                  ].join(" ")}
                >
                  {loading ? "⏳ Processing..." : `Payment Rp${formatIDR(total)}`}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className={`mt-4 rounded-2xl border p-4 ${statusClasses}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg">
                  {status?.kind === "ok" ? "✅" : status?.kind === "err" ? "❌" : status?.kind === "warn" ? "⚠️" : "ℹ️"}
                </span>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide opacity-80">Status</div>
                  <div className="mt-1 text-sm leading-relaxed">{status?.text ?? "-"}</div>
                </div>
              </div>
            </div>

            {/* Help Section */}
            <div className="mt-6 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 p-6">
              <h3 className="text-lg font-bold text-gray-900">❓ Cara Cetak Foto</h3>
              <ol className="mt-4 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">1</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Scan atau Upload QR</span> — Gunakan tombol "Scan" untuk menggunakan kamera, atau "Upload" untuk memilih gambar QR dari galeri.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">2</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Pilih ukuran & jumlah</span> — Tentukan ukuran cetak dan berapa banyak yang ingin dicetak.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff4b86] text-xs font-bold text-white shrink-0">3</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Bayar dengan QRIS</span> — Klik tombol bayar dan scan QRIS menggunakan e-wallet atau mobile banking.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shrink-0">4</span>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Tunggu panggilan</span> — Setelah pembayaran berhasil, tunggu foto Anda dicetak dan dipanggil untuk pengambilan.
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
