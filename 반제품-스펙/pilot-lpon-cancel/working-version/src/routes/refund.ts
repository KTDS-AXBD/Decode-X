import { Hono } from 'hono';
import { getDb } from '../db.js';
import { authMiddleware } from '../auth.js';
import { processRefundRequest, approveRefund, rejectRefund, RefundError } from '../domain/refund.js';

const app = new Hono();

// API-030: POST /api/v1/refunds
app.post('/', authMiddleware('USER', 'ADMIN'), async (c) => {
  const body = await c.req.json<{
    payment_id: string;
    amount: number;
    reason: string;
  }>();
  const userId = c.get('userId') as string;

  try {
    const result = processRefundRequest(getDb(), {
      userId,
      paymentId: body.payment_id,
      amount: body.amount,
      reason: body.reason,
    });

    return c.json({
      success: true,
      data: {
        refund_id: result.refundId,
        payment_id: result.paymentId,
        amount: result.amount,
        status: result.status,
        reason: result.reason,
        requested_at: result.requestedAt,
      },
    }, 201);
  } catch (err) {
    if (err instanceof RefundError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

// API-033: POST /api/v1/refunds/:refundId/approve
app.post('/:refundId/approve', authMiddleware('ADMIN'), async (c) => {
  const refundId = c.req.param('refundId');

  try {
    const result = await approveRefund(getDb(), refundId);

    return c.json({
      success: true,
      data: {
        refund_id: result.refundId,
        status: result.status,
        approved_at: result.approvedAt,
      },
    });
  } catch (err) {
    if (err instanceof RefundError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

// API-034: POST /api/v1/refunds/:refundId/reject
app.post('/:refundId/reject', authMiddleware('ADMIN'), async (c) => {
  const refundId = c.req.param('refundId');
  const body = await c.req.json<{ reason: string }>();

  try {
    const result = rejectRefund(getDb(), refundId, body.reason);

    return c.json({
      success: true,
      data: {
        refund_id: result.refundId,
        status: result.status,
        reject_reason: result.rejectReason,
        rejected_at: result.rejectedAt,
      },
    });
  } catch (err) {
    if (err instanceof RefundError) {
      return c.json(
        { success: false, error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    throw err;
  }
});

export default app;
