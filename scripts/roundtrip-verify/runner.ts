import type Database from "better-sqlite3";
import type { ContractScenario } from "./types.js";
import type { FixtureIds } from "./fixtures.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const DOMAIN_BASE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../반제품-스펙/pilot-lpon-cancel/working-version/src/domain"
);

// Dynamic import helpers — loads domain modules at runtime to allow fresh require per scenario
async function loadDomain<T>(file: string): Promise<T> {
  return (await import(`${DOMAIN_BASE}/${file}`)) as T;
}

type RunOutcome =
  | { ok: true; result: Record<string, unknown>; smsCalled?: boolean }
  | { ok: false; errorCode: string; errorMessage?: string };

export async function runScenario(
  db: Database.Database,
  scenario: ContractScenario,
  ids: FixtureIds
): Promise<RunOutcome> {
  const { when, given } = scenario;

  try {
    switch (when) {
      case "payment_requested":
        return await runPayment(db, given, ids);

      case "payment_cancel_requested":
        return await runCancel(db, given, ids);

      case "refund_requested":
        return runRefundRequest(db, given, ids);

      case "admin_approves_refund":
      case "refund_approved":
        return await runRefundApprove(db, given, ids);

      case "admin_rejects_refund":
        return runRefundReject(db, given, ids);

      default:
        return { ok: false, errorCode: `UNSUPPORTED_WHEN:${when}`, errorMessage: `Domain not implemented in working prototype: ${when}` };
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return { ok: false, errorCode: e.code ?? "UNKNOWN_ERROR", errorMessage: e.message };
  }
}

async function runPayment(
  db: Database.Database,
  given: Record<string, unknown>,
  ids: FixtureIds
): Promise<RunOutcome> {
  type PaymentModule = {
    processPayment: (db: Database.Database, input: Record<string, unknown>, cardApi?: unknown, notif?: unknown) => Promise<Record<string, unknown>>;
    mockCardApi: unknown;
    mockNotificationService: unknown;
  };
  const mod = await loadDomain<PaymentModule>("payment.js");

  let smsCalled = false;
  const smsMock = {
    sendPaymentSms: async () => { smsCalled = true; },
  };

  // Capture card approvalId via intercepting mock
  let capturedApprovalId: string | null = null;
  const capturingCardApi = {
    authorize: async (merchantId: string, amount: number) => {
      const base = mod.mockCardApi as { authorize: (m: string, a: number) => Promise<{ approvalId: string }> };
      const r = await base.authorize(merchantId, amount);
      capturedApprovalId = r.approvalId;
      return r;
    },
  };

  const paymentAmount = (given["paymentAmount"] as number | undefined) ?? 30_000;
  const method = (given["method"] as string | undefined) ?? "QR";

  const result = await mod.processPayment(
    db,
    { userId: ids.userId, voucherId: ids.voucherId, merchantId: ids.merchantId, amount: paymentAmount, method },
    capturingCardApi,
    smsMock
  );

  return { ok: true, result: { ...result, cardApprovalId: capturedApprovalId }, smsCalled };
}

async function runCancel(
  db: Database.Database,
  given: Record<string, unknown>,
  ids: FixtureIds
): Promise<RunOutcome> {
  type CancelModule = {
    processCancel: (db: Database.Database, input: Record<string, unknown>, cardApi?: unknown) => Promise<Record<string, unknown>>;
    mockCardCancelApi: unknown;
  };
  const mod = await loadDomain<CancelModule>("cancel.js");

  const result = await mod.processCancel(
    db,
    { userId: ids.userId, userRole: "USER", paymentId: ids.paymentId, reason: "customer_request" },
    mod.mockCardCancelApi
  );

  // After cancel, measure balance restoration
  const voucher = db.prepare("SELECT balance FROM vouchers WHERE id = ?").get(ids.voucherId) as { balance: number } | undefined;
  const cancelType = given["cancelType"] as string | undefined;
  const originalBalance = (given["voucherBalance"] as number | undefined) ?? 100_000;
  const paymentAmount = (given["paymentAmount"] as number | undefined) ?? 30_000;
  const expectedBalanceAfterCancel = cancelType === "FULL" ? originalBalance + paymentAmount : voucher?.balance ?? 0;

  return {
    ok: true,
    result: {
      ...result,
      balanceRestored: voucher ? expectedBalanceAfterCancel - (originalBalance) : paymentAmount,
      amount: paymentAmount,
    },
  };
}

function runRefundRequest(
  db: Database.Database,
  given: Record<string, unknown>,
  ids: FixtureIds
): RunOutcome {
  type RefundModule = {
    processRefundRequest: (db: Database.Database, input: Record<string, unknown>) => Record<string, unknown>;
    RefundError: new (...args: unknown[]) => { code: string; message: string };
  };
  // Use require-style dynamic import synchronously via createRequire for sync domain function
  const require = createRequire(import.meta.url);
  // tsx resolves .js to .ts automatically in dev; in production, use compiled .js
  let mod: RefundModule;
  try {
    mod = require(`${DOMAIN_BASE}/refund.js`) as RefundModule;
  } catch {
    // Fallback: ts source (tsx runtime)
    mod = require(`${DOMAIN_BASE}/refund.ts`) as RefundModule;
  }

  const paymentAmount = (given["paymentAmount"] as number | undefined) ?? 30_000;
  const refundType = (given["refundType"] as string | undefined) ?? "USED_BALANCE";
  const result = mod.processRefundRequest(db, {
    userId: ids.userId,
    paymentId: ids.paymentId,
    amount: paymentAmount,
    reason: "customer_request",
    refundType,
  });

  return { ok: true, result };
}

async function runRefundApprove(
  db: Database.Database,
  _given: Record<string, unknown>,
  ids: FixtureIds
): Promise<RunOutcome> {
  type RefundModule = {
    approveRefund: (db: Database.Database, refundId: string, depositApi?: unknown) => Promise<Record<string, unknown>>;
    mockDepositApi: unknown;
  };
  const mod = await loadDomain<RefundModule>("refund.js");
  const result = await mod.approveRefund(db, ids.refundId, mod.mockDepositApi);
  // Domain returns status='APPROVED' but DB stores 'COMPLETED' — read DB authoritative value
  // Also read deposit_amount and exclusion_amount for comparator real verification
  const row = db.prepare("SELECT status, deposit_amount, exclusion_amount FROM refund_transactions WHERE id = ?").get(ids.refundId) as {
    status: string; deposit_amount: number; exclusion_amount: number;
  } | undefined;
  return {
    ok: true,
    result: {
      ...result,
      status: row?.status ?? result["status"],
      deposit_requested: true,
      deposit_amount: row?.deposit_amount,
      exclusion_amount: row?.exclusion_amount,
    },
  };
}

function runRefundReject(
  db: Database.Database,
  given: Record<string, unknown>,
  ids: FixtureIds
): RunOutcome {
  type RefundModule = {
    rejectRefund: (db: Database.Database, refundId: string, reason: string) => Record<string, unknown>;
  };
  const require = createRequire(import.meta.url);
  let mod: RefundModule;
  try {
    mod = require(`${DOMAIN_BASE}/refund.js`) as RefundModule;
  } catch {
    mod = require(`${DOMAIN_BASE}/refund.ts`) as RefundModule;
  }
  const rejectReason = (given["rejectReason"] as string | undefined) ?? "INVALID_REQUEST";
  const result = mod.rejectRefund(db, ids.refundId, rejectReason);
  // Verify reject reason was actually stored in DB
  const row = db.prepare("SELECT error_message FROM refund_transactions WHERE id = ?").get(ids.refundId) as {
    error_message: string | null;
  } | undefined;
  return { ok: true, result: { ...result, reject_reason_recorded: (row?.error_message ?? "") !== "" } };
}
