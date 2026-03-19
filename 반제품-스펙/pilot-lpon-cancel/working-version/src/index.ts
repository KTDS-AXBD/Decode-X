import { Hono } from 'hono';
import chargingRoutes from './routes/charging.js';
import paymentRoutes from './routes/payment.js';
import cancelRoutes from './routes/cancel.js';
import refundRoutes from './routes/refund.js';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ success: true, data: { status: 'ok' } }));

// API routes
app.route('/api/v1/vouchers', chargingRoutes);  // POST /api/v1/vouchers/:voucherId/charges
app.route('/api/v1/payments', paymentRoutes);    // POST /api/v1/payments
app.route('/api/v1/payments', cancelRoutes);     // POST /api/v1/payments/:paymentId/cancel
app.route('/api/v1/refunds', refundRoutes);      // POST /api/v1/refunds

export default app;
