import { Resend } from 'resend';

// Only initialize Resend if API key exists
let resend: any = null;
try {
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch (e) {
  console.warn("Resend initialization error - email disabled:", e);
}

const FROM_EMAIL = 'onboarding@resend.dev'; // Replace with your domain if verified, e.g., 'receipts@sparkstage.id'

export async function sendOrderEmail({
  to,
  name,
  orderId,
  amount,
  items,
  type,
  queueNumber
}: {
  to: string;
  name: string;
  orderId: string;
  amount: number;
  items: { name: string; qty: number; price: number }[];
  type: 'ORDER_PLACED' | 'PAYMENT_RECEIVED';
  queueNumber?: number;
}) {
  // Skip email if Resend not available
  if (!resend || !process.env.RESEND_API_KEY) {
    console.log("[EMAIL] Resend disabled, skipping email send");
    return { success: true, message: 'Email skipped (disabled)' };
  }

  const subject = 
    type === 'PAYMENT_RECEIVED' 
      ? `E-Receipt: Order ${orderId}` 
      : `Menunggu Pembayaran: Order ${orderId}`;

  const title = 
    type === 'PAYMENT_RECEIVED' 
      ? 'Pembayaran Berhasil' 
      : 'Menunggu Pembayaran';

  const message = 
    type === 'PAYMENT_RECEIVED'
      ? 'Terima kasih telah melakukan pembayaran. Berikut adalah rincian pesanan Anda.'
      : 'Pesanan Anda telah dibuat. Silakan lakukan pembayaran di kasir untuk memproses pesanan ini.';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: sans-serif; line-height: 1.5; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #ff4b86; }
          .info { margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
          .details { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .details th, .details td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
          .total { font-size: 18px; font-weight: bold; text-align: right; padding-top: 10px; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #888; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">${title}</h1>
            <p>Halo ${name},</p>
            <p>${message}</p>
          </div>

          <div class="info">
            <p><strong>Order ID:</strong> ${orderId}</p>

          </div>

          <table class="details">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Harga</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.qty}</td>
                  <td>Rp${new Intl.NumberFormat('id-ID').format(item.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total">
            Total: Rp${new Intl.NumberFormat('id-ID').format(amount)}
          </div>

          <div class="footer">
            <p>Simpan email ini sebagai bukti pesanan Anda.</p>
            <p>&copy; ${new Date().getFullYear()} Spark Stage Print</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    if (!resend) {
      console.log("[EMAIL] Resend not available, skipping");
      return null;
    }
    
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log("[EMAIL] Email sent successfully:", data?.id);
    return data;
  } catch (error) {
    console.error("[EMAIL] Send error:", error);
    // Don't throw - just log and continue
    return null;
  }
}
