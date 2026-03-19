import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';
import { processPayment, PaymentError } from '../domain/payment.js';

const app = new Hono();

// API-020: POST /api/v1/payments
app.post('/', authMiddleware('USER'), async (c) => {
  const body = await c.req.json<{
    voucher_id: string;
    merchant_id: string;
    amount: number;
    method?: string;
  }>();
  const userId = c.get('userId') as string;

  try {
    const result = await processPayment(getDb(), {
      userId,
      voucherId: body.voucher_id,
      merchantId: body.merchant_id,
      amount: body.amount,
      method: body.method ?? 'QR',
    });

    return c.json({
      success: true,
      data: {
        payment_id: result.paymentId,
        voucher_id: result.voucherId,
        merchant_id: result.merchantId,
        amount: result.amount,
        balance_after: result.balanceAfter,
        status: result.status,
        paid_at: result.paidAt,
      },
    }, 201);
  } catch (err) {
    if (err instanceof PaymentError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

export default app;
