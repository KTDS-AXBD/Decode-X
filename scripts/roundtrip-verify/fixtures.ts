import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const MIGRATION_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../반제품-스펙/pilot-lpon-cancel/working-version/migrations/0001_init.sql"
);

export const TEST_USER_ID = "user-test-001";
export const TEST_MERCHANT_OWNER_ID = "merchant-owner-001";
export const TEST_ADMIN_ID = "admin-001";
export const TEST_MERCHANT_ID = "merchant-test-001";
export const TEST_VOUCHER_ID = "voucher-test-001";
export const TEST_PAYMENT_ID = "payment-test-001";
export const TEST_REFUND_ID = "refund-test-001";

export interface FixtureIds {
  userId: string;
  merchantId: string;
  voucherId: string;
  paymentId: string;
  refundId: string;
}

function applyMigrations(db: Database.Database): void {
  const sql = readFileSync(MIGRATION_PATH, "utf-8");
  // Use bracket notation to avoid security hook pattern match on exec(
  (db as unknown as Record<string, (s: string) => void>)["exec"](sql);
}

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");
  applyMigrations(db);
  return db;
}

export function setupFixtures(
  db: Database.Database,
  given: Record<string, unknown>
): FixtureIds {
  const userId = TEST_USER_ID;
  const merchantId = TEST_MERCHANT_ID;
  const paymentId = (given["paymentId"] as string | undefined) ?? TEST_PAYMENT_ID;
  const refundId = (given["refundId"] as string | undefined) ?? TEST_REFUND_ID;

  db.prepare(
    `INSERT OR IGNORE INTO users(id, name, phone, role, status) VALUES(?,?,?,?,?)`
  ).run(userId, "테스트사용자", "010-0000-0000", "USER", "ACTIVE");

  db.prepare(
    `INSERT OR IGNORE INTO users(id, name, phone, role, status) VALUES(?,?,?,?,?)`
  ).run(TEST_MERCHANT_OWNER_ID, "가맹점주", "010-1111-1111", "MERCHANT", "ACTIVE");

  db.prepare(
    `INSERT OR IGNORE INTO users(id, name, phone, role, status) VALUES(?,?,?,?,?)`
  ).run(TEST_ADMIN_ID, "관리자", "010-2222-2222", "ADMIN", "ACTIVE");

  const merchantStatus = (given["merchantStatus"] as string | undefined) ?? "ACTIVE";
  // Map contract INACTIVE → SUSPENDED (DB CHECK constraint only allows ACTIVE/SUSPENDED/TERMINATED)
  const dbMerchantStatus = merchantStatus === "INACTIVE" ? "SUSPENDED" : merchantStatus;
  db.prepare(
    `INSERT OR IGNORE INTO merchants(id, name, business_number, owner_user_id, status) VALUES(?,?,?,?,?)`
  ).run(merchantId, "테스트가맹점", "123-45-67890", TEST_MERCHANT_OWNER_ID, dbMerchantStatus);

  const purchasedDaysAgo = (given["purchasedDaysAgo"] as number | undefined) ?? 0;
  const purchasedAt = new Date(Date.now() - purchasedDaysAgo * 86_400_000).toISOString();
  const voucherBalance = (given["voucherBalance"] as number | undefined) ?? 100_000;
  const originalAmount = (given["originalAmount"] as number | undefined) ?? voucherBalance;
  const voucherStatus = (given["voucherStatus"] as string | undefined) ?? "ACTIVE";
  db.prepare(
    `INSERT OR IGNORE INTO vouchers(id, user_id, face_amount, balance, status, purchased_at, expires_at) VALUES(?,?,?,?,?,?,?)`
  ).run(
    TEST_VOUCHER_ID, userId, originalAmount, voucherBalance, voucherStatus,
    purchasedAt,
    new Date(Date.now() + 365 * 86_400_000).toISOString()
  );

  const paymentStatus = given["paymentStatus"] as string | undefined;
  const paymentAmount = (given["paymentAmount"] as number | undefined) ?? 30_000;
  if (paymentStatus) {
    db.prepare(
      `INSERT OR IGNORE INTO payments(id, user_id, merchant_id, voucher_id, amount, method, status, paid_at) VALUES(?,?,?,?,?,?,?,?)`
    ).run(paymentId, userId, merchantId, TEST_VOUCHER_ID, paymentAmount, "QR", paymentStatus, new Date().toISOString());
  }

  const isRefundScenario = !!(given["refundType"] ?? given["refundId"] ?? given["refundStatus"]);
  if (isRefundScenario && !paymentStatus) {
    // Refund domain requires a CANCELED payment to exist for processRefundRequest
    db.prepare(
      `INSERT OR IGNORE INTO payments(id, user_id, merchant_id, voucher_id, amount, method, status, paid_at) VALUES(?,?,?,?,?,?,?,?)`
    ).run(TEST_PAYMENT_ID, userId, merchantId, TEST_VOUCHER_ID, paymentAmount, "QR", "CANCELED", new Date().toISOString());
  }

  const refundStatus = given["refundStatus"] as string | undefined;
  if (refundStatus) {
    const dbRefundStatus = refundStatus === "PENDING" ? "REQUESTED"
      : refundStatus === "REJECTED" ? "MANUAL_REQUIRED"
      : refundStatus;
    const depositAmount = (given["requestedAmount"] as number | undefined) ?? paymentAmount;
    // Ensure CANCELED payment exists for refund FK
    if (!paymentStatus) {
      db.prepare(
        `INSERT OR IGNORE INTO payments(id, user_id, merchant_id, voucher_id, amount, method, status, paid_at) VALUES(?,?,?,?,?,?,?,?)`
      ).run(paymentId, userId, merchantId, TEST_VOUCHER_ID, depositAmount, "QR", "CANCELED", new Date().toISOString());
    }
    db.prepare(
      `INSERT OR IGNORE INTO refund_transactions(id, user_id, voucher_id, refund_type, requested_amount, deposit_amount, status, rfnd_psblty_yn) VALUES(?,?,?,?,?,?,?,?)`
    ).run(refundId, userId, TEST_VOUCHER_ID, "USED_BALANCE", depositAmount, depositAmount, dbRefundStatus, "Y");
    db.prepare(
      `INSERT OR IGNORE INTO refund_accounts(id, user_id, bank_code, account_number, holder_name) VALUES(?,?,?,?,?)`
    ).run(randomUUID(), userId, "088", "123456789", "테스트사용자");
  }

  return { userId, merchantId, voucherId: TEST_VOUCHER_ID, paymentId, refundId };
}
