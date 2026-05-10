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
import { crossCheck, parseProvenanceMarkers, DETECTOR_SUPPORTED_RULES } from "../src/divergence/provenance-cross-check.js";

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

  // ──────────────────────────────────────────────────────────────────────
  // F445 (Sprint 279) — detector 확장 검증 (CC-001/002 ABSENCE 해소)
  // ──────────────────────────────────────────────────────────────────────

  it("F445 Path A: detects non-keyword var < UPPERCASE_CONSTANT (CC-001 case)", () => {
    // CC-001 issueCard: `if (creditScore < MIN_CREDIT_SCORE) throw ...`
    //   leftText='creditScore' (keyword 미매칭) — but rightIsConstant=true → Path A PASS
    const src = parseTypeScriptSource(
      "test.ts",
      `function issueCard(creditScore: number) {
  if (creditScore < MIN_CREDIT_SCORE) {
    throw new Error("E422-CS");
  }
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("F445 Path B: detects var-var with keyword on one side (CC-002 case)", () => {
    // CC-002 checkPaymentLimit: `if (remainingLimit < amount) throw ...`
    //   left='remainingLimit' matches `limit` keyword → Path B PASS
    const src = parseTypeScriptSource(
      "test.ts",
      `function check(remainingLimit: number, amount: number) {
  if (remainingLimit < amount) {
    throw new Error("E422-LIMIT");
  }
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
  });

  it("F445 false positive 회피: var-var with no keyword on either side (DIVERGENCE)", () => {
    // 양변 모두 keyword 미매칭 → ABSENCE 유지 (i < j 같은 일반 비교는 threshold 아님)
    const src = parseTypeScriptSource(
      "test.ts",
      `function loopCheck(i: number, j: number) {
  if (i < j) {
    return i;
  }
  return j;
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.pattern).toBe("missing_threshold_check");
  });

  it("F445 Path A reverse: detects literal < var (양변 어느 쪽이든 literal 인정)", () => {
    // 0 < amount 같은 reverse direction도 PASS (CC-006 같은 sanity check)
    const src = parseTypeScriptSource(
      "test.ts",
      `function check(amount: number) {
  if (0 < amount) {
    return amount;
  }
  return 0;
}`,
    );
    const markers = detectThresholdCheck(src, "test.ts");
    expect(markers).toHaveLength(0);
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
  it("exposes 159 detectors (Sprint 299 F465 — pharmacy PH-001~PH-006 added, 29번째 도메인 제약/약국 산업, 18번째 신규, 90.4% coverage 안정화)", () => {
    expect(Object.keys(BL_DETECTOR_REGISTRY).sort()).toEqual([
      "BB-001",
      "BB-002",
      "BB-003",
      "BB-004",
      "BB-005",
      "BK-001",
      "BK-002",
      "BK-003",
      "BK-004",
      "BK-005",
      "BK-006",
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
      "BL-042",
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
      "CC-001",
      "CC-002",
      "CC-003",
      "CC-004",
      "CC-005",
      "CC-006",
      "DV-001",
      "DV-002",
      "DV-003",
      "DV-004",
      "DV-005",
      "DV-006",
      "ED-001",
      "ED-002",
      "ED-003",
      "ED-004",
      "ED-005",
      "ED-006",
      "EN-001",
      "EN-002",
      "EN-003",
      "EN-004",
      "EN-005",
      "EN-006",
      "GV-001",
      "GV-002",
      "GV-003",
      "GV-004",
      "GV-005",
      "GV-006",
      "HC-001",
      "HC-002",
      "HC-003",
      "HC-004",
      "HC-005",
      "HC-006",
      "HO-001",
      "HO-002",
      "HO-003",
      "HO-004",
      "HO-005",
      "HO-006",
      "IN-001",
      "IN-002",
      "IN-003",
      "IN-004",
      "IN-005",
      "IN-006",
      "LG-001",
      "LG-002",
      "LG-003",
      "LG-004",
      "LG-005",
      "LG-006",
      "LP-001",
      "LP-002",
      "LP-003",
      "LP-004",
      "LP-005",
      "LP-006",
      "MD-001",
      "MD-002",
      "MD-003",
      "MD-004",
      "MD-005",
      "MD-006",
      "MF-001",
      "MF-002",
      "MF-003",
      "MF-004",
      "MF-005",
      "MF-006",
      "P-001",
      "P-002",
      "P-003",
      "P-004",
      "P-005",
      "P-006",
      "P-007",
      "PH-001",
      "PH-002",
      "PH-003",
      "PH-004",
      "PH-005",
      "PH-006",
      "RE-001",
      "RE-002",
      "RE-003",
      "RE-004",
      "RE-005",
      "RE-006",
      "RT-001",
      "RT-002",
      "RT-003",
      "RT-004",
      "RT-005",
      "RT-006",
      "SB-001",
      "SB-002",
      "SB-003",
      "SB-004",
      "SB-005",
      "SB-006",
      "TC-001",
      "TC-002",
      "TC-003",
      "TC-004",
      "TC-005",
      "TC-006",
      "TR-001",
      "TR-002",
      "TR-003",
      "TR-004",
      "TR-005",
      "TR-006",
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

// ---------------------------------------------------------------------------
// F455 (Sprint 289) — logistics domain LG-001~006 PRESENCE (idempotent 2-step)
// ---------------------------------------------------------------------------
describe("logistics domain — LG-001~006 via withRuleId (Sprint 289 F455)", () => {
  it("LG-001 PRESENCE — weightKg > MAX_WEIGHT_KG threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "logistics.ts",
      `const MAX_WEIGHT_KG = 30_000;
function checkShipmentLimits(db, shipperId, origin, destination, weightKg, volumeM3) {
  if (weightKg > MAX_WEIGHT_KG) {
    throw new LogisticsError("E422-WT-MAX", "Weight exceeds limit", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-001"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    // idempotent: 두 번째 호출도 동일
    expect(BL_DETECTOR_REGISTRY["LG-001"]!(src, "logistics.ts")).toHaveLength(0);
  });

  it("LG-002 PRESENCE — routeDistanceKm > maxRouteLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "logistics.ts",
      `function optimizeRoute(db, shipmentId, routeDistanceKm) {
  const maxRouteLimit = 20_000;
  if (routeDistanceKm > maxRouteLimit) {
    throw new LogisticsError("E422-LIMIT", "Route exceeds limit", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-002"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["LG-002"]!(src, "logistics.ts")).toHaveLength(0);
  });

  it("LG-003 PRESENCE — db.transaction() in clearCustoms (atomic)", () => {
    const src = parseTypeScriptSource(
      "logistics.ts",
      `function clearCustoms(db, shipmentId, declaredValueUsd) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO customs_records ...").run();
    db.prepare("UPDATE shipments SET status = 'in_transit' WHERE id = ?").run(shipmentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-003"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["LG-003"]!(src, "logistics.ts")).toHaveLength(0);
  });

  it("LG-004 PRESENCE — status comparison + 'in_transit'/'delivered' assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "logistics.ts",
      `function transitionDeliveryStatus(db, shipmentId, newStatus) {
  const shipment = db.prepare("SELECT status FROM shipments WHERE id = ?").get(shipmentId);
  if (shipment.status === 'delivered') throw new LogisticsError("E409-TR", "Invalid transition", 409);
  db.prepare("UPDATE shipments SET status = 'in_transit' WHERE id = ?").run(shipmentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-004"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["LG-004"]!(src, "logistics.ts")).toHaveLength(0);
  });

  it("LG-005 PRESENCE — batch status='stale' update in markStaleInventory (file context)", () => {
    // detector는 파일 전체 스캔 — LG-004 함수의 TypeScript status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "logistics.ts",
      `function transitionDeliveryStatus(db, shipmentId, newStatus) {
  const shipment = db.prepare("SELECT status FROM shipments WHERE id = ?").get(shipmentId);
  if (shipment.status === 'delivered') throw new Error("E409-TR");
  db.prepare("UPDATE shipments SET status = 'in_transit' WHERE id = ?").run(shipmentId);
}
function markStaleInventory(db, cutoffDate) {
  const candidates = db.prepare("SELECT id FROM warehouse_inventory WHERE status = 'active' AND last_updated < ?").all(cutoffDate);
  for (const item of candidates) {
    db.prepare("UPDATE warehouse_inventory SET status = 'stale' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-005"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["LG-005"]!(src, "logistics.ts")).toHaveLength(0);
  });

  it("LG-006 PRESENCE — db.transaction() in processReturnRma (atomic RMA)", () => {
    const src = parseTypeScriptSource(
      "logistics.ts",
      `function processReturnRma(db, shipmentId, reason) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO rma_records ...").run();
    db.prepare("UPDATE shipments SET status = 'returned' WHERE id = ?").run(shipmentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["LG-006"]!(src, "logistics.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["LG-006"]!(src, "logistics.ts")).toHaveLength(0);
  });
});

// F456 (Sprint 290) — hospitality domain HO-001~006 PRESENCE (idempotent 2-step)
describe("hospitality domain — HO-001~006 via withRuleId (Sprint 290 F456)", () => {
  it("HO-001 PRESENCE — requestedRooms > MAX_ROOMS_PER_BOOKING threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `const MAX_ROOMS_PER_BOOKING = 10;
function bookRoom(db, guestId, checkIn, checkOut, requestedRooms, availableRooms) {
  if (requestedRooms > MAX_ROOMS_PER_BOOKING) throw new Error('E422-RM-MAX');
  if (requestedRooms > availableRooms) throw new Error('E422-RM-AVAIL');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-001"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-001"]!(src, "hospitality.ts")).toHaveLength(0);
  });

  it("HO-002 PRESENCE — hoursUntilCheckIn <= cancellationLimitHours (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `function applyCancellationPolicy(db, bookingId, hoursUntilCheckIn) {
  const cancellationLimitHours = 24;
  if (hoursUntilCheckIn <= cancellationLimitHours) throw new Error('E422-CANCEL-EXP');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-002"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-002"]!(src, "hospitality.ts")).toHaveLength(0);
  });

  it("HO-003 PRESENCE — db.transaction() in processCheckIn (atomic check-in)", () => {
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `function processCheckIn(db, bookingId, roomId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'checked_in' WHERE id = ?").run(bookingId);
    db.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(roomId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-003"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-003"]!(src, "hospitality.ts")).toHaveLength(0);
  });

  it("HO-004 PRESENCE — status comparison + 'confirmed'/'checked_in' assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `function transitionBookingStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'pending') throw new Error("E409-TR");
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(bookingId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-004"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-004"]!(src, "hospitality.ts")).toHaveLength(0);
  });

  it("HO-005 PRESENCE — batch status='clean' update in markHousekeepingComplete (file context)", () => {
    // detector는 파일 전체 스캔 — transitionBookingStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `function transitionBookingStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'confirmed') throw new Error("E409-TR");
  db.prepare("UPDATE bookings SET status = 'checked_in' WHERE id = ?").run(bookingId);
}
function markHousekeepingComplete(db) {
  const candidates = db.prepare("SELECT id FROM rooms WHERE housekeeping_status = 'dirty'").all();
  for (const room of candidates) {
    db.prepare("UPDATE rooms SET housekeeping_status = 'clean' WHERE id = ?").run(room.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-005"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-005"]!(src, "hospitality.ts")).toHaveLength(0);
  });

  it("HO-006 PRESENCE — db.transaction() in handleOverbookingCompensation (atomic overbooking)", () => {
    const src = parseTypeScriptSource(
      "hospitality.ts",
      `function handleOverbookingCompensation(db, bookingId, reason) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO overbooking_log (id, booking_id, reason, compensated_at) VALUES (?, ?, ?, ?)").run();
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(bookingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["HO-006"]!(src, "hospitality.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["HO-006"]!(src, "hospitality.ts")).toHaveLength(0);
  });
});

// F457 (Sprint 291) — travel domain TR-001~006 PRESENCE (idempotent 2-step)
describe("travel domain — TR-001~006 via withRuleId (Sprint 291 F457)", () => {
  it("TR-001 PRESENCE — seatsRequested > MAX_SEATS_PER_BOOKING threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "travel.ts",
      `const MAX_SEATS_PER_BOOKING = 9;
function bookFlight(db, passengerId, flightId, fareClass, seatsRequested, availableSeats) {
  if (seatsRequested > MAX_SEATS_PER_BOOKING) throw new Error('E422-ST-MAX');
  if (seatsRequested > availableSeats) throw new Error('E422-ST-AVAIL');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-001"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-001"]!(src, "travel.ts")).toHaveLength(0);
  });

  it("TR-002 PRESENCE — availableMiles < requiredMilesLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "travel.ts",
      `function upgradeFareClass(db, itineraryId, targetFare, availableMiles) {
  const requiredMilesLimit = 30000;
  if (availableMiles < requiredMilesLimit) throw new Error('E422-MILES');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-002"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-002"]!(src, "travel.ts")).toHaveLength(0);
  });

  it("TR-003 PRESENCE — db.transaction() in confirmItinerary (atomic itinerary confirm)", () => {
    const src = parseTypeScriptSource(
      "travel.ts",
      `function confirmItinerary(db, itineraryId, paymentAmount) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE itineraries SET status = 'confirmed', pnr = ? WHERE id = ?").run(pnr, itineraryId);
    db.prepare("INSERT INTO trips (id, itinerary_id, passenger_id, status) VALUES (?, ?, ?, 'pending')").run(tripId, itineraryId, passengerId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-003"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-003"]!(src, "travel.ts")).toHaveLength(0);
  });

  it("TR-004 PRESENCE — status comparison + 'confirmed'/'checked_in' assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "travel.ts",
      `function transitionTripStatus(db, tripId, newStatus) {
  const trip = db.prepare("SELECT status FROM trips WHERE id = ?").get(tripId);
  if (trip.status === 'pending') throw new Error("E409-TR");
  db.prepare("UPDATE trips SET status = 'confirmed' WHERE id = ?").run(tripId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-004"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-004"]!(src, "travel.ts")).toHaveLength(0);
  });

  it("TR-005 PRESENCE — batch status='cancelled' update in markDisruptedTrips (file context)", () => {
    // detector는 파일 전체 스캔 — transitionTripStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "travel.ts",
      `function transitionTripStatus(db, tripId, newStatus) {
  const trip = db.prepare("SELECT status FROM trips WHERE id = ?").get(tripId);
  if (trip.status === 'confirmed') throw new Error("E409-TR");
  db.prepare("UPDATE trips SET status = 'checked_in' WHERE id = ?").run(tripId);
}
function markDisruptedTrips(db, flightId, reason) {
  const candidates = db.prepare("SELECT id FROM trips WHERE status IN ('pending', 'confirmed')").all();
  for (const trip of candidates) {
    db.prepare("UPDATE trips SET status = 'cancelled' WHERE id = ?").run(trip.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-005"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-005"]!(src, "travel.ts")).toHaveLength(0);
  });

  it("TR-006 PRESENCE — db.transaction() in processCancellationRefund (atomic cancel+refund)", () => {
    const src = parseTypeScriptSource(
      "travel.ts",
      `function processCancellationRefund(db, itineraryId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE itineraries SET status = 'cancelled' WHERE id = ?").run(itineraryId);
    db.prepare("INSERT INTO refund_log (id, itinerary_id, refund_amount, miles_restored, refunded_at) VALUES (?, ?, ?, ?, ?)").run();
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TR-006"]!(src, "travel.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TR-006"]!(src, "travel.ts")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F446 (Sprint 280) — DETECTOR_SUPPORTED_RULES auto-sync (BL_DETECTOR_REGISTRY source of truth)
// ---------------------------------------------------------------------------
describe("F446 — DETECTOR_SUPPORTED_RULES auto-sync (Sprint 280)", () => {
  it("includes ALL BL_DETECTOR_REGISTRY ruleIds (no manual whitelist drift)", () => {
    // 이전: manual whitelist (P-007까지) — V/LP/BL-042/CC 누락으로 write-provenance status 전환 skip.
    // 현재: BL_DETECTOR_REGISTRY 자동 derive → 매 Sprint 동기화 불필요.
    const registryKeys = Object.keys(BL_DETECTOR_REGISTRY).sort();
    const supportedKeys = Array.from(DETECTOR_SUPPORTED_RULES).sort();
    expect(supportedKeys).toEqual(registryKeys);
  });

  it("CC-001 (Sprint 278) is now SUPPORTED (ABSENCE→RESOLVED 자동 전환 가능)", () => {
    expect(DETECTOR_SUPPORTED_RULES.has("CC-001")).toBe(true);
  });

  it("BL-042 (Sprint 277), V-001 (Sprint 274), LP-001 (Sprint 275) all SUPPORTED", () => {
    expect(DETECTOR_SUPPORTED_RULES.has("BL-042")).toBe(true);
    expect(DETECTOR_SUPPORTED_RULES.has("V-001")).toBe(true);
    expect(DETECTOR_SUPPORTED_RULES.has("LP-001")).toBe(true);
  });

  it("미등록 ID는 NOT supported (UNKNOWN cross-check 분기 유지)", () => {
    expect(DETECTOR_SUPPORTED_RULES.has("BL-999-NONEXISTENT")).toBe(false);
  });

  it("crossCheck: PRESENCE 자동 입증 시 OPEN→RESOLVED 권고 (CC-001 시뮬레이션)", () => {
    // provenance.yaml에 CC-001 status=OPEN인 상태 + autoMarkers 빈 배열(detector PRESENCE 입증)
    // → 권고 RESOLVED
    const yamlText = `divergenceMarkers:
  - marker: DIVERGENCE
    ruleId: CC-001
    severity: MEDIUM
    pattern: missing_threshold_check
    status: OPEN
`;
    const recs = crossCheck(yamlText, []);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.ruleId).toBe("CC-001");
    expect(recs[0]?.detectorSupported).toBe(true);  // F446 fix — 이전엔 false였음
    expect(recs[0]?.recommendedStatus).toBe("RESOLVED");
  });
});

// F458 (Sprint 292) — manufacturing domain MF-001~006 PRESENCE (idempotent 2-step)
describe("manufacturing domain — MF-001~006 via withRuleId (Sprint 292 F458)", () => {
  it("MF-001 PRESENCE — components.length > BOM_MAX_COMPONENTS threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `const BOM_MAX_COMPONENTS = 500;
function explodeBom(db, productId, components) {
  if (components.length > BOM_MAX_COMPONENTS) throw new Error('E422-BOM-MAX');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-001"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-001"]!(src, "manufacturing.ts")).toHaveLength(0);
  });

  it("MF-002 PRESENCE — requiredCapacity > capacityLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `function placeProductionOrder(db, productId, requiredCapacity, availableCapacity) {
  const capacityLimit = availableCapacity;
  if (requiredCapacity > capacityLimit) throw new Error('E422-CAP-MAX');
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-002"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-002"]!(src, "manufacturing.ts")).toHaveLength(0);
  });

  it("MF-003 PRESENCE — db.transaction() in confirmProductionOrder (atomic order confirm)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `function confirmProductionOrder(db, orderId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE production_orders SET status = 'confirmed' WHERE id = ?").run(orderId);
    db.prepare("INSERT INTO production_lots (id, order_id, status, scheduled_at) VALUES (?, ?, 'planned', ?)").run(lotId, orderId, confirmedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-003"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-003"]!(src, "manufacturing.ts")).toHaveLength(0);
  });

  it("MF-004 PRESENCE — status comparison + 'in_progress'/'qc' assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `function transitionProductionStatus(db, lotId, newStatus) {
  const lot = db.prepare("SELECT status FROM production_lots WHERE id = ?").get(lotId);
  if (lot.status === 'planned') throw new Error("E409-LOT");
  db.prepare("UPDATE production_lots SET status = 'in_progress' WHERE id = ?").run(lotId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-004"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-004"]!(src, "manufacturing.ts")).toHaveLength(0);
  });

  it("MF-005 PRESENCE — batch status='quarantined' update in quarantineDefectiveLots (file context)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `function transitionProductionStatus(db, lotId, newStatus) {
  const lot = db.prepare("SELECT status FROM production_lots WHERE id = ?").get(lotId);
  if (lot.status === 'in_progress') throw new Error("E409-LOT");
  db.prepare("UPDATE production_lots SET status = 'qc' WHERE id = ?").run(lotId);
}
function quarantineDefectiveLots(db, orderId, reason) {
  const candidates = db.prepare("SELECT id FROM production_lots WHERE status IN ('in_progress', 'qc') AND order_id = ?").all(orderId);
  for (const lot of candidates) {
    db.prepare("UPDATE production_lots SET status = 'quarantined' WHERE id = ?").run(lot.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-005"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-005"]!(src, "manufacturing.ts")).toHaveLength(0);
  });

  it("MF-006 PRESENCE — db.transaction() in releaseForShipment (atomic release+shipment)", () => {
    const src = parseTypeScriptSource(
      "manufacturing.ts",
      `function releaseForShipment(db, lotId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE production_lots SET status = 'released' WHERE id = ?").run(lotId);
    db.prepare("INSERT INTO shipment_log (id, order_id, released_at) VALUES (?, ?, ?)").run(shipmentLogId, orderId, releasedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MF-006"]!(src, "manufacturing.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MF-006"]!(src, "manufacturing.ts")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F459 (Sprint 293) — retail domain RT-001~006 PRESENCE (idempotent 2-step)
// ---------------------------------------------------------------------------
describe("retail domain — RT-001~006 via withRuleId (Sprint 293 F459)", () => {
  it("RT-001 PRESENCE — requestedTier > MAX_SKU_PRICE_TIER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "retail.ts",
      `const MAX_SKU_PRICE_TIER = 10;
function listSku(db, productId, requestedTier) {
  if (requestedTier > MAX_SKU_PRICE_TIER) {
    throw new RetailError("E422-TIER-MAX", "Price tier exceeds limit", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-001"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-001"]!(src, "retail.ts")).toHaveLength(0);
  });

  it("RT-002 PRESENCE — cartTotal < minOrderLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "retail.ts",
      `function applyPromotion(db, promotionId, cartTotal) {
  const minOrderLimit = 30000;
  if (cartTotal < minOrderLimit) {
    throw new RetailError("E422-PROMO-MIN", "Cart total below minimum order limit", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-002"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-002"]!(src, "retail.ts")).toHaveLength(0);
  });

  it("RT-003 PRESENCE — db.transaction() in processCheckout (atomic checkout)", () => {
    const src = parseTypeScriptSource(
      "retail.ts",
      `function processCheckout(db, customerId, cartItems, totalAmount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO orders (id, customer_id, status) VALUES (?, ?, 'placed')").run(orderId, customerId);
    db.prepare("INSERT INTO inventory_sync_log (id, sku_id, synced_at) VALUES (?, ?, ?)").run(logId, cartItems[0], placedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-003"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-003"]!(src, "retail.ts")).toHaveLength(0);
  });

  it("RT-004 PRESENCE — status comparison + 'confirmed'/'shipped' assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "retail.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
  if (order.status === 'placed') throw new RetailError("E409-ORD", "Invalid transition", 409);
  db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?").run(orderId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-004"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-004"]!(src, "retail.ts")).toHaveLength(0);
  });

  it("RT-005 PRESENCE — batch status='synced' update in markInventorySync (file context)", () => {
    // detector는 파일 전체 스캔 — transitionOrderStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "retail.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
  if (order.status === 'confirmed') throw new RetailError("E409-ORD", "Invalid", 409);
  db.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").run(orderId);
}
function markInventorySync(db, productId) {
  const candidates = db.prepare("SELECT id FROM sku_catalog WHERE stock_status = 'available' AND product_id = ?").all(productId);
  for (const sku of candidates) {
    db.prepare("UPDATE sku_catalog SET stock_status = 'synced' WHERE id = ?").run(sku.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-005"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-005"]!(src, "retail.ts")).toHaveLength(0);
  });

  it("RT-006 PRESENCE — db.transaction() in processReturnRefund (atomic return+refund)", () => {
    const src = parseTypeScriptSource(
      "retail.ts",
      `function processReturnRefund(db, orderId, reason) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET status = 'returned' WHERE id = ?").run(orderId);
    db.prepare("INSERT INTO return_log (id, order_id, reason, refund_amount, returned_at) VALUES (?, ?, ?, ?, ?)").run(returnLogId, orderId, reason, refundAmount, returnedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RT-006"]!(src, "retail.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["RT-006"]!(src, "retail.ts")).toHaveLength(0);
  });
});

// F460 (Sprint 294) — energy domain EN-001~006 PRESENCE (idempotent 2-step)
describe("energy domain — EN-001~006 via withRuleId (Sprint 294 F460)", () => {
  it("EN-001 PRESENCE — usageKwh > MAX_METER_USAGE_KWH threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "energy.ts",
      `const MAX_METER_USAGE_KWH = 50_000;
function recordMeterReading(db, meterId, usageKwh) {
  if (usageKwh > MAX_METER_USAGE_KWH) {
    throw new EnergyError("E422-USAGE-MAX", "Usage exceeds peak limit", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-001"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-001"]!(src, "energy.ts")).toHaveLength(0);
  });

  it("EN-002 PRESENCE — currentUsage <= tierUsageLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "energy.ts",
      `function computeBillingTier(db, meterId, currentUsage) {
  for (const tier of tiers) {
    const tierUsageLimit = tier.tier_usage_limit;
    if (currentUsage <= tierUsageLimit) {
      selectedTier = tier;
      break;
    }
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-002"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-002"]!(src, "energy.ts")).toHaveLength(0);
  });

  it("EN-003 PRESENCE — db.transaction() in triggerUsageAlert (atomic alert)", () => {
    const src = parseTypeScriptSource(
      "energy.ts",
      `function triggerUsageAlert(db, meterId, currentUsage, alertThresholdKwh) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO meter_readings (id, meter_id, usage_kwh, recorded_at) VALUES (?, ?, ?, ?)").run(randomUUID(), meterId, currentUsage, triggeredAt);
    db.prepare("INSERT INTO outage_records (id, account_id, outage_type, status, occurred_at) SELECT ?, account_id, 'electricity', 'pending', ? FROM meters WHERE id = ?").run(alertId, triggeredAt, meterId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-003"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-003"]!(src, "energy.ts")).toHaveLength(0);
  });

  it("EN-004 PRESENCE — status comparison + 'reading_due'/'billed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "energy.ts",
      `function transitionMeterStatus(db, meterId, newStatus) {
  const meter = db.prepare("SELECT status FROM meters WHERE id = ?").get(meterId);
  if (meter.status === 'active') throw new EnergyError("E409-METER", "Invalid transition", 409);
  db.prepare("UPDATE meters SET status = 'reading_due' WHERE id = ?").run(meterId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-004"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-004"]!(src, "energy.ts")).toHaveLength(0);
  });

  it("EN-005 PRESENCE — batch status='notified' update in markOutageNotified (file context)", () => {
    // detector는 파일 전체 스캔 — transitionMeterStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "energy.ts",
      `function transitionMeterStatus(db, meterId, newStatus) {
  const meter = db.prepare("SELECT status FROM meters WHERE id = ?").get(meterId);
  if (meter.status === 'active') throw new EnergyError("E409-METER", "Invalid", 409);
  db.prepare("UPDATE meters SET status = 'reading_due' WHERE id = ?").run(meterId);
}
function markOutageNotified(db, accountId) {
  const candidates = db.prepare("SELECT id FROM outage_records WHERE status = 'pending' AND account_id = ?").all(accountId);
  for (const record of candidates) {
    db.prepare("UPDATE outage_records SET status = 'notified', notified_at = ? WHERE id = ?").run(notifiedAt, record.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-005"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-005"]!(src, "energy.ts")).toHaveLength(0);
  });

  it("EN-006 PRESENCE — db.transaction() in processOverdueSuspension (atomic suspend+lock)", () => {
    const src = parseTypeScriptSource(
      "energy.ts",
      `function processOverdueSuspension(db, accountId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE overdue_accounts SET suspended_at = ? WHERE id = ?").run(suspendedAt, overdue.id);
    db.prepare("UPDATE meters SET status = 'suspended' WHERE account_id = ? AND status = 'active'").run(accountId);
    db.prepare("UPDATE meters SET status = 'locked' WHERE account_id = ? AND status = 'suspended'").run(accountId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EN-006"]!(src, "energy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["EN-006"]!(src, "energy.ts")).toHaveLength(0);
  });
});

// F461 (Sprint 295) — government domain GV-001~006 PRESENCE (idempotent 2-step)
describe("government domain — GV-001~006 via withRuleId (Sprint 295 F461)", () => {
  it("GV-001 PRESENCE — currentCount >= MAX_ANNUAL_PERMIT_COUNT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "government.ts",
      `const MAX_ANNUAL_PERMIT_COUNT = 10;
function submitPermitApplication(db, applicantId, permitType, fiscalYear) {
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM permit_applications WHERE applicant_id = ? AND fiscal_year = ?").get(applicantId, fiscalYear);
  if (existing.cnt >= MAX_ANNUAL_PERMIT_COUNT) {
    throw new GovernmentError("E422-PERMIT-LIMIT", "Annual permit limit reached", 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-001"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-001"]!(src, "government.ts")).toHaveLength(0);
  });

  it("GV-002 PRESENCE — feeAmount <= feeTierLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "government.ts",
      `function computeFeeTier(db, permitId, feeAmount) {
  const tiers = db.prepare("SELECT * FROM fee_tiers ORDER BY tier_level ASC").all();
  let selectedTier = tiers[tiers.length - 1];
  for (const tier of tiers) {
    const feeTierLimit = tier.fee_tier_limit;
    if (feeAmount <= feeTierLimit) {
      selectedTier = tier;
      break;
    }
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-002"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-002"]!(src, "government.ts")).toHaveLength(0);
  });

  it("GV-003 PRESENCE — db.transaction() in processApproval (atomic approval+issue)", () => {
    const src = parseTypeScriptSource(
      "government.ts",
      `function processApproval(db, permitId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO approval_workflows (id, permit_id, status, approved_at, issued_at) VALUES (?, ?, 'approved', ?, ?)").run(workflowId, permitId, approvedAt, issuedAt);
    db.prepare("UPDATE permit_applications SET status = 'approved' WHERE id = ?").run(permitId);
    db.prepare("UPDATE permit_applications SET status = 'issued' WHERE id = ?").run(permitId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-003"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-003"]!(src, "government.ts")).toHaveLength(0);
  });

  it("GV-004 PRESENCE — status comparison + 'reviewing'/'approved' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "government.ts",
      `function transitionApplicationStatus(db, applicationId, newStatus) {
  const application = db.prepare("SELECT status FROM permit_applications WHERE id = ?").get(applicationId);
  if (application.status === 'submitted') throw new GovernmentError("E409-APPLICATION", "Invalid transition", 409);
  db.prepare("UPDATE permit_applications SET status = 'reviewing' WHERE id = ?").run(applicationId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-004"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-004"]!(src, "government.ts")).toHaveLength(0);
  });

  it("GV-005 PRESENCE — batch status='penalized' update in applyOverduePenalty (file context)", () => {
    // detector는 파일 전체 스캔 — transitionApplicationStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "government.ts",
      `function transitionApplicationStatus(db, applicationId, newStatus) {
  const application = db.prepare("SELECT status FROM permit_applications WHERE id = ?").get(applicationId);
  if (application.status === 'submitted') throw new GovernmentError("E409-APPLICATION", "Invalid", 409);
  db.prepare("UPDATE permit_applications SET status = 'reviewing' WHERE id = ?").run(applicationId);
}
function applyOverduePenalty(db, applicantId) {
  const candidates = db.prepare("SELECT id, overdue_amount FROM overdue_penalties WHERE status = 'pending' AND applicant_id = ?").all(applicantId);
  for (const penalty of candidates) {
    db.prepare("UPDATE overdue_penalties SET status = 'penalized', penalty_applied_at = ?, overdue_amount = overdue_amount + ? WHERE id = ?").run(penaltyAppliedAt, penaltyAmount, penalty.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-005"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-005"]!(src, "government.ts")).toHaveLength(0);
  });

  it("GV-006 PRESENCE — db.transaction() in validateDocument (atomic validated+certified+issued)", () => {
    const src = parseTypeScriptSource(
      "government.ts",
      `function validateDocument(db, documentId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE documents SET status = 'validated', validated_at = ? WHERE id = ?").run(validatedAt, documentId);
    db.prepare("UPDATE documents SET status = 'certified', certified_at = ? WHERE id = ?").run(certifiedAt, documentId);
    db.prepare("UPDATE documents SET status = 'issued', issued_at = ? WHERE id = ?").run(issuedAt, documentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GV-006"]!(src, "government.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["GV-006"]!(src, "government.ts")).toHaveLength(0);
  });
});

// F462 (Sprint 296) — telecom domain TC-001~006 PRESENCE (idempotent 2-step)
describe("telecom domain — TC-001~006 via withRuleId (Sprint 296 F462)", () => {
  it("TC-001 PRESENCE — activeLines >= MAX_ACTIVE_LINES threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "telecom.ts",
      `const MAX_ACTIVE_LINES = 5;
function activateSubscription(db, customerId, lineNumber, planId, carrier) {
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM subscriptions WHERE customer_id = ? AND status = 'active'").get(customerId);
  const activeLines = existing.cnt;
  if (activeLines >= MAX_ACTIVE_LINES) {
    throw new TelecomError('E422-LINE-LIMIT', \`Active line limit reached (\${activeLines} >= \${MAX_ACTIVE_LINES})\`, 422);
  }
  db.prepare("INSERT INTO subscriptions (id, customer_id, line_number, plan_id, status, carrier, activated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").run(subscriptionId, customerId, lineNumber, planId, carrier, activatedAt);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-001"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-001"]!(src, "telecom.ts")).toHaveLength(0);
  });

  it("TC-002 PRESENCE — usageBytes > dataQuotaLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "telecom.ts",
      `function checkDataUsage(db, subscriptionId, additionalUsageBytes) {
  const plan = db.prepare("SELECT data_quota_limit FROM data_plans WHERE id = ?").get(planId);
  const usageBytes = currentUsage.total + additionalUsageBytes;
  const dataQuotaLimit = plan.data_quota_limit;
  if (usageBytes > dataQuotaLimit) {
    throw new TelecomError('E429-DATA-QUOTA', \`Data quota exceeded (\${usageBytes} > \${dataQuotaLimit} bytes)\`, 429);
  }
  db.prepare("INSERT INTO data_usages (id, subscription_id, usage_bytes, recorded_at) VALUES (?, ?, ?, ?)").run(usageId, subscriptionId, additionalUsageBytes, recordedAt);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-002"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-002"]!(src, "telecom.ts")).toHaveLength(0);
  });

  it("TC-003 PRESENCE — db.transaction() in upgradePlan (atomic plan+billing+renewal)", () => {
    const src = parseTypeScriptSource(
      "telecom.ts",
      `function upgradePlan(db, subscriptionId, newPlanId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE subscriptions SET plan_id = ? WHERE id = ?").run(newPlanId, subscriptionId);
    db.prepare("INSERT INTO billing_cycles (id, subscription_id, cycle_month, status, amount, billed_at) VALUES (?, ?, ?, 'billed', ?, ?)").run(cycleId, subscriptionId, month, fee, upgradedAt);
    db.prepare("UPDATE subscriptions SET activated_at = ? WHERE id = ?").run(upgradedAt, subscriptionId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-003"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-003"]!(src, "telecom.ts")).toHaveLength(0);
  });

  it("TC-004 PRESENCE — status comparison + 'active'/'suspended' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "telecom.ts",
      `function transitionSubscriptionStatus(db, subscriptionId, newStatus) {
  const subscription = db.prepare("SELECT status FROM subscriptions WHERE id = ?").get(subscriptionId);
  if (subscription.status === 'pending') throw new TelecomError("E409-SUBSCRIPTION", "Invalid transition", 409);
  db.prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").run(subscriptionId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-004"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-004"]!(src, "telecom.ts")).toHaveLength(0);
  });

  it("TC-005 PRESENCE — batch status='billed' update in runBillingCycle (file context)", () => {
    // detector는 파일 전체 스캔 — transitionSubscriptionStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "telecom.ts",
      `function transitionSubscriptionStatus(db, subscriptionId, newStatus) {
  const subscription = db.prepare("SELECT status FROM subscriptions WHERE id = ?").get(subscriptionId);
  if (subscription.status === 'pending') throw new TelecomError("E409-SUBSCRIPTION", "Invalid", 409);
  db.prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").run(subscriptionId);
}
function runBillingCycle(db, cycleMonth) {
  const candidates = db.prepare("SELECT id, subscription_id, amount FROM billing_cycles WHERE status = 'pending' AND cycle_month = ?").all(cycleMonth);
  for (const cycle of candidates) {
    db.prepare("UPDATE billing_cycles SET status = 'billed', billed_at = ? WHERE id = ?").run(billedAt, cycle.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-005"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-005"]!(src, "telecom.ts")).toHaveLength(0);
  });

  it("TC-006 PRESENCE — db.transaction() in processPortOut (atomic port-out+terminated)", () => {
    const src = parseTypeScriptSource(
      "telecom.ts",
      `function processPortOut(db, subscriptionId, targetCarrier, settlementAmount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO port_out_requests (id, subscription_id, target_carrier, status, settlement_amount, requested_at, completed_at) VALUES (?, ?, ?, 'completed', ?, ?, ?)").run(portOutId, subscriptionId, targetCarrier, settlementAmount, completedAt, completedAt);
    db.prepare("UPDATE subscriptions SET status = 'terminated' WHERE id = ?").run(subscriptionId);
    db.prepare("UPDATE subscriptions SET terminated_at = ? WHERE id = ?").run(completedAt, subscriptionId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TC-006"]!(src, "telecom.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TC-006"]!(src, "telecom.ts")).toHaveLength(0);
  });
});

// F463 (Sprint 297) — banking domain BK-001~006 PRESENCE (idempotent 2-step)
describe("banking domain — BK-001~006 via withRuleId (Sprint 297 F463)", () => {
  it("BK-001 PRESENCE — amount >= MAX_WITHDRAWAL_AMOUNT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "banking.ts",
      `const MAX_WITHDRAWAL_AMOUNT = 10000000;
function processWithdrawal(db, accountId, amount) {
  const account = db.prepare("SELECT id, status, balance FROM accounts WHERE id = ?").get(accountId);
  if (amount >= MAX_WITHDRAWAL_AMOUNT) {
    throw new BankingError('E422-WITHDRAWAL-LIMIT', \`Withdrawal amount exceeds limit (\${amount} >= \${MAX_WITHDRAWAL_AMOUNT})\`, 422);
  }
  db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(amount, accountId);
  db.prepare("INSERT INTO transactions (id, from_account_id, amount, transaction_type, status, fee, created_at, completed_at) VALUES (?, ?, ?, 'withdrawal', 'completed', 0, ?, ?)").run(transactionId, accountId, amount, completedAt, completedAt);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-001"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-001"]!(src, "banking.ts")).toHaveLength(0);
  });

  it("BK-002 PRESENCE — feeAmount > transferFeeLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "banking.ts",
      `function computeTransferFee(db, fromAccountId, transferAmount) {
  const account = db.prepare("SELECT id, account_type FROM accounts WHERE id = ?").get(fromAccountId);
  const feeAmount = Math.floor(transferAmount * feeRate);
  const transferFeeLimit = 50000;
  if (feeAmount > transferFeeLimit) {
    throw new BankingError('E422-TRANSFER-FEE', \`Transfer fee exceeds limit (\${feeAmount} > \${transferFeeLimit})\`, 422);
  }
  return { feeAmount, transferFeeLimit, withinLimit: true };
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-002"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-002"]!(src, "banking.ts")).toHaveLength(0);
  });

  it("BK-003 PRESENCE — db.transaction() in processAccountTransfer (atomic debit+credit+log)", () => {
    const src = parseTypeScriptSource(
      "banking.ts",
      `function processAccountTransfer(db, fromAccountId, toAccountId, amount, fee) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").run(amount + fee, fromAccountId);
    db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").run(amount, toAccountId);
    db.prepare("INSERT INTO transactions (id, from_account_id, to_account_id, amount, transaction_type, status, fee, created_at, completed_at) VALUES (?, ?, ?, ?, 'transfer', 'completed', ?, ?, ?)").run(transactionId, fromAccountId, toAccountId, amount, fee, completedAt, completedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-003"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-003"]!(src, "banking.ts")).toHaveLength(0);
  });

  it("BK-004 PRESENCE — status comparison + 'active'/'frozen' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "banking.ts",
      `function transitionAccountStatus(db, accountId, newStatus) {
  const account = db.prepare("SELECT status FROM accounts WHERE id = ?").get(accountId);
  if (account.status === 'pending_kyc') throw new BankingError("E409-ACCOUNT", "Invalid transition", 409);
  db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(accountId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-004"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-004"]!(src, "banking.ts")).toHaveLength(0);
  });

  it("BK-005 PRESENCE — batch status='dormant' update in markDormantAccounts (file context)", () => {
    // detector는 파일 전체 스캔 — transitionAccountStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "banking.ts",
      `function transitionAccountStatus(db, accountId, newStatus) {
  const account = db.prepare("SELECT status FROM accounts WHERE id = ?").get(accountId);
  if (account.status === 'pending_kyc') throw new BankingError("E409-ACCOUNT", "Invalid", 409);
  db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(accountId);
}
function markDormantAccounts(db, inactiveCutoffDate) {
  const candidates = db.prepare("SELECT id FROM accounts WHERE status = 'active' AND last_tx_date < ?").all(inactiveCutoffDate);
  for (const account of candidates) {
    db.prepare("UPDATE accounts SET status = 'dormant', dormant_at = ? WHERE id = ?").run(dormantAt, account.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-005"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-005"]!(src, "banking.ts")).toHaveLength(0);
  });

  it("BK-006 PRESENCE — db.transaction() in verifyKyc (atomic kyc+aml+activation)", () => {
    const src = parseTypeScriptSource(
      "banking.ts",
      `function verifyKyc(db, accountId, documentType) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO kyc_records (id, account_id, verification_status, verified_at, document_type) VALUES (?, ?, 'verified', ?, ?)").run(kycId, accountId, activatedAt, documentType);
    db.prepare("INSERT INTO aml_checks (id, account_id, check_status, checked_at, risk_score) VALUES (?, ?, 'cleared', ?, 0)").run(amlId, accountId, activatedAt);
    db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(accountId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BK-006"]!(src, "banking.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BK-006"]!(src, "banking.ts")).toHaveLength(0);
  });
});

// F464 (Sprint 298) — media domain MD-001~006 PRESENCE (idempotent 2-step)
describe("media domain — MD-001~006 via withRuleId (Sprint 298 F464)", () => {
  it("MD-001 PRESENCE — concurrentStreamCount >= MAX_CONCURRENT_STREAMS threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "media.ts",
      `const MAX_CONCURRENT_STREAMS = 4;
function activateMediaSubscription(db, subscriptionId, concurrentStreamCount) {
  if (concurrentStreamCount >= MAX_CONCURRENT_STREAMS) {
    throw new MediaError('E422-STREAM-LIMIT', 'Concurrent stream limit reached', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-001"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-001"]!(src, "media.ts")).toHaveLength(0);
  });

  it("MD-002 PRESENCE — viewedCount > viewQuotaLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "media.ts",
      `function checkViewQuota(db, userId, viewedCount) {
  const viewQuotaLimit = 10;
  if (viewedCount > viewQuotaLimit) {
    throw new MediaError('E422-VIEW-QUOTA', 'View quota exceeded', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-002"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-002"]!(src, "media.ts")).toHaveLength(0);
  });

  it("MD-003 PRESENCE — db.transaction() in processLicensing (atomic license_count decrement+insert)", () => {
    const src = parseTypeScriptSource(
      "media.ts",
      `function processLicensing(db, contentId, userId, licenseType) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE contents SET license_count = license_count - 1 WHERE id = ?").run(contentId);
    db.prepare("INSERT INTO licenses (id, content_id, user_id, license_type, status, granted_at) VALUES (?, ?, ?, ?, 'active', ?)").run(licenseId, contentId, userId, licenseType, grantedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-003"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-003"]!(src, "media.ts")).toHaveLength(0);
  });

  it("MD-004 PRESENCE — status comparison + 'published'/'archived' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "media.ts",
      `function transitionContentStatus(db, contentId, newStatus) {
  const content = db.prepare("SELECT status FROM contents WHERE id = ?").get(contentId);
  if (content.status === 'draft') throw new MediaError("E409-CONTENT", "Invalid transition", 409);
  db.prepare("UPDATE contents SET status = 'published' WHERE id = ?").run(contentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-004"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-004"]!(src, "media.ts")).toHaveLength(0);
  });

  it("MD-005 PRESENCE — batch status='expired' update in markExpiringContent (file context)", () => {
    // detector는 파일 전체 스캔 — transitionContentStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "media.ts",
      `function transitionContentStatus(db, contentId, newStatus) {
  const content = db.prepare("SELECT status FROM contents WHERE id = ?").get(contentId);
  if (content.status === 'draft') throw new MediaError("E409-CONTENT", "Invalid", 409);
  db.prepare("UPDATE contents SET status = 'published' WHERE id = ?").run(contentId);
}
function markExpiringContent(db, expirationCutoffDate) {
  const candidates = db.prepare("SELECT id FROM contents WHERE status = 'published' AND expires_at <= ?").all(expirationCutoffDate);
  for (const content of candidates) {
    db.prepare("UPDATE contents SET status = 'expired' WHERE id = ?").run(content.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-005"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-005"]!(src, "media.ts")).toHaveLength(0);
  });

  it("MD-006 PRESENCE — db.transaction() in processTakedown (atomic archived+resolved+revoked+refunds)", () => {
    const src = parseTypeScriptSource(
      "media.ts",
      `function processTakedown(db, contentId, reportId, reason) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE contents SET status = 'archived', archived_at = ? WHERE id = ?").run(takenDownAt, contentId);
    db.prepare("UPDATE reports SET status = 'resolved', resolved_at = ? WHERE id = ?").run(takenDownAt, reportId);
    db.prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?").run(license.id);
    db.prepare("INSERT INTO refunds (id, license_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), license.id, license.user_id, reason, takenDownAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MD-006"]!(src, "media.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MD-006"]!(src, "media.ts")).toHaveLength(0);
  });
});

// F465 (Sprint 299) — pharmacy domain PH-001~006 PRESENCE (idempotent 2-step)
describe("pharmacy domain — PH-001~006 via withRuleId (Sprint 299 F465)", () => {
  it("PH-001 PRESENCE — dosageAmount >= MAX_DAILY_DOSE threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `const MAX_DAILY_DOSE = 4000;
function validateDosage(db, prescriptionId, dosageAmount) {
  if (dosageAmount >= MAX_DAILY_DOSE) {
    throw new PharmacyError('E422-DOSAGE-EXCEEDED', 'Daily dosage limit exceeded', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-001"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-001"]!(src, "pharmacy.ts")).toHaveLength(0);
  });

  it("PH-002 PRESENCE — refillsUsed > refillQuotaLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `function checkRefillQuota(db, prescriptionId, refillsUsed) {
  const refillQuotaLimit = 3;
  if (refillsUsed > refillQuotaLimit) {
    throw new PharmacyError('E422-REFILL-QUOTA', 'Refill quota exceeded', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-002"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-002"]!(src, "pharmacy.ts")).toHaveLength(0);
  });

  it("PH-003 PRESENCE — db.transaction() in dispensePrescription (atomic stock decrement+status+dispenses INSERT)", () => {
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `function dispensePrescription(db, prescriptionId, pharmacistId) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE drugs SET stock_count = stock_count - 1 WHERE id = ?").run(drugId);
    db.prepare("UPDATE prescriptions SET status = 'dispensed', dispensed_at = ? WHERE id = ?").run(dispensedAt, prescriptionId);
    db.prepare("INSERT INTO dispenses (id, prescription_id, pharmacist_id, drug_id, dispensed_at) VALUES (?, ?, ?, ?, ?)").run(dispenseId, prescriptionId, pharmacistId, drugId, dispensedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-003"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-003"]!(src, "pharmacy.ts")).toHaveLength(0);
  });

  it("PH-004 PRESENCE — status comparison + 'dispensed'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `function transitionPrescriptionStatus(db, prescriptionId, newStatus) {
  const prescription = db.prepare("SELECT status FROM prescriptions WHERE id = ?").get(prescriptionId);
  if (prescription.status === 'issued') throw new PharmacyError("E409-PRESCRIPTION", "Invalid transition", 409);
  db.prepare("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?").run(prescriptionId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-004"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-004"]!(src, "pharmacy.ts")).toHaveLength(0);
  });

  it("PH-005 PRESENCE — batch status='recalled' update in markRecalledBatches (file context)", () => {
    // detector는 파일 전체 스캔 — transitionPrescriptionStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `function transitionPrescriptionStatus(db, prescriptionId, newStatus) {
  const prescription = db.prepare("SELECT status FROM prescriptions WHERE id = ?").get(prescriptionId);
  if (prescription.status === 'issued') throw new PharmacyError("E409-PRESCRIPTION", "Invalid", 409);
  db.prepare("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?").run(prescriptionId);
}
function markRecalledBatches(db, recallCutoffDate) {
  const candidates = db.prepare("SELECT id FROM drugs WHERE status = 'active' AND recalled_at <= ?").all(recallCutoffDate);
  for (const drug of candidates) {
    db.prepare("UPDATE drugs SET status = 'recalled' WHERE id = ?").run(drug.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-005"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-005"]!(src, "pharmacy.ts")).toHaveLength(0);
  });

  it("PH-006 PRESENCE — db.transaction() in checkDrugInteraction (atomic interaction log+prescription block)", () => {
    const src = parseTypeScriptSource(
      "pharmacy.ts",
      `function checkDrugInteraction(db, prescriptionId, newDrugId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO interaction_logs (id, prescription_id, new_drug_id, severity, alternative_drug_id, checked_at, blocked) VALUES (?, ?, ?, ?, ?, ?, 1)").run(randomUUID(), prescriptionId, newDrugId, 'severe', altId, checkedAt);
    db.prepare("UPDATE prescriptions SET status = 'pending' WHERE id = ? AND status = 'issued'").run(prescriptionId);
    return altId;
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PH-006"]!(src, "pharmacy.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PH-006"]!(src, "pharmacy.ts")).toHaveLength(0);
  });
});
