import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';
import { processCharge, ChargeError } from '../domain/charging.js';

const app = new Hono();

// API-010: POST /api/v1/vouchers/:voucherId/charges
app.post('/:voucherId/charges', authMiddleware('USER', 'ADMIN'), async (c) => {
  const voucherId = c.req.param('voucherId');
  const body = await c.req.json<{ amount: number; payment_method: string }>();
  const userId = c.get('userId') as string;

  try {
    const result = await processCharge(getDb(), {
      userId,
      voucherId,
      amount: body.amount,
      paymentMethod: body.payment_method,
      withdrawalAccountId: 'default', // PoC: 기본 계좌
    });

    return c.json({
      success: true,
      data: {
        charge_id: result.chargeId,
        voucher_id: result.voucherId,
        amount: result.amount,
        balance_after: result.balanceAfter,
        payment_method: result.paymentMethod,
        charged_at: result.chargedAt,
      },
    }, 201);
  } catch (err) {
    if (err instanceof ChargeError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

export default app;
