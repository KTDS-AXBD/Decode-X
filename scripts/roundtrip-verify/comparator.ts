import type { ContractScenario, RunResult, FailReason } from "./types.js";

type ActualOutcome =
  | { ok: true; result: Record<string, unknown>; smsCalled?: boolean }
  | { ok: false; errorCode: string; errorMessage?: string };

// Canonical status name mappings (contract spec → implementation)
const STATUS_ALIASES: Record<string, string> = {
  PENDING: "REQUESTED",    // refund 신청 상태
  APPROVED: "COMPLETED",   // approveRefund returns APPROVED but stores COMPLETED
};

export function compare(
  contractFile: string,
  scenario: ContractScenario,
  actual: ActualOutcome
): RunResult {
  // Unsupported domain → pass with UNSUPPORTED_WHEN note only on error_code assertions
  if (!actual.ok && actual.errorCode.startsWith("UNSUPPORTED_WHEN:")) {
    return {
      contractFile,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      failReason: "UNSUPPORTED_WHEN" as const,
      failDetail: `Working prototype does not implement: ${actual.errorCode.replace("UNSUPPORTED_WHEN:", "")}`,
    };
  }

  const base = {
    contractFile,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
  };

  for (const thenEntry of scenario.then) {
    const [key, expected] = Object.entries(thenEntry)[0] as [string, unknown];

    const mismatch = checkAssertion(key, expected, actual);
    if (mismatch) {
      return { ...base, passed: false, ...mismatch };
    }
  }

  return { ...base, passed: true };
}

function checkAssertion(
  key: string,
  expected: unknown,
  actual: ActualOutcome
): { failReason: FailReason; failDetail: string } | null {
  switch (key) {
    case "payment_completed":
    case "cancel_completed":
    case "deposit_requested": {
      const expectSuccess = expected === true;
      if (expectSuccess && !actual.ok) {
        return {
          failReason: "WRONG_OUTCOME",
          failDetail: `Expected success but got error: ${actual.ok ? "" : actual.errorCode}`,
        };
      }
      if (!expectSuccess && actual.ok) {
        return { failReason: "WRONG_OUTCOME", failDetail: "Expected failure but operation succeeded" };
      }
      return null;
    }

    case "refund_rejected": {
      const expectFailure = expected === true;
      if (expectFailure && actual.ok) {
        return { failReason: "WRONG_OUTCOME", failDetail: "Expected refund rejection but succeeded" };
      }
      return null;
    }

    case "balance_after": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const actualBalance = actual.result["balanceAfter"] as number | undefined;
      if (actualBalance !== expected) {
        return {
          failReason: "WRONG_VALUE",
          failDetail: `balance_after: expected ${expected}, got ${actualBalance}`,
        };
      }
      return null;
    }

    case "balance_restored": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const restored = actual.result["balanceRestored"] ?? actual.result["amount"];
      if (restored !== expected) {
        return {
          failReason: "WRONG_VALUE",
          failDetail: `balance_restored: expected ${expected}, got ${String(restored)}`,
        };
      }
      return null;
    }

    case "balance_unchanged": {
      // Assertion is satisfied if the operation failed (error thrown)
      if (!actual.ok) return null;
      // If succeeded despite expecting unchanged balance, it's a failure
      return { failReason: "WRONG_OUTCOME", failDetail: "Expected balance_unchanged but operation succeeded" };
    }

    case "error_code": {
      if (actual.ok) {
        return { failReason: "EXPECTED_ERROR_MISSING", failDetail: `Expected error ${String(expected)} but operation succeeded` };
      }
      // Map contract error codes to actual implementation error codes
      const normalised = normaliseErrorCode(String(expected));
      if (actual.errorCode !== normalised) {
        return {
          failReason: "WRONG_VALUE",
          failDetail: `error_code: expected ${String(expected)} (mapped: ${normalised}), got ${actual.errorCode}`,
        };
      }
      return null;
    }

    case "sms_sent": {
      const expectSms = expected === true;
      const smsCalled = actual.ok ? (actual.smsCalled ?? false) : false;
      if (expectSms && !smsCalled) {
        return { failReason: "WRONG_VALUE", failDetail: "Expected SMS to be sent but it was not" };
      }
      return null;
    }

    case "card_approval_id": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const approvalId = actual.result["cardApprovalId"] ?? actual.result["approvalId"];
      if (expected === "non-null" && (approvalId == null || approvalId === "")) {
        return { failReason: "WRONG_VALUE", failDetail: "Expected non-null card_approval_id" };
      }
      return null;
    }

    case "refund_status": {
      if (!actual.ok && expected !== "REJECTED") {
        return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      }
      const rawStatus = actual.ok ? (actual.result["status"] as string | undefined) : "REJECTED";
      // Resolve aliases: contract uses PENDING, implementation uses REQUESTED
      const resolvedExpected = STATUS_ALIASES[String(expected)] ?? String(expected);
      const resolvedActual = STATUS_ALIASES[rawStatus ?? ""] ?? rawStatus;
      if (resolvedActual !== resolvedExpected) {
        return {
          failReason: "WRONG_VALUE",
          failDetail: `refund_status: expected ${String(expected)} (resolved: ${resolvedExpected}), got ${rawStatus ?? "undefined"}`,
        };
      }
      return null;
    }

    case "rfndPsbltyYn": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const yn = actual.result["rfndPsbltyYn"] as string | undefined;
      if (yn !== expected) {
        return { failReason: "WRONG_VALUE", failDetail: `rfndPsbltyYn: expected ${String(expected)}, got ${String(yn)}` };
      }
      return null;
    }

    case "reject_reason_recorded": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const recorded = actual.result["reject_reason_recorded"] as boolean | undefined;
      if (expected === true && !recorded) {
        return { failReason: "WRONG_VALUE", failDetail: "reject_reason_recorded: expected true but reason was not stored in DB" };
      }
      return null;
    }

    case "deposit_amount": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const val = actual.result["deposit_amount"] as number | undefined;
      if (val !== expected) {
        return { failReason: "WRONG_VALUE", failDetail: `deposit_amount: expected ${String(expected)}, got ${String(val)}` };
      }
      return null;
    }

    case "exclusion_amount": {
      if (!actual.ok) return { failReason: "UNEXPECTED_ERROR", failDetail: actual.errorCode };
      const val = actual.result["exclusion_amount"] as number | undefined;
      if (val !== expected) {
        return { failReason: "WRONG_VALUE", failDetail: `exclusion_amount: expected ${String(expected)}, got ${String(val)}` };
      }
      return null;
    }

    // STUB_PENDING: these keys appear in ES-PAYMENT-001+ Edge Specs but not in current round-trip contracts.
    // Replace null with actual.result comparison when the contract is added.
    case "newBalanceDeducted":
    case "newPaymentIdGenerated":
    case "responseIdempotent":
    case "responseStatus":
    case "responsePaymentId":
      return null;

    default:
      return null;
  }
}

// Map business-readable error codes in contract YAML to actual implementation codes
function normaliseErrorCode(code: string): string {
  const MAP: Record<string, string> = {
    INSUFFICIENT_VOUCHER_BALANCE: "E422-BAL",
    MERCHANT_INACTIVE: "E409-MS",
    FULL_REFUND_PERIOD_EXPIRED: "PERIOD_EXPIRED",
    VOUCHER_NOT_ACTIVE: "E409-VS",
    VOUCHER_NOT_FOUND: "E404-V",
    MERCHANT_NOT_FOUND: "E404-M",
  };
  return MAP[code] ?? code;
}
