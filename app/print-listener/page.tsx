"use client";

import { useEffect, useState } from "react";

interface Order {
  id: string;
  queue_number: number;
  customer_name: string;
  image_url: string; // Changed from fotoshare_token
  size: string;
  qty: number;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string;
}

export default function PrintListenerPage() {
  const [status, setStatus] = useState("Menunggu order...");
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [qzStatus, setQzStatus] = useState<"unknown" | "connected" | "disconnected" | "error">("unknown");

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]); // Keep last 10 logs
  };

  const testQzConnection = async () => {
    try {
      const { printService } = await import("../../lib/printService");
      await printService.connect();
      const isConnected = printService.isConnected();
      setQzStatus(isConnected ? "connected" : "disconnected");
      addLog(`QZ Tray connection test: ${isConnected ? "SUCCESS" : "FAILED"}`);
    } catch (error) {
      setQzStatus("error");
      addLog(`QZ Tray connection test failed: ${error}`);
    }
  };

  const fetchReadyOrders = async () => {
    try {
      const response = await fetch("/api/orders/ready-to-print");
      if (!response.ok) throw new Error("Failed to fetch orders");

      const orders: Order[] = await response.json();
      if (orders.length > 0) {
        const order = orders[0]; // Process first order
        setCurrentOrder(order);
        setStatus(`Memproses order #${order.queue_number}`);
        addLog(`Order #${order.queue_number} siap print`);

        // Trigger print
        await printOrder(order);
      }
    } catch (error) {
      addLog(`Error fetching orders: ${error}`);
    }
  };

  const printOrder = async (order: Order) => {
    try {
      // Import print service dynamically to avoid SSR issues
      const { printService } = await import("../../lib/printService");

      const imageUrl = order.image_url;
      addLog(`Printing ${order.qty}x ${order.size} for order #${order.queue_number}`);

      await printService.printImage({ imageUrl, quantity: order.qty, size: order.size as "4x6", orderId: order.id });

      // Mark as printed
      const response = await fetch(`/api/orders/${order.id}/printed`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to mark as printed");

      addLog(`Order #${order.queue_number} berhasil di-print`);
      setCurrentOrder(null);
      setStatus("Menunggu order...");
    } catch (error) {
      addLog(`Error printing order #${order.queue_number}: ${error}`);
      setStatus(`Error: ${error}`);
    }
  };

  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(fetchReadyOrders, 3000); // Poll every 3 seconds
    fetchReadyOrders(); // Initial fetch

    return () => clearInterval(interval);
  }, [isPolling]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Print Listener - Auto Print System</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Status</h2>
          <p className="text-lg">{status}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-600">QZ Tray:</span>
            <span className={`px-2 py-1 rounded text-sm ${
              qzStatus === "connected" ? "bg-green-100 text-green-800" :
              qzStatus === "disconnected" ? "bg-red-100 text-red-800" :
              qzStatus === "error" ? "bg-red-100 text-red-800" :
              "bg-gray-100 text-gray-800"
            }`}>
              {qzStatus === "connected" ? "✅ Connected" :
               qzStatus === "disconnected" ? "❌ Disconnected" :
               qzStatus === "error" ? "⚠️ Error" :
               "❓ Unknown"}
            </span>
          </div>
          {currentOrder && (
            <div className="mt-4 p-4 bg-blue-50 rounded">
              <p><strong>Order #:</strong> {currentOrder.queue_number}</p>
              <p><strong>Customer:</strong> {currentOrder.customer_name}</p>
              <p><strong>Size:</strong> {currentOrder.size}</p>
              <p><strong>Qty:</strong> {currentOrder.qty}</p>
              <div className="mt-2">
                <img
                  src={currentOrder.image_url}
                  alt="Preview"
                  className="max-w-xs max-h-48 object-contain border"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Log Aktivitas</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm text-gray-600 font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={testQzConnection}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Test QZ Connection
          </button>
          <button
            onClick={() => setIsPolling(!isPolling)}
            className={`px-4 py-2 rounded ${
              isPolling ? "bg-red-500 text-white" : "bg-green-500 text-white"
            }`}
            disabled={qzStatus !== "connected"}
          >
            {isPolling ? "Stop Polling" : "Start Polling"}
          </button>
          <button
            onClick={fetchReadyOrders}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Check Now
          </button>
        </div>
      </div>
    </div>
  );
}