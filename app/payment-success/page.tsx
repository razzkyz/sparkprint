"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Order {
  id: string;
  doku_order_id: string;
  customer_name: string;
  customer_email: string;
  image_urls: string[];
  size: string;
  qty: number;
  amount: number;
  status: string;
  queue_number: number;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const invoice = searchParams.get("invoice_number");
    const dokuOrderId = searchParams.get("order_id");

    if (!invoice) {
      setStatus("error");
      return;
    }

    let pollCount = 0;
    const maxPolls = 30; // Poll for up to 3 minutes (30 * 6 seconds)

    const checkPaymentStatus = async () => {
      try {
        // Check payment status via polling API and auto-mark as PAID
        const res = await fetch(`/api/check-payment-status?order_id=${dokuOrderId || invoice}&auto_mark_paid=true`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data.order);
          
          if (data.status === "PAID") {
            setStatus("success");
            return true; // Payment confirmed
          } else {
            // Continue polling
            return false;
          }
        } else {
          console.error("Check status error:", res.status);
          return false;
        }
      } catch (err) {
        console.error("Check status error:", err);
        return false;
      }
    };

    // Initial check
    checkPaymentStatus().then((confirmed) => {
      if (confirmed) return;

      // Poll every 6 seconds
      const interval = setInterval(async () => {
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setStatus("success"); // Show success even if not confirmed (fallback)
          return;
        }

        const confirmed = await checkPaymentStatus();
        if (confirmed) {
          clearInterval(interval);
        }
      }, 6000);

      return () => clearInterval(interval);
    });
  }, [searchParams]);

  const downloadImages = async () => {
    if (!order?.image_urls) return;
    
    for (let i = 0; i < order.image_urls.length; i++) {
      const url = order.image_urls[i];
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `photo-${order.doku_order_id}-${i + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      } catch (err) {
        console.error('Download error:', err);
      }
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memeriksa status pembayaran...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-50 to-purple-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Terjadi Kesalahan</h1>
          <p className="text-gray-600 mb-6">Gagal memeriksa status pembayaran.</p>
          <Link
            href="/"
            className="inline-block bg-pink-600 text-white px-6 py-3 rounded-xl hover:bg-pink-700 transition-colors"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-50 to-purple-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div className="text-green-500 text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pembayaran Berhasil!</h1>
        <p className="text-gray-600 mb-6">
          Terima kasih! 🎉<br />
          Foto Anda sedang diproses. Tunggu panggilan untuk pengambilan.
        </p>

        {order && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <div className="mb-3">
              <span className="text-sm text-gray-500">Order ID:</span>
              <div className="font-mono text-sm font-bold text-gray-900 break-all">{order.doku_order_id}</div>
            </div>
            <div className="mb-3">
              <span className="text-sm text-gray-500">Nomor Urut:</span>
              <div className="font-bold text-gray-900">{order.queue_number}</div>
            </div>
            <div className="mb-3">
              <span className="text-sm text-gray-500">Jumlah Foto:</span>
              <div className="font-bold text-gray-900">{order.qty}x ({order.size})</div>
            </div>
            <div className="border-t pt-3 mt-3">
              <p className="text-xs text-gray-600 mb-2">
                💾 Simpan gambar ini untuk ditunjukkan ke admin jika ada kesalahan
              </p>
              <button
                onClick={downloadImages}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Download Gambar ({order.image_urls?.length || 0})
              </button>
            </div>
          </div>
        )}

        {order && order.status === "PENDING" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
            <p className="text-xs text-yellow-800">
              ⚠️ Status pembayaran masih PENDING. Jika pembayaran sudah berhasil, 
              tunjukkan Order ID ini ke admin untuk konfirmasi manual.
            </p>
          </div>
        )}

        <Link
          href="/"
          className="inline-block bg-pink-600 text-white px-6 py-3 rounded-xl hover:bg-pink-700 transition-colors"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memeriksa status pembayaran...</p>
        </div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
