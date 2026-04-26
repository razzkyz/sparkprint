This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Auto Print Setup (QZ Tray)

For automatic printing functionality on the cashier PC:

1. **Download and Install QZ Tray:**
   - Download from: https://qz.io/download/
   - Install on the cashier PC
   - Run QZ Tray application

2. **Certificate Setup:**
   - Open QZ Tray settings
   - Generate or import SSL certificate
   - Allow the certificate in browser when prompted

3. **Printer Setup:**
   - Ensure your photo printer is connected and set as default
   - Test printing from QZ Tray demo

4. **Access Print Listener:**
   - Open `http://localhost:3000/print-listener` on the cashier PC
   - Keep this page open - it will automatically detect and print new orders

### Troubleshooting QZ Tray Connection

**Error: "A connection to QZ Tray has not been established yet"**

1. **QZ Tray Not Running:**
   - Make sure QZ Tray application is running
   - Check system tray for QZ Tray icon

2. **Certificate Issues:**
   - Open QZ Tray → Settings → Certificates
   - Generate self-signed certificate or import valid certificate
   - Add your domain (localhost for development) to allowed sites

3. **Browser Security:**
   - QZ Tray requires HTTPS in production
   - For development, allow insecure localhost connections
   - Check browser console for certificate warnings

4. **Network/Firewall:**
   - QZ Tray uses WebSocket on port 8181 (default)
   - Ensure firewall allows connections to localhost:8181

5. **Certificate Signing (Development):**
   - Current code allows unsigned certificates for development
   - In production, implement proper certificate signing

**Test Connection:**
- Open browser console on `/print-listener` page
- Look for "Connected to QZ Tray" message
- Check Network tab for WebSocket connections

**Alternative Setup:**
If QZ Tray setup is complex, consider:
- Direct printer APIs (Windows/Mac specific)
- Third-party print services
- Manual print triggers from admin panel

### Alternative: WebSocket Implementation

For real-time updates instead of polling, you can implement WebSocket:

1. Install WebSocket library: `npm install ws`
2. Create WebSocket server in `lib/websocketServer.ts`
3. Modify `/api/orders/ready-to-print` to broadcast updates
4. Update `print-listener/page.tsx` to use WebSocket instead of polling

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
