import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';
import { processCancel, CancelError } from '../domain/cancel.js';

const app = new Hono();

// API-023: POST /api/v1/payments/:paymentId/cancel
app.post('/:paymentId/cancel', authMiddleware('USER', 'ADMIN'), async (c) => {
  const paymentId = c.req.param('paymentId');
  const body = await c.req.json<{ reason: string }>();
  const userId = c.get('userId') as string;
  const userRole = c.get('userRole') as string;

  try {
    const result = await processCancel(getDb(), {
      userId,
      userRole,
      paymentId,
      reason: body.reason,
    });

    return c.json({
      success: true,
      data: {
        payment_id: result.paymentId,
        status: result.status,
        cancel_reason: result.cancelReason,
        requested_at: result.requestedAt,
      },
    });
  } catch (err) {
    if (err instanceof CancelError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

export default app;
