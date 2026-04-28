"use client";

import { useEffect, useMemo, useState } from "react";

type OrderStatus = "PENDING" | "PAID" | "PRINTED" | "FAILED" | string;

type Order = {
  id: string;
  queue_number: number | null;
  customer_name: string | null;
  customer_email: string | null;
  image_urls: string[];
  size: string;
  qty: number;
  amount: number;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  doku_order_id: string | null;
  payment_method?: string | null;
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function badgeClasses(status: string) {
  switch (status) {
    case "PAID":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "PRINTED":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "PENDING":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "FAILED":
      return "bg-red-100 text-red-700 border border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [qrisOrders, setQrisOrders] = useState<Order[]>([]);
  const [cashierOrders, setCashierOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());

  // Print confirmation modal
  const [printConfirm, setPrintConfirm] = useState<Order | null>(null);

  // Tab - temporarily disable cashier
  const [activeTab, setActiveTab] = useState<"qris" | "cashier">("qris");

  // Filters
  const [status, setStatus] = useState<"ALL" | "PENDING" | "PAID" | "PRINTED" | "FAILED">("PAID");
  const [needsPrint, setNeedsPrint] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<"ALL" | "4x6" | "strip">("ALL");
  const [q, setQ] = useState("");

  // Sort
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const authHeader = useMemo(() => ({ "x-admin-password": password }), [password]);

  async function load() {
    if (!password) {
      setMsg("Isi password operator dulu.");
      return;
    }

    setMsg("loading...");

    // Load QRIS orders (payment_method = 'qris' or null)
    const qrisParams = new URLSearchParams();
    // Show all statuses when "needsPrint" is checked (both PENDING and PAID)
    qrisParams.set("status", needsPrint ? "ALL" : status);
    qrisParams.set("size", sizeFilter);
    qrisParams.set("q", q.trim());
    // Sort by created_at to show orders in order they came in
    qrisParams.set("sortField", "created_at");
    qrisParams.set("sortDir", sortDir);
    qrisParams.set("limit", "200");
    qrisParams.set("paymentMethod", "qris");

    const qrisRes = await fetch(`/api/admin/orders?${qrisParams.toString()}`, { headers: authHeader });
    const qrisJson = await qrisRes.json().catch(() => ({}));

    // Load Cashier orders
    const cashierParams = new URLSearchParams();
    cashierParams.set("status", status);
    cashierParams.set("size", sizeFilter);
    cashierParams.set("q", q.trim());
    cashierParams.set("sortField", "created_at");
    cashierParams.set("sortDir", sortDir);
    cashierParams.set("limit", "200");
    cashierParams.set("paymentMethod", "cashier");

    const cashierRes = await fetch(`/api/admin/orders?${cashierParams.toString()}`, { headers: authHeader });
    const cashierJson = await cashierRes.json().catch(() => ({}));

    if (!qrisRes.ok || !cashierRes.ok) {
      return setMsg(qrisJson?.error ?? cashierJson?.error ?? "Load failed");
    }

    setQrisOrders(qrisJson.orders ?? []);
    setCashierOrders(cashierJson.orders ?? []);
    setMsg("");
  }

  async function markPrinted(id: string) {
    // Find order data
    const order = currentOrders.find(o => o.id === id);
    if (!order) {
      alert("Order tidak ditemukan");
      return;
    }

    // Show confirmation modal with print details
    setPrintConfirm(order);
  }

  async function confirmedMarkPrinted() {
    if (!printConfirm) return;

    const id = printConfirm.id;
    setPrintingIds(prev => new Set(prev).add(id));

    try {
      const order = printConfirm;

      // Handle image_urls - ensure it's an array
      let imageUrls: string[] = [];
      if (Array.isArray(order.image_urls)) {
        imageUrls = order.image_urls;
      } else if (typeof order.image_urls === 'string') {
        imageUrls = [order.image_urls];
      }

      if (imageUrls.length === 0) {
        alert("Order tidak memiliki gambar");
        return;
      }

      console.log(`[PRINT] Starting print for order ${id}:`, {
        imageCount: imageUrls.length,
        size: order.size,
        qty: order.qty,
        urls: imageUrls,
      });

      // ============= PRELOAD & CONVERT IMAGES =============
      // Load all images and convert to data URLs
      const loadedImages: string[] = [];
      for (const url of imageUrls) {
        try {
          console.log(`[PRINT] Loading image: ${url}`);
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`[PRINT] Failed to load image: ${response.status}`);
            continue;
          }
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          console.log(`[PRINT] Image loaded: ${dataUrl.substring(0, 50)}...`);
          loadedImages.push(dataUrl);
        } catch (err) {
          console.error('[PRINT] Failed to load image:', url, err);
        }
      }

      if (loadedImages.length === 0) {
        alert("❌ Gagal memuat gambar untuk print");
        return;
      }

      console.log(`[PRINT] Successfully loaded ${loadedImages.length} image(s)`);

      // ============= CALCULATE PAGE DIMENSIONS =============
      // 2x6 = 2 inches wide x 6 inches tall
      // 4x6 = 4 inches wide x 6 inches tall
      // At 96 DPI (screen): 2x6 = 192x576px, 4x6 = 384x576px
      const pageWidth = order.size === "2x6" ? 2 : 4; // inches
      const pageHeight = 6; // inches
      const dpi = 96; // screen DPI for display
      const widthPx = pageWidth * dpi;
      const heightPx = pageHeight * dpi;

      console.log(`[PRINT] Page dimensions for ${order.size}:`, {
        inches: `${pageWidth}x${pageHeight}`,
        pixels: `${widthPx}x${heightPx}`,
      });

      // ============= CREATE PRINT WINDOW =============
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("❌ Popup blocked. Please allow popups for this site.");
        return;
      }

      // Generate HTML with all images, each on separate page
      const imagesHtml = loadedImages
        .map((dataUrl, idx) => {
          return `
            <div class="print-page" id="page-${idx}">
              <img 
                src="${dataUrl}" 
                class="print-image"
                alt="Image ${idx + 1}"
                onload="window.imageLoadCount = (window.imageLoadCount || 0) + 1; checkAllImagesLoaded();"
                onerror="console.error('Image ${idx} failed to load')"
              />
            </div>
          `;
        })
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Print - ${order.size === "2x6" ? "2×6" : "4×6"}</title>
          <style>
            /* Reset all margins and padding */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            html, body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
            }

            /* Print page container - one per image */
            .print-page {
              width: ${widthPx}px;
              height: ${heightPx}px;
              page-break-after: always;
              page-break-inside: avoid;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
              overflow: hidden;
              position: relative;
            }

            /* Image fills entire page, no white borders */
            .print-image {
              width: 100%;
              height: 100%;
              object-fit: cover;
              object-position: center;
              display: block;
            }

            /* Print-specific styles */
            @page {
              /* Paper size: match the print size */
              size: ${pageWidth}in ${pageHeight}in;
              margin: 0;
              padding: 0;
            }

            @media print {
              * {
                margin: 0 !important;
                padding: 0 !important;
              }

              html, body {
                margin: 0 !important;
                padding: 0 !important;
                width: 100%;
                height: 100%;
              }

              .print-page {
                width: 100%;
                height: 100%;
                margin: 0 !important;
                padding: 0 !important;
                page-break-after: always;
                page-break-before: avoid;
                page-break-inside: avoid;
                display: flex;
                align-items: center;
                justify-content: center;
                background: white;
              }

              .print-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
              }
            }

            /* Loading indicator */
            #loading {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 10000;
              font-family: Arial, sans-serif;
              text-align: center;
            }

            #loading p {
              margin: 0;
              color: #333;
              font-size: 14px;
            }

            #loading .spinner {
              width: 30px;
              height: 30px;
              border: 3px solid #e0e0e0;
              border-top-color: #0066cc;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 10px auto;
            }

            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          ${imagesHtml}

          <div id="loading">
            <div class="spinner"></div>
            <p id="status">Loading images...</p>
          </div>

          <script>
            window.imageLoadCount = 0;
            window.totalImages = ${loadedImages.length};
            window.pageSize = "${order.size}";

            function checkAllImagesLoaded() {
              const status = document.getElementById('status');
              status.textContent = \`Loading images: \${window.imageLoadCount}/\${window.totalImages}\`;

              if (window.imageLoadCount >= window.totalImages) {
                console.log('[PRINT] ✅ All images loaded, ready to print');
                document.getElementById('loading').remove();
                setTimeout(function() {
                  window.print();
                  // Close window after print dialog closes
                  setTimeout(function() {
                    window.close();
                  }, 500);
                }, 300);
              }
            }

            // Timeout safety: auto-print after 10 seconds even if images aren't loaded
            setTimeout(function() {
              if (window.imageLoadCount < window.totalImages) {
                console.warn(\`[PRINT] ⚠️ Timeout: Only \${window.imageLoadCount}/\${window.totalImages} images loaded\`);
                document.getElementById('loading').remove();
                window.print();
              }
            }, 10000);
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      console.log(`[PRINT] Print window opened, waiting for images to load...`);

      // Wait a bit for print dialog (adjustable)
      await new Promise(resolve => setTimeout(resolve, 5000));

      // ============= MARK AS PRINTED =============
      console.log(`[PRINT] Marking order as printed...`);
      const markRes = await fetch("/api/admin/mark-printed", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ id }),
      });

      const markJson = await markRes.json().catch(() => ({}));
      if (!markRes.ok) {
        console.error(`[PRINT] Failed to mark printed:`, markJson);
        alert(`❌ Mark printed error: ${markJson?.error ?? `HTTP ${markRes.status}`}`);
        return;
      }

      console.log(`[PRINT] ✅ Order marked as printed:`, markJson);

      // Close confirmation modal
      setPrintConfirm(null);

      // Reload to show updated status
      await load();
    } catch (error) {
      console.error(`[PRINT] ❌ Error:`, error);
      alert(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPrintingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function markPaid(id: string) {
    console.log("[markPaid] Order ID:", id);
    if (!id) {
      alert("Order ID tidak valid");
      return;
    }
    if (!confirm("Tandai pesanan ini sebagai SUDAH DIBAYAR?")) return;

    const r = await fetch("/api/admin/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ id }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return alert(j?.error ?? `HTTP ${r.status}`);
    }

    await load();
  }

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    if (!password) return;

    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, password, status, needsPrint, sizeFilter, q, sortDir]);

  const currentOrders = activeTab === "qris" ? qrisOrders : cashierOrders;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              🖨️ Print Queue
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Kelola antrian print foto • Auto-refresh setiap 5 detik
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Auto refresh</span>
              {autoRefresh && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Password + Refresh */}
        <div className="mt-6 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Password Operator
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
                placeholder="••••••••"
                type="password"
              />
            </div>

            <button
              onClick={load}
              className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setActiveTab("qris")}
            className={[
              "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
              activeTab === "qris"
                ? "bg-blue-600 text-white shadow"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            ].join(" ")}
          >
            💳 Pesanan QRIS ({qrisOrders.length})
          </button>
          {/* Cashier tab temporarily disabled */}
          {/* <button
            onClick={() => setActiveTab("cashier")}
            className={[
              "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
              activeTab === "cashier"
                ? "bg-pink-600 text-white shadow"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            ].join(" ")}
          >
            🏪 Pesanan Kasir ({cashierOrders.length})
          </button> */}
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Filter Status */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Filter Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              disabled={needsPrint}
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">🕐 PENDING</option>
              <option value="PAID">💰 PAID</option>
              <option value="PRINTED">✅ PRINTED</option>
              <option value="FAILED">❌ FAILED</option>
            </select>

            <label className="mt-3 flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={needsPrint}
                onChange={(e) => setNeedsPrint(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Butuh print saja</span>
            </label>
          </div>

          {/* Search */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Cari
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Token / nama / email..."
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          {/* Filter Ukuran */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Filter Ukuran
            </label>
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="ALL">Semua Ukuran</option>
              <option value="4x6">📷 4×6</option>
              <option value="strip">📸 2×6 Strip</option>
            </select>
          </div>

          {/* Sort */}
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-200">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
              Urutkan
            </label>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "desc" | "asc")}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="desc">⬇️ Terbaru</option>
              <option value="asc">⬆️ Terlama</option>
            </select>
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>{msg}</span>
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm border border-gray-200 shadow-sm">
            <span className="text-gray-500">Total:</span>
            <span className="font-semibold text-gray-900">{currentOrders.length}</span>
          </div>
          {activeTab === "qris" && (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm border border-amber-200">
                <span className="text-amber-600">Menunggu Pembayaran:</span>
                <span className="font-semibold text-amber-700">
                  {currentOrders.filter(o => o.status === "PENDING").length}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm border border-blue-200">
                <span className="text-blue-600">Perlu Print:</span>
                <span className="font-semibold text-blue-700">
                  {currentOrders.filter(o => o.status === "PAID").length}
                </span>
              </div>
            </>
          )}
          {activeTab === "cashier" && (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm border border-amber-200">
                <span className="text-amber-600">Belum Bayar:</span>
                <span className="font-semibold text-amber-700">
                  {currentOrders.filter(o => o.status === "PENDING").length}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm border border-blue-200">
                <span className="text-blue-600">Perlu Print:</span>
                <span className="font-semibold text-blue-700">
                  {currentOrders.filter(o => o.status === "PAID").length}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">No. Tiket</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Detail</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {currentOrders.map((o, index) => (
                  <tr key={o.id || index} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                        {o.queue_number ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {activeTab === "qris" ? (
                        o.paid_at ? (
                          <span className="font-mono text-xs">{o.paid_at}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )
                      ) : (
                        <span className="font-mono text-xs">{o.created_at}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{o.customer_name || "-"}</div>
                      <div className="text-xs text-gray-500">{o.customer_email || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            {o.size === "strip" ? "2×6" : o.size}
                          </span>
                          <span className="text-xs text-gray-600">× {o.qty}</span>
                        </div>
                        <div className="text-xs font-semibold text-gray-900">Rp{formatIDR(o.amount)}</div>
                        <div className="text-[10px] text-gray-400">{o.image_urls?.length || 0} foto</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", badgeClasses(o.status)].join(" ")}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            if (o.image_urls) {
                              // Handle image_urls - ensure it's an array
                              let urls: string[] = [];
                              if (Array.isArray(o.image_urls)) {
                                urls = o.image_urls;
                              } else if (typeof o.image_urls === 'string') {
                                urls = [o.image_urls];
                              }
                              if (urls.length > 0) {
                                setPreviewImages(urls);
                                setPreviewImage(urls[0]);
                              }
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          🔗 Open ({Array.isArray(o.image_urls) ? o.image_urls.length : (typeof o.image_urls === 'string' ? 1 : 0)})
                        </button>

                        {/* Download button - Only for PAID orders */}
                        {o.status === "PAID" && o.image_urls && o.image_urls.length > 0 && (
                          <button
                            onClick={async () => {
                              console.log('Starting download for', o.image_urls.length, 'images');
                              for (let i = 0; i < o.image_urls.length; i++) {
                                try {
                                  console.log(`Downloading image ${i + 1}/${o.image_urls.length}:`, o.image_urls[i]);
                                  const response = await fetch(o.image_urls[i]);
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `Photo No urut - ${o.queue_number || o.id}${i > 0 ? `-${i + 1}` : ''}.jpg`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  window.URL.revokeObjectURL(url);
                                  console.log(`Downloaded image ${i + 1}`);
                                  
                                  // Delay between downloads
                                  if (i < o.image_urls.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                  }
                                } catch (error) {
                                  console.error('Download error for image', i + 1, ':', error);
                                }
                              }
                              console.log('Download complete');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
                          >
                            ⬇️ Download
                          </button>
                        )}

                        {/* Download button disabled for non-PAID */}
                        {o.status !== "PAID" && o.image_urls && o.image_urls.length > 0 && (
                          <button
                            disabled
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400 cursor-not-allowed transition-colors"
                            title={`Download available only for PAID orders (current: ${o.status})`}
                          >
                            ⬇️ Download
                          </button>
                        )}

                        {/* Show Pay button for PENDING (both QRIS and Cashier) */}
                        {o.status === "PENDING" && (
                          <button
                            onClick={() => markPaid(o.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
                          >
                            💰 Bayar
                          </button>
                        )}

                        <button
                          onClick={() => markPrinted(o.id)}
                          disabled={o.status !== "PAID" || printingIds.has(o.id)}
                          className={[
                            "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                            o.status !== "PAID" || printingIds.has(o.id)
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm",
                          ].join(" ")}
                        >
                          {printingIds.has(o.id) ? "⏳ Printing..." : o.status === "PRINTED" ? "✅ Done" : "🖨️ Print"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {currentOrders.length === 0 && (
                  <tr>
                    <td className="px-4 py-12 text-center text-gray-400" colSpan={9}>
                      <div className="text-4xl mb-2">📭</div>
                      <div>Tidak ada data untuk filter ini.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4">
          <div className="flex items-start gap-2 text-sm text-blue-700">
            <span>💡</span>
            <div>
              {activeTab === "qris" ? (
                <span><span className="font-medium">Tips:</span> Gunakan filter "Butuh print saja" untuk fokus pada order yang perlu diprint (status PAID).</span>
              ) : (
                <span><span className="font-medium">Tips:</span> Klik "Bayar" setelah customer bayar di kasir, lalu klik "Print" untuk memproses.</span>
              )}
            </div>
          </div>
        </div>

        {/* Image Preview Modal */}
        {previewImage && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
            onClick={() => {
              setPreviewImage(null);
              setPreviewImages([]);
            }}
          >
            <div className="relative max-w-4xl max-h-full w-full">
              <img
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg mx-auto"
                onClick={(e) => e.stopPropagation()}
                onError={() => {
                  console.error("Failed to load image:", previewImage);
                  alert("Gagal memuat gambar. Membuka di tab baru...");
                  window.open(previewImage, '_blank');
                  setPreviewImage(null);
                  setPreviewImages([]);
                }}
              />
              
              {/* Navigation buttons */}
              {previewImages.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIndex = previewImages.indexOf(previewImage);
                      const prevIndex = currentIndex > 0 ? currentIndex - 1 : previewImages.length - 1;
                      setPreviewImage(previewImages[prevIndex]);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 rounded-full p-3 shadow-lg hover:bg-white transition-colors"
                  >
                    ◀
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentIndex = previewImages.indexOf(previewImage);
                      const nextIndex = currentIndex < previewImages.length - 1 ? currentIndex + 1 : 0;
                      setPreviewImage(previewImages[nextIndex]);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 text-gray-800 rounded-full p-3 shadow-lg hover:bg-white transition-colors"
                  >
                    ▶
                  </button>
                </>
              )}

              {/* Image counter */}
              {previewImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
                  {previewImages.indexOf(previewImage) + 1} / {previewImages.length}
                </div>
              )}

              <button
                onClick={() => {
                  setPreviewImage(null);
                  setPreviewImages([]);
                }}
                className="absolute -top-4 -right-4 bg-white text-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-100 text-xl"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Print Confirmation Modal */}
        {printConfirm && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
            onClick={() => setPrintConfirm(null)}
          >
            <div 
              className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">🖨️ Konfirmasi Print</h2>
                <p className="text-sm text-gray-500 mt-1">Pastikan detail pesanan sebelum print</p>
              </div>

              {/* Order Details */}
              <div className="space-y-4 mb-6 bg-gray-50 rounded-lg p-4">
                {/* Ticket Number */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">No. Tiket:</span>
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                    {printConfirm.queue_number ?? "-"}
                  </span>
                </div>

                {/* Customer Name */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-semibold text-gray-900">{printConfirm.customer_name || "-"}</span>
                </div>

                {/* Print Size - HIGHLIGHTED */}
                <div className="border-2 border-emerald-500 rounded-lg p-3 bg-emerald-50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-900">Ukuran Print:</span>
                    <span className="inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1 text-lg font-bold">
                      {printConfirm.size === "strip" || printConfirm.size === "2x6" ? "2×6" : "4×6"}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-700 mt-1">
                    {printConfirm.size === "strip" || printConfirm.size === "2x6" 
                      ? "📸 Foto strip / Photo strip" 
                      : "📷 Standar / Standard"}
                  </div>
                </div>

                {/* Quantity */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Jumlah:</span>
                  <span className="font-semibold text-gray-900">{printConfirm.qty} pcs</span>
                </div>

                {/* Total Photos */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Jumlah Foto:</span>
                  <span className="font-semibold text-gray-900">
                    {Array.isArray(printConfirm.image_urls) ? printConfirm.image_urls.length : 1} file
                  </span>
                </div>

                {/* Amount */}
                <div className="border-t border-emerald-200 pt-3 flex items-center justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold text-emerald-700 text-lg">Rp{formatIDR(printConfirm.amount)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setPrintConfirm(null)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={confirmedMarkPrinted}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 shadow-md transition-colors"
                >
                  ✓ Print Sekarang
                </button>
              </div>

              {/* Info */}
              <p className="text-xs text-gray-500 text-center mt-4">
                Pastikan printer sudah siap sebelum print
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
