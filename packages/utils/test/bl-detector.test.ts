import { describe, it, expect } from "vitest";
import {
  detectHardCodedExclusion,
  detectUnderImplementation,
  detectTemporalCheck,
  detectExpiryCheck,
  detectCashbackBranch,
  detectThresholdCheck,
  detectStatusTransition,
  detectAtomicTransaction,
  parseTypeScriptSource,
  BL_DETECTOR_REGISTRY,
} from "../src/divergence/bl-detector.js";
import { crossCheck, parseProvenanceMarkers } from "../src/divergence/provenance-cross-check.js";

describe("BL-028 — detectHardCodedExclusion", () => {
  it("detects const exclusionAmount = 0", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f() {
  const exclusionAmount = 0;
  return exclusionAmount;
}`,
    );
    const markers = detectHardCodedExclusion(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-028");
    expect(markers[0]?.confidence).toBe(0.95);
    expect(markers[0]?.matchedText).toContain("exclusionAmount");
  });

  it("detects let excl_amount = 0 (assignment via initializer)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `let excl_amount = 0;`,
    );
    const markers = detectHardCodedExclusion(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.matchedText).toContain("excl_amount");
  });

  it("does NOT detect computed exclusionAmount", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { cashback: number }) {
  const exclusionAmount = Math.round(voucher.cashback * 1.1);
  return exclusionAmount;
}`,
    );
    const markers = detectHardCodedExclusion(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("does NOT detect unrelated value = 0", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `const counter = 0;
const value = 0;
const total = 0;`,
    );
    const markers = detectHardCodedExclusion(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("detects assignment expression exclusionAmount = 0", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f() {
  let exclusionAmount: number;
  exclusionAmount = 0;
  return exclusionAmount;
}`,
    );
    const markers = detectHardCodedExclusion(src, "test.ts");
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers.some((m) => m.matchedText?.includes("exclusionAmount"))).toBe(true);
  });
});

describe("BL-027 — detectUnderImplementation", () => {
  it("detects stub function (3 line body, 0 branch)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function approveRefund() {
  return { status: "approved" };
}`,
    );
    const markers = detectUnderImplementation(src, "test.ts", {
      targetFunctionNames: ["approveRefund"],
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-027");
    expect(markers[0]?.confidence).toBe(0.7);
  });

  it("does NOT detect implemented function (large body + branches)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `async function approveRefund(refundId: string) {
  if (!refundId) {
    throw new Error("invalid");
  }
  try {
    if (Math.random() > 0.5) {
      const result = await fetch("https://example.com");
      return result;
    }
    if (Math.random() < 0.1) {
      return null;
    }
    return { status: "approved" };
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("unknown");
  }
}`,
    );
    const markers = detectUnderImplementation(src, "test.ts", {
      targetFunctionNames: ["approveRefund"],
    });
    expect(markers).toHaveLength(0);
  });

  it("respects target function name filter", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function shortStub() {
  return 1;
}
function alsoShort() {
  return 2;
}`,
    );
    const filtered = detectUnderImplementation(src, "test.ts", {
      targetFunctionNames: ["shortStub"],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.matchedText).toBe("shortStub");

    const all = detectUnderImplementation(src, "test.ts");
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// F427 (Sprint 260) — BL-024 / BL-029 / BL-026 detector tests
// ---------------------------------------------------------------------------

describe("BL-024 — detectTemporalCheck", () => {
  it("does NOT flag when daysSincePurchase > 7 present (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { purchased_at: string }) {
  const daysSincePurchase = (Date.now() - new Date(voucher.purchased_at).getTime()) / (1000*60*60*24);
  if (daysSincePurchase > 7) {
    throw new Error("PERIOD_EXPIRED");
  }
}`,
    );
    const markers = detectTemporalCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags BL-024 when no 7-day window check present (DIVERGENCE)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function processRefund(refundType: string) {
  if (refundType === 'UNUSED_FULL') {
    return { status: 'OK' };
  }
}`,
    );
    const markers = detectTemporalCheck(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-024");
    expect(markers[0]?.pattern).toBe("missing_temporal_check");
    expect(markers[0]?.confidence).toBe(0.75);
  });

  it("does NOT match unrelated `> 7` literal (counter > 7)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(counter: number) {
  if (counter > 7) return true;
  return false;
}`,
    );
    const markers = detectTemporalCheck(src, "test.ts");
    // counter는 temporal field가 아니므로 PRESENCE 매칭 안 됨 → ABSENCE marker 발행
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-024");
  });
});

describe("BL-029 — detectExpiryCheck", () => {
  it("does NOT flag when expires_at < new Date() present (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { expires_at: string }) {
  if (new Date(voucher.expires_at) < new Date()) {
    throw new Error("EXPIRED");
  }
}`,
    );
    const markers = detectExpiryCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("does NOT flag when expir field compared to Date.now() (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { validUntil: number }) {
  if (voucher.validUntil < Date.now()) return false;
  return true;
}`,
    );
    const markers = detectExpiryCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags BL-029 when no expiry comparison present (DIVERGENCE)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { balance: number }) {
  return voucher.balance > 0;
}`,
    );
    const markers = detectExpiryCheck(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-029");
    expect(markers[0]?.pattern).toBe("missing_validation_check");
    expect(markers[0]?.confidence).toBe(0.8);
  });
});

describe("BL-026 — detectCashbackBranch", () => {
  it("does NOT flag when cashback branch with reject outcome present (RESOLVED hypothetical)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { cashback_amount: number }) {
  if (voucher.cashback_amount > 0) {
    throw new Error("CASHBACK_REFUND_DENIED");
  }
  return { ok: true };
}`,
    );
    const markers = detectCashbackBranch(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags BL-026 when cashback_amount used but no reject branch (current refund.ts)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { cashback_amount: number }, amount: number) {
  const exclusion = Math.round(voucher.cashback_amount * 1.1);
  return amount - exclusion;
}`,
    );
    const markers = detectCashbackBranch(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-026");
    expect(markers[0]?.pattern).toBe("missing_alt_branch");
  });

  it("flags BL-026 when cashback branch exists but no reject outcome", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(voucher: { cashback_amount: number }) {
  if (voucher.cashback_amount > 0) {
    return { adjusted: true };
  }
  return { adjusted: false };
}`,
    );
    const markers = detectCashbackBranch(src, "test.ts");
    expect(markers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// F429 (Sprint 262) — Threshold/Status transition/Atomic transaction tests
// ---------------------------------------------------------------------------

describe("BL-005~008/015 — detectThresholdCheck", () => {
  it("does NOT flag when threshold comparison present (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function check(amount: number) {
  if (amount > DAILY_LIMIT) {
    throw new Error("limit exceeded");
  }
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("does NOT flag for amount >= 50_000 numeric literal", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(amount: number) {
  if (amount >= 50000) {
    sendSms();
  }
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags missing threshold check (DIVERGENCE)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function noThreshold(input: string) {
  return input.toUpperCase();
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.pattern).toBe("missing_threshold_check");
    expect(markers[0]?.confidence).toBe(0.7);
  });
});

describe("BL-014 — detectStatusTransition", () => {
  it("does NOT flag when comparison + assignment both present (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function pay(voucher: { status: string }) {
  if (voucher.status !== 'ACTIVE') {
    throw new Error("not active");
  }
  return { status: 'PAID' };
}`,
    );
    const markers = detectStatusTransition(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags when only comparison present (no assignment)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function check(s: { status: string }) {
  if (s.status === 'ACTIVE') return true;
  return false;
}`,
    );
    const markers = detectStatusTransition(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.detail).toContain("comparison=true");
    expect(markers[0]?.detail).toContain("assignment=false");
  });

  it("flags when only assignment present (no comparison)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function create() {
  return { status: 'PAID' };
}`,
    );
    const markers = detectStatusTransition(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.detail).toContain("comparison=false");
  });
});

describe("BL-022 — detectAtomicTransaction", () => {
  it("does NOT flag when db.transaction present (RESOLVED)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function approve(db: any) {
  const tx = db.transaction(() => {
    db.prepare('INSERT ...').run();
    db.prepare('UPDATE ...').run();
  });
  tx();
}`,
    );
    const markers = detectAtomicTransaction(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("does NOT flag for database.transaction (alias receiver)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function f(database: any) {
  database.transaction(() => { /* atomic */ })();
}`,
    );
    const markers = detectAtomicTransaction(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("flags missing transaction (sequential statements)", () => {
    const src = parseTypeScriptSource(
      "test.ts",
      `function approveLegacy(db: any) {
  db.prepare('INSERT ...').run();
  db.prepare('UPDATE ...').run();
  db.prepare('UPDATE balance ...').run();
}`,
    );
    const markers = detectAtomicTransaction(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.pattern).toBe("missing_atomic_transaction");
    expect(markers[0]?.confidence).toBe(0.85);
  });
});

describe("BL-G002~G006 — gift domain (Sprint 264 F431)", () => {
  // Sprint 264: gift.ts에 5 BL이 모두 status transition + atomic transaction 패턴.
  // detector는 file-level PRESENCE 판정이라 5 BL 모두 같은 결과 (RESOLVED 빈 배열).
  const giftSrc = `
    function acceptGift(db, giftId, receiverId) {
      const gift = db.prepare("SELECT status FROM gift_transactions WHERE id = ?").get(giftId);
      if (gift.status !== 'pending') {
        throw new GiftError('E422', 'already processed', 422);
      }
      const tx = db.transaction(() => {
        db.prepare("UPDATE gift_transactions SET status = 'accepted' WHERE id = ?").run(giftId);
      });
      tx();
    }
  `;

  it("BL-G002 (status transition pending → accepted) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("gift.ts", giftSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G002"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "gift.ts");
    expect(markers).toEqual([]);
  });

  it("BL-G003 (status transition pending → rejected) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("gift.ts", giftSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G003"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "gift.ts")).toEqual([]);
  });

  it("BL-G004 (status transition pending → expired) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("gift.ts", giftSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G004"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "gift.ts")).toEqual([]);
  });

  it("BL-G005 (status transition pending → canceled) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("gift.ts", giftSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G005"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "gift.ts")).toEqual([]);
  });

  it("BL-G006 (atomic transaction db.transaction()) — PRESENCE → 0 markers + ruleId tagged", () => {
    const sf = parseTypeScriptSource("gift.ts", giftSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G006"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "gift.ts")).toEqual([]);
  });

  it("BL-G002 ABSENCE — status comparison only, no assignment → 1 marker with ruleId BL-G002", () => {
    const partial = `
      function check(db) {
        const row = db.prepare("SELECT status FROM gift_transactions").get();
        if (row.status !== 'pending') throw new Error('bad');
      }
    `;
    const sf = parseTypeScriptSource("gift.ts", partial);
    const markers = BL_DETECTOR_REGISTRY["BL-G002"]!(sf, "gift.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-G002");
  });

  it("BL-G006 ABSENCE — sequential writes (no db.transaction) → 1 marker with ruleId BL-G006", () => {
    const partial = `
      function nonAtomic(db) {
        db.prepare("UPDATE vouchers SET balance = balance - 100").run();
        db.prepare("UPDATE vouchers SET balance = balance + 100").run();
      }
    `;
    const sf = parseTypeScriptSource("gift.ts", partial);
    const markers = BL_DETECTOR_REGISTRY["BL-G006"]!(sf, "gift.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-G006");
  });
});

describe("BL-budget/purchase — 10 BL (Sprint 266 F433)", () => {
  // budget.ts/purchase.ts 모두 status check + threshold + atomic transaction 패턴.
  // file-level PRESENCE 판정으로 동일 파일 내 모든 BL 동일 결과.
  const budgetSrc = `
    function allocateBudget(db, companyId, amount, MAX_LIMIT) {
      if (amount > MAX_LIMIT) throw new Error('limit');
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO budget_ledger (status) VALUES ('active')").run();
      });
      tx();
    }
    function rollover(db, ledgerId) {
      const row = db.prepare("SELECT status, rollover_yn FROM budget_ledger").get();
      if (row.status !== 'active') throw new Error('bad');
      if (row.rollover_yn === 'Y') {
        db.prepare("UPDATE budget_ledger SET status = 'rolled_over'").run();
      }
    }
  `;

  it("BB-001 (threshold) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("budget.ts", budgetSrc);
    expect(BL_DETECTOR_REGISTRY["BB-001"]!(sf, "budget.ts")).toEqual([]);
  });

  it("BB-004 (status transition rollover_yn) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("budget.ts", budgetSrc);
    expect(BL_DETECTOR_REGISTRY["BB-004"]!(sf, "budget.ts")).toEqual([]);
  });

  it("BB-005 (atomic transaction) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("budget.ts", budgetSrc);
    expect(BL_DETECTOR_REGISTRY["BB-005"]!(sf, "budget.ts")).toEqual([]);
  });

  const purchaseSrc = `
    const PER_PURCHASE_LIMIT = 500_000;
    function requestPurchase(db, userId, amount) {
      if (amount > PER_PURCHASE_LIMIT) throw new Error('limit');
      const row = db.prepare("SELECT status FROM purchase_transactions").get();
      if (row.status !== 'pending') throw new Error('bad');
      db.prepare("UPDATE purchase_transactions SET status = 'completed'").run(userId, amount);
    }
  `;

  it("BP-001 (threshold per-purchase limit) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("purchase.ts", purchaseSrc);
    expect(BL_DETECTOR_REGISTRY["BP-001"]!(sf, "purchase.ts")).toEqual([]);
  });

  it("BP-002 (status transition pending → completed) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("purchase.ts", purchaseSrc);
    expect(BL_DETECTOR_REGISTRY["BP-002"]!(sf, "purchase.ts")).toEqual([]);
  });

  it("BB-001 ABSENCE — no threshold + UPPERCASE_CONSTANT → 1 marker with ruleId BB-001", () => {
    const partial = `
      function f(amount) {
        return amount + 1;
      }
    `;
    const sf = parseTypeScriptSource("budget.ts", partial);
    const markers = BL_DETECTOR_REGISTRY["BB-001"]!(sf, "budget.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BB-001");
  });
});

describe("BL_DETECTOR_REGISTRY", () => {
  it("exposes 50 detectors (Sprint 275 F441 — loyalty-points 6 BL added)", () => {
    expect(Object.keys(BL_DETECTOR_REGISTRY).sort()).toEqual([
      "BB-001",
      "BB-002",
      "BB-003",
      "BB-004",
      "BB-005",
      "BL-005",
      "BL-006",
      "BL-007",
      "BL-008",
      "BL-014",
      "BL-015",
      "BL-022",
      "BL-024",
      "BL-026",
      "BL-027",
      "BL-028",
      "BL-029",
      "BL-033",
      "BL-034",
      "BL-035",
      "BL-036",
      "BL-G002",
      "BL-G003",
      "BL-G004",
      "BL-G005",
      "BL-G006",
      "BP-001",
      "BP-002",
      "BP-003",
      "BP-004",
      "BP-005",
      "LP-001",
      "LP-002",
      "LP-003",
      "LP-004",
      "LP-005",
      "LP-006",
      "P-001",
      "P-002",
      "P-003",
      "P-004",
      "P-005",
      "P-006",
      "P-007",
      "V-001",
      "V-002",
      "V-003",
      "V-004",
      "V-005",
      "V-006",
    ]);
  });

  it("each detector returns BLDivergenceMarker[]", () => {
    const src = parseTypeScriptSource("empty.ts", "");
    for (const ruleId of Object.keys(BL_DETECTOR_REGISTRY)) {
      const fn = BL_DETECTOR_REGISTRY[ruleId];
      expect(fn).toBeDefined();
      const markers = fn!(src, "empty.ts");
      expect(Array.isArray(markers)).toBe(true);
    }
  });
});

describe("provenance cross-check", () => {
  const yamlSample = `
divergenceMarkers:
  - marker: DIVERGENCE
    ruleId: BL-024
    status: OPEN
    severity: HIGH

  - marker: DIVERGENCE
    ruleId: BL-028
    status: OPEN
    severity: MEDIUM

  - marker: DIVERGENCE
    ruleId: BL-026
    status: OPEN
    severity: MEDIUM
`;

  it("parses 3 manual markers", () => {
    const parsed = parseProvenanceMarkers(yamlSample);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((m) => m.ruleId).sort()).toEqual(["BL-024", "BL-026", "BL-028"]);
  });

  it("recommends RESOLVED for manual=OPEN + auto=0 (BL-028 already fixed)", () => {
    const recs = crossCheck(yamlSample, []);
    expect(recs).toHaveLength(3);
    const bl028 = recs.find((r) => r.ruleId === "BL-028");
    expect(bl028?.recommendedStatus).toBe("RESOLVED");
    expect(bl028?.reason).toContain("RESOLVED");
  });

  it("keeps OPEN for manual=OPEN + auto≥1 (BL-028 still hardcoded)", () => {
    const autoMarkers = [
      {
        ruleId: "BL-028",
        severity: "MEDIUM" as const,
        pattern: "hardcoded_exclusion" as const,
        sourceFile: "refund.ts",
        sourceLine: 80,
        detail: "test",
        confidence: 0.95,
        autoDetected: true as const,
      },
    ];
    const recs = crossCheck(yamlSample, autoMarkers);
    const bl028 = recs.find((r) => r.ruleId === "BL-028");
    expect(bl028?.recommendedStatus).toBe("OPEN");
    expect(bl028?.autoDetectionCount).toBe(1);
  });
});

describe("BL-033~036 — settlement domain (Sprint 265 F432)", () => {
  // settlement.ts: runBatchSettlement + processCalculations 둘 다 db.transaction() 사용 (BL-033/034 atomic).
  // getSettlementCheck MAX_PERIOD_DAYS 비교 (BL-035 threshold).
  // applyFeeAdjustment fee_reflected === 'Y'/'N' 분기 (BL-036 status transition).
  const settlementSrc = `
    const MAX_PERIOD_DAYS = 60;

    function runBatchSettlement(db, periodStart, periodEnd) {
      const tx = db.transaction(() => {
        db.prepare("UPDATE settlement_summaries SET charge_count = ? WHERE period_start = ?").run(5, periodStart);
      });
      tx();
    }

    function processCalculations(db, calculationIds) {
      for (const id of calculationIds) {
        const tx = db.transaction(() => {
          db.prepare("UPDATE calculations SET status = 'processed' WHERE id = ?").run(id);
          db.prepare("UPDATE calculation_transactions SET processed = 1 WHERE calculation_id = ?").run(id);
        });
        tx();
      }
    }

    function getSettlementCheck(db, fromDate, toDate) {
      const dayCount = Math.ceil((new Date(toDate) - new Date(fromDate)) / 86400000);
      if (dayCount > MAX_PERIOD_DAYS) {
        throw new SettlementError('E422-THRESHOLD', 'exceeded', 422);
      }
      return db.prepare("SELECT * FROM calculations WHERE period_start >= ?").all(fromDate);
    }

    function applyFeeAdjustment(db, summaryId, feeReflected) {
      const status = feeReflected;
      if (status === 'Y') {
        db.prepare("UPDATE settlement_summaries SET fee_reflected = 'Y' WHERE id = ?").run(summaryId);
        return { status: 'applied', feeReflected: 'Y' };
      }
      if (status === 'N') {
        db.prepare("UPDATE settlement_summaries SET fee_reflected = 'N' WHERE id = ?").run(summaryId);
        return { status: 'gross', feeReflected: 'N' };
      }
      throw new SettlementError('E422-FEE', 'INVALID_FEE_FLAG', 422);
    }
  `;

  it("BL-033 (BATCH atomic — db.transaction) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-033"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-034 (반복 atomic — db.transaction per row) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-034"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-035 (기간 threshold MAX_PERIOD_DAYS) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-035"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-036 (fee_reflected Y/N status transition) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-036"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-033 ABSENCE — sequential writes (no db.transaction) → 1 marker", () => {
    const noTxSrc = `
      function runBatch(db, start, end) {
        db.prepare("UPDATE calculations SET status = 'done'").run();
        db.prepare("UPDATE settlement_summaries SET charge_count = 1").run();
      }
    `;
    const sf = parseTypeScriptSource("settlement.ts", noTxSrc);
    const markers = BL_DETECTOR_REGISTRY["BL-033"]!(sf, "settlement.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-033");
  });

  it("BL-035 ABSENCE — no threshold constant/comparison → 1 marker", () => {
    const noThresholdSrc = `
      function getSettlementCheck(db, fromDate, toDate) {
        return db.prepare("SELECT * FROM calculations").all();
      }
    `;
    const sf = parseTypeScriptSource("settlement.ts", noThresholdSrc);
    const markers = BL_DETECTOR_REGISTRY["BL-035"]!(sf, "settlement.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-035");
  });
});

// ---------------------------------------------------------------------------
// Sprint 269 (F436) — miraeasset-pension domain (P-001~P-007)
// ---------------------------------------------------------------------------
describe("pension domain — P-001~P-007 via withRuleId (Sprint 269 F436)", () => {
  it("P-001 PRESENCE — minServiceAmount/minAgeThreshold threshold (min* pattern)", () => {
    const src = `
      const MIN_ENROLLMENT_YEARS = 1;
      const MIN_ENROLLMENT_AGE = 18;
      function validateEnrollmentEligibility(db, holderId, yearsOfService, age, employmentStatus) {
        const minServiceAmount = yearsOfService;
        const minAgeThreshold = age;
        if (minServiceAmount < MIN_ENROLLMENT_YEARS) throw new Error('E422-INELIGIBLE');
        if (minAgeThreshold < MIN_ENROLLMENT_AGE) throw new Error('E422-INELIGIBLE');
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-001"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-002 PRESENCE — ANNUAL_LIMIT_KRW threshold in checkAnnualAccumulationLimit", () => {
    const src = `
      const ANNUAL_LIMIT_KRW = 18000000;
      function checkAnnualAccumulationLimit(db, accountId, amount) {
        if (accumulatedSoFar + amount > ANNUAL_LIMIT_KRW) throw new Error('E422-LIMIT_EXCEEDED');
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-002"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-003 PRESENCE — account.status comparison + INSERT 'UNDER_REVIEW' SQL", () => {
    const src = `
      function requestEarlyWithdrawal(db, accountId, reason, amount) {
        const account = db.prepare('SELECT status FROM pension_accounts WHERE id = ?').get(accountId);
        if (account.status !== 'ACTIVE') throw new Error('E409-ACCOUNT_NOT_ACTIVE');
        db.prepare("INSERT INTO pension_withdrawals (status) VALUES ('UNDER_REVIEW')").run();
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-003"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-004 PRESENCE — minAge/minYears threshold (min* pattern)", () => {
    const src = `
      const MIN_RECEIPT_AGE = 55;
      const MIN_SUBSCRIPTION_YEARS = 5;
      function initiateReceiptPayout(db, accountId, applicantAge, subscriptionYears) {
        const minAge = applicantAge;
        const minYears = subscriptionYears;
        if (minAge < MIN_RECEIPT_AGE) throw new Error('E422-AGE_NOT_MET');
        if (minYears < MIN_SUBSCRIPTION_YEARS) throw new Error('E422-SUBSCRIPTION_TOO_SHORT');
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-004"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-005 PRESENCE — totalAmount > TAX_BENEFIT_LIMIT_KRW threshold (total* pattern)", () => {
    const src = `
      const TAX_BENEFIT_LIMIT_KRW = 9000000;
      function applyTaxBenefit(db, accountId, annualContribution) {
        const totalAmount = annualContribution;
        const eligibleAmount = totalAmount > TAX_BENEFIT_LIMIT_KRW ? TAX_BENEFIT_LIMIT_KRW : totalAmount;
        return { eligibleAmount };
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-005"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-006 PRESENCE — account.status comparison + SQL 'TERMINATED' inline", () => {
    const src = `
      function terminatePlan(db, accountId) {
        const account = db.prepare("SELECT status FROM pension_accounts WHERE id = ?").get(accountId);
        if (account.status === 'TERMINATED') throw new Error('E409-ALREADY_TERMINATED');
        db.prepare("UPDATE pension_accounts SET status = 'TERMINATED', updated_at = ? WHERE id = ?").run(now, accountId);
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-006"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-007 PRESENCE — db.transaction() in disbursePrincipalAndInterest", () => {
    const src = `
      function disbursePrincipalAndInterest(db, accountId, principal, interest, type) {
        const disburse = db.transaction(() => {
          db.prepare("UPDATE pension_ledger SET balance = balance - ?").run(principal);
          db.prepare("INSERT INTO pension_payouts VALUES (?)").run(principal);
        });
        disburse();
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", src);
    const markers = BL_DETECTOR_REGISTRY["P-007"]!(sf, "pension.ts");
    expect(markers).toHaveLength(0);
  });

  it("P-001 ABSENCE — no threshold check → 1 marker", () => {
    const noCheckSrc = `
      function validateEnrollmentEligibility(db, holderId) {
        return db.prepare("INSERT INTO pension_accounts VALUES (?)").run(holderId);
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", noCheckSrc);
    const markers = BL_DETECTOR_REGISTRY["P-001"]!(sf, "pension.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("P-001");
  });

  it("P-007 ABSENCE — no db.transaction() → 1 marker", () => {
    const noTxSrc = `
      function disbursePrincipalAndInterest(db, accountId, principal, interest) {
        db.prepare("UPDATE pension_ledger SET balance = balance - ?").run(principal);
        db.prepare("INSERT INTO pension_payouts VALUES (?)").run(principal);
      }
    `;
    const sf = parseTypeScriptSource("pension.ts", noTxSrc);
    const markers = BL_DETECTOR_REGISTRY["P-007"]!(sf, "pension.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("P-007");
  });
});
