"use client";

import { useEffect, useMemo, useState } from "react";
import { connectQZ, checkPrinters, printPhoto, printPhotobooth4Pose, type PrintOrientation } from "@/lib/qzPrint";

type OrderStatus = "PENDING" | "PAID" | "PRINTED" | "FAILED" | string;

type Order = {
  id: string;
  doku_order_id: string | null;
  queue_number: number | null;
  customer_name: string | null;
  customer_email: string | null;
  image_urls: string[];
  photo_sizes?: string[]; // Per-photo sizes array
  size: string;
  qty: number;
  amount: number;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  payment_method?: string | null;
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function badgeClasses(status: string) {
  switch (status) {
    case "PAID":
      return "bg-gradient-to-r from-blue-500 to-blue-600 text-white border border-blue-600 shadow-sm";
    case "PRINTED":
      return "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border border-emerald-600 shadow-sm";
    case "PENDING":
      return "bg-gradient-to-r from-amber-400 to-amber-500 text-white border border-amber-500 shadow-sm";
    case "FAILED":
      return "bg-gradient-to-r from-red-500 to-red-600 text-white border border-red-600 shadow-sm";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

export default function AdminPage() {
  const [password] = useState("password123"); // Auto-fill password
  const [qrisOrders, setQrisOrders] = useState<Order[]>([]);
  const [cashierOrders, setCashierOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [autoRefresh] = useState(true); // Always on
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [qzConnected, setQzConnected] = useState(false);
  const [printingIds, setPrintingIds] = useState<Set<string>>(new Set());

  async function handleConnectQZ() {
    try {
      await connectQZ();
      setQzConnected(true);
      setMsg("QZ Connected successfully");
    } catch (err) {
      console.error("QZ Error:", err);
      setMsg("QZ Connection failed. Check QZ Tray is running.");
    }
  }

  async function handleCheckPrinters() {
    try {
      const printers = await checkPrinters();
      setMsg(`Found printers: ${JSON.stringify(printers)}`);
    } catch (err) {
      console.error("Check printers error:", err);
      setMsg("Failed to check printers");
    }
  }

  // Print confirmation modal
  const [printConfirm, setPrintConfirm] = useState<Order | null>(null);

  // Auto-print enabled
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(true);

  // Tab - temporarily disable cashier
  const [activeTab, setActiveTab] = useState<"qris" | "cashier">("qris");

  // Filters
  const [status, setStatus] = useState<"ALL" | "PENDING" | "PAID" | "PRINTED" | "FAILED">("ALL");
  const [needsPrint, setNeedsPrint] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<"ALL" | "2R" | "4R" | "4x6">("ALL");
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("landscape");
  const [q, setQ] = useState("");

  // Sort
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const authHeader = useMemo(() => ({ "x-admin-password": password }), [password]);

  async function load() {
    if (!password) {
      setMsg("Isi password operator dulu.");
      return;
    }

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

    const qrisRes = await fetch(`/api/admin/orders?${qrisParams.toString()}&_t=${Date.now()}`, { headers: authHeader });
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

    const cashierRes = await fetch(`/api/admin/orders?${cashierParams.toString()}&_t=${Date.now()}`, { headers: authHeader });
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
    await confirmedMarkPrintedWithOrder(printConfirm);
  }

  async function confirmedMarkPrintedWithOrder(order: Order) {
    const id = order.id;
    setPrintingIds(prev => new Set(prev).add(id));

    try {
      // Handle image_urls - ensure it's an array
      let imageUrls: string[] = [];
      if (Array.isArray(order.image_urls)) {
        imageUrls = order.image_urls;
      } else if (typeof order.image_urls === 'string') {
        imageUrls = [order.image_urls];
      }

      if (imageUrls.length === 0) {
        console.error(`[PRINT] Order ${id} has no images`);
        return;
      }

      console.log(`[PRINT] Starting print for order ${id}:`, {
        imageCount: imageUrls.length,
        size: order.size,
        qty: order.qty,
        urls: imageUrls,
      });

      // Check QZ connection
      if (!qzConnected) {
        console.error(`[PRINT] QZ Tray not connected for order ${id}`);
        return;
      }

      // Group images by size for mixed size orders
      const photoSizes = order.photo_sizes || [];
      const sizeGroups: Record<string, string[]> = {};

      imageUrls.forEach((url, idx) => {
        const size = photoSizes[idx] || '4R';
        if (!sizeGroups[size]) {
          sizeGroups[size] = [];
        }
        sizeGroups[size].push(url);
      });

      console.log(`[PRINT] Size groups:`, Object.keys(sizeGroups).map(size => `${size}: ${sizeGroups[size].length} photos`));

      // Print each size group separately
      for (const [size, urls] of Object.entries(sizeGroups)) {
        console.log(`[PRINT] Printing ${size} group: ${urls.length} photos`);

        // Use 4-pose renderer for 4 images of same size, otherwise print individually
        if (urls.length === 4) {
          console.log(`[PRINT] Using 4-pose photobooth renderer (${size})`);
          await printPhotobooth4Pose(urls, size as any, order.qty || 1);
        } else {
          // Print each image using QZ Tray with size-based orientation
          for (let i = 0; i < urls.length; i++) {
            console.log(`[PRINT] Printing image ${i + 1}/${urls.length} (${size})`);
            await printPhoto(urls[i], size as '2R' | '4R', 1);
          }
        }
      }

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
        return;
      }

      console.log(`[PRINT] ✅ Order marked as printed:`, markJson);

      // Close confirmation modal if it exists
      if (printConfirm && printConfirm.id === id) {
        setPrintConfirm(null);
      }

      // Reload data
      await load();
    } catch (error) {
      console.error("[PRINT] Error:", error);
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

  async function testWebhook(dokuOrderId: string) {
    if (!dokuOrderId) {
      alert("Order tidak memiliki doku_order_id");
      return;
    }
    if (!confirm(`Simulasi webhook payment SUCCESS untuk order ${dokuOrderId}?`)) return;

    try {
      const r = await fetch("/api/admin/doku-webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ doku_order_id: dokuOrderId, status: "SUCCESS" }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Gagal: ${j?.error ?? `HTTP ${r.status}`}`);
        return;
      }

      alert(`✅ Webhook test berhasil!\n${j?.message ?? ""}`);
      await load();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function debugWebhook(dokuOrderId: string) {
    if (!dokuOrderId) {
      alert("Order tidak memiliki doku_order_id");
      return;
    }

    try {
      const r = await fetch(`/api/admin/webhook-status?invoice_number=${dokuOrderId}`, {
        headers: authHeader,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Gagal: ${j?.error ?? `HTTP ${r.status}`}`);
        return;
      }

      const webhookReceived = j.webhook_logs && j.webhook_logs.length > 0;
      const message = `
📊 Order Status: ${j.order?.status}
💰 Amount: Rp${new Intl.NumberFormat("id-ID").format(j.order?.amount || 0)}
📧 Customer: ${j.order?.customer_name}

🔍 Webhook Status:
${webhookReceived ? "✅ Webhook DITERIMA dari DOKU" : "❌ Webhook TIDAK diterima dari DOKU"}

${webhookReceived ? `📝 Webhook Logs: ${j.webhook_logs.length} entry` : "⚠️ Solusi: Daftarkan webhook URL di DOKU Dashboard"}

${j.recommendation || ""}
      `.trim();

      alert(message);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function runDiagnostic() {
    try {
      const r = await fetch("/api/admin/webhook-diagnostic", {
        headers: authHeader,
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Gagal: ${j?.error ?? `HTTP ${r.status}`}`);
        return;
      }

      const message = `
🔍 WEBHOOK DIAGNOSTIC REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Connectivity:
- Edge Function: ${j.connectivity.edge_function_accessible ? "✅ Accessible" : "❌ Not accessible"}
- URL: ${j.connectivity.edge_function_url}

📊 Database:
- Total Orders: ${j.database.orders.total}
- Pending: ${j.database.orders.pending}
- Paid: ${j.database.orders.paid}
- Webhook Logs: ${j.database.webhook_logs.total_logs}

🔍 Analysis:
${j.analysis.issue_description}

Root Cause:
${j.analysis.root_cause}

Recommendation:
${j.analysis.recommendation}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();

      alert(message);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Auto-refresh - faster interval for real-time status updates
  useEffect(() => {
    if (!autoRefresh) return;
    if (!password) return;

    load();
    const t = setInterval(load, 2000); // 2 seconds for faster updates
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, password, status, needsPrint, sizeFilter, q, sortDir]);

  // Auto-print when order becomes PAID
  useEffect(() => {
    if (!autoPrintEnabled || !qzConnected) return;

    const newlyPaidOrders = qrisOrders.filter(
      o => o.status === "PAID" && !printingIds.has(o.id)
    );

    newlyPaidOrders.forEach(async (order) => {
      console.log(`[AUTO-PRINT] Auto-printing order ${order.id}...`);
      try {
        await confirmedMarkPrintedWithOrder(order);
      } catch (error) {
        console.error(`[AUTO-PRINT] Failed to auto-print order ${order.id}:`, error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrisOrders, autoPrintEnabled, qzConnected]);

  const currentOrders = activeTab === "qris" ? qrisOrders : cashierOrders;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div className="mx-auto max-w-[95%] px-4 py-6 sm:px-6 lg:px-8">
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
            <span className="text-sm text-gray-600">Auto-refresh: ON (2s)</span>
          </div>
        </div>

        {/* Password + Refresh */}
        <div className="mt-6 rounded-xl bg-white p-4 shadow-sm border border-gray-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <button
              onClick={load}
              className="rounded-lg bg-pink-500 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-pink-600 active:scale-[0.98] transition-all"
            >
              🔄 Refresh
            </button>

            <button
              onClick={handleConnectQZ}
              className={`rounded-lg px-6 py-2.5 font-semibold text-white shadow-sm active:scale-[0.98] transition-all ${
                qzConnected ? "bg-pink-700 hover:bg-pink-800" : "bg-pink-700 hover:bg-pink-800"
              }`}
            >
              {qzConnected ? "✓ QZ Connected" : "Connect QZ"}
            </button>

            <button
              onClick={handleCheckPrinters}
              className="rounded-lg bg-pink-500 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-pink-600 active:scale-[0.98] transition-all"
            >
              🔍 Find Printer
            </button>

            <button
              onClick={runDiagnostic}
              className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              🩺 Webhook Diagnostic
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
                ? "bg-pink-600 text-white shadow"
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
              <option value="2R">📷 2R (Strip)</option>
              <option value="4R">📷 4R (10×15cm)</option>
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
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-lg border border-gray-200">
          {/* Spark Logo */}
          <div className="flex justify-center pt-4 pb-2">
            <img
              src="/logo.png"
              alt="Spark Logo"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-pink-500 to-pink-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">No. Tiket</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Detail</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Aksi</th>
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
                      <span className="font-mono text-xs">{o.doku_order_id || "-"}</span>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Display per-photo sizes if available */}
                          {o.photo_sizes && o.photo_sizes.length > 0 ? (
                            o.photo_sizes.map((size, idx) => (
                              <span key={idx} className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                                {size === "strip" ? "2×6" : size}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                              {o.size === "strip" ? "2×6" : o.size}
                            </span>
                          )}
                          <span className="text-xs text-gray-600">({o.qty} {o.qty === 1 ? 'foto' : 'foto'})</span>
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

                        {/** Download button - Only available when PAID */}
                        {o.image_urls && o.image_urls.length > 0 && (
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
                            disabled={o.status !== "PAID"}
                            className={[
                              "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                              o.status === "PAID"
                                ? "bg-pink-500 text-white hover:bg-pink-600 shadow-sm"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            ].join(" ")}
                          >
                            ⬇️ Download
                          </button>
                        )}

                        <button
                          onClick={() => markPrinted(o.id)}
                          disabled={printingIds.has(o.id) || o.status !== "PAID"}
                          className={[
                            "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                            printingIds.has(o.id) || o.status !== "PAID"
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-pink-600 text-white hover:bg-pink-700 shadow-sm",
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-emerald-900">Ukuran Print:</span>
                    <span className="inline-flex items-center rounded-md bg-emerald-600 text-white px-3 py-1 text-lg font-bold">
                      {printConfirm.size === "strip" || printConfirm.size === "2x6" ? "2×6" : "4×6"}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-700">
                    {printConfirm.size === "strip" || printConfirm.size === "2x6" 
                      ? "📸 Foto strip / Photo strip" 
                      : "📷 Standar / Standard"}
                  </div>
                  <div className="text-xs text-emerald-600 mt-2">
                    🔄 Orientasi otomatis (Portrait/Landscape)
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
