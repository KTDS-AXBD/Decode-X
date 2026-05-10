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

describe("BL-001~004 — lpon-charge gap fill (Sprint 314 F480)", () => {
  // charging.ts executeCharge 패턴 — 외부 출금 API try/catch + db.transaction.
  // BL-001 (외부 호출) / BL-002 (단일 tx) / BL-003 (catch branch) / BL-004 (timeout 동일 catch)
  // 모두 AtomicTransaction PRESENCE 입증.
  const chargingSrc = `
    async function executeCharge(db, input, api) {
      let externalTxId;
      try {
        const result = await api.requestWithdrawal(input.accountId, input.amount);
        externalTxId = result.externalTxId;
      } catch {
        throw new ChargeError('E500', 'Withdrawal failed', 500);
      }
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO charge_transactions (id, status) VALUES (?, 'CHARGED')").run(input.chargeId);
        db.prepare("UPDATE vouchers SET balance = balance + ? WHERE id = ?").run(input.amount, input.voucherId);
      });
      tx();
    }
  `;

  it("BL-001 (외부 출금 API try/catch) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("charging.ts", chargingSrc);
    expect(BL_DETECTOR_REGISTRY["BL-001"]!(sf, "charging.ts")).toEqual([]);
  });

  it("BL-002 (db.transaction 단일 tx) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("charging.ts", chargingSrc);
    expect(BL_DETECTOR_REGISTRY["BL-002"]!(sf, "charging.ts")).toEqual([]);
  });

  it("BL-003 (catch branch — 출금 실패 처리) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("charging.ts", chargingSrc);
    expect(BL_DETECTOR_REGISTRY["BL-003"]!(sf, "charging.ts")).toEqual([]);
  });

  it("BL-004 (timeout — 동일 try/catch 분기) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("charging.ts", chargingSrc);
    expect(BL_DETECTOR_REGISTRY["BL-004"]!(sf, "charging.ts")).toEqual([]);
  });

  it("BL-001 ABSENCE — sequential writes (no try/catch + no db.transaction) → 1 marker with ruleId BL-001", () => {
    const partial = `
      function nonAtomic(db) {
        db.prepare("INSERT INTO charge_transactions (id) VALUES (?)").run("c1");
        db.prepare("UPDATE vouchers SET balance = balance + 100").run();
      }
    `;
    const sf = parseTypeScriptSource("charging.ts", partial);
    const markers = BL_DETECTOR_REGISTRY["BL-001"]!(sf, "charging.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-001");
  });
});

describe("BL_DETECTOR_REGISTRY", () => {
  it("exposes 260 detectors (Sprint 317 F483 — lpon-payment BL-013/016/017/018/019 ABSENCE markers, 100% coverage 마일스톤)", () => {
    expect(Object.keys(BL_DETECTOR_REGISTRY).sort()).toEqual([
      "AG-001",
      "AG-002",
      "AG-003",
      "AG-004",
      "AG-005",
      "AG-006",
      "AV-001",
      "AV-002",
      "AV-003",
      "AV-004",
      "AV-005",
      "AV-006",
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
      "BL-001",
      "BL-002",
      "BL-003",
      "BL-004",
      "BL-005",
      "BL-006",
      "BL-007",
      "BL-008",
      "BL-013",
      "BL-014",
      "BL-015",
      "BL-016",
      "BL-017",
      "BL-018",
      "BL-019",
      "BL-020",
      "BL-021",
      "BL-022",
      "BL-023",
      "BL-024",
      "BL-025",
      "BL-026",
      "BL-027",
      "BL-028",
      "BL-029",
      "BL-030",
      "BL-031",
      "BL-032",
      "BL-033",
      "BL-034",
      "BL-035",
      "BL-036",
      "BL-042",
      "BL-G001",
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
      "BT-001",
      "BT-002",
      "BT-003",
      "BT-004",
      "BT-005",
      "BT-006",
      "CC-001",
      "CC-002",
      "CC-003",
      "CC-004",
      "CC-005",
      "CC-006",
      "CH-001",
      "CH-002",
      "CH-003",
      "CH-004",
      "CH-005",
      "CH-006",
      "CN-001",
      "CN-002",
      "CN-003",
      "CN-004",
      "CN-005",
      "CN-006",
      "DF-001",
      "DF-002",
      "DF-003",
      "DF-004",
      "DF-005",
      "DF-006",
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
      "FT-001",
      "FT-002",
      "FT-003",
      "FT-004",
      "FT-005",
      "FT-006",
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
      "MN-001",
      "MN-002",
      "MN-003",
      "MN-004",
      "MN-005",
      "MN-006",
      "MR-001",
      "MR-002",
      "MR-003",
      "MR-004",
      "MR-005",
      "MR-006",
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
      "PR-001",
      "PR-002",
      "PR-003",
      "PR-004",
      "PR-005",
      "PR-006",
      "PT-001",
      "PT-002",
      "PT-003",
      "PT-004",
      "PT-005",
      "PT-006",
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
      "SP-001",
      "SP-002",
      "SP-003",
      "SP-004",
      "SP-005",
      "SP-006",
      "TC-001",
      "TC-002",
      "TC-003",
      "TC-004",
      "TC-005",
      "TC-006",
      "TM-001",
      "TM-002",
      "TM-003",
      "TM-004",
      "TM-005",
      "TM-006",
      "TR-001",
      "TR-002",
      "TR-003",
      "TR-004",
      "TR-005",
      "TR-006",
      "TS-001",
      "TS-002",
      "TS-003",
      "TS-004",
      "TS-005",
      "TS-006",
      "V-001",
      "V-002",
      "V-003",
      "V-004",
      "V-005",
      "V-006",
      "WL-001",
      "WL-002",
      "WL-003",
      "WL-004",
      "WL-005",
      "WL-006",
    ]);
  });

  it("MN-001~MN-006 registered (Sprint 305 F471 — mining 35번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["MN-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MN-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MN-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MN-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MN-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MN-006"]).toBeDefined();
  });

  it("DF-001~DF-006 registered (Sprint 306 F472 — defense 36번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["DF-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["DF-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["DF-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["DF-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["DF-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["DF-006"]).toBeDefined();
  });

  it("SP-001~SP-006 registered (Sprint 307 F473 — sports 37번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["SP-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SP-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SP-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SP-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SP-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SP-006"]).toBeDefined();
  });

  it("CH-001~CH-006 registered (Sprint 308 F474 — charity 38번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["CH-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CH-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CH-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CH-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CH-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CH-006"]).toBeDefined();
  });

  it("WL-001~WL-006 registered (Sprint 309 F475 — wellness 39번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["WL-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["WL-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["WL-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["WL-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["WL-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["WL-006"]).toBeDefined();
  });

  it("PT-001~PT-006 registered (Sprint 310 F476 — pet 40번째 도메인)", () => {
    expect(BL_DETECTOR_REGISTRY["PT-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PT-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PT-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PT-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PT-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PT-006"]).toBeDefined();
  });

  it("PR-001~PR-006 registered (Sprint 311 F477 — property 41번째 도메인, 🏆 30 산업 연속 0 ABSENCE)", () => {
    expect(BL_DETECTOR_REGISTRY["PR-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PR-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PR-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PR-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PR-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PR-006"]).toBeDefined();
  });

  it("FT-001~FT-006 registered (Sprint 312 F478 — fitness 42번째 도메인, 🏆 40 Sprint 연속 정점)", () => {
    expect(BL_DETECTOR_REGISTRY["FT-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FT-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FT-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FT-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FT-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FT-006"]).toBeDefined();
  });

  it("TM-001~TM-006 registered (Sprint 318 F484 — telemedicine 44번째 도메인, HC+PH+TM 의료 3-클러스터)", () => {
    expect(BL_DETECTOR_REGISTRY["TM-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TM-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TM-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TM-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TM-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TM-006"]).toBeDefined();
  });

  it("BT-001~BT-006 registered (Sprint 313 F479 — beauty 43번째 도메인, WL+SP+FT+BT 서비스 4-클러스터)", () => {
    expect(BL_DETECTOR_REGISTRY["BT-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BT-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BT-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BT-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BT-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BT-006"]).toBeDefined();
  });

  it("BL-001~BL-004 registered (Sprint 314 F480 — lpon-charge gap fill, 95.0% coverage 돌파)", () => {
    expect(BL_DETECTOR_REGISTRY["BL-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-004"]).toBeDefined();
  });

  it("BL-020/021/023/025/030 registered (Sprint 315 F481 — lpon-refund gap fill, 96.9% coverage)", () => {
    expect(BL_DETECTOR_REGISTRY["BL-020"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-021"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-023"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-025"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BL-030"]).toBeDefined();
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

// F466 (Sprint 300) — agriculture domain AG-001~006 PRESENCE (idempotent 2-step) 🏆 Sprint 300 마일스톤
describe("agriculture domain — AG-001~006 via withRuleId (Sprint 300 F466)", () => {
  it("AG-001 PRESENCE — yieldPerHectare >= MAX_YIELD_PER_HECTARE threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `const MAX_YIELD_PER_HECTARE = 10000;
function recordCropYield(db, cropId, yieldKg) {
  const yieldPerHectare = yieldKg / areaHectares;
  if (yieldPerHectare >= MAX_YIELD_PER_HECTARE) {
    throw new AgricultureError('E422-YIELD-EXCEEDED', 'Crop yield per hectare exceeded', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-001"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-001"]!(src, "agriculture.ts")).toHaveLength(0);
  });

  it("AG-002 PRESENCE — pesticideApplied > pesticideQuotaLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `function applyPesticide(db, fieldId, pesticideApplied) {
  const pesticideQuotaLimit = 80;
  if (pesticideApplied > pesticideQuotaLimit) {
    throw new AgricultureError('E422-PESTICIDE-QUOTA', 'Pesticide quota exceeded', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-002"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-002"]!(src, "agriculture.ts")).toHaveLength(0);
  });

  it("AG-003 PRESENCE — db.transaction() in processHarvest (atomic harvest+grading+status INSERT)", () => {
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `function processHarvest(db, cropId, inspectorId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO harvests (id, crop_id, field_id, yield_kg, harvested_at, inspector_id) VALUES (?, ?, ?, ?, ?, ?)").run(harvestId, cropId, fieldId, yieldKg, harvestedAt, inspectorId);
    db.prepare("INSERT INTO gradings (id, harvest_id, grade, graded_at, grader_id) VALUES (?, ?, ?, ?, ?)").run(gradingId, harvestId, grade, harvestedAt, inspectorId);
    db.prepare("UPDATE crops SET status = 'harvested', harvested_at = ?, grade = ? WHERE id = ?").run(harvestedAt, grade, cropId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-003"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-003"]!(src, "agriculture.ts")).toHaveLength(0);
  });

  it("AG-004 PRESENCE — status comparison + 'harvested'/'sold' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `function transitionCropStatus(db, cropId, newStatus) {
  const crop = db.prepare("SELECT status FROM crops WHERE id = ?").get(cropId);
  if (crop.status === 'planted') throw new AgricultureError("E409-CROP", "Invalid transition", 409);
  db.prepare("UPDATE crops SET status = 'harvested' WHERE id = ?").run(cropId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-004"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-004"]!(src, "agriculture.ts")).toHaveLength(0);
  });

  it("AG-005 PRESENCE — batch status='graded' update in markBatchGrading (file context)", () => {
    // detector는 파일 전체 스캔 — transitionCropStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `function transitionCropStatus(db, cropId, newStatus) {
  const crop = db.prepare("SELECT status FROM crops WHERE id = ?").get(cropId);
  if (crop.status === 'planted') throw new AgricultureError("E409-CROP", "Invalid", 409);
  db.prepare("UPDATE crops SET status = 'harvested' WHERE id = ?").run(cropId);
}
function markBatchGrading(db, gradingCutoffDate) {
  const candidates = db.prepare("SELECT id FROM harvests WHERE graded = 0 AND harvested_at <= ?").all(gradingCutoffDate);
  for (const harvest of candidates) {
    db.prepare("UPDATE harvests SET graded = 1, status = 'graded' WHERE id = ?").run(harvest.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-005"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-005"]!(src, "agriculture.ts")).toHaveLength(0);
  });

  it("AG-006 PRESENCE — db.transaction() in issueCertification (atomic certifications+labels+certified)", () => {
    const src = parseTypeScriptSource(
      "agriculture.ts",
      `function issueCertification(db, cropId, certType, issuedBy) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO certifications (id, crop_id, cert_type, issued_at, expires_at, issued_by) VALUES (?, ?, ?, ?, ?, ?)").run(certId, cropId, certType, issuedAt, expiresAt, issuedBy);
    db.prepare("INSERT INTO certification_labels (id, cert_id, crop_id, cert_type, label_created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), certId, cropId, certType, issuedAt);
    db.prepare("UPDATE crops SET certified = 1 WHERE id = ?").run(cropId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AG-006"]!(src, "agriculture.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AG-006"]!(src, "agriculture.ts")).toHaveLength(0);
  });
});

// F467 (Sprint 301) — construction domain CN-001~006 PRESENCE (idempotent 2-step) 🏆 20 산업 round number
describe("construction domain — CN-001~006 via withRuleId (Sprint 301 F467)", () => {
  it("CN-001 PRESENCE — bidAmount >= MAX_BID_AMOUNT_LIMIT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "construction.ts",
      `const MAX_BID_AMOUNT_LIMIT = 1000000000;
function submitBid(db, projectId, contractorId, bidAmount) {
  if (bidAmount >= MAX_BID_AMOUNT_LIMIT) {
    throw new ConstructionError('E422-BID-LIMIT', 'Bid amount exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-001"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-001"]!(src, "construction.ts")).toHaveLength(0);
  });

  it("CN-002 PRESENCE — retentionRate > retentionRateLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "construction.ts",
      `function computePaymentRetention(db, projectId, paymentAmount, retentionRate) {
  const retentionRateLimit = 0.07;
  if (retentionRate > retentionRateLimit) {
    throw new ConstructionError('E422-RETENTION-EXCEEDED', 'Retention rate exceeded limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-002"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-002"]!(src, "construction.ts")).toHaveLength(0);
  });

  it("CN-003 PRESENCE — db.transaction() in processChangeOrder (atomic change_orders+approvals+contract_value UPDATE)", () => {
    const src = parseTypeScriptSource(
      "construction.ts",
      `function processChangeOrder(db, projectId, description, unitPriceAdjustment, approverId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO change_orders (id, project_id, description, unit_price_adjustment, approved_at, status) VALUES (?, ?, ?, ?, ?, 'approved')").run(changeOrderId, projectId, description, unitPriceAdjustment, approvedAt);
    db.prepare("UPDATE projects SET contract_value = ? WHERE id = ?").run(newContractValue, projectId);
    db.prepare("INSERT INTO change_order_approvals (id, change_order_id, approver_id, approved_at) VALUES (?, ?, ?, ?)").run(randomUUID(), changeOrderId, approverId, approvedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-003"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-003"]!(src, "construction.ts")).toHaveLength(0);
  });

  it("CN-004 PRESENCE — status comparison + 'awarded'/'in_progress' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "construction.ts",
      `function transitionProjectStatus(db, projectId, newStatus) {
  const project = db.prepare("SELECT status FROM projects WHERE id = ?").get(projectId);
  if (project.status === 'bidding') throw new ConstructionError("E409-PROJECT", "Invalid transition", 409);
  db.prepare("UPDATE projects SET status = 'awarded' WHERE id = ?").run(projectId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-004"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-004"]!(src, "construction.ts")).toHaveLength(0);
  });

  it("CN-005 PRESENCE — batch status='completed' update in markMilestoneCompletion (file context)", () => {
    // detector는 파일 전체 스캔 — transitionProjectStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "construction.ts",
      `function transitionProjectStatus(db, projectId, newStatus) {
  const project = db.prepare("SELECT status FROM projects WHERE id = ?").get(projectId);
  if (project.status === 'bidding') throw new ConstructionError("E409-PROJECT", "Invalid", 409);
  db.prepare("UPDATE projects SET status = 'awarded' WHERE id = ?").run(projectId);
}
function markMilestoneCompletion(db, dueDateCutoff) {
  const candidates = db.prepare("SELECT id FROM milestones WHERE completed = 0 AND due_date <= ?").all(dueDateCutoff);
  for (const milestone of candidates) {
    db.prepare("UPDATE milestones SET completed = 1, status = 'completed' WHERE id = ?").run(milestone.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-005"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-005"]!(src, "construction.ts")).toHaveLength(0);
  });

  it("CN-006 PRESENCE — db.transaction() in processSafetyInspection (atomic inspections+correction_orders+last_inspection UPDATE)", () => {
    const src = parseTypeScriptSource(
      "construction.ts",
      `function processSafetyInspection(db, projectId, inspectorId, passed, correctionNotes) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO safety_inspections (id, project_id, inspector_id, inspected_at, result) VALUES (?, ?, ?, ?, ?)").run(inspectionId, projectId, inspectorId, inspectedAt, result);
    db.prepare("INSERT INTO correction_orders (id, inspection_id, project_id, notes, issued_at) VALUES (?, ?, ?, ?, ?)").run(correctionOrderId, inspectionId, projectId, correctionNotes, inspectedAt);
    db.prepare("UPDATE projects SET last_inspection_at = ?, last_inspection_result = ? WHERE id = ?").run(inspectedAt, result, projectId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CN-006"]!(src, "construction.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CN-006"]!(src, "construction.ts")).toHaveLength(0);
  });
});

// F468 (Sprint 302) — maritime domain MR-001~006 via withRuleId (30 Sprint 연속 정점) 🎯 AIF-PLAN-100
describe("maritime domain — MR-001~006 via withRuleId (Sprint 302 F468)", () => {
  it("MR-001 PRESENCE — cargoTons >= MAX_CARGO_CAPACITY_TONS threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "maritime.ts",
      `const MAX_CARGO_CAPACITY_TONS = 200000;
function loadCargo(db, vesselId, shipperId, cargoTons) {
  if (cargoTons >= MAX_CARGO_CAPACITY_TONS) {
    throw new MaritimeError('E422-CARGO-LIMIT', 'Cargo tonnage exceeded maximum capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-001"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-001"]!(src, "maritime.ts")).toHaveLength(0);
  });

  it("MR-002 PRESENCE — quotedRate > freightRateLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "maritime.ts",
      `function computeFreightRate(db, shipmentId, quotedRate) {
  const freightRateLimit = 40;
  if (quotedRate > freightRateLimit) {
    throw new MaritimeError('E422-FREIGHT-RATE-EXCEEDED', 'Freight rate exceeded limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-002"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-002"]!(src, "maritime.ts")).toHaveLength(0);
  });

  it("MR-003 PRESENCE — db.transaction() in processCustoms (atomic customs_declarations+approvals+customs_cleared UPDATE)", () => {
    const src = parseTypeScriptSource(
      "maritime.ts",
      `function processCustoms(db, shipmentId, declaredValue, tariffRate, inspectorId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO customs_declarations (id, shipment_id, declared_value, tariff_amount, status, declared_at, cleared_at) VALUES (?, ?, ?, ?, 'cleared', ?, ?)").run(declarationId, shipmentId, declaredValue, tariffAmount, clearedAt, clearedAt);
    db.prepare("INSERT INTO customs_approvals (id, declaration_id, inspector_id, approved_at, notes) VALUES (?, ?, ?, ?, ?)").run(customsApprovalId, declarationId, inspectorId, clearedAt, 'Customs clearance approved');
    db.prepare("UPDATE shipments SET customs_cleared = 1, customs_cleared_at = ? WHERE id = ?").run(clearedAt, shipmentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-003"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-003"]!(src, "maritime.ts")).toHaveLength(0);
  });

  it("MR-004 PRESENCE — status comparison + 'loaded'/'at_sea' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "maritime.ts",
      `function transitionShipmentStatus(db, shipmentId, newStatus) {
  const shipment = db.prepare("SELECT status FROM shipments WHERE id = ?").get(shipmentId);
  if (shipment.status === 'booked') throw new MaritimeError("E409-SHIPMENT", "Invalid transition", 409);
  db.prepare("UPDATE shipments SET status = 'loaded' WHERE id = ?").run(shipmentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-004"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-004"]!(src, "maritime.ts")).toHaveLength(0);
  });

  it("MR-005 PRESENCE — batch status='port_cleared' update in markPortHandled (file context)", () => {
    // detector는 파일 전체 스캔 — transitionShipmentStatus 함수의 status === 비교식이 foundComparison=true 확정
    const src = parseTypeScriptSource(
      "maritime.ts",
      `function transitionShipmentStatus(db, shipmentId, newStatus) {
  const shipment = db.prepare("SELECT status FROM shipments WHERE id = ?").get(shipmentId);
  if (shipment.status === 'booked') throw new MaritimeError("E409-SHIPMENT", "Invalid", 409);
  db.prepare("UPDATE shipments SET status = 'loaded' WHERE id = ?").run(shipmentId);
}
function markPortHandled(db, arrivalCutoff) {
  const candidates = db.prepare("SELECT id FROM shipments WHERE status = 'arrived' AND arrived_at <= ? AND port_handled = 0").all(arrivalCutoff);
  for (const shipment of candidates) {
    db.prepare("UPDATE shipments SET port_handled = 1, status = 'port_cleared' WHERE id = ?").run(shipment.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-005"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-005"]!(src, "maritime.ts")).toHaveLength(0);
  });

  it("MR-006 PRESENCE — db.transaction() in processDamageClaim (atomic damage_claims+compensation_records+damage_claim_filed UPDATE)", () => {
    const src = parseTypeScriptSource(
      "maritime.ts",
      `function processDamageClaim(db, shipmentId, claimantId, damageDescription, compensationAmount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO damage_claims (id, shipment_id, claimant_id, damage_description, compensation_amount, status, submitted_at) VALUES (?, ?, ?, ?, ?, 'compensated', ?)").run(claimId, shipmentId, claimantId, damageDescription, compensationAmount, processedAt);
    db.prepare("INSERT INTO compensation_records (id, claim_id, shipment_id, amount, processed_at, processed_by) VALUES (?, ?, ?, ?, ?, ?)").run(compensationRecordId, claimId, shipmentId, compensationAmount, processedAt, claimantId);
    db.prepare("UPDATE shipments SET damage_claim_filed = 1 WHERE id = ?").run(shipmentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MR-006"]!(src, "maritime.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MR-006"]!(src, "maritime.ts")).toHaveLength(0);
  });
});

// F469 (Sprint 303) — transit domain TS-001~006 via withRuleId (31 Sprint 연속 정점)
describe("transit domain — TS-001~006 via withRuleId (Sprint 303 F469)", () => {
  it("TS-001 PRESENCE — passengerCount >= MAX_ROUTE_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `const MAX_ROUTE_CAPACITY = 1200;
function checkRouteCapacity(db, routeId, passengerId, originStop, destStop, fareZone) {
  if (passengerCount >= MAX_ROUTE_CAPACITY) {
    throw new TransitError('E422-CAPACITY-LIMIT', 'Route capacity exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-001"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-001"]!(src, "transit.ts")).toHaveLength(0);
  });

  it("TS-002 PRESENCE — zoneFare > fareZoneLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `function computeFare(db, tripId, zoneFare) {
  const fareZoneLimit = 1500;
  if (zoneFare > fareZoneLimit) {
    throw new TransitError('E422-FARE-EXCEEDED', 'Zone fare exceeded limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-002"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-002"]!(src, "transit.ts")).toHaveLength(0);
  });

  it("TS-003 PRESENCE — db.transaction() in processTransfer (atomic transfers+integrated_passes+trips UPDATE)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `function processTransfer(db, tripId, passengerId, toRouteId, transferFare) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO transfers (id, from_trip_id, to_route_id, passenger_id, transfer_fare, status, transferred_at) VALUES (?, ?, ?, ?, ?, 'completed', ?)").run(transferId, tripId, toRouteId, passengerId, transferFare, processedAt);
    db.prepare("INSERT INTO integrated_passes (id, transfer_id, passenger_id, issued_at, valid_minutes) VALUES (?, ?, ?, ?, 30)").run(integratedPassId, transferId, passengerId, processedAt);
    db.prepare("UPDATE trips SET status = 'transferred', transferred_at = ? WHERE id = ?").run(processedAt, tripId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-003"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-003"]!(src, "transit.ts")).toHaveLength(0);
  });

  it("TS-004 PRESENCE — status comparison + 'in_transit'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `function transitionTripStatus(db, tripId, newStatus) {
  const trip = db.prepare("SELECT status FROM trips WHERE id = ?").get(tripId);
  if (trip.status === 'boarded') throw new TransitError("E409-TRIP", "Invalid transition", 409);
  db.prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(tripId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-004"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-004"]!(src, "transit.ts")).toHaveLength(0);
  });

  it("TS-005 PRESENCE — batch renewed=1 update in markSeasonPassRenewal (file context)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `function transitionTripStatus(db, tripId, newStatus) {
  const trip = db.prepare("SELECT status FROM trips WHERE id = ?").get(tripId);
  if (trip.status === 'boarded') throw new TransitError("E409-TRIP", "Invalid", 409);
  db.prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(tripId);
}
function markSeasonPassRenewal(db, expiryBefore) {
  const candidates = db.prepare("SELECT id FROM season_passes WHERE valid_until <= ? AND renewed = 0 AND status = 'active'").all(expiryBefore);
  for (const pass of candidates) {
    db.prepare("UPDATE season_passes SET renewed = 1, renewed_at = ? WHERE id = ?").run(new Date().toISOString(), pass.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-005"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-005"]!(src, "transit.ts")).toHaveLength(0);
  });

  it("TS-006 PRESENCE — db.transaction() in processSuspensionRefund (atomic suspension_refunds+refund_records+suspension_refund_issued UPDATE)", () => {
    const src = parseTypeScriptSource(
      "transit.ts",
      `function processSuspensionRefund(db, routeId, passengerId, refundAmount, compensationAmount, suspensionReason) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO suspension_refunds (id, route_id, passenger_id, refund_amount, compensation_amount, status, processed_at, suspension_reason) VALUES (?, ?, ?, ?, ?, 'processed', ?, ?)").run(suspensionId, routeId, passengerId, refundAmount, compensationAmount, processedAt, suspensionReason);
    db.prepare("INSERT INTO refund_records (id, suspension_id, passenger_id, total_amount, processed_at, notes) VALUES (?, ?, ?, ?, ?, ?)").run(refundRecordId, suspensionId, passengerId, totalAmount, processedAt, 'Suspension refund + compensation processed');
    db.prepare("UPDATE routes SET suspension_refund_issued = 1 WHERE id = ?").run(routeId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TS-006"]!(src, "transit.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TS-006"]!(src, "transit.ts")).toHaveLength(0);
  });
});

// F470 (Sprint 304) — aviation domain AV-001~006 via withRuleId (32 Sprint 연속 정점)
describe("aviation domain — AV-001~006 via withRuleId (Sprint 304 F470)", () => {
  it("AV-001 PRESENCE — passengerCount >= MAX_PASSENGER_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `const MAX_PASSENGER_CAPACITY = 400;
function boardPassenger(db, flightId, passengerId, seatNumber, baggageWeight) {
  if (passengerCount >= MAX_PASSENGER_CAPACITY) {
    throw new AviationError('E422-CAPACITY-LIMIT', 'Passenger capacity exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-001"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-001"]!(src, "aviation.ts")).toHaveLength(0);
  });

  it("AV-002 PRESENCE — requiredFuel > fuelQuotaLimit (Path B, 'limit' keyword)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `function allocateFuel(db, flightId, requiredFuel) {
  const fuelQuotaLimit = 25000;
  if (requiredFuel > fuelQuotaLimit) {
    throw new AviationError('E422-FUEL-EXCEEDED', 'Required fuel exceeded quota limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-002"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-002"]!(src, "aviation.ts")).toHaveLength(0);
  });

  it("AV-003 PRESENCE — db.transaction() in dispatchFlight (atomic dispatch_records+flight_clearances+flights UPDATE+crew_schedules UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `function dispatchFlight(db, flightId, captainId, fuelLoaded, clearanceCode) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO dispatch_records (id, flight_id, captain_id, fuel_loaded, dispatched_at) VALUES (?, ?, ?, ?, ?)").run(dispatchId, flightId, captainId, fuelLoaded, departedAt);
    db.prepare("INSERT INTO flight_clearances (id, flight_id, clearance_code, issued_at, status) VALUES (?, ?, ?, ?, 'approved')").run(clearanceId, flightId, clearanceCode, departedAt);
    db.prepare("UPDATE flights SET status = 'departed', departed_at = ? WHERE id = ?").run(departedAt, flightId);
    db.prepare("UPDATE crew_schedules SET status = 'on_duty' WHERE flight_id = ?").run(flightId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-003"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-003"]!(src, "aviation.ts")).toHaveLength(0);
  });

  it("AV-004 PRESENCE — status comparison + 'boarding'/'in_flight' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `function transitionFlightStatus(db, flightId, newStatus) {
  const flight = db.prepare("SELECT status FROM flights WHERE id = ?").get(flightId);
  if (flight.status === 'scheduled') throw new AviationError("E409-FLIGHT", "Invalid transition", 409);
  db.prepare("UPDATE flights SET status = 'boarding' WHERE id = ?").run(flightId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-004"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-004"]!(src, "aviation.ts")).toHaveLength(0);
  });

  it("AV-005 PRESENCE — batch rotated=1 update in rotateCrewSchedule (file context)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `function transitionFlightStatus(db, flightId, newStatus) {
  const flight = db.prepare("SELECT status FROM flights WHERE id = ?").get(flightId);
  if (flight.status === 'scheduled') throw new AviationError("E409-FLIGHT", "Invalid", 409);
  db.prepare("UPDATE flights SET status = 'boarding' WHERE id = ?").run(flightId);
}
function rotateCrewSchedule(db, rotationBefore) {
  const candidates = db.prepare("SELECT id FROM crew_schedules WHERE assigned_at <= ? AND status = 'on_duty' AND rotation_due = 1").all(rotationBefore);
  for (const schedule of candidates) {
    db.prepare("UPDATE crew_schedules SET status = 'rotated', rotated_at = ? WHERE id = ?").run(new Date().toISOString(), schedule.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-005"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-005"]!(src, "aviation.ts")).toHaveLength(0);
  });

  it("AV-006 PRESENCE — db.transaction() in processBaggageClaim (atomic baggage_claims+damage_assessments+compensation_records+baggage_claim_filed UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aviation.ts",
      `function processBaggageClaim(db, passengerId, flightId, baggageTag, damageAmount, damageDescription) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO baggage_claims (id, passenger_id, flight_id, baggage_tag, damage_status, claim_amount, status, processed_at) VALUES (?, ?, ?, ?, 'damaged', ?, 'compensated', ?)").run(claimId, passengerId, flightId, baggageTag, damageAmount, processedAt);
    db.prepare("INSERT INTO damage_assessments (id, claim_id, description, assessed_amount, assessed_at) VALUES (?, ?, ?, ?, ?)").run(assessmentId, claimId, damageDescription, damageAmount, processedAt);
    db.prepare("INSERT INTO compensation_records (id, claim_id, passenger_id, total_amount, processed_at, notes) VALUES (?, ?, ?, ?, ?, ?)").run(compensationId, claimId, passengerId, totalCompensation, processedAt, 'Baggage damage compensation processed');
    db.prepare("UPDATE baggage_claims SET baggage_claim_filed = 1 WHERE id = ?").run(claimId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AV-006"]!(src, "aviation.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["AV-006"]!(src, "aviation.ts")).toHaveLength(0);
  });
});

// F471 (Sprint 305) — mining domain MN-001~006 via withRuleId (33 Sprint 연속 정점)
describe("mining domain — MN-001~006 via withRuleId (Sprint 305 F471)", () => {
  it("MN-001 PRESENCE — totalExtracted >= MAX_EXTRACTION_QUOTA threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `const MAX_EXTRACTION_QUOTA = 50000;
function recordExtraction(db, siteId, oreType, extractedTons, operatorId, shift) {
  if (totalExtracted >= MAX_EXTRACTION_QUOTA) {
    throw new MiningError('E422-QUOTA-EXCEEDED', 'Extraction quota exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-001"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-001"]!(src, "mining.ts")).toHaveLength(0);
  });

  it("MN-002 PRESENCE — royaltyAmount > royaltyTierLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `function computeRoyalty(db, siteId, oreType, extractionValue, tierCode) {
  const royaltyTierLimit = tier.max_royalty_limit;
  if (royaltyAmount > royaltyTierLimit) {
    throw new MiningError('E422-ROYALTY-EXCEEDED', 'Royalty amount exceeded tier limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-002"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-002"]!(src, "mining.ts")).toHaveLength(0);
  });

  it("MN-003 PRESENCE — db.transaction() in processBlastOperation (atomic blast_records+safety_clearances+blast_operations UPDATE+ore_batches UPDATE)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `function processBlastOperation(db, siteId, blastZone, operatorId, clearanceCode) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO blast_records (id, site_id, blast_zone, operator_id, executed_at, clearance_code) VALUES (?, ?, ?, ?, ?, ?)").run(blastId, siteId, blastZone, operatorId, executedAt, clearanceCode);
    db.prepare("INSERT INTO safety_clearances (id, blast_id, clearance_code, issued_at, status) VALUES (?, ?, ?, ?, 'approved')").run(clearanceId, blastId, clearanceCode, executedAt);
    db.prepare("UPDATE blast_operations SET status = 'executed', executed_at = ?, clearance_code = ? WHERE id = ?").run(executedAt, clearanceCode, pending.id);
    db.prepare("UPDATE ore_batches SET status = 'extracted' WHERE extraction_id IN (SELECT id FROM extractions WHERE site_id = ? AND status = 'recorded')").run(siteId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-003"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-003"]!(src, "mining.ts")).toHaveLength(0);
  });

  it("MN-004 PRESENCE — status comparison + 'graded'/'processed'/'shipped' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `function transitionOreStatus(db, batchId, newStatus) {
  const batch = db.prepare("SELECT status FROM ore_batches WHERE id = ?").get(batchId);
  if (batch.status === 'extracted') throw new MiningError("E409-BATCH", "Invalid transition", 409);
  db.prepare("UPDATE ore_batches SET status = 'graded' WHERE id = ?").run(batchId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-004"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-004"]!(src, "mining.ts")).toHaveLength(0);
  });

  it("MN-005 PRESENCE — batch checked update in runComplianceBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `function transitionOreStatus(db, batchId, newStatus) {
  const batch = db.prepare("SELECT status FROM ore_batches WHERE id = ?").get(batchId);
  if (batch.status === 'extracted') throw new MiningError("E409-BATCH", "Invalid", 409);
  db.prepare("UPDATE ore_batches SET status = 'graded' WHERE id = ?").run(batchId);
}
function runComplianceBatch(db, scheduledBefore) {
  const candidates = db.prepare("SELECT id FROM compliance_checks WHERE scheduled_at <= ? AND status = 'pending'").all(scheduledBefore);
  for (const check of candidates) {
    db.prepare("UPDATE compliance_checks SET status = 'checked', checked_at = ? WHERE id = ?").run(new Date().toISOString(), check.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-005"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-005"]!(src, "mining.ts")).toHaveLength(0);
  });

  it("MN-006 PRESENCE — db.transaction() in processSafetyIncident (atomic safety_incidents+incident_investigations+corrective_actions+safety_incidents.filed UPDATE)", () => {
    const src = parseTypeScriptSource(
      "mining.ts",
      `function processSafetyIncident(db, siteId, incidentType, severity, description, correctiveAction) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO safety_incidents (id, site_id, incident_type, severity, occurred_at, status, reported_at, filed) VALUES (?, ?, ?, ?, ?, 'reported', ?, 0)").run(incidentId, siteId, incidentType, severity, reportedAt, reportedAt);
    db.prepare("INSERT INTO incident_investigations (id, incident_id, description, investigated_at) VALUES (?, ?, ?, ?)").run(investigationId, incidentId, description, reportedAt);
    db.prepare("INSERT INTO corrective_actions (id, incident_id, action_description, created_at) VALUES (?, ?, ?, ?)").run(correctiveId, incidentId, correctiveAction, reportedAt);
    db.prepare("UPDATE safety_incidents SET filed = 1 WHERE id = ?").run(incidentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MN-006"]!(src, "mining.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["MN-006"]!(src, "mining.ts")).toHaveLength(0);
  });
});

// F472 (Sprint 306) — defense domain DF-001~006 via withRuleId (34 Sprint 연속 정점)
describe("defense domain — DF-001~006 via withRuleId (Sprint 306 F472)", () => {
  it("DF-001 PRESENCE — totalQuantity >= MAX_WEAPON_INVENTORY_LIMIT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `const MAX_WEAPON_INVENTORY_LIMIT = 500;
function recordWeaponInventory(db, unitId, weaponType, quantity, operatorId) {
  if (totalQuantity >= MAX_WEAPON_INVENTORY_LIMIT) {
    throw new DefenseError('E422-INVENTORY-EXCEEDED', 'Weapon inventory exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-001"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-001"]!(src, "defense.ts")).toHaveLength(0);
  });

  it("DF-002 PRESENCE — clearanceLevel > clearanceLevelLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `function checkClearanceLevel(db, personnelId, requiredLevel, tierCode) {
  const clearanceLevelLimit = tier.clearance_level_limit;
  if (clearanceLevel > clearanceLevelLimit) {
    throw new DefenseError('E422-CLEARANCE-EXCEEDED', 'Clearance level exceeded tier limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-002"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-002"]!(src, "defense.ts")).toHaveLength(0);
  });

  it("DF-003 PRESENCE — db.transaction() in dispatchMission (atomic missions+mission_assignments+mission_equipment+mission_communications INSERT)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `function dispatchMission(db, unitId, missionCode, personnelIds, equipmentIds, communicationChannel) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO missions (id, unit_id, mission_code, status, planned_at, dispatched_at, completed_at) VALUES (?, ?, ?, 'executing', ?, ?, NULL)").run(missionId, unitId, missionCode, dispatchedAt, dispatchedAt);
    db.prepare("INSERT INTO mission_assignments (id, mission_id, personnel_id, role, assigned_at) VALUES (?, ?, ?, 'operator', ?)").run(randomUUID(), missionId, personnelId, dispatchedAt);
    db.prepare("INSERT INTO mission_equipment (id, mission_id, equipment_id, quantity, assigned_at) VALUES (?, ?, ?, 1, ?)").run(randomUUID(), missionId, equipmentId, dispatchedAt);
    db.prepare("INSERT INTO mission_communications (id, mission_id, channel, protocol, activated_at) VALUES (?, ?, ?, 'encrypted', ?)").run(commId, missionId, communicationChannel, dispatchedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-003"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-003"]!(src, "defense.ts")).toHaveLength(0);
  });

  it("DF-004 PRESENCE — status comparison + 'briefed'/'executing'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `function transitionMissionStatus(db, missionId, newStatus) {
  const mission = db.prepare("SELECT status FROM missions WHERE id = ?").get(missionId);
  if (mission.status === 'planned') throw new DefenseError("E409-MISSION", "Invalid transition", 409);
  db.prepare("UPDATE missions SET status = 'briefed' WHERE id = ?").run(missionId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-004"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-004"]!(src, "defense.ts")).toHaveLength(0);
  });

  it("DF-005 PRESENCE — batch completed update in markTrainingRotation (file context)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `function transitionMissionStatus(db, missionId, newStatus) {
  const mission = db.prepare("SELECT status FROM missions WHERE id = ?").get(missionId);
  if (mission.status === 'planned') throw new DefenseError("E409-MISSION", "Invalid", 409);
  db.prepare("UPDATE missions SET status = 'briefed' WHERE id = ?").run(missionId);
}
function markTrainingRotation(db, scheduledBefore) {
  const candidates = db.prepare("SELECT id FROM training_schedules WHERE scheduled_at <= ? AND status = 'scheduled'").all(scheduledBefore);
  for (const schedule of candidates) {
    db.prepare("UPDATE training_schedules SET status = 'completed', completed_at = ? WHERE id = ?").run(new Date().toISOString(), schedule.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-005"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-005"]!(src, "defense.ts")).toHaveLength(0);
  });

  it("DF-006 PRESENCE — db.transaction() in processClassifiedDocument (atomic classified_documents+document_validations+document_issuances+document_audit_logs+classified_documents.status UPDATE)", () => {
    const src = parseTypeScriptSource(
      "defense.ts",
      `function processClassifiedDocument(db, unitId, documentCode, classificationLevel, validatorId, recipientId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO classified_documents (id, unit_id, document_code, classification_level, status, processed_at, issued_at) VALUES (?, ?, ?, ?, 'classified', ?, ?)").run(documentId, unitId, documentCode, classificationLevel, issuedAt, issuedAt);
    db.prepare("INSERT INTO document_validations (id, document_id, validated_by, validated_at, result) VALUES (?, ?, ?, ?, 'approved')").run(validationId, documentId, validatorId, issuedAt);
    db.prepare("INSERT INTO document_issuances (id, document_id, issued_to, issued_at, receipt_confirmed) VALUES (?, ?, ?, ?, 0)").run(issuanceId, documentId, recipientId, issuedAt);
    db.prepare("INSERT INTO document_audit_logs (id, document_id, action, performed_by, performed_at) VALUES (?, ?, 'issued', ?, ?)").run(auditId, documentId, validatorId, issuedAt);
    db.prepare("UPDATE classified_documents SET status = 'issued' WHERE id = ?").run(documentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["DF-006"]!(src, "defense.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["DF-006"]!(src, "defense.ts")).toHaveLength(0);
  });
});

// F473 (Sprint 307) — sports domain SP-001~006 via withRuleId (35 Sprint 연속 정점)
describe("sports domain — SP-001~006 via withRuleId (Sprint 307 F473)", () => {
  it("SP-001 PRESENCE — totalBooked >= MAX_VENUE_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `const MAX_VENUE_CAPACITY = 50000;
function bookVenueSeat(db, venueId, eventId, section, seatNumber, memberId) {
  if (totalBooked >= MAX_VENUE_CAPACITY) {
    throw new SportsError('E422-VENUE-CAPACITY-EXCEEDED', 'Venue capacity exceeded maximum limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-001"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-001"]!(src, "sports.ts")).toHaveLength(0);
  });

  it("SP-002 PRESENCE — requestedQuantity > seasonTicketLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `function applySeasonTicketTier(db, memberId, tierCode, requestedQuantity) {
  const seasonTicketLimit = tier.seasonTicketLimit;
  if (requestedQuantity > seasonTicketLimit) {
    throw new SportsError('E422-SEASON-TICKET-EXCEEDED', 'Season ticket request exceeded tier limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-002"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-002"]!(src, "sports.ts")).toHaveLength(0);
  });

  it("SP-003 PRESENCE — db.transaction() in processTicketSale (atomic ticket_sales+venue_seats+issued_tickets INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `function processTicketSale(db, eventId, memberId, seatId, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO ticket_sales (id, event_id, member_id, seat_id, amount, status, sold_at) VALUES (?, ?, ?, ?, ?, 'payment_confirmed', ?)").run(saleId, eventId, memberId, seatId, amount, soldAt);
    db.prepare("UPDATE venue_seats SET status = 'sold' WHERE id = ?").run(seatId);
    db.prepare("INSERT INTO issued_tickets (id, sale_id, event_id, member_id, seat_id, issued_at) VALUES (?, ?, ?, ?, ?, ?)").run(ticketId, saleId, eventId, memberId, seatId, soldAt);
    db.prepare("UPDATE ticket_sales SET status = 'issued' WHERE id = ?").run(saleId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-003"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-003"]!(src, "sports.ts")).toHaveLength(0);
  });

  it("SP-004 PRESENCE — status comparison + 'ticketing'/'live'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `function transitionEventStatus(db, eventId, newStatus) {
  const event = db.prepare("SELECT status FROM events WHERE id = ?").get(eventId);
  if (event.status === 'scheduled') throw new SportsError("E409-EVENT", "Invalid transition", 409);
  db.prepare("UPDATE events SET status = 'ticketing' WHERE id = ?").run(eventId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-004"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-004"]!(src, "sports.ts")).toHaveLength(0);
  });

  it("SP-005 PRESENCE — batch synced update in markMerchandiseSync (file context)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `function transitionEventStatus(db, eventId, newStatus) {
  const event = db.prepare("SELECT status FROM events WHERE id = ?").get(eventId);
  if (event.status === 'scheduled') throw new SportsError("E409-EVENT", "Invalid", 409);
  db.prepare("UPDATE events SET status = 'ticketing' WHERE id = ?").run(eventId);
}
function markMerchandiseSync(db, syncedBefore) {
  const candidates = db.prepare("SELECT id FROM merchandise_batches WHERE created_at <= ? AND status = 'pending'").all(syncedBefore);
  for (const batch of candidates) {
    db.prepare("UPDATE merchandise_batches SET status = 'synced', synced_at = ? WHERE id = ?").run(new Date().toISOString(), batch.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-005"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-005"]!(src, "sports.ts")).toHaveLength(0);
  });

  it("SP-006 PRESENCE — db.transaction() in processRefundRebook (atomic refund_records+ticket_sales+venue_seats+cancellation_logs)", () => {
    const src = parseTypeScriptSource(
      "sports.ts",
      `function processRefundRebook(db, originalSaleId, newEventId, newSeatId, memberId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO refund_records (id, sale_id, member_id, refund_amount, status, refunded_at) SELECT ?, id, ?, amount, 'completed', ? FROM ticket_sales WHERE id = ?").run(refundId, memberId, processedAt, originalSaleId);
    db.prepare("UPDATE ticket_sales SET status = 'cancelled' WHERE id = ?").run(originalSaleId);
    db.prepare("UPDATE venue_seats SET status = 'available' WHERE id = (SELECT seat_id FROM ticket_sales WHERE id = ?)").run(originalSaleId);
    db.prepare("INSERT INTO ticket_sales (id, event_id, member_id, seat_id, amount, status, sold_at) SELECT ?, ?, ?, ?, amount, 'issued', ? FROM ticket_sales WHERE id = ?").run(rebookSaleId, newEventId, memberId, newSeatId, processedAt, originalSaleId);
    db.prepare("INSERT INTO cancellation_logs (id, sale_id, member_id, reason, cancelled_at) VALUES (?, ?, ?, 'rebook', ?)").run(cancelId, originalSaleId, memberId, processedAt);
    db.prepare("UPDATE venue_seats SET status = 'sold' WHERE id = ?").run(newSeatId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SP-006"]!(src, "sports.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["SP-006"]!(src, "sports.ts")).toHaveLength(0);
  });
});

// F474 (Sprint 308) — charity domain CH-001~006 via withRuleId (36 Sprint 연속 정점)
describe("charity domain — CH-001~006 via withRuleId (Sprint 308 F474)", () => {
  it("CH-001 PRESENCE — amount >= MAX_RECEIPT_AMOUNT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `const MAX_RECEIPT_AMOUNT = 10_000_000;
function recordDonation(db, donorId, campaignId, amount, paymentMethod) {
  if (amount >= MAX_RECEIPT_AMOUNT) {
    throw new CharityError('E422-RECEIPT-LIMIT-EXCEEDED', 'Donation amount exceeds receipt issuance limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-001"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-001"]!(src, "charity.ts")).toHaveLength(0);
  });

  it("CH-002 PRESENCE — requestedAmount > grantTierLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `function applyGrant(db, granteeId, tierCode, requestedAmount) {
  const grantTierLimit = tier.grantTierLimit;
  if (requestedAmount > grantTierLimit) {
    throw new CharityError('E422-GRANT-TIER-EXCEEDED', 'Grant request exceeded tier limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-002"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-002"]!(src, "charity.ts")).toHaveLength(0);
  });

  it("CH-003 PRESENCE — db.transaction() in disburseFund (atomic fund_disbursements+grants+disbursement_receipts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `function disburseFund(db, grantId, granteeId, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO fund_disbursements (id, grant_id, grantee_id, amount, status, disbursed_at) VALUES (?, ?, ?, ?, 'initiated', ?)").run(disbursementId, grantId, granteeId, amount, disbursedAt);
    db.prepare("UPDATE grants SET status = 'disbursed' WHERE id = ?").run(grantId);
    db.prepare("INSERT INTO disbursement_receipts (id, disbursement_id, grantee_id, amount, issued_at) VALUES (?, ?, ?, ?, ?)").run(receiptId, disbursementId, granteeId, amount, disbursedAt);
    db.prepare("UPDATE fund_disbursements SET status = 'disbursed' WHERE id = ?").run(disbursementId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-003"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-003"]!(src, "charity.ts")).toHaveLength(0);
  });

  it("CH-004 PRESENCE — status comparison + 'active'/'closed'/'reported' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `function transitionCampaignStatus(db, campaignId, newStatus) {
  const campaign = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(campaignId);
  if (campaign.status === 'draft') throw new CharityError("E409-CAMPAIGN", "Invalid transition", 409);
  db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").run(campaignId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-004"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-004"]!(src, "charity.ts")).toHaveLength(0);
  });

  it("CH-005 PRESENCE — batch assigned update in markVolunteerSchedule (file context)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `function transitionCampaignStatus(db, campaignId, newStatus) {
  const campaign = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(campaignId);
  if (campaign.status === 'draft') throw new CharityError("E409-CAMPAIGN", "Invalid", 409);
  db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").run(campaignId);
}
function markVolunteerSchedule(db, scheduledBefore) {
  const candidates = db.prepare("SELECT id FROM volunteer_schedules WHERE scheduled_date <= ? AND status = 'pending'").all(scheduledBefore);
  for (const schedule of candidates) {
    db.prepare("UPDATE volunteer_schedules SET status = 'assigned', synced_at = ? WHERE id = ?").run(new Date().toISOString(), schedule.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-005"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-005"]!(src, "charity.ts")).toHaveLength(0);
  });

  it("CH-006 PRESENCE — db.transaction() in issueTaxCertificate (atomic tax_certificates+donations+tax_reports INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "charity.ts",
      `function issueTaxCertificate(db, donorId, donationId) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO tax_certificates (id, donor_id, donation_id, certificate_number, issued_at, reported_at) VALUES (?, ?, ?, ?, ?, NULL)").run(certificateId, donorId, donationId, certificateNumber, issuedAt);
    db.prepare("UPDATE donations SET status = 'confirmed' WHERE id = ?").run(donationId);
    db.prepare("INSERT INTO tax_reports (id, certificate_id, donor_id, reported_at) VALUES (?, ?, ?, ?)").run(reportId, certificateId, donorId, issuedAt);
    db.prepare("UPDATE tax_certificates SET reported_at = ? WHERE id = ?").run(issuedAt, certificateId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CH-006"]!(src, "charity.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["CH-006"]!(src, "charity.ts")).toHaveLength(0);
  });
});

// F475 (Sprint 309) — wellness domain WL-001~006 via withRuleId (37 Sprint 연속 정점)
describe("wellness domain — WL-001~006 via withRuleId (Sprint 309 F475)", () => {
  it("WL-001 PRESENCE — session.booked_count >= MAX_SESSION_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `const MAX_SESSION_CAPACITY = 20;
function bookSession(db, sessionId, memberId) {
  const limit = session.capacity ?? MAX_SESSION_CAPACITY;
  if (session.booked_count >= limit) {
    throw new WellnessError('E422-SESSION-CAPACITY-EXCEEDED', 'Session is fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-001"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-001"]!(src, "wellness.ts")).toHaveLength(0);
  });

  it("WL-002 PRESENCE — pkg.used_count >= packageUsageLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `function usePackageSession(db, memberId, packageId) {
  const packageUsageLimit = pkg.packageUsageLimit;
  if (pkg.used_count >= packageUsageLimit) {
    throw new WellnessError('E422-PACKAGE-USAGE-EXCEEDED', 'Package sessions exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-002"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-002"]!(src, "wellness.ts")).toHaveLength(0);
  });

  it("WL-003 PRESENCE — db.transaction() in confirmAppointment (atomic appointments+appointment_payments+appointment_resources+resources INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `function confirmAppointment(db, appointmentId, memberId, resourceId, amount) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(confirmedAt, appointmentId);
    db.prepare("INSERT INTO appointment_payments (id, appointment_id, member_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, appointmentId, memberId, amount, confirmedAt);
    db.prepare("INSERT INTO appointment_resources (id, appointment_id, resource_id, held_at, released_at) VALUES (?, ?, ?, ?, NULL)").run(resourceHoldId, appointmentId, resourceId, confirmedAt);
    db.prepare("UPDATE resources SET status = 'held' WHERE id = ?").run(resourceId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-003"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-003"]!(src, "wellness.ts")).toHaveLength(0);
  });

  it("WL-004 PRESENCE — status comparison + 'confirmed'/'in_session'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appt = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appt.status === 'booked') throw new WellnessError("E409-APPOINTMENT", "Invalid transition", 409);
  db.prepare("UPDATE appointments SET status = 'confirmed' WHERE id = ?").run(appointmentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-004"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-004"]!(src, "wellness.ts")).toHaveLength(0);
  });

  it("WL-005 PRESENCE — batch no_show update in markNoShowSessions (file context)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appt = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appt.status === 'booked') throw new WellnessError("E409-APPOINTMENT", "Invalid", 409);
  db.prepare("UPDATE appointments SET status = 'confirmed' WHERE id = ?").run(appointmentId);
}
function markNoShowSessions(db, scheduledBefore) {
  const candidates = db.prepare("SELECT a.id FROM appointments a JOIN sessions s ON a.session_id = s.id WHERE s.scheduled_date <= ? AND a.status = 'confirmed'").all(scheduledBefore);
  for (const appt of candidates) {
    db.prepare("UPDATE appointments SET status = 'no_show' WHERE id = ?").run(appt.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-005"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-005"]!(src, "wellness.ts")).toHaveLength(0);
  });

  it("WL-006 PRESENCE — db.transaction() in processCancellationFee (atomic appointments+cancellation_logs+refund_records+sessions INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "wellness.ts",
      `function processCancellationFee(db, appointmentId, memberId, penaltyAmount, refundAmount) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(appointmentId);
    db.prepare("INSERT INTO cancellation_logs (id, appointment_id, member_id, penalty_amount, refund_amount, reason, cancelled_at) VALUES (?, ?, ?, ?, ?, 'member_request', ?)").run(cancellationId, appointmentId, memberId, penaltyAmount, refundAmount, cancelledAt);
    db.prepare("INSERT INTO refund_records (id, appointment_id, member_id, refund_amount, status, refunded_at) VALUES (?, ?, ?, ?, 'completed', ?)").run(refundId, appointmentId, memberId, refundAmount, cancelledAt);
    db.prepare("UPDATE sessions SET booked_count = booked_count - 1 WHERE id = ?").run(sessionId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["WL-006"]!(src, "wellness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["WL-006"]!(src, "wellness.ts")).toHaveLength(0);
  });
});

// F476 (Sprint 310) — pet domain PT-001~006 via withRuleId (38 Sprint 연속 정점)
describe("pet domain — PT-001~006 via withRuleId (Sprint 310 F476)", () => {
  it("PT-001 PRESENCE — facility.booked_count >= MAX_BOARDING_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `const MAX_BOARDING_CAPACITY = 30;
function bookBoarding(db, facilityId, petId, ownerId) {
  const limit = facility.capacity ?? MAX_BOARDING_CAPACITY;
  if (facility.booked_count >= limit) {
    throw new PetError('E422-BOARDING-CAPACITY-EXCEEDED', 'Boarding fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-001"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-001"]!(src, "pet.ts")).toHaveLength(0);
  });

  it("PT-002 PRESENCE — vaccine.administered_count >= vaccinationLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `function applyVaccination(db, petId, vaccineId) {
  const vaccinationLimit = vaccine.vaccinationLimit;
  if (vaccine.administered_count >= vaccinationLimit) {
    throw new PetError('E422-VACCINATION-QUOTA-EXCEEDED', 'Vaccination quota reached', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-002"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-002"]!(src, "pet.ts")).toHaveLength(0);
  });

  it("PT-003 PRESENCE — db.transaction() in processGrooming (atomic groomings+grooming_payments+grooming_owner_matches+groomers INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `function processGrooming(db, groomingId, ownerId, groomerId, amount) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE groomings SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(confirmedAt, groomingId);
    db.prepare("INSERT INTO grooming_payments (id, grooming_id, owner_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, groomingId, ownerId, amount, confirmedAt);
    db.prepare("INSERT INTO grooming_owner_matches (id, grooming_id, owner_id, groomer_id, matched_at) VALUES (?, ?, ?, ?, ?)").run(ownerMatchId, groomingId, ownerId, groomerId, confirmedAt);
    db.prepare("UPDATE groomers SET status = 'booked' WHERE id = ?").run(groomerId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-003"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-003"]!(src, "pet.ts")).toHaveLength(0);
  });

  it("PT-004 PRESENCE — status comparison + 'checked_in'/'in_care'/'checked_out' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `function transitionCareStatus(db, careRecordId, newStatus) {
  const record = db.prepare("SELECT status FROM care_records WHERE id = ?").get(careRecordId);
  if (record.status === 'booked') throw new PetError("E409-CARE-RECORD", "Invalid transition", 409);
  db.prepare("UPDATE care_records SET status = 'checked_in' WHERE id = ?").run(careRecordId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-004"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-004"]!(src, "pet.ts")).toHaveLength(0);
  });

  it("PT-005 PRESENCE — batch processed update in markHealthRecordBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `function transitionCareStatus(db, careRecordId, newStatus) {
  const record = db.prepare("SELECT status FROM care_records WHERE id = ?").get(careRecordId);
  if (record.status === 'booked') throw new PetError("E409-CARE-RECORD", "Invalid", 409);
  db.prepare("UPDATE care_records SET status = 'checked_in' WHERE id = ?").run(careRecordId);
}
function markHealthRecordBatch(db, visitBefore) {
  const candidates = db.prepare("SELECT hr.id FROM health_records hr JOIN boarding_facilities bf ON hr.facility_id = bf.id WHERE hr.visit_date <= ? AND hr.status = 'pending'").all(visitBefore);
  for (const record of candidates) {
    db.prepare("UPDATE health_records SET status = 'processed' WHERE id = ?").run(record.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-005"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-005"]!(src, "pet.ts")).toHaveLength(0);
  });

  it("PT-006 PRESENCE — db.transaction() in processEmergency (atomic emergencies+emergency_treatments+owner_notifications+pets INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "pet.ts",
      `function processEmergency(db, petId, ownerId, facilityId, severity, treatmentNote) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO emergencies (id, pet_id, owner_id, facility_id, severity, status, reported_at) VALUES (?, ?, ?, ?, ?, 'treating', ?)").run(emergencyId, petId, ownerId, facilityId, severity, treatedAt);
    db.prepare("INSERT INTO emergency_treatments (id, emergency_id, facility_id, treatment_note, treated_at) VALUES (?, ?, ?, ?, ?)").run(treatmentId, emergencyId, facilityId, treatmentNote, treatedAt);
    db.prepare("INSERT INTO owner_notifications (id, owner_id, emergency_id, message, sent_at) VALUES (?, ?, ?, ?, ?)").run(notificationId, ownerId, emergencyId, message, treatedAt);
    db.prepare("UPDATE pets SET last_emergency_at = ? WHERE id = ?").run(treatedAt, petId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PT-006"]!(src, "pet.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PT-006"]!(src, "pet.ts")).toHaveLength(0);
  });
});

// F477 (Sprint 311) — property domain PR-001~006 via withRuleId (39 Sprint 연속 정점)
// 🏆 30 산업 연속 0 ABSENCE round number 마일스톤
describe("property domain — PR-001~006 via withRuleId (Sprint 311 F477)", () => {
  it("PR-001 PRESENCE — totalAmount >= MAX_UTILITY_BILL_AMOUNT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `const MAX_UTILITY_BILL_AMOUNT = 500000;
function computeUtilityBill(db, propertyId, tenantId, billingMonth, totalAmount) {
  const limit = MAX_UTILITY_BILL_AMOUNT;
  if (totalAmount >= limit) {
    throw new PropertyError('E422-UTILITY-BILL-EXCEEDED', 'Utility bill exceeds limit', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-001"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-001"]!(src, "property.ts")).toHaveLength(0);
  });

  it("PR-002 PRESENCE — requestedAmount > maintenanceBudgetLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `function approveMaintenance(db, requestId, propertyId) {
  const maintenanceBudgetLimit = request.maintenanceBudgetLimit;
  if (request.requested_amount > maintenanceBudgetLimit) {
    throw new PropertyError('E422-MAINTENANCE-BUDGET-EXCEEDED', 'Maintenance exceeds budget', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-002"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-002"]!(src, "property.ts")).toHaveLength(0);
  });

  it("PR-003 PRESENCE — db.transaction() in renewLease (atomic leases+lease_renewals+deposits INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `function renewLease(db, leaseId, newEndDate, newMonthlyRent, depositAdjustment) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE leases SET status = 'renewed', end_date = ?, monthly_rent = ?, updated_at = ? WHERE id = ?").run(newEndDate, newMonthlyRent, renewedAt, leaseId);
    db.prepare("INSERT INTO lease_renewals (id, lease_id, previous_end_date, new_end_date, monthly_rent, renewed_at) VALUES (?, ?, ?, ?, ?, ?)").run(renewalId, leaseId, prevEnd, newEndDate, newMonthlyRent, renewedAt);
    db.prepare("INSERT INTO deposits (id, lease_id, tenant_id, amount, status, created_at) VALUES (?, ?, ?, ?, 'held', ?)").run(depositId, leaseId, tenantId, depositAdjustment, renewedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-003"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-003"]!(src, "property.ts")).toHaveLength(0);
  });

  it("PR-004 PRESENCE — status comparison + 'active'/'renewed'/'terminated' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `function transitionLeaseStatus(db, leaseId, newStatus) {
  const lease = db.prepare("SELECT status FROM leases WHERE id = ?").get(leaseId);
  if (lease.status === 'pending') throw new PropertyError("E409-LEASE-STATUS", "Invalid transition", 409);
  db.prepare("UPDATE leases SET status = 'active' WHERE id = ?").run(leaseId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-004"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-004"]!(src, "property.ts")).toHaveLength(0);
  });

  it("PR-005 PRESENCE — batch inspected update in markInspectionBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `function transitionLeaseStatus(db, leaseId, newStatus) {
  const lease = db.prepare("SELECT status FROM leases WHERE id = ?").get(leaseId);
  if (lease.status === 'pending') throw new PropertyError("E409-LEASE-STATUS", "Invalid", 409);
  db.prepare("UPDATE leases SET status = 'active' WHERE id = ?").run(leaseId);
}
function markInspectionBatch(db, scheduledBefore) {
  const candidates = db.prepare("SELECT pi.id FROM property_inspections pi JOIN properties p ON pi.property_id = p.id WHERE pi.scheduled_date <= ? AND pi.status = 'scheduled'").all(scheduledBefore);
  for (const inspection of candidates) {
    db.prepare("UPDATE property_inspections SET status = 'inspected' WHERE id = ?").run(inspection.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-005"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-005"]!(src, "property.ts")).toHaveLength(0);
  });

  it("PR-006 PRESENCE — db.transaction() in processEviction (atomic evictions+legal_proceedings+eviction_notifications+lease_closures+leases INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "property.ts",
      `function processEviction(db, leaseId, tenantId, propertyId, reason, noticeMessage) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO evictions (id, lease_id, tenant_id, property_id, reason, status, initiated_at) VALUES (?, ?, ?, ?, ?, 'initiated', ?)").run(evictionId, leaseId, tenantId, propertyId, reason, initiatedAt);
    db.prepare("INSERT INTO legal_proceedings (id, eviction_id, proceeding_type, status, started_at) VALUES (?, ?, 'eviction_notice', 'pending', ?)").run(legalId, evictionId, initiatedAt);
    db.prepare("INSERT INTO eviction_notifications (id, eviction_id, tenant_id, message, sent_at) VALUES (?, ?, ?, ?, ?)").run(notificationId, evictionId, tenantId, noticeMessage, initiatedAt);
    db.prepare("INSERT INTO lease_closures (id, lease_id, eviction_id, closed_at) VALUES (?, ?, ?, ?)").run(closureId, leaseId, evictionId, initiatedAt);
    db.prepare("UPDATE leases SET status = 'terminated', updated_at = ? WHERE id = ?").run(initiatedAt, leaseId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PR-006"]!(src, "property.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["PR-006"]!(src, "property.ts")).toHaveLength(0);
  });
});

// F478 (Sprint 312) — fitness domain FT-001~006 via withRuleId (40 Sprint 연속 정점)
describe("fitness domain — FT-001~006 via withRuleId (Sprint 312 F478)", () => {
  it("FT-001 PRESENCE — booked_count >= MAX_CLASS_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `const MAX_CLASS_CAPACITY = 25;
function bookClassSlot(db, classId, memberId) {
  const cls = db.prepare("SELECT booked_count, capacity FROM fitness_classes WHERE id = ?").get(classId);
  const limit = cls.capacity ?? MAX_CLASS_CAPACITY;
  if (cls.booked_count >= limit) {
    throw new FitnessError('E422-CLASS-CAPACITY-EXCEEDED', 'Class is fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-001"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-001"]!(src, "fitness.ts")).toHaveLength(0);
  });

  it("FT-002 PRESENCE — pt_sessions_used >= ptSessionLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `function usePtSession(db, memberId, membershipId) {
  const membership = db.prepare("SELECT pt_sessions_used, pt_session_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1").get(membershipId, memberId);
  const ptSessionLimit = membership.pt_session_limit;
  if (membership.pt_sessions_used >= ptSessionLimit) {
    throw new FitnessError('E422-PT-SESSION-LIMIT-EXCEEDED', 'PT sessions exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-002"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-002"]!(src, "fitness.ts")).toHaveLength(0);
  });

  it("FT-003 PRESENCE — db.transaction() in bookPersonalTraining (atomic pt_bookings+trainer_slots+pt_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `function bookPersonalTraining(db, memberId, trainerId, slotId, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO pt_bookings (id, member_id, trainer_id, slot_id, payment_id, status, reserved_at) VALUES (?, ?, ?, ?, ?, 'reserved', ?)").run(ptBookingId, memberId, trainerId, slotId, paymentId, reservedAt);
    db.prepare("UPDATE trainer_slots SET status = 'booked', booked_member_id = ? WHERE id = ?").run(memberId, slotId);
    db.prepare("INSERT INTO pt_payments (id, pt_booking_id, member_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, ptBookingId, memberId, amount, reservedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-003"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-003"]!(src, "fitness.ts")).toHaveLength(0);
  });

  it("FT-004 PRESENCE — status comparison + 'in_progress'/'assessment'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `function transitionProgressStatus(db, progressId, newStatus) {
  const progress = db.prepare("SELECT status FROM member_progress WHERE id = ?").get(progressId);
  if (progress.status === 'assessment') throw new FitnessError("E409-PROGRESS", "Invalid transition", 409);
  db.prepare("UPDATE member_progress SET status = 'in_progress' WHERE id = ?").run(progressId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-004"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-004"]!(src, "fitness.ts")).toHaveLength(0);
  });

  it("FT-005 PRESENCE — batch no_show update in markNoShowBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `function transitionProgressStatus(db, progressId, newStatus) {
  const progress = db.prepare("SELECT status FROM member_progress WHERE id = ?").get(progressId);
  if (progress.status === 'assessment') throw new FitnessError("E409-PROGRESS", "Invalid", 409);
  db.prepare("UPDATE member_progress SET status = 'in_progress' WHERE id = ?").run(progressId);
}
function markNoShowBatch(db, scheduledBefore) {
  const candidates = db.prepare("SELECT cb.id FROM class_bookings cb JOIN fitness_classes fc ON cb.class_id = fc.id WHERE fc.scheduled_at <= ? AND cb.status = 'booked'").all(scheduledBefore);
  for (const booking of candidates) {
    db.prepare("UPDATE class_bookings SET status = 'no_show' WHERE id = ?").run(booking.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-005"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-005"]!(src, "fitness.ts")).toHaveLength(0);
  });

  it("FT-006 PRESENCE — db.transaction() in reserveEquipment (atomic equipment_reservations+equipment_holds+equipment INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "fitness.ts",
      `function reserveEquipment(db, memberId, equipmentId, durationMinutes) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO equipment_reservations (id, member_id, equipment_id, duration_minutes, status, reserved_at) VALUES (?, ?, ?, ?, 'active', ?)").run(reservationId, memberId, equipmentId, durationMinutes, reservedAt);
    db.prepare("INSERT INTO equipment_holds (id, reservation_id, equipment_id, held_at, released_at) VALUES (?, ?, ?, ?, NULL)").run(holdId, reservationId, equipmentId, reservedAt);
    db.prepare("UPDATE equipment SET status = 'reserved', daily_usage_count = daily_usage_count + 1 WHERE id = ?").run(equipmentId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FT-006"]!(src, "fitness.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["FT-006"]!(src, "fitness.ts")).toHaveLength(0);
  });
});

// F479 (Sprint 313) — beauty domain BT-001~006 via withRuleId (41 Sprint 연속 정점)
describe("beauty domain — BT-001~006 via withRuleId (Sprint 313 F479)", () => {
  it("BT-001 PRESENCE — booked_count >= MAX_SEAT_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `const MAX_SEAT_CAPACITY = 20;
function bookSeat(db, seatId, customerId) {
  const seat = db.prepare("SELECT booked_count, capacity FROM beauty_seats WHERE id = ?").get(seatId);
  const limit = seat.capacity ?? MAX_SEAT_CAPACITY;
  if (seat.booked_count >= limit) {
    throw new BeautyError('E422-SEAT-CAPACITY-EXCEEDED', 'Seat is fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-001"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-001"]!(src, "beauty.ts")).toHaveLength(0);
  });

  it("BT-002 PRESENCE — loyalty_usage >= loyaltyTierLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `function applyLoyaltyDiscount(db, customerId, membershipId) {
  const membership = db.prepare("SELECT loyalty_usage, loyalty_tier_limit FROM loyalty_memberships WHERE id = ? AND customer_id = ? LIMIT 1").get(membershipId, customerId);
  const loyaltyTierLimit = membership.loyalty_tier_limit;
  if (membership.loyalty_usage >= loyaltyTierLimit) {
    throw new BeautyError('E422-LOYALTY-TIER-LIMIT-EXCEEDED', 'Loyalty limit exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-002"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-002"]!(src, "beauty.ts")).toHaveLength(0);
  });

  it("BT-003 PRESENCE — db.transaction() in confirmAppointment (atomic appointments+stylists+appointment_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `function confirmAppointment(db, customerId, stylistId, serviceType, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO appointments (id, customer_id, stylist_id, service_type, payment_id, status, booked_at) VALUES (?, ?, ?, ?, ?, 'booked', ?)").run(appointmentId, customerId, stylistId, serviceType, paymentId, bookedAt);
    db.prepare("UPDATE stylists SET status = 'booked', booked_customer_id = ? WHERE id = ?").run(customerId, stylistId);
    db.prepare("INSERT INTO appointment_payments (id, appointment_id, customer_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, appointmentId, customerId, amount, bookedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-003"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-003"]!(src, "beauty.ts")).toHaveLength(0);
  });

  it("BT-004 PRESENCE — status comparison + 'confirmed'/'in_service'/'completed'/'reviewed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appointment = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appointment.status === 'in_service') throw new BeautyError("E409-APPOINTMENT", "Invalid transition", 409);
  db.prepare("UPDATE appointments SET status = 'confirmed' WHERE id = ?").run(appointmentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-004"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-004"]!(src, "beauty.ts")).toHaveLength(0);
  });

  it("BT-005 PRESENCE — batch restocked update in markInventoryRestockBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appointment = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appointment.status === 'in_service') throw new BeautyError("E409-APPOINTMENT", "Invalid", 409);
  db.prepare("UPDATE appointments SET status = 'confirmed' WHERE id = ?").run(appointmentId);
}
function markInventoryRestockBatch(db, restockedBefore) {
  const candidates = db.prepare("SELECT id FROM inventory_items WHERE status = 'depleted' AND restocked_at <= ?").all(restockedBefore);
  for (const item of candidates) {
    db.prepare("UPDATE inventory_items SET status = 'restocked' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-005"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-005"]!(src, "beauty.ts")).toHaveLength(0);
  });

  it("BT-006 PRESENCE — db.transaction() in processCommission (atomic commission_records+settlements INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "beauty.ts",
      `function processCommission(db, stylistId, appointmentId, revenue, commissionRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO commission_records (id, stylist_id, appointment_id, revenue, commission_rate, commission_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(commissionId, stylistId, appointmentId, revenue, commissionRate, commissionAmount);
    db.prepare("INSERT INTO settlements (id, commission_id, stylist_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(settlementId, commissionId, stylistId, commissionAmount, settledAt);
    db.prepare("UPDATE commission_records SET status = 'settled' WHERE id = ?").run(commissionId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BT-006"]!(src, "beauty.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["BT-006"]!(src, "beauty.ts")).toHaveLength(0);
  });
});

// F484 (Sprint 318) — telemedicine domain TM-001~006 via withRuleId (45 Sprint 연속 정점)
describe("telemedicine domain — TM-001~006 via withRuleId (Sprint 318 F484)", () => {
  it("TM-001 PRESENCE — booked_count >= MAX_SLOT_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `const MAX_SLOT_CAPACITY = 30;
function bookConsultationSlot(db, slotId, patientId) {
  const slot = db.prepare("SELECT booked_count, capacity FROM consultation_slots WHERE id = ?").get(slotId);
  const limit = slot.capacity ?? MAX_SLOT_CAPACITY;
  if (slot.booked_count >= limit) {
    throw new TelemedicineError('E422-SLOT-CAPACITY-EXCEEDED', 'Slot is fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-001"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-001"]!(src, "telemedicine.ts")).toHaveLength(0);
  });

  it("TM-002 PRESENCE — prescription_usage >= prescriptionLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `function applyPrescriptionLimit(db, patientId, subscriptionId) {
  const subscription = db.prepare("SELECT prescription_usage, prescription_limit FROM patient_subscriptions WHERE id = ? AND patient_id = ? LIMIT 1").get(subscriptionId, patientId);
  const prescriptionLimit = subscription.prescription_limit;
  if (subscription.prescription_usage >= prescriptionLimit) {
    throw new TelemedicineError('E422-PRESCRIPTION-LIMIT-EXCEEDED', 'Prescription quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-002"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-002"]!(src, "telemedicine.ts")).toHaveLength(0);
  });

  it("TM-003 PRESENCE — db.transaction() in confirmConsultation (atomic consultations+doctors+consultation_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `function confirmConsultation(db, patientId, doctorId, serviceType, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO consultations (id, patient_id, doctor_id, service_type, payment_id, status, booked_at) VALUES (?, ?, ?, ?, ?, 'booked', ?)").run(consultationId, patientId, doctorId, serviceType, paymentId, bookedAt);
    db.prepare("UPDATE doctors SET status = 'busy', booked_patient_id = ? WHERE id = ?").run(patientId, doctorId);
    db.prepare("INSERT INTO consultation_payments (id, consultation_id, patient_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, consultationId, patientId, amount, bookedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-003"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-003"]!(src, "telemedicine.ts")).toHaveLength(0);
  });

  it("TM-004 PRESENCE — status comparison + 'in_progress'/'completed'/'prescribed'/'reviewed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `function transitionConsultationStatus(db, consultationId, newStatus) {
  const consultation = db.prepare("SELECT status FROM consultations WHERE id = ?").get(consultationId);
  if (consultation.status === 'in_progress') throw new TelemedicineError("E409-CONSULTATION", "Invalid transition", 409);
  db.prepare("UPDATE consultations SET status = 'in_progress' WHERE id = ?").run(consultationId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-004"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-004"]!(src, "telemedicine.ts")).toHaveLength(0);
  });

  it("TM-005 PRESENCE — batch expired update in markPrescriptionExpiryBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `function transitionConsultationStatus(db, consultationId, newStatus) {
  const consultation = db.prepare("SELECT status FROM consultations WHERE id = ?").get(consultationId);
  if (consultation.status === 'in_progress') throw new TelemedicineError("E409-CONSULTATION", "Invalid", 409);
  db.prepare("UPDATE consultations SET status = 'in_progress' WHERE id = ?").run(consultationId);
}
function markPrescriptionExpiryBatch(db, expiredBefore) {
  const candidates = db.prepare("SELECT id FROM prescriptions WHERE status = 'active' AND valid_until <= ?").all(expiredBefore);
  for (const item of candidates) {
    db.prepare("UPDATE prescriptions SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-005"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-005"]!(src, "telemedicine.ts")).toHaveLength(0);
  });

  it("TM-006 PRESENCE — db.transaction() in processBilling (atomic billing_records+payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "telemedicine.ts",
      `function processBilling(db, doctorId, consultationId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO billing_records (id, doctor_id, consultation_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, doctorId, consultationId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO payouts (id, billing_id, doctor_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, doctorId, billingAmount, settledAt);
    db.prepare("UPDATE billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TM-006"]!(src, "telemedicine.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["TM-006"]!(src, "telemedicine.ts")).toHaveLength(0);
  });
});

describe("BL-020~025/030 — lpon-refund gap fill (Sprint 315 F481)", () => {
  // refund.ts processRefundRequest + approveRefund 패턴 — status transition + atomic tx + threshold.
  // BL-020 (rfndPsbltyYn='Y' status transition) / BL-021 (입금 처리 atomic tx) /
  // BL-023 (입금 실패 catch → status='FAILED') / BL-025 (60% 이상 사용 threshold) /
  // BL-030 (유효기간 연장 거부 ABSENCE — 기능 자체 미구현)

  const refundSrc = `
    function processRefundRequest(db, input) {
      const payment = db.prepare("SELECT status FROM payments WHERE id = ?").get(input.paymentId);
      if (payment.status !== 'CANCELED') throw new Error('E409-ST');
      const voucher = db.prepare("SELECT face_amount, balance FROM vouchers WHERE id = ?").get(input.voucherId);
      const usedAmount = voucher.face_amount - voucher.balance;
      const usageRate = voucher.face_amount > 0 ? usedAmount / voucher.face_amount : 0;
      if (usageRate < 0.6) throw new Error('INSUFFICIENT_USAGE');
      db.prepare("INSERT INTO refund_transactions (id, status, rfnd_psblty_yn) VALUES (?, 'REQUESTED', 'Y')").run(input.refundId);
    }
    async function approveRefund(db, refundId, depositApi) {
      try {
        const result = await depositApi.requestDeposit(accountId, amount);
        const tx = db.transaction(() => {
          db.prepare("INSERT INTO deposit_transactions (id, status) VALUES (?, 'COMPLETED')").run(depositId);
          db.prepare("UPDATE refund_transactions SET status = 'COMPLETED' WHERE id = ?").run(refundId);
        });
        tx();
      } catch (err) {
        db.prepare("UPDATE refund_transactions SET status = 'FAILED' WHERE id = ?").run(refundId);
        throw new Error('E500');
      }
    }
  `;

  it("BL-020 (rfndPsbltyYn='Y' status transition) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("refund.ts", refundSrc);
    expect(BL_DETECTOR_REGISTRY["BL-020"]!(sf, "refund.ts")).toEqual([]);
  });

  it("BL-021 (입금 처리 atomic tx) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("refund.ts", refundSrc);
    expect(BL_DETECTOR_REGISTRY["BL-021"]!(sf, "refund.ts")).toEqual([]);
  });

  it("BL-023 (입금 실패 catch → status='FAILED') — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("refund.ts", refundSrc);
    expect(BL_DETECTOR_REGISTRY["BL-023"]!(sf, "refund.ts")).toEqual([]);
  });

  it("BL-025 (60% 이상 사용 threshold: usageRate < 0.6) — PRESENCE → 0 markers", () => {
    const sf = parseTypeScriptSource("refund.ts", refundSrc);
    expect(BL_DETECTOR_REGISTRY["BL-025"]!(sf, "refund.ts")).toEqual([]);
  });

  it("BL-030 (유효기간 연장 거부 미구현 ABSENCE) — refund.ts에 extend 패턴 없음 → 1 marker with ruleId BL-030", () => {
    const sf = parseTypeScriptSource("refund.ts", refundSrc);
    const markers = BL_DETECTOR_REGISTRY["BL-030"]!(sf, "refund.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-030");
  });
});

describe("BL-031/032 + BL-G001 — lpon-settlement/gift gap fill (Sprint 316 F482)", () => {
  // settlement.ts: runBatchSettlement 안 db.transaction(settlement_summaries UPSERT) — BL-031/032 atomic
  // gift.ts: sendGift/createGift 미구현 → BL-G001 ABSENCE
  const settlementWithAtomicSrc = `
    function runBatchSettlement(db, periodStart, periodEnd) {
      const tx = db.transaction(() => {
        db.prepare("INSERT OR REPLACE INTO settlement_summaries (period_start, charge_count) VALUES (?, ?)").run(periodStart, 5);
        db.prepare("UPDATE settlement_summaries SET updated_at = ? WHERE period_start = ?").run(new Date().toISOString(), periodStart);
      });
      tx();
    }
  `;

  it("BL-031 PRESENCE — db.transaction(UPSERT) in settlement → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementWithAtomicSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-031"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-032 PRESENCE — db.transaction exists in settlement → 0 markers", () => {
    const sf = parseTypeScriptSource("settlement.ts", settlementWithAtomicSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-032"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "settlement.ts")).toEqual([]);
  });

  it("BL-G001 ABSENCE — no sendGift/createGift in gift.ts → 1 marker with ruleId BL-G001", () => {
    const giftNoImplSrc = `
      function getGiftStatus(db, giftId) {
        return db.prepare("SELECT * FROM gift_transactions WHERE id = ?").get(giftId);
      }
    `;
    const sf = parseTypeScriptSource("gift.ts", giftNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-G001"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "gift.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-G001");
  });
});

describe("BL-013/016/017/018/019 — lpon-payment 5 ABSENCE markers (Sprint 317 F483, 100% coverage 마일스톤)", () => {
  // payment.ts (현실): 1 함수 processPayment 만 존재 — cancel/refund 분기 자체 부재.
  // 5 ABSENCE markers (BL-013/016/017/018/019) — LPON pilot 5 컨테이너 100% 종결.
  const paymentNoImplSrc = `
    function processPayment(db, input) {
      const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(input.voucherId);
      if (!voucher) throw new Error("E404");
      if (voucher.status !== 'ACTIVE') throw new Error("E409");
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO payments (id, status) VALUES (?, 'PAID')").run(input.id);
        db.prepare("UPDATE vouchers SET balance = balance - ? WHERE id = ?").run(input.amount, input.voucherId);
      });
      tx();
      if (input.amount >= 50000) {
        // SMS 발송
      }
      return { paymentId: input.id };
    }
  `;

  it("BL-013 ABSENCE — no refundByCompany in payment.ts → 1 marker with ruleId BL-013", () => {
    const sf = parseTypeScriptSource("payment.ts", paymentNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-013"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "payment.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-013");
    expect(markers[0]?.severity).toBe("HIGH");
  });

  it("BL-016 ABSENCE — no cancelPayment in payment.ts → 1 marker with ruleId BL-016", () => {
    const sf = parseTypeScriptSource("payment.ts", paymentNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-016"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "payment.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-016");
  });

  it("BL-017 ABSENCE — no cancelByMerchant/mpmCancel in payment.ts → 1 marker with ruleId BL-017", () => {
    const sf = parseTypeScriptSource("payment.ts", paymentNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-017"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "payment.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-017");
  });

  it("BL-018 ABSENCE — no approveQrCancel/merchantApproveCancel in payment.ts → 1 marker with ruleId BL-018", () => {
    const sf = parseTypeScriptSource("payment.ts", paymentNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-018"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "payment.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-018");
  });

  it("BL-019 ABSENCE — no cancelByWithdrawnUser/ap06Cancel in payment.ts → 1 marker with ruleId BL-019", () => {
    const sf = parseTypeScriptSource("payment.ts", paymentNoImplSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-019"];
    expect(fn).toBeDefined();
    const markers = fn!(sf, "payment.ts");
    expect(markers).toHaveLength(1);
    expect(markers[0]?.ruleId).toBe("BL-019");
  });

  it("BL-016 PRESENCE counter — cancelPayment function exists → 0 markers (false positive 방지)", () => {
    const paymentWithCancelSrc = paymentNoImplSrc + `
      function cancelPayment(db, paymentId) {
        const tx = db.transaction(() => {
          db.prepare("UPDATE payments SET status = 'CANCELED' WHERE id = ?").run(paymentId);
        });
        tx();
      }
    `;
    const sf = parseTypeScriptSource("payment.ts", paymentWithCancelSrc);
    const fn = BL_DETECTOR_REGISTRY["BL-016"];
    expect(fn).toBeDefined();
    expect(fn!(sf, "payment.ts")).toEqual([]);
  });
});
