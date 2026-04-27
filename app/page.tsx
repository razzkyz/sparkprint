"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    loadJokulCheckout: (url: string) => void;
  }
}

type SizeKey = "4x6" | "2x6";

const SIZE_OPTIONS: { key: SizeKey; label: string; desc: string; price: number }[] = [
  { key: "4x6", label: "4×6", desc: "Standard photo", price: 10000 },
  { key: "2x6", label: "2×6", desc: "Photo strip", price: 10000 },
];

function unitPrice(size: SizeKey) {
  return SIZE_OPTIONS.find((s) => s.key === size)?.price ?? 10000;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const SUCCESS_MODAL_AUTO_CLOSE_MS = 3000;

export default function KioskPage() {
  // Customer info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Photo upload
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState<SizeKey>("4x6");

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

  // Auto-set quantity based on number of uploaded images
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      setQty(uploadedFiles.length);
    }
  }, [uploadedFiles.length]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const total = useMemo(() => unitPrice(size) * qty, [qty, size]);
  const currentSizeOption = SIZE_OPTIONS.find((s) => s.key === size)!;

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
    setUploadedFiles([]);
    setPreviewUrls([]);
    setQty(1);
    setSize("4x6");
    setTimeout(() => fileInputRef.current?.focus(), 50);
  }

  // Handle photo upload
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const invalidFiles = files.filter(f => !allowedTypes.includes(f.type));
    if (invalidFiles.length > 0) {
      setStatus({ kind: "err", text: "Format file tidak didukung. Gunakan PNG, JPG, atau WebP." });
      e.target.value = "";
      return;
    }

    // Validate file sizes (max 10MB each)
    const maxSize = 10 * 1024 * 1024;
    const oversizedFiles = files.filter(f => f.size > maxSize);
    if (oversizedFiles.length > 0) {
      setStatus({ kind: "err", text: "Ukuran file terlalu besar. Maksimal 10MB per file." });
      e.target.value = "";
      return;
    }

    // Create previews
    const newPreviews = await Promise.all(
      files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      })
    );

    setUploadedFiles(prev => [...prev, ...files]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    setStatus({ kind: "ok", text: `${files.length} foto ditambahkan. Total: ${uploadedFiles.length + files.length} foto.` });
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  }

  function closeSuccessAndReset() {
    clearSuccessTimer();
    setSuccessOpen(false);
    resetForm();
  }

  const canPay =
    !loading &&
    dokuReady &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    isValidEmail(email.trim()) &&
    uploadedFiles.length > 0 &&
    qty >= 1;

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
    if (uploadedFiles.length === 0) {
      setStatus({ kind: "warn", text: "Foto belum diupload." });
      fileInputRef.current?.focus();
      return;
    }
    if (qty < 1) {
      setStatus({ kind: "warn", text: "Pilih jumlah print dulu (minimal 1)." });
      return;
    }

    setLoading(true);
    setStatus({ kind: "info", text: "Mengupload foto dan membuat pesanan..." });

    try {
      // Create FormData for file upload
      const formData = new FormData();
      uploadedFiles.forEach((file, index) => {
        formData.append(`photos`, file);
      });
      formData.append("qty", qty.toString());
      formData.append("size", size);
      formData.append("customer_name", name.trim());
      formData.append("customer_email", email.trim());
      formData.append("payment_method", "qris");

      const r = await fetch("/api/print-orders", {
        method: "POST",
        body: formData, // Send as FormData instead of JSON
      });

      const j = await r.json().catch(() => ({}));

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
          queueNumber: null, // Will be auto-generated by database
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

      if (typeof window.loadJokulCheckout === "function") {
        window.loadJokulCheckout(payment_url);
      } else {
        window.location.href = payment_url;
      }

      // Poll to check payment status
      const pollInterval = setInterval(async () => {
        try {
          console.log("[POLL] Checking order:", order_id);
          const checkRes = await fetch(`/api/orders/${order_id}`);
          if (checkRes.ok) {
            const orderData = await checkRes.json();
            console.log("[POLL] Order status:", orderData.status);
            if (orderData.status === "PAID") {
              clearInterval(pollInterval);
              // Close DOKU modal and show success
              window.location.href = window.location.href;
            }
          } else {
            console.log("[POLL] Order not found, trying doku_order_id:", doku_order_id);
            // Fallback: try using doku_order_id
            const fallbackRes = await fetch(`/api/orders/${doku_order_id}`);
            if (fallbackRes.ok) {
              const orderData = await fallbackRes.json();
              console.log("[POLL] Found by doku_order_id, status:", orderData.status);
              if (orderData.status === "PAID") {
                clearInterval(pollInterval);
                window.location.href = window.location.href;
              }
            }
          }
        } catch (err) {
          console.error("Poll payment status error:", err);
        }
      }, 3000); // Check every 3 seconds

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setStatus({
          kind: "warn",
          text: `Pembayaran pending. Order ID: ${doku_order_id}. Selesaikan pembayaran di halaman DOKU.`,
        });
      }, 300000);

    } catch (e: any) {
      console.error("Pay error:", e);
      setStatus({ kind: "err", text: e?.message ?? "Error" });
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
        src={dokuScriptUrl}
        strategy="afterInteractive"
        onLoad={() => setDokuReady(true)}
        onError={() => setDokuReady(false)}
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
                      <span className="text-sm text-gray-500">PNG, JPG, atau WebP (max 10MB per file)</span>
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
                            setUploadedFiles([]);
                            setPreviewUrls([]);
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Hapus semua
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {previewUrls.map((url, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={url}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-24 object-cover border border-gray-200 rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(index)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Size selection */}
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <div className="text-sm font-medium text-gray-700">Choose Photo Size:</div>
                  <div className="mt-3 space-y-2">
                    {SIZE_OPTIONS.map((opt) => (
                      <label
                        key={opt.key}
                        className={[
                          "flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all",
                          size === opt.key
                            ? "border-[#ff4b86] bg-pink-50 shadow-sm"
                            : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="size"
                          value={opt.key}
                          checked={size === opt.key}
                          onChange={() => setSize(opt.key)}
                          className="h-4 w-4 text-[#ff4b86] accent-[#ff4b86]"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.desc}</div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          Rp{formatIDR(opt.price)}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Qty */}
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <div className="text-sm font-medium text-gray-700">Quantity</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex-1 text-center">
                      <div className="text-4xl font-bold text-gray-900">{qty}</div>
                      <div className="text-xs text-gray-500">Otomatis berdasarkan jumlah gambar</div>
                    </div>
                  </div>
                </div>
              </div>

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
