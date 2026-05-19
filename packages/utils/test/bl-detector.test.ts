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
  it("exposes 326 detectors (세션 307 후속2 F544 — movie 76번째 도메인 +6 detectors, 🎬 단일 클러스터 7 도메인 첫 사례 마일스톤)", () => {
    expect(Object.keys(BL_DETECTOR_REGISTRY).sort()).toEqual([
      "AD-001",
      "AD-002",
      "AD-003",
      "AD-004",
      "AD-005",
      "AD-006",
      "AG-001",
      "AG-002",
      "AG-003",
      "AG-004",
      "AG-005",
      "AG-006",
      "AM-001",
      "AM-002",
      "AM-003",
      "AM-004",
      "AM-005",
      "AM-006",
      "AQ-001",
      "AQ-002",
      "AQ-003",
      "AQ-004",
      "AQ-005",
      "AQ-006",
      "AR-001",
      "AR-002",
      "AR-003",
      "AR-004",
      "AR-005",
      "AR-006",
      "AS-001",
      "AS-002",
      "AS-003",
      "AS-004",
      "AS-005",
      "AS-006",
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
      "BR-001",
      "BR-002",
      "BR-003",
      "BR-004",
      "BR-005",
      "BR-006",
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
      "CS-001",
      "CS-002",
      "CS-003",
      "CS-004",
      "CS-005",
      "CS-006",
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
      "ER-001",
      "ER-002",
      "ER-003",
      "ER-004",
      "ER-005",
      "ER-006",
      "EX-001",
      "EX-002",
      "EX-003",
      "EX-004",
      "EX-005",
      "EX-006",
      "FS-001",
      "FS-002",
      "FS-003",
      "FS-004",
      "FS-005",
      "FS-006",
      "FT-001",
      "FT-002",
      "FT-003",
      "FT-004",
      "FT-005",
      "FT-006",
      "GA-001",
      "GA-002",
      "GA-003",
      "GA-004",
      "GA-005",
      "GA-006",
      "GF-001",
      "GF-002",
      "GF-003",
      "GF-004",
      "GF-005",
      "GF-006",
      "GM-001",
      "GM-002",
      "GM-003",
      "GM-004",
      "GM-005",
      "GM-006",
      "GV-001",
      "GV-002",
      "GV-003",
      "GV-004",
      "GV-005",
      "GV-006",
      "GY-001",
      "GY-002",
      "GY-003",
      "GY-004",
      "GY-005",
      "GY-006",
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
      "KP-001",
      "KP-002",
      "KP-003",
      "KP-004",
      "KP-005",
      "KP-006",
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
      "MS-001",
      "MS-002",
      "MS-003",
      "MS-004",
      "MS-005",
      "MS-006",
      "MU-001",
      "MU-002",
      "MU-003",
      "MU-004",
      "MU-005",
      "MU-006",
      "MV-001",
      "MV-002",
      "MV-003",
      "MV-004",
      "MV-005",
      "MV-006",
      "NW-001",
      "NW-002",
      "NW-003",
      "NW-004",
      "NW-005",
      "NW-006",
      "P-001",
      "P-002",
      "P-003",
      "P-004",
      "P-005",
      "P-006",
      "P-007",
      "PB-001",
      "PB-002",
      "PB-003",
      "PB-004",
      "PB-005",
      "PB-006",
      "PC-001",
      "PC-002",
      "PC-003",
      "PC-004",
      "PC-005",
      "PC-006",
      "PH-001",
      "PH-002",
      "PH-003",
      "PH-004",
      "PH-005",
      "PH-006",
      "PK-001",
      "PK-002",
      "PK-003",
      "PK-004",
      "PK-005",
      "PK-006",
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
      "RA-001",
      "RA-002",
      "RA-003",
      "RA-004",
      "RA-005",
      "RA-006",
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
      "SF-001",
      "SF-002",
      "SF-003",
      "SF-004",
      "SF-005",
      "SF-006",
      "SH-001",
      "SH-002",
      "SH-003",
      "SH-004",
      "SH-005",
      "SH-006",
      "SK-001",
      "SK-002",
      "SK-003",
      "SK-004",
      "SK-005",
      "SK-006",
      "SM-001",
      "SM-002",
      "SM-003",
      "SM-004",
      "SM-005",
      "SM-006",
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
      "TH-001",
      "TH-002",
      "TH-003",
      "TH-004",
      "TH-005",
      "TH-006",
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
      "TX-001",
      "TX-002",
      "TX-003",
      "TX-004",
      "TX-005",
      "TX-006",
      "V-001",
      "V-002",
      "V-003",
      "V-004",
      "V-005",
      "V-006",
      "VD-001",
      "VD-002",
      "VD-003",
      "VD-004",
      "VD-005",
      "VD-006",
      "VT-001",
      "VT-002",
      "VT-003",
      "VT-004",
      "VT-005",
      "VT-006",
      "WL-001",
      "WL-002",
      "WL-003",
      "WL-004",
      "WL-005",
      "WL-006",
      "ZO-001",
      "ZO-002",
      "ZO-003",
      "ZO-004",
      "ZO-005",
      "ZO-006",
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

  it("VT-001~VT-006 registered (Sprint 319 F485 — veterinary 45번째 도메인, PT+VT 동물 케어 2-클러스터)", () => {
    expect(BL_DETECTOR_REGISTRY["VT-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VT-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VT-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VT-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VT-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VT-006"]).toBeDefined();
  });

  it("GY-001~GY-006 registered (세션 295 F488 — gym 46번째 도메인, PT+FT+GY 스포츠/헬스 3-클러스터, 47 Sprint 연속 정점)", () => {
    expect(BL_DETECTOR_REGISTRY["GY-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GY-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GY-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GY-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GY-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GY-006"]).toBeDefined();
  });

  it("PK-001~PK-006 registered (세션 296 F494 — parking 47번째 도메인, RE+PR+PK 부동산 3-클러스터, 48 Sprint 연속 정점)", () => {
    expect(BL_DETECTOR_REGISTRY["PK-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PK-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PK-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PK-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PK-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PK-006"]).toBeDefined();
  });

  it("CS-001~CS-006 registered (세션 297 F500 — carsharing 48번째 도메인, TR+AV+CS 운송 3-클러스터, 49 Sprint 연속 정점)", () => {
    expect(BL_DETECTOR_REGISTRY["CS-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CS-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CS-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CS-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CS-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["CS-006"]).toBeDefined();
  });

  it("FS-001~FS-006 registered (세션 298 F502 — fastfood 49번째 도메인, DV+WL+FT+FS QSR 외식 4-클러스터, 50 Sprint 연속 정점)", () => {
    expect(BL_DETECTOR_REGISTRY["FS-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FS-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FS-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FS-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FS-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["FS-006"]).toBeDefined();
  });

  it("AS-001~AS-006 registered (세션 299 F506 — aerospace 50번째 도메인, TR+AV+CS+AS 항공/운송 4-클러스터, 51 Sprint 연속 정점, 🏆 50번째 도메인 마일스톤)", () => {
    expect(BL_DETECTOR_REGISTRY["AS-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AS-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AS-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AS-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AS-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AS-006"]).toBeDefined();
  });

  it("MU-001~MU-006 registered (세션 300 F509 — music streaming 51번째 도메인, 40번째 신규 산업, 52 Sprint 연속 정점 도전, 거울 변환 4회차)", () => {
    expect(BL_DETECTOR_REGISTRY["MU-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MU-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MU-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MU-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MU-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MU-006"]).toBeDefined();
  });

  it("SH-001~SH-006 registered (세션 301 F511 — shipping 52번째 도메인, 41번째 신규 산업, 53 Sprint 연속 정점 도전, 거울 변환 5회차, LG+SH 국제무역 클러스터)", () => {
    expect(BL_DETECTOR_REGISTRY["SH-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SH-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SH-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SH-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SH-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SH-006"]).toBeDefined();
  });

  it("PB-001~PB-006 registered (세션 304 F518 — publishing 53번째 도메인, 42번째 신규 산업, 54 Sprint 연속 정점 도전, 거울 변환 6회차, MU+PB 디지털 콘텐츠 클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["PB-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PB-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PB-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PB-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PB-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PB-006"]).toBeDefined();
  });

  it("TX-001~TX-006 registered (세션 304 후속 F521 — textile 54번째 도메인, 43번째 신규 산업, 55 Sprint 연속 정점 도전, 거울 변환 7회차, MF+TX 제조 클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["TX-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TX-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TX-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TX-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TX-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TX-006"]).toBeDefined();
  });

  it("AD-001~AD-006 registered (세션 304 후속 F522 — advertising 55번째 도메인, 44번째 신규 산업, 56 Sprint 연속 정점 도전, 거울 변환 8회차, MU+PB+AD 디지털 콘텐츠 3-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["AD-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AD-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AD-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AD-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AD-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AD-006"]).toBeDefined();
  });

  it("GM-001~GM-006 registered (세션 304 후속 F523 — gaming 56번째 도메인, 45번째 신규 산업, 57 Sprint 연속 정점 도전, 거울 변환 9회차, MU+PB+AD+GM 디지털 콘텐츠 4-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["GM-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GM-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GM-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GM-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GM-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GM-006"]).toBeDefined();
  });

  it("VD-001~VD-006 registered (세션 305 F524 — video 57번째 도메인, 46번째 신규 산업, 58 Sprint 연속 정점 도전, 거울 변환 10회차, MU+PB+AD+GM+VD 디지털 콘텐츠 5-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["VD-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VD-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VD-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VD-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VD-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["VD-006"]).toBeDefined();
  });

  it("SM-001~SM-006 registered (세션 305 후속 F526 — socialmedia 58번째 도메인, 47번째 신규 산업, 59 Sprint 연속 정점 도전, 거울 변환 11회차, MU+PB+AD+GM+VD+SM 디지털 콘텐츠 6-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["SM-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SM-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SM-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SM-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SM-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SM-006"]).toBeDefined();
  });

  it("NW-001~NW-006 registered (세션 305 후속2 F527 — news 59번째 도메인, 48번째 신규 산업, 60 Sprint 연속 정점 도전, 거울 변환 12회차, MU+PB+AD+GM+VD+SM+NW 디지털 콘텐츠 7-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["NW-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["NW-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["NW-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["NW-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["NW-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["NW-006"]).toBeDefined();
  });

  it("BR-001~BR-006 registered (세션 305 후속3 F528 — broadcast 60번째 도메인, 49번째 신규 산업, 🏆 60 Sprint round 마일스톤, 61 Sprint 연속 정점 도전, 거울 변환 13회차, MU+PB+AD+GM+VD+SM+NW+BR 디지털 콘텐츠 8-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["BR-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BR-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BR-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BR-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BR-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["BR-006"]).toBeDefined();
  });

  it("ER-001~ER-006 registered (세션 305 후속4 F529 — esports 61번째 도메인, 50번째 신규 산업, 🏆🏆 50 신규 산업 round 마일스톤, 62 Sprint 연속 정점 도전, 거울 변환 14회차, MU+PB+AD+GM+VD+SM+NW+BR+ER 디지털 콘텐츠 9-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["ER-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ER-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ER-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ER-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ER-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ER-006"]).toBeDefined();
  });

  it("PC-001~PC-006 registered (세션 305 후속5 F530 — podcast 62번째 도메인, 51번째 신규 산업, 63 Sprint 연속 정점 도전, 거울 변환 15회차, MU+PB+AD+GM+VD+SM+NW+BR+ER+PC 디지털 콘텐츠 10-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["PC-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PC-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PC-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PC-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PC-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["PC-006"]).toBeDefined();
  });

  it("RA-001~RA-006 registered (세션 305 후속6 F531 — radio 63번째 도메인, 52번째 신규 산업, 🏆🏆 1세션 9 Sprint 신기록, 64 Sprint 연속 정점 도전, 거울 변환 16회차, MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA 디지털 콘텐츠 11-클러스터 확장)", () => {
    expect(BL_DETECTOR_REGISTRY["RA-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["RA-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["RA-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["RA-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["RA-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["RA-006"]).toBeDefined();
  });

  it("AR-001~AR-006 registered (세션 306 F532 — art 64번째 도메인, 53번째 신규 산업, 🏆 64번째 도메인 마일스톤, 65 Sprint 연속 정점 도전, 거울 변환 17회차, MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR 디지털 콘텐츠 12-클러스터 확장 — 시각 예술 / 갤러리 / NFT 디지털 아트 확장 가능)", () => {
    expect(BL_DETECTOR_REGISTRY["AR-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AR-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AR-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AR-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AR-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AR-006"]).toBeDefined();
  });

  it("GA-001~GA-006 registered (세션 306 후속 F533 — gambling 65번째 도메인, 54번째 신규 산업, 🏆 65번째 도메인 마일스톤, 66 Sprint 연속 정점 도전, 거울 변환 18회차, 🎮 GM+GA 게임엔터 2-클러스터 신규 — 게임 in-app purchase + 카지노/베팅 payout 통합 추상화)", () => {
    expect(BL_DETECTOR_REGISTRY["GA-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GA-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GA-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GA-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GA-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GA-006"]).toBeDefined();
  });

  it("AM-001~AM-006 registered (세션 306 후속2 F534 — amusement 66번째 도메인, 55번째 신규 산업, 🏆 66번째 도메인 마일스톤, 67 Sprint 연속 정점 도전, 거울 변환 19회차, 🎢 오프라인 엔터테인먼트 신규 클러스터 출범 — 디지털 12 + 게임엔터 2 + 오프라인 엔터 1 = 3 메타 카테고리)", () => {
    expect(BL_DETECTOR_REGISTRY["AM-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AM-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AM-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AM-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AM-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AM-006"]).toBeDefined();
  });

  it("TH-001~TH-006 registered (세션 306 후속3 F535 — theater 67번째 도메인, 56번째 신규 산업, 🏆 67번째 도메인 마일스톤, 68 Sprint 연속 정점 도전, 거울 변환 20회차 정점, 🎭 AM+TH 오프라인 엔터 2-클러스터 확장 — 테마파크 입장권 + 극장 좌석권 통합 추상화)", () => {
    expect(BL_DETECTOR_REGISTRY["TH-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TH-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TH-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TH-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TH-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["TH-006"]).toBeDefined();
  });

  it("SK-001~SK-006 registered (세션 306 후속4 F536 — skiing 68번째 도메인, 57번째 신규 산업, 🏆 68번째 도메인 마일스톤, 69 Sprint 연속 정점 도전, 거울 변환 21회차, 🏔️ SP+SK 스포츠 레저 2-클러스터 신규 — 피트니스/스포츠 + 윈터 레저 통합 추상화)", () => {
    expect(BL_DETECTOR_REGISTRY["SK-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SK-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SK-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SK-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SK-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SK-006"]).toBeDefined();
  });

  it("EX-001~EX-006 registered (세션 306 후속5 F537 — exhibition 69번째 도메인, 58번째 신규 산업, 🏆 69번째 도메인 마일스톤, 70 Sprint 연속 정점 round 마일스톤 도전, 거울 변환 22회차, 🎨 AR+EX 예술/전시 2-클러스터 신규 — 시각 예술 갤러리 + 박람회/컨벤션 부스 통합 추상화)", () => {
    expect(BL_DETECTOR_REGISTRY["EX-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["EX-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["EX-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["EX-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["EX-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["EX-006"]).toBeDefined();
  });

  it("GF-001~GF-006 registered (세션 306 후속6 F538 — golf 70번째 도메인 🏆🏆 round 마일스톤, 59번째 신규 산업, 71 Sprint 연속 정점 도전, 거울 변환 23회차, ⛳ SP+SK+GF 스포츠 레저 3-클러스터 확장 — 피트니스/스포츠 + 윈터 레저 + 골프 통합 추상화, 단일 클러스터 3 도메인 첫 사례)", () => {
    expect(BL_DETECTOR_REGISTRY["GF-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GF-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GF-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GF-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GF-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["GF-006"]).toBeDefined();
  });

  it("KP-001~KP-006 registered (세션 306 후속7 F539 — kpop 71번째 도메인, 60번째 신규 산업, 한국 특화, 🏆 71번째 도메인 마일스톤, 72 Sprint 연속 정점 도전, 거울 변환 24회차, 🎤 AM+TH+KP 오프라인 엔터 3-클러스터 확장 — 놀이공원 + 극장 + 콘서트 통합 추상화, 단일 클러스터 3 도메인 두 번째 사례)", () => {
    expect(BL_DETECTOR_REGISTRY["KP-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["KP-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["KP-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["KP-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["KP-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["KP-006"]).toBeDefined();
  });

  it("SF-001~SF-006 registered (세션 306 후속8 F540 — surfing 72번째 도메인, 61번째 신규 산업, 🏆🏆 1세션 9 Sprint 신기록 동률 도달, 73 Sprint 연속 정점 도전, 거울 변환 25회차 정점 round, 🏄 SP+SK+GF+SF 스포츠 레저 4-클러스터 확장 — 피트니스/스포츠 + 윈터 레저 + 골프 + 서핑 통합 추상화, 단일 클러스터 4 도메인 첫 사례)", () => {
    expect(BL_DETECTOR_REGISTRY["SF-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SF-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SF-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SF-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SF-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["SF-006"]).toBeDefined();
  });

  it("AQ-001~AQ-006 registered (세션 306 후속9 F541 — aquarium 73번째 도메인, 62번째 신규 산업, 🏆🏆🏆 1세션 10 Sprint 신기록 도전, 74 Sprint 연속 정점 도전, 거울 변환 26회차, 🐠 AM+TH+KP+AQ 오프라인 엔터 4-클러스터 확장 — 놀이공원 + 극장 + 콘서트 + 수족관 통합 추상화, 단일 클러스터 4 도메인 두 번째 사례)", () => {
    expect(BL_DETECTOR_REGISTRY["AQ-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AQ-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AQ-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AQ-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AQ-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["AQ-006"]).toBeDefined();
  });

  it("ZO-001~ZO-006 registered (세션 307 F542 — zoo 74번째 도메인, 63번째 신규 산업, 🦁 AM+TH+KP+AQ+ZO 오프라인 엔터 5-클러스터 확장 — 단일 클러스터 5 도메인 첫 사례 마일스톤, 75 Sprint 연속 정점 도전, 거울 변환 27회차)", () => {
    expect(BL_DETECTOR_REGISTRY["ZO-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ZO-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ZO-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ZO-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ZO-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["ZO-006"]).toBeDefined();
  });

  it("MS-001~MS-006 registered (세션 307 F543 — museum 75번째 도메인, 64번째 신규 산업, 🏛️ AM+TH+KP+AQ+ZO+MS 오프라인 엔터 6-클러스터 확장 — 단일 클러스터 6 도메인 첫 사례 마일스톤, 76 Sprint 연속 정점 도전, 거울 변환 28회차)", () => {
    expect(BL_DETECTOR_REGISTRY["MS-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MS-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MS-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MS-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MS-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MS-006"]).toBeDefined();
  });

  it("MV-001~MV-006 registered (세션 307 후속2 F544 — movie 76번째 도메인, 65번째 신규 산업, 🎬 AM+TH+KP+AQ+ZO+MS+MV 오프라인 엔터 7-클러스터 확장 — 단일 클러스터 7 도메인 첫 사례 마일스톤, 77 Sprint 연속 정점 도전, 거울 변환 29회차)", () => {
    expect(BL_DETECTOR_REGISTRY["MV-001"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MV-002"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MV-003"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MV-004"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MV-005"]).toBeDefined();
    expect(BL_DETECTOR_REGISTRY["MV-006"]).toBeDefined();
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

// F485 (Sprint 319) — veterinary domain VT-001~006 via withRuleId (46 Sprint 연속 정점 도전)
describe("veterinary domain — VT-001~006 via withRuleId (Sprint 319 F485)", () => {
  it("VT-001 PRESENCE — booked_count >= MAX_APPOINTMENT_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `const MAX_APPOINTMENT_CAPACITY = 20;
function bookAppointmentSlot(db, slotId, petId) {
  const slot = db.prepare("SELECT booked_count, capacity FROM appointment_slots WHERE id = ?").get(slotId);
  const limit = slot.capacity ?? MAX_APPOINTMENT_CAPACITY;
  if (slot.booked_count >= limit) {
    throw new VeterinaryError('E422-SLOT-CAPACITY-EXCEEDED', 'Slot is fully booked', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-001"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-001"]!(src, "veterinary.ts")).toHaveLength(0);
  });

  it("VT-002 PRESENCE — vaccine_usage >= vaccineLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `function applyVaccineLimit(db, petId, subscriptionId) {
  const subscription = db.prepare("SELECT vaccine_usage, vaccine_limit FROM pet_subscriptions WHERE id = ? AND pet_id = ? LIMIT 1").get(subscriptionId, petId);
  const vaccineLimit = subscription.vaccine_limit;
  if (subscription.vaccine_usage >= vaccineLimit) {
    throw new VeterinaryError('E422-VACCINE-LIMIT-EXCEEDED', 'Vaccine quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-002"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-002"]!(src, "veterinary.ts")).toHaveLength(0);
  });

  it("VT-003 PRESENCE — db.transaction() in confirmAppointment (atomic appointments+veterinarians+appointment_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `function confirmAppointment(db, petId, veterinarianId, serviceType, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO appointments (id, pet_id, veterinarian_id, service_type, payment_id, status, booked_at) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)").run(appointmentId, petId, veterinarianId, serviceType, paymentId, bookedAt);
    db.prepare("UPDATE veterinarians SET status = 'busy', booked_pet_id = ? WHERE id = ?").run(petId, veterinarianId);
    db.prepare("INSERT INTO appointment_payments (id, appointment_id, pet_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, appointmentId, petId, amount, bookedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-003"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-003"]!(src, "veterinary.ts")).toHaveLength(0);
  });

  it("VT-004 PRESENCE — status comparison + 'in_progress'/'completed'/'billed'/'reviewed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appointment = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appointment.status === 'in_progress') throw new VeterinaryError("E409-APPOINTMENT", "Invalid transition", 409);
  db.prepare("UPDATE appointments SET status = 'in_progress' WHERE id = ?").run(appointmentId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-004"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-004"]!(src, "veterinary.ts")).toHaveLength(0);
  });

  it("VT-005 PRESENCE — batch archived update in markMedicalRecordArchiveBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `function transitionAppointmentStatus(db, appointmentId, newStatus) {
  const appointment = db.prepare("SELECT status FROM appointments WHERE id = ?").get(appointmentId);
  if (appointment.status === 'in_progress') throw new VeterinaryError("E409-APPOINTMENT", "Invalid", 409);
  db.prepare("UPDATE appointments SET status = 'in_progress' WHERE id = ?").run(appointmentId);
}
function markMedicalRecordArchiveBatch(db, expiredBefore) {
  const candidates = db.prepare("SELECT id FROM medical_records WHERE status = 'active' AND archive_eligible_at <= ?").all(expiredBefore);
  for (const item of candidates) {
    db.prepare("UPDATE medical_records SET status = 'archived' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-005"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-005"]!(src, "veterinary.ts")).toHaveLength(0);
  });

  it("VT-006 PRESENCE — db.transaction() in processVeterinaryBilling (atomic vet_billing_records+vet_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "veterinary.ts",
      `function processVeterinaryBilling(db, veterinarianId, appointmentId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO vet_billing_records (id, veterinarian_id, appointment_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, veterinarianId, appointmentId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO vet_payouts (id, billing_id, veterinarian_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, veterinarianId, billingAmount, settledAt);
    db.prepare("UPDATE vet_billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VT-006"]!(src, "veterinary.ts");
    expect(markers).toHaveLength(0);
    expect(BL_DETECTOR_REGISTRY["VT-006"]!(src, "veterinary.ts")).toHaveLength(0);
  });
});

// F488 (세션 295) — gym domain GY-001~006 via withRuleId (47 Sprint 연속 정점 도전)
describe("gym domain — GY-001~006 via withRuleId (세션 295 F488)", () => {
  it("GY-001 PRESENCE — member_count >= MAX_GYM_CAPACITY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `const MAX_GYM_CAPACITY = 300;
function registerGymMember(db, branchId, memberId) {
  const branch = db.prepare("SELECT member_count, capacity FROM branches WHERE id = ?").get(branchId);
  const limit = branch.capacity ?? MAX_GYM_CAPACITY;
  if (branch.member_count >= limit) {
    throw new GymError('E422-GYM-CAPACITY-EXCEEDED', 'Branch is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-001"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });

  it("GY-002 PRESENCE — pt_used >= ptLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `function applyPtLimit(db, memberId, membershipId) {
  const membership = db.prepare("SELECT pt_used, pt_limit FROM memberships WHERE id = ? AND member_id = ? LIMIT 1").get(membershipId, memberId);
  const ptLimit = membership.pt_limit;
  if (membership.pt_used >= ptLimit) {
    throw new GymError('E422-PT-LIMIT-EXCEEDED', 'PT session quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-002"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });

  it("GY-003 PRESENCE — db.transaction() in registerMemberWithLocker (atomic members+lockers+member_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `function registerMemberWithLocker(db, branchId, membershipId, lockerId, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO members (id, branch_id, membership_id, payment_id, locker_id, status, joined_at) VALUES (?, ?, ?, ?, ?, 'active', ?)").run(memberId, branchId, membershipId, paymentId, lockerId, joinedAt);
    db.prepare("UPDATE lockers SET status = 'occupied', occupied_by = ? WHERE id = ?").run(memberId, lockerId);
    db.prepare("INSERT INTO member_payments (id, member_id, membership_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, memberId, membershipId, amount, joinedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-003"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });

  it("GY-004 PRESENCE — status comparison + 'paused'/'active'/'expired'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `function transitionMembershipStatus(db, membershipId, newStatus) {
  const membership = db.prepare("SELECT status FROM memberships WHERE id = ?").get(membershipId);
  if (membership.status === 'paused') throw new GymError("E409-MEMBERSHIP", "Invalid transition", 409);
  db.prepare("UPDATE memberships SET status = 'paused' WHERE id = ?").run(membershipId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-004"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });

  it("GY-005 PRESENCE — batch expired update in markExpiredMembershipBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `function transitionMembershipStatus(db, membershipId, newStatus) {
  const membership = db.prepare("SELECT status FROM memberships WHERE id = ?").get(membershipId);
  if (membership.status === 'paused') throw new GymError("E409-MEMBERSHIP", "Invalid", 409);
  db.prepare("UPDATE memberships SET status = 'paused' WHERE id = ?").run(membershipId);
}
function markExpiredMembershipBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM memberships WHERE status = 'active' AND expires_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE memberships SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-005"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });

  it("GY-006 PRESENCE — db.transaction() in processTrainerBilling (atomic trainer_billing_records+trainer_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gym.ts",
      `function processTrainerBilling(db, trainerId, ptSessionId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO trainer_billing_records (id, trainer_id, pt_session_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, trainerId, ptSessionId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO trainer_payouts (id, billing_id, trainer_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, trainerId, billingAmount, settledAt);
    db.prepare("UPDATE trainer_billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GY-006"]!(src, "gym.ts");
    expect(markers).toHaveLength(0);
  });
});

// F494 (세션 296) — parking domain PK-001~006 via withRuleId (48 Sprint 연속 정점 도전)
// S283 audit fix 1차: HT(Hotel→hospitality 중복) + FD(Food Delivery→delivery 중복) → PK 채택.
describe("parking domain — PK-001~006 via withRuleId (세션 296 F494)", () => {
  it("PK-001 PRESENCE — occupied_slots >= MAX_PARKING_SLOTS threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `const MAX_PARKING_SLOTS = 500;
function reserveParkingSlot(db, lotId, passId, vehiclePlate) {
  const lot = db.prepare("SELECT occupied_slots, total_slots FROM lots WHERE id = ?").get(lotId);
  const limit = lot.total_slots ?? MAX_PARKING_SLOTS;
  if (lot.occupied_slots >= limit) {
    throw new ParkingError('E422-LOT-CAPACITY-EXCEEDED', 'Parking lot is full', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-001"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });

  it("PK-002 PRESENCE — slot_used >= slotLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `function applyMonthlyPassLimit(db, memberId, passId) {
  const pass = db.prepare("SELECT slot_used, slot_limit FROM monthly_passes WHERE id = ? AND member_id = ? LIMIT 1").get(passId, memberId);
  const slotLimit = pass.slot_limit;
  if (pass.slot_used >= slotLimit) {
    throw new ParkingError('E422-PASS-LIMIT-EXCEEDED', 'Monthly pass slot quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-002"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });

  it("PK-003 PRESENCE — db.transaction() in confirmEntry (atomic parking_sessions+slot_reservations+parking_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `function confirmEntry(db, lotId, reservationId, vehiclePlate, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO parking_sessions (id, lot_id, reservation_id, vehicle_plate, status, entered_at) VALUES (?, ?, ?, ?, 'active', ?)").run(sessionId, lotId, reservationId, vehiclePlate, enteredAt);
    db.prepare("UPDATE slot_reservations SET status = 'checked_in', payment_id = ? WHERE id = ?").run(paymentId, reservationId);
    db.prepare("INSERT INTO parking_payments (id, session_id, reservation_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, sessionId, reservationId, amount, enteredAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-003"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });

  it("PK-004 PRESENCE — status comparison + 'confirmed'/'checked_in'/'completed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `function transitionReservationStatus(db, reservationId, newStatus) {
  const reservation = db.prepare("SELECT status FROM slot_reservations WHERE id = ?").get(reservationId);
  if (reservation.status === 'pending') throw new ParkingError("E409-RESERVATION", "Invalid transition", 409);
  db.prepare("UPDATE slot_reservations SET status = 'confirmed' WHERE id = ?").run(reservationId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-004"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });

  it("PK-005 PRESENCE — batch unauthorized update in markUnauthorizedExitBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `function transitionReservationStatus(db, reservationId, newStatus) {
  const reservation = db.prepare("SELECT status FROM slot_reservations WHERE id = ?").get(reservationId);
  if (reservation.status === 'pending') throw new ParkingError("E409-RESERVATION", "Invalid", 409);
  db.prepare("UPDATE slot_reservations SET status = 'confirmed' WHERE id = ?").run(reservationId);
}
function markUnauthorizedExitBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM parking_sessions WHERE status = 'active' AND entered_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE parking_sessions SET status = 'unauthorized' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-005"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });

  it("PK-006 PRESENCE — db.transaction() in processOperatorBilling (atomic operator_billing_records+operator_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "parking.ts",
      `function processOperatorBilling(db, operatorId, parkingSessionId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO operator_billing_records (id, operator_id, parking_session_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, operatorId, parkingSessionId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO operator_payouts (id, billing_id, operator_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, operatorId, billingAmount, settledAt);
    db.prepare("UPDATE operator_billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PK-006"]!(src, "parking.ts");
    expect(markers).toHaveLength(0);
  });
});

// F500 (세션 297) — carsharing domain CS-001~006 via withRuleId (49 Sprint 연속 정점 도전)
// TR+AV+CS 운송 3-클러스터 형성 (Transit + Aviation + Car Sharing).
describe("carsharing domain — CS-001~006 via withRuleId (세션 297 F500)", () => {
  it("CS-001 PRESENCE — active_vehicles >= MAX_FLEET_VEHICLES threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `const MAX_FLEET_VEHICLES = 200;
function reserveSharingVehicle(db, poolId, passId) {
  const pool = db.prepare("SELECT active_vehicles, total_vehicles FROM vehicle_pool WHERE id = ?").get(poolId);
  const limit = pool.total_vehicles ?? MAX_FLEET_VEHICLES;
  if (pool.active_vehicles >= limit) {
    throw new CarSharingError('E422-FLEET-CAPACITY-EXCEEDED', 'Fleet is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-001"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });

  it("CS-002 PRESENCE — distance_used + distance >= distanceLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `function applyDistanceLimit(db, memberId, passId, distance) {
  const pass = db.prepare("SELECT distance_used, distance_limit FROM member_passes WHERE id = ? AND member_id = ? LIMIT 1").get(passId, memberId);
  const distanceLimit = pass.distance_limit;
  if (pass.distance_used + distance >= distanceLimit) {
    throw new CarSharingError('E422-DISTANCE-LIMIT-EXCEEDED', 'Distance quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-002"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });

  it("CS-003 PRESENCE — db.transaction() in confirmPickup (atomic rental_sessions+vehicle_reservations+rental_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `function confirmPickup(db, poolId, reservationId, vehicleId, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO rental_sessions (id, pool_id, reservation_id, vehicle_id, status, picked_up_at) VALUES (?, ?, ?, ?, 'active', ?)").run(sessionId, poolId, reservationId, vehicleId, pickedUpAt);
    db.prepare("UPDATE vehicle_reservations SET status = 'picked_up', vehicle_id = ?, payment_id = ? WHERE id = ?").run(vehicleId, paymentId, reservationId);
    db.prepare("INSERT INTO rental_payments (id, session_id, reservation_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, sessionId, reservationId, amount, pickedUpAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-003"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });

  it("CS-004 PRESENCE — status comparison + 'confirmed'/'picked_up'/'returned'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `function transitionRentalStatus(db, reservationId, newStatus) {
  const reservation = db.prepare("SELECT status FROM vehicle_reservations WHERE id = ?").get(reservationId);
  if (reservation.status === 'pending') throw new CarSharingError("E409-RESERVATION", "Invalid transition", 409);
  db.prepare("UPDATE vehicle_reservations SET status = 'confirmed' WHERE id = ?").run(reservationId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-004"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });

  it("CS-005 PRESENCE — batch overdue update in markOverdueReturnBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `function transitionRentalStatus(db, reservationId, newStatus) {
  const reservation = db.prepare("SELECT status FROM vehicle_reservations WHERE id = ?").get(reservationId);
  if (reservation.status === 'pending') throw new CarSharingError("E409-RESERVATION", "Invalid", 409);
  db.prepare("UPDATE vehicle_reservations SET status = 'confirmed' WHERE id = ?").run(reservationId);
}
function markOverdueReturnBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM rental_sessions WHERE status = 'active' AND picked_up_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE rental_sessions SET status = 'overdue' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-005"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });

  it("CS-006 PRESENCE — db.transaction() in processOperatorBilling (atomic operator_billing_records+operator_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "carsharing.ts",
      `function processOperatorBilling(db, operatorId, rentalSessionId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO operator_billing_records (id, operator_id, rental_session_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, operatorId, rentalSessionId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO operator_payouts (id, billing_id, operator_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, operatorId, billingAmount, settledAt);
    db.prepare("UPDATE operator_billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["CS-006"]!(src, "carsharing.ts");
    expect(markers).toHaveLength(0);
  });
});

// F502 (세션 298) — fastfood domain FS-001~006 via withRuleId (50 Sprint 연속 정점 도전)
// DV+WL+FT+FS QSR 외식 4-클러스터 확장 (Delivery + Wellness + Fitness + Fast Food).
describe("fastfood domain — FS-001~006 via withRuleId (세션 298 F502)", () => {
  it("FS-001 PRESENCE — active_orders >= MAX_DAILY_ORDERS_PER_KIOSK threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `const MAX_DAILY_ORDERS_PER_KIOSK = 300;
function placeOrder(db, kioskId, membershipId) {
  const kiosk = db.prepare("SELECT active_orders, total_capacity FROM kiosk_pool WHERE id = ?").get(kioskId);
  const limit = kiosk.total_capacity ?? MAX_DAILY_ORDERS_PER_KIOSK;
  if (kiosk.active_orders >= limit) {
    throw new FastFoodError('E422-KIOSK-CAPACITY-EXCEEDED', 'Kiosk is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-001"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });

  it("FS-002 PRESENCE — discount_used + discount >= discountLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `function applyComboDiscount(db, customerId, membershipId, discount) {
  const membership = db.prepare("SELECT discount_used, discount_limit FROM customer_memberships WHERE id = ? AND customer_id = ? LIMIT 1").get(membershipId, customerId);
  const discountLimit = membership.discount_limit;
  if (membership.discount_used + discount >= discountLimit) {
    throw new FastFoodError('E422-COMBO-DISCOUNT-LIMIT-EXCEEDED', 'Combo discount quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-002"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });

  it("FS-003 PRESENCE — db.transaction() in processPayment (atomic kitchen_tickets+orders+order_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `function processPayment(db, kioskId, orderId, ticketNumber, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO kitchen_tickets (id, kiosk_id, order_id, ticket_number, status, accepted_at) VALUES (?, ?, ?, ?, 'preparing', ?)").run(ticketId, kioskId, orderId, ticketNumber, acceptedAt);
    db.prepare("UPDATE orders SET status = 'preparing', ticket_id = ?, payment_id = ? WHERE id = ?").run(ticketId, paymentId, orderId);
    db.prepare("INSERT INTO order_payments (id, order_id, ticket_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(paymentId, orderId, ticketId, amount, acceptedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-003"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });

  it("FS-004 PRESENCE — status comparison + 'confirmed'/'preparing'/'ready'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
  if (order.status === 'pending') throw new FastFoodError("E409-ORDER", "Invalid transition", 409);
  db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?").run(orderId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-004"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });

  it("FS-005 PRESENCE — batch stale update in markStaleOrderBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
  if (order.status === 'pending') throw new FastFoodError("E409-ORDER", "Invalid", 409);
  db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?").run(orderId);
}
function markStaleOrderBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM kitchen_tickets WHERE status = 'preparing' AND accepted_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE kitchen_tickets SET status = 'stale' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-005"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });

  it("FS-006 PRESENCE — db.transaction() in settleDailyRevenue (atomic franchise_billing_records+franchise_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "fastfood.ts",
      `function settleDailyRevenue(db, franchiseeId, kitchenTicketId, revenue, billingRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO franchise_billing_records (id, franchisee_id, kitchen_ticket_id, revenue, billing_rate, billing_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(billingId, franchiseeId, kitchenTicketId, revenue, billingRate, billingAmount);
    db.prepare("INSERT INTO franchise_payouts (id, billing_id, franchisee_id, amount, status, settled_at) VALUES (?, ?, ?, ?, 'settled', ?)").run(payoutId, billingId, franchiseeId, billingAmount, settledAt);
    db.prepare("UPDATE franchise_billing_records SET status = 'settled' WHERE id = ?").run(billingId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["FS-006"]!(src, "fastfood.ts");
    expect(markers).toHaveLength(0);
  });
});

// F506 (세션 299) — aerospace domain AS-001~006 via withRuleId (51 Sprint 연속 정점 도전)
// TR+AV+CS+AS 항공/운송 4-클러스터 확장 (Travel + Aviation + Car Sharing + Aerospace).
// 🏆 50번째 도메인 마일스톤 (S262 5 → S299 50, 10배 확장).
describe("aerospace domain — AS-001~006 via withRuleId (세션 299 F506)", () => {
  it("AS-001 PRESENCE — active_launches >= MAX_DAILY_LAUNCHES_PER_PAD threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `const MAX_DAILY_LAUNCHES_PER_PAD = 24;
function scheduleLaunch(db, launchPadId, orbitId) {
  const pad = db.prepare("SELECT active_launches, total_capacity FROM launch_pad_pool WHERE id = ?").get(launchPadId);
  const limit = pad.total_capacity ?? MAX_DAILY_LAUNCHES_PER_PAD;
  if (pad.active_launches >= limit) {
    throw new AerospaceError('E422-LAUNCH-PAD-CAPACITY-EXCEEDED', 'Launch pad is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-001"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });

  it("AS-002 PRESENCE — fee_used + fee >= orbitFeeLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `function applyOrbitFeeTier(db, contractorId, orbitId, fee) {
  const orbit = db.prepare("SELECT fee_used, fee_limit FROM contractor_orbits WHERE id = ? AND contractor_id = ? LIMIT 1").get(orbitId, contractorId);
  const orbitFeeLimit = orbit.fee_limit;
  if (orbit.fee_used + fee >= orbitFeeLimit) {
    throw new AerospaceError('E422-ORBIT-FEE-LIMIT-EXCEEDED', 'Orbit fee quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-002"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });

  it("AS-003 PRESENCE — db.transaction() in executeMission (atomic payloads+missions+mission_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `function executeMission(db, launchPadId, missionId, payloadNumber, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO payloads (id, launch_pad_id, mission_id, payload_number, status, deployed_at) VALUES (?, ?, ?, ?, 'launching', ?)").run(payloadId, launchPadId, missionId, payloadNumber, deployedAt);
    db.prepare("UPDATE missions SET status = 'launching', payload_id = ?, mission_payment_id = ? WHERE id = ?").run(payloadId, missionPaymentId, missionId);
    db.prepare("INSERT INTO mission_payments (id, mission_id, payload_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(missionPaymentId, missionId, payloadId, amount, deployedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-003"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });

  it("AS-004 PRESENCE — status comparison + 'confirmed'/'launching'/'inOrbit'/'aborted' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `function transitionMissionStatus(db, missionId, newStatus) {
  const mission = db.prepare("SELECT status FROM missions WHERE id = ?").get(missionId);
  if (mission.status === 'pending') throw new AerospaceError("E409-MISSION", "Invalid transition", 409);
  db.prepare("UPDATE missions SET status = 'confirmed' WHERE id = ?").run(missionId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-004"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });

  it("AS-005 PRESENCE — batch retire update in retireSatelliteBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `function transitionMissionStatus(db, missionId, newStatus) {
  const mission = db.prepare("SELECT status FROM missions WHERE id = ?").get(missionId);
  if (mission.status === 'pending') throw new AerospaceError("E409-MISSION", "Invalid", 409);
  db.prepare("UPDATE missions SET status = 'confirmed' WHERE id = ?").run(missionId);
}
function retireSatelliteBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM payloads WHERE status = 'inOrbit' AND deployed_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE payloads SET status = 'retired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-005"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });

  it("AS-006 PRESENCE — db.transaction() in processAbortRefund (atomic abort_refund_records+abort_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aerospace.ts",
      `function processAbortRefund(db, contractorId, payloadId, missionCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO abort_refund_records (id, contractor_id, payload_id, mission_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(abortRefundId, contractorId, payloadId, missionCost, refundRate, refundAmount);
    db.prepare("INSERT INTO abort_refunds (id, abort_refund_id, contractor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, abortRefundId, contractorId, refundAmount, refundedAt);
    db.prepare("UPDATE abort_refund_records SET status = 'refunded' WHERE id = ?").run(abortRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AS-006"]!(src, "aerospace.ts");
    expect(markers).toHaveLength(0);
  });
});

// F509 (세션 300) — music streaming domain MU-001~006 via withRuleId (52 Sprint 연속 정점 도전)
// 거울 변환 4회차 (carsharing → fastfood → aerospace → music). 디지털 콘텐츠 도메인 신규.
describe("music streaming domain — MU-001~006 via withRuleId (세션 300 F509)", () => {
  it("MU-001 PRESENCE — active_sessions >= MAX_CONCURRENT_SESSIONS_PER_TIER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `const MAX_CONCURRENT_SESSIONS_PER_TIER = 50;
function startStream(db, streamingTierId, contractId) {
  const tier = db.prepare("SELECT active_sessions, total_capacity FROM streaming_tiers WHERE id = ?").get(streamingTierId);
  const limit = tier.total_capacity ?? MAX_CONCURRENT_SESSIONS_PER_TIER;
  if (tier.active_sessions >= limit) {
    throw new MusicError('E422-STREAMING-TIER-CAPACITY-EXCEEDED', 'Streaming tier is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-001"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });

  it("MU-002 PRESENCE — fee_used + fee >= royaltyPayoutLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `function applyRoyaltyTier(db, artistId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM royalty_contracts WHERE id = ? AND artist_id = ? LIMIT 1").get(contractId, artistId);
  const royaltyPayoutLimit = contract.fee_limit;
  if (contract.fee_used + fee >= royaltyPayoutLimit) {
    throw new MusicError('E422-ROYALTY-PAYOUT-LIMIT-EXCEEDED', 'Royalty payout quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-002"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });

  it("MU-003 PRESENCE — db.transaction() in playTrack (atomic track_plays+playback_sessions+royalty_payouts INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `function playTrack(db, streamingTierId, sessionId, trackIsrc, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO track_plays (id, streaming_tier_id, session_id, track_isrc, status, played_at) VALUES (?, ?, ?, ?, 'playing', ?)").run(trackPlayId, streamingTierId, sessionId, trackIsrc, playedAt);
    db.prepare("UPDATE playback_sessions SET status = 'playing', track_play_id = ?, royalty_payout_id = ? WHERE id = ?").run(trackPlayId, royaltyPayoutId, sessionId);
    db.prepare("INSERT INTO royalty_payouts (id, session_id, track_play_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(royaltyPayoutId, sessionId, trackPlayId, amount, playedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-003"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });

  it("MU-004 PRESENCE — status comparison + 'confirmed'/'playing'/'paused'/'completed' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `function transitionSessionStatus(db, sessionId, newStatus) {
  const session = db.prepare("SELECT status FROM playback_sessions WHERE id = ?").get(sessionId);
  if (session.status === 'pending') throw new MusicError("E409-SESSION", "Invalid transition", 409);
  db.prepare("UPDATE playback_sessions SET status = 'confirmed' WHERE id = ?").run(sessionId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-004"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });

  it("MU-005 PRESENCE — batch expire update in expireTrackPlayBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `function transitionSessionStatus(db, sessionId, newStatus) {
  const session = db.prepare("SELECT status FROM playback_sessions WHERE id = ?").get(sessionId);
  if (session.status === 'pending') throw new MusicError("E409-SESSION", "Invalid", 409);
  db.prepare("UPDATE playback_sessions SET status = 'confirmed' WHERE id = ?").run(sessionId);
}
function expireTrackPlayBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM track_plays WHERE status = 'completed' AND played_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE track_plays SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-005"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });

  it("MU-006 PRESENCE — db.transaction() in processCancellationRefund (atomic cancellation_refund_records+cancellation_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "music.ts",
      `function processCancellationRefund(db, subscriberId, trackPlayId, subscriptionCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO cancellation_refund_records (id, subscriber_id, track_play_id, subscription_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(cancellationRefundId, subscriberId, trackPlayId, subscriptionCost, refundRate, refundAmount);
    db.prepare("INSERT INTO cancellation_refunds (id, cancellation_refund_id, subscriber_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, cancellationRefundId, subscriberId, refundAmount, refundedAt);
    db.prepare("UPDATE cancellation_refund_records SET status = 'refunded' WHERE id = ?").run(cancellationRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MU-006"]!(src, "music.ts");
    expect(markers).toHaveLength(0);
  });
});

// F511 (세션 301) — shipping domain SH-001~006 via withRuleId (53 Sprint 연속 정점 도전)
// 거울 변환 5회차 (carsharing → fastfood → aerospace → music → shipping). LG+SH 국제무역 클러스터 신규 형성.
// 🏆 52번째 도메인 마일스톤 (S262 5 → S301 52, 10.4배 확장).
describe("shipping domain — SH-001~006 via withRuleId (세션 301 F511)", () => {
  it("SH-001 PRESENCE — active_bookings >= MAX_CONCURRENT_BOOKINGS_PER_VESSEL threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `const MAX_CONCURRENT_BOOKINGS_PER_VESSEL = 200;
function bookVoyage(db, vesselId, contractId) {
  const vessel = db.prepare("SELECT active_bookings, total_capacity FROM vessels WHERE id = ?").get(vesselId);
  const limit = vessel.total_capacity ?? MAX_CONCURRENT_BOOKINGS_PER_VESSEL;
  if (vessel.active_bookings >= limit) {
    throw new ShippingError('E422-VESSEL-CAPACITY-EXCEEDED', 'Vessel is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-001"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });

  it("SH-002 PRESENCE — fee_used + fee >= freightPaymentLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `function applyFreightTier(db, shipperId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM freight_contracts WHERE id = ? AND shipper_id = ? LIMIT 1").get(contractId, shipperId);
  const freightPaymentLimit = contract.fee_limit;
  if (contract.fee_used + fee >= freightPaymentLimit) {
    throw new ShippingError('E422-FREIGHT-PAYMENT-LIMIT-EXCEEDED', 'Freight payment quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-002"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });

  it("SH-003 PRESENCE — db.transaction() in loadCargo (atomic cargo_loads+voyage_bookings+freight_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `function loadCargo(db, vesselId, bookingId, containerNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO cargo_loads (id, vessel_id, booking_id, container_no, status, loaded_at) VALUES (?, ?, ?, ?, 'loading', ?)").run(cargoLoadId, vesselId, bookingId, containerNo, loadedAt);
    db.prepare("UPDATE voyage_bookings SET status = 'loading', cargo_load_id = ?, freight_payment_id = ? WHERE id = ?").run(cargoLoadId, freightPaymentId, bookingId);
    db.prepare("INSERT INTO freight_payments (id, booking_id, cargo_load_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(freightPaymentId, bookingId, cargoLoadId, amount, loadedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-003"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });

  it("SH-004 PRESENCE — status comparison + 'confirmed'/'loading'/'departed'/'arrived' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `function transitionBookingStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM voyage_bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'booked') throw new ShippingError("E409-BOOKING", "Invalid transition", 409);
  db.prepare("UPDATE voyage_bookings SET status = 'confirmed' WHERE id = ?").run(bookingId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-004"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });

  it("SH-005 PRESENCE — batch expire update in expireCargoLoadBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `function transitionBookingStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM voyage_bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'booked') throw new ShippingError("E409-BOOKING", "Invalid", 409);
  db.prepare("UPDATE voyage_bookings SET status = 'confirmed' WHERE id = ?").run(bookingId);
}
function expireCargoLoadBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM cargo_loads WHERE status = 'arrived' AND loaded_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE cargo_loads SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-005"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });

  it("SH-006 PRESENCE — db.transaction() in processDemurrageRefund (atomic demurrage_refund_records+demurrage_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "shipping.ts",
      `function processDemurrageRefund(db, shipperId, cargoLoadId, freightCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO demurrage_refund_records (id, shipper_id, cargo_load_id, freight_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(demurrageRefundId, shipperId, cargoLoadId, freightCost, refundRate, refundAmount);
    db.prepare("INSERT INTO demurrage_refunds (id, demurrage_refund_id, shipper_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, demurrageRefundId, shipperId, refundAmount, refundedAt);
    db.prepare("UPDATE demurrage_refund_records SET status = 'refunded' WHERE id = ?").run(demurrageRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SH-006"]!(src, "shipping.ts");
    expect(markers).toHaveLength(0);
  });
});

// F518 (세션 304) — publishing domain PB-001~006 via withRuleId (54 Sprint 연속 정점 도전)
// 거울 변환 6회차 (carsharing → fastfood → aerospace → music → shipping → publishing).
// MU+PB 디지털 콘텐츠 클러스터 확장 형성. 🏆 53번째 도메인 마일스톤 (S262 5 → S304 53, 10.6배 확장).
describe("publishing domain — PB-001~006 via withRuleId (세션 304 F518)", () => {
  it("PB-001 PRESENCE — active_volumes >= MAX_CONCURRENT_VOLUMES_PER_IMPRINT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `const MAX_CONCURRENT_VOLUMES_PER_IMPRINT = 500;
function registerVolume(db, imprintId, contractId) {
  const imprint = db.prepare("SELECT active_volumes, total_capacity FROM imprints WHERE id = ?").get(imprintId);
  const limit = imprint.total_capacity ?? MAX_CONCURRENT_VOLUMES_PER_IMPRINT;
  if (imprint.active_volumes >= limit) {
    throw new PublishingError('E422-IMPRINT-VOLUME-EXCEEDED', 'Imprint is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-001"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });

  it("PB-002 PRESENCE — fee_used + fee >= royaltyPaymentLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `function applyRoyaltyTier(db, authorId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM royalty_contracts WHERE id = ? AND author_id = ? LIMIT 1").get(contractId, authorId);
  const royaltyPaymentLimit = contract.fee_limit;
  if (contract.fee_used + fee >= royaltyPaymentLimit) {
    throw new PublishingError('E422-ROYALTY-PAYMENT-LIMIT-EXCEEDED', 'Royalty payment quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-002"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });

  it("PB-003 PRESENCE — db.transaction() in processPrintBatch (atomic print_batches+volume_registrations+royalty_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `function processPrintBatch(db, imprintId, registrationId, batchNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO print_batches (id, imprint_id, registration_id, batch_no, status, printed_at) VALUES (?, ?, ?, ?, 'printed', ?)").run(printBatchId, imprintId, registrationId, batchNo, printedAt);
    db.prepare("UPDATE volume_registrations SET status = 'printed', print_batch_id = ?, royalty_payment_id = ? WHERE id = ?").run(printBatchId, royaltyPaymentId, registrationId);
    db.prepare("INSERT INTO royalty_payments (id, registration_id, print_batch_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(royaltyPaymentId, registrationId, printBatchId, amount, printedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-003"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });

  it("PB-004 PRESENCE — status comparison + 'edited'/'printed'/'distributed'/'sold' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `function transitionRegistrationStatus(db, registrationId, newStatus) {
  const registration = db.prepare("SELECT status FROM volume_registrations WHERE id = ?").get(registrationId);
  if (registration.status === 'registered') throw new PublishingError("E409-REGISTRATION", "Invalid transition", 409);
  db.prepare("UPDATE volume_registrations SET status = 'edited' WHERE id = ?").run(registrationId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-004"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });

  it("PB-005 PRESENCE — batch expire update in expirePrintBatchInventory (file context)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `function transitionRegistrationStatus(db, registrationId, newStatus) {
  const registration = db.prepare("SELECT status FROM volume_registrations WHERE id = ?").get(registrationId);
  if (registration.status === 'registered') throw new PublishingError("E409-REGISTRATION", "Invalid", 409);
  db.prepare("UPDATE volume_registrations SET status = 'edited' WHERE id = ?").run(registrationId);
}
function expirePrintBatchInventory(db, now) {
  const candidates = db.prepare("SELECT id FROM print_batches WHERE status = 'distributed' AND printed_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE print_batches SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-005"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });

  it("PB-006 PRESENCE — db.transaction() in processRoyaltyRefund (atomic royalty_refund_records+royalty_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "publishing.ts",
      `function processRoyaltyRefund(db, authorId, printBatchId, royaltyCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO royalty_refund_records (id, author_id, print_batch_id, royalty_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(royaltyRefundId, authorId, printBatchId, royaltyCost, refundRate, refundAmount);
    db.prepare("INSERT INTO royalty_refunds (id, royalty_refund_id, author_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, royaltyRefundId, authorId, refundAmount, refundedAt);
    db.prepare("UPDATE royalty_refund_records SET status = 'refunded' WHERE id = ?").run(royaltyRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PB-006"]!(src, "publishing.ts");
    expect(markers).toHaveLength(0);
  });
});

// F521 (세션 304 후속) — textile domain TX-001~006 via withRuleId (55 Sprint 연속 정점 도전)
// 거울 변환 7회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile).
// MF+TX 제조 클러스터 확장 형성. 🏆 54번째 도메인 마일스톤 (S262 5 → S304 54, 10.8배 확장).
describe("textile domain — TX-001~006 via withRuleId (세션 304 후속 F521)", () => {
  it("TX-001 PRESENCE — active_batches >= MAX_CONCURRENT_BATCHES_PER_MILL threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `const MAX_CONCURRENT_BATCHES_PER_MILL = 300;
function startWeavingBatch(db, millId, contractId) {
  const mill = db.prepare("SELECT active_batches, total_capacity FROM mills WHERE id = ?").get(millId);
  const limit = mill.total_capacity ?? MAX_CONCURRENT_BATCHES_PER_MILL;
  if (mill.active_batches >= limit) {
    throw new TextileError('E422-MILL-CAPACITY-EXCEEDED', 'Mill is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-001"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });

  it("TX-002 PRESENCE — fee_used + fee >= dyeFeePaymentLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `function applyDyeFeeTier(db, buyerId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM dye_contracts WHERE id = ? AND buyer_id = ? LIMIT 1").get(contractId, buyerId);
  const dyeFeePaymentLimit = contract.fee_limit;
  if (contract.fee_used + fee >= dyeFeePaymentLimit) {
    throw new TextileError('E422-DYE-FEE-PAYMENT-LIMIT-EXCEEDED', 'Dye fee payment quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-002"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });

  it("TX-003 PRESENCE — db.transaction() in processFabricBatch (atomic fabric_batches+fabric_orders+dye_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `function processFabricBatch(db, millId, orderId, boltNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO fabric_batches (id, mill_id, order_id, bolt_no, status, woven_at) VALUES (?, ?, ?, ?, 'dyed', ?)").run(fabricBatchId, millId, orderId, boltNo, wovenAt);
    db.prepare("UPDATE fabric_orders SET status = 'dyed', fabric_batch_id = ?, dye_payment_id = ? WHERE id = ?").run(fabricBatchId, dyePaymentId, orderId);
    db.prepare("INSERT INTO dye_payments (id, order_id, fabric_batch_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(dyePaymentId, orderId, fabricBatchId, amount, wovenAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-003"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });

  it("TX-004 PRESENCE — status comparison + 'woven'/'dyed'/'qc'/'shipped' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM fabric_orders WHERE id = ?").get(orderId);
  if (order.status === 'ordered') throw new TextileError("E409-ORDER", "Invalid transition", 409);
  db.prepare("UPDATE fabric_orders SET status = 'woven' WHERE id = ?").run(orderId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-004"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });

  it("TX-005 PRESENCE — batch expire update in expireRejectedFabricBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `function transitionOrderStatus(db, orderId, newStatus) {
  const order = db.prepare("SELECT status FROM fabric_orders WHERE id = ?").get(orderId);
  if (order.status === 'ordered') throw new TextileError("E409-ORDER", "Invalid", 409);
  db.prepare("UPDATE fabric_orders SET status = 'woven' WHERE id = ?").run(orderId);
}
function expireRejectedFabricBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM fabric_batches WHERE status = 'rejected' AND woven_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE fabric_batches SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-005"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });

  it("TX-006 PRESENCE — db.transaction() in processReturnRefund (atomic return_refund_records+return_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "textile.ts",
      `function processReturnRefund(db, buyerId, fabricBatchId, fabricCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO return_refund_records (id, buyer_id, fabric_batch_id, fabric_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(returnRefundId, buyerId, fabricBatchId, fabricCost, refundRate, refundAmount);
    db.prepare("INSERT INTO return_refunds (id, return_refund_id, buyer_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, returnRefundId, buyerId, refundAmount, refundedAt);
    db.prepare("UPDATE return_refund_records SET status = 'refunded' WHERE id = ?").run(returnRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TX-006"]!(src, "textile.ts");
    expect(markers).toHaveLength(0);
  });
});

// F522 (세션 304 후속) — advertising domain AD-001~006 via withRuleId (56 Sprint 연속 정점 도전)
// 거울 변환 8회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising).
// MU+PB+AD 디지털 콘텐츠 3-클러스터 확장. 🏆 55번째 도메인 마일스톤 (S262 5 → S304 55, 11배 확장).
describe("advertising domain — AD-001~006 via withRuleId (세션 304 후속 F522)", () => {
  it("AD-001 PRESENCE — active_campaigns >= MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `const MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY = 400;
function bookCampaign(db, agencyId, contractId) {
  const agency = db.prepare("SELECT active_campaigns, total_capacity FROM agencies WHERE id = ?").get(agencyId);
  const limit = agency.total_capacity ?? MAX_CONCURRENT_CAMPAIGNS_PER_AGENCY;
  if (agency.active_campaigns >= limit) {
    throw new AdvertisingError('E422-AGENCY-CAPACITY-EXCEEDED', 'Agency is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-001"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });

  it("AD-002 PRESENCE — fee_used + fee >= mediaFeePaymentLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `function applyMediaFeeTier(db, advertiserId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM media_contracts WHERE id = ? AND advertiser_id = ? LIMIT 1").get(contractId, advertiserId);
  const mediaFeePaymentLimit = contract.fee_limit;
  if (contract.fee_used + fee >= mediaFeePaymentLimit) {
    throw new AdvertisingError('E422-MEDIA-FEE-PAYMENT-LIMIT-EXCEEDED', 'Media fee payment quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-002"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });

  it("AD-003 PRESENCE — db.transaction() in processImpressionBatch (atomic impression_batches+campaign_bookings+media_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `function processImpressionBatch(db, agencyId, bookingId, slotNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO impression_batches (id, agency_id, booking_id, slot_no, status, served_at) VALUES (?, ?, ?, ?, 'live', ?)").run(impressionBatchId, agencyId, bookingId, slotNo, servedAt);
    db.prepare("UPDATE campaign_bookings SET status = 'live', impression_batch_id = ?, media_payment_id = ? WHERE id = ?").run(impressionBatchId, mediaPaymentId, bookingId);
    db.prepare("INSERT INTO media_payments (id, booking_id, impression_batch_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(mediaPaymentId, bookingId, impressionBatchId, amount, servedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-003"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });

  it("AD-004 PRESENCE — status comparison + 'approved'/'live'/'paused'/'ended' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `function transitionCampaignStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM campaign_bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'proposed') throw new AdvertisingError("E409-BOOKING", "Invalid transition", 409);
  db.prepare("UPDATE campaign_bookings SET status = 'approved' WHERE id = ?").run(bookingId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-004"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });

  it("AD-005 PRESENCE — batch expire update in expireEndedCampaignBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `function transitionCampaignStatus(db, bookingId, newStatus) {
  const booking = db.prepare("SELECT status FROM campaign_bookings WHERE id = ?").get(bookingId);
  if (booking.status === 'proposed') throw new AdvertisingError("E409-BOOKING", "Invalid", 409);
  db.prepare("UPDATE campaign_bookings SET status = 'approved' WHERE id = ?").run(bookingId);
}
function expireEndedCampaignBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM impression_batches WHERE status = 'ended' AND served_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE impression_batches SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-005"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });

  it("AD-006 PRESENCE — db.transaction() in processChargebackRefund (atomic chargeback_refund_records+chargeback_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "advertising.ts",
      `function processChargebackRefund(db, advertiserId, impressionBatchId, mediaCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO chargeback_refund_records (id, advertiser_id, impression_batch_id, media_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(chargebackRefundId, advertiserId, impressionBatchId, mediaCost, refundRate, refundAmount);
    db.prepare("INSERT INTO chargeback_refunds (id, chargeback_refund_id, advertiser_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, chargebackRefundId, advertiserId, refundAmount, refundedAt);
    db.prepare("UPDATE chargeback_refund_records SET status = 'refunded' WHERE id = ?").run(chargebackRefundId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AD-006"]!(src, "advertising.ts");
    expect(markers).toHaveLength(0);
  });
});

// F523 (세션 304 후속) — gaming domain GM-001~006 via withRuleId (57 Sprint 연속 정점 도전)
// 거울 변환 9회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming).
// MU+PB+AD+GM 디지털 콘텐츠 4-클러스터 확장. 🏆 56번째 도메인 마일스톤 (S262 5 → S304 56, 11.2배 확장).
describe("gaming domain — GM-001~006 via withRuleId (세션 304 후속 F523)", () => {
  it("GM-001 PRESENCE — active_live_games >= MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `const MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO = 250;
function launchGame(db, studioId, contractId) {
  const studio = db.prepare("SELECT active_live_games, total_capacity FROM studios WHERE id = ?").get(studioId);
  const limit = studio.total_capacity ?? MAX_CONCURRENT_LIVE_GAMES_PER_STUDIO;
  if (studio.active_live_games >= limit) {
    throw new GamingError('E422-STUDIO-CAPACITY-EXCEEDED', 'Studio is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-001"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });

  it("GM-002 PRESENCE — fee_used + fee >= inAppPaymentLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `function applyInAppPurchase(db, playerId, contractId, fee) {
  const contract = db.prepare("SELECT fee_used, fee_limit FROM store_contracts WHERE id = ? AND player_id = ? LIMIT 1").get(contractId, playerId);
  const inAppPaymentLimit = contract.fee_limit;
  if (contract.fee_used + fee >= inAppPaymentLimit) {
    throw new GamingError('E422-IN-APP-PAYMENT-LIMIT-EXCEEDED', 'In-app payment quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-002"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });

  it("GM-003 PRESENCE — db.transaction() in processGameSession (atomic game_sessions+game_launches+store_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `function processGameSession(db, studioId, launchId, matchNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO game_sessions (id, studio_id, launch_id, match_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(gameSessionId, studioId, launchId, matchNo, startedAt);
    db.prepare("UPDATE game_launches SET status = 'live', game_session_id = ?, store_payment_id = ? WHERE id = ?").run(gameSessionId, storePaymentId, launchId);
    db.prepare("INSERT INTO store_payments (id, launch_id, game_session_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(storePaymentId, launchId, gameSessionId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-003"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });

  it("GM-004 PRESENCE — status comparison + 'published'/'live'/'maintained'/'retired' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `function transitionGameStatus(db, launchId, newStatus) {
  const launch = db.prepare("SELECT status FROM game_launches WHERE id = ?").get(launchId);
  if (launch.status === 'registered') throw new GamingError("E409-LAUNCH", "Invalid transition", 409);
  db.prepare("UPDATE game_launches SET status = 'published' WHERE id = ?").run(launchId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-004"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });

  it("GM-005 PRESENCE — batch expire update in expireRetiredGameBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `function transitionGameStatus(db, launchId, newStatus) {
  const launch = db.prepare("SELECT status FROM game_launches WHERE id = ?").get(launchId);
  if (launch.status === 'registered') throw new GamingError("E409-LAUNCH", "Invalid", 409);
  db.prepare("UPDATE game_launches SET status = 'published' WHERE id = ?").run(launchId);
}
function expireRetiredGameBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM game_sessions WHERE status = 'retired' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE game_sessions SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-005"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });

  it("GM-006 PRESENCE — db.transaction() in processRefundClaim (atomic refund_claim_records+refund_claims INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gaming.ts",
      `function processRefundClaim(db, playerId, gameSessionId, purchaseCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO refund_claim_records (id, player_id, game_session_id, purchase_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundClaimId, playerId, gameSessionId, purchaseCost, refundRate, refundAmount);
    db.prepare("INSERT INTO refund_claims (id, refund_claim_id, player_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundClaimId, playerId, refundAmount, refundedAt);
    db.prepare("UPDATE refund_claim_records SET status = 'refunded' WHERE id = ?").run(refundClaimId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GM-006"]!(src, "gaming.ts");
    expect(markers).toHaveLength(0);
  });
});

// F524 (세션 305) — video domain VD-001~006 via withRuleId (58 Sprint 연속 정점 도전)
// 거울 변환 10회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video).
// MU+PB+AD+GM+VD 디지털 콘텐츠 5-클러스터 확장. 🏆 57번째 도메인 마일스톤 (S262 5 → S305 57, 11.4배 확장).
describe("video domain — VD-001~006 via withRuleId (세션 305 F524)", () => {
  it("VD-001 PRESENCE — active_published_videos >= MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `const MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL = 1000;
function publishVideo(db, channelId, contractId) {
  const channel = db.prepare("SELECT active_published_videos, total_capacity FROM channels WHERE id = ?").get(channelId);
  const limit = channel.total_capacity ?? MAX_CONCURRENT_PUBLISHED_VIDEOS_PER_CHANNEL;
  if (channel.active_published_videos >= limit) {
    throw new VideoError('E422-CHANNEL-CAPACITY-EXCEEDED', 'Channel is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-001"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });

  it("VD-002 PRESENCE — view_used + views >= dailyViewLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `function applyViewLimit(db, viewerId, contractId, views) {
  const contract = db.prepare("SELECT view_used, view_limit FROM ad_contracts WHERE id = ? AND viewer_id = ? LIMIT 1").get(contractId, viewerId);
  const dailyViewLimit = contract.view_limit;
  if (contract.view_used + views >= dailyViewLimit) {
    throw new VideoError('E422-DAILY-VIEW-LIMIT-EXCEEDED', 'Daily view quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-002"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });

  it("VD-003 PRESENCE — db.transaction() in processStream (atomic video_streams+video_publishes+ad_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `function processStream(db, channelId, publishId, streamNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO video_streams (id, channel_id, publish_id, stream_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(videoStreamId, channelId, publishId, streamNo, startedAt);
    db.prepare("UPDATE video_publishes SET status = 'published', video_stream_id = ?, ad_payment_id = ? WHERE id = ?").run(videoStreamId, adPaymentId, publishId);
    db.prepare("INSERT INTO ad_payments (id, publish_id, video_stream_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(adPaymentId, publishId, videoStreamId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-003"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });

  it("VD-004 PRESENCE — status comparison + 'encoded'/'published'/'unlisted'/'retired' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `function transitionVideoStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM video_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'uploaded') throw new VideoError("E409-PUBLISH", "Invalid transition", 409);
  db.prepare("UPDATE video_publishes SET status = 'encoded' WHERE id = ?").run(publishId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-004"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });

  it("VD-005 PRESENCE — batch expire update in expireRetiredVideoBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `function transitionVideoStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM video_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'uploaded') throw new VideoError("E409-PUBLISH", "Invalid", 409);
  db.prepare("UPDATE video_publishes SET status = 'encoded' WHERE id = ?").run(publishId);
}
function expireRetiredVideoBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM video_streams WHERE status = 'retired' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE video_streams SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-005"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });

  it("VD-006 PRESENCE — db.transaction() in processRefundClaim (atomic reward_clawback_records+reward_clawbacks INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "video.ts",
      `function processRefundClaim(db, viewerId, videoStreamId, rewardCost, clawbackRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO reward_clawback_records (id, viewer_id, video_stream_id, reward_cost, clawback_rate, clawback_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(clawbackRecordId, viewerId, videoStreamId, rewardCost, clawbackRate, clawbackAmount);
    db.prepare("INSERT INTO reward_clawbacks (id, clawback_record_id, viewer_id, amount, status, clawed_back_at) VALUES (?, ?, ?, ?, 'clawed_back', ?)").run(clawbackId, clawbackRecordId, viewerId, clawbackAmount, clawedBackAt);
    db.prepare("UPDATE reward_clawback_records SET status = 'clawed_back' WHERE id = ?").run(clawbackRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["VD-006"]!(src, "video.ts");
    expect(markers).toHaveLength(0);
  });
});

// F526 (세션 305 후속) — socialmedia domain SM-001~006 via withRuleId (59 Sprint 연속 정점 도전)
// 거울 변환 11회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia).
// MU+PB+AD+GM+VD+SM 디지털 콘텐츠 6-클러스터 확장. 🏆 58번째 도메인 마일스톤 (S262 5 → S305+ 58, 11.6배 확장).
describe("socialmedia domain — SM-001~006 via withRuleId (세션 305 후속 F526)", () => {
  it("SM-001 PRESENCE — active_published_posts >= MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `const MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT = 10000;
function publishPost(db, accountId, contractId) {
  const account = db.prepare("SELECT active_published_posts, total_capacity FROM accounts WHERE id = ?").get(accountId);
  const limit = account.total_capacity ?? MAX_CONCURRENT_ACTIVE_POSTS_PER_ACCOUNT;
  if (account.active_published_posts >= limit) {
    throw new SocialMediaError('E422-ACCOUNT-CAPACITY-EXCEEDED', 'Account is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-001"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });

  it("SM-002 PRESENCE — monetization_used + earnings >= dailyMonetizationLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `function applyMonetizationLimit(db, creatorId, contractId, earnings) {
  const contract = db.prepare("SELECT monetization_used, monetization_limit FROM monetization_contracts WHERE id = ? AND creator_id = ? LIMIT 1").get(contractId, creatorId);
  const dailyMonetizationLimit = contract.monetization_limit;
  if (contract.monetization_used + earnings >= dailyMonetizationLimit) {
    throw new SocialMediaError('E422-DAILY-MONETIZATION-LIMIT-EXCEEDED', 'Daily monetization quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-002"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });

  it("SM-003 PRESENCE — db.transaction() in processFeedDistribution (atomic post_feeds+post_publishes+ad_distributions INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `function processFeedDistribution(db, accountId, publishId, feedNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO post_feeds (id, account_id, publish_id, feed_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(postFeedId, accountId, publishId, feedNo, startedAt);
    db.prepare("UPDATE post_publishes SET status = 'published', post_feed_id = ?, ad_distribution_id = ? WHERE id = ?").run(postFeedId, adDistributionId, publishId);
    db.prepare("INSERT INTO ad_distributions (id, publish_id, post_feed_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(adDistributionId, publishId, postFeedId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-003"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });

  it("SM-004 PRESENCE — status comparison + 'reviewed'/'published'/'restricted'/'archived' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `function transitionPostStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM post_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'draft') throw new SocialMediaError("E409-PUBLISH", "Invalid transition", 409);
  db.prepare("UPDATE post_publishes SET status = 'reviewed' WHERE id = ?").run(publishId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-004"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });

  it("SM-005 PRESENCE — batch expire update in expireRemovedPostBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `function transitionPostStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM post_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'draft') throw new SocialMediaError("E409-PUBLISH", "Invalid", 409);
  db.prepare("UPDATE post_publishes SET status = 'reviewed' WHERE id = ?").run(publishId);
}
function expireRemovedPostBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM post_feeds WHERE status = 'removed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE post_feeds SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-005"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });

  it("SM-006 PRESENCE — db.transaction() in processCreatorClawback (atomic creator_payout_clawback_records+creator_payout_clawbacks INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "socialmedia.ts",
      `function processCreatorClawback(db, creatorId, postFeedId, payoutCost, clawbackRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO creator_payout_clawback_records (id, creator_id, post_feed_id, payout_cost, clawback_rate, clawback_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(clawbackRecordId, creatorId, postFeedId, payoutCost, clawbackRate, clawbackAmount);
    db.prepare("INSERT INTO creator_payout_clawbacks (id, clawback_record_id, creator_id, amount, status, clawed_back_at) VALUES (?, ?, ?, ?, 'clawed_back', ?)").run(clawbackId, clawbackRecordId, creatorId, clawbackAmount, clawedBackAt);
    db.prepare("UPDATE creator_payout_clawback_records SET status = 'clawed_back' WHERE id = ?").run(clawbackRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SM-006"]!(src, "socialmedia.ts");
    expect(markers).toHaveLength(0);
  });
});

// F527 (세션 305 후속2) — news domain NW-001~006 via withRuleId (60 Sprint 연속 정점 도전)
// 거울 변환 12회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news).
// MU+PB+AD+GM+VD+SM+NW 디지털 콘텐츠 7-클러스터 확장. 🏆 59번째 도메인 마일스톤 (S262 5 → S305++ 59, 11.8배 확장).
describe("news domain — NW-001~006 via withRuleId (세션 305 후속2 F527)", () => {
  it("NW-001 PRESENCE — active_published_articles >= MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `const MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER = 50000;
function publishArticle(db, publisherId, contractId) {
  const publisher = db.prepare("SELECT active_published_articles, total_capacity FROM publishers WHERE id = ?").get(publisherId);
  const limit = publisher.total_capacity ?? MAX_CONCURRENT_PUBLISHED_ARTICLES_PER_PUBLISHER;
  if (publisher.active_published_articles >= limit) {
    throw new NewsError('E422-PUBLISHER-CAPACITY-EXCEEDED', 'Publisher is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-001"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });

  it("NW-002 PRESENCE — article_used + articles >= dailyArticleLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `function applyArticleQuotaLimit(db, subscriberId, contractId, articles) {
  const contract = db.prepare("SELECT article_used, article_limit FROM subscription_contracts WHERE id = ? AND subscriber_id = ? LIMIT 1").get(contractId, subscriberId);
  const dailyArticleLimit = contract.article_limit;
  if (contract.article_used + articles >= dailyArticleLimit) {
    throw new NewsError('E422-DAILY-ARTICLE-LIMIT-EXCEEDED', 'Daily article quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-002"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });

  it("NW-003 PRESENCE — db.transaction() in processSyndication (atomic article_syndications+article_publishes+subscription_charges INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `function processSyndication(db, publisherId, publishId, syndicationNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO article_syndications (id, publisher_id, publish_id, syndication_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(articleSyndicationId, publisherId, publishId, syndicationNo, startedAt);
    db.prepare("UPDATE article_publishes SET status = 'published', article_syndication_id = ?, subscription_charge_id = ? WHERE id = ?").run(articleSyndicationId, subscriptionChargeId, publishId);
    db.prepare("INSERT INTO subscription_charges (id, publish_id, article_syndication_id, amount, status, charged_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(subscriptionChargeId, publishId, articleSyndicationId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-003"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });

  it("NW-004 PRESENCE — status comparison + 'edited'/'published'/'updated'/'archived' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `function transitionArticleStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM article_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'drafted') throw new NewsError("E409-PUBLISH", "Invalid transition", 409);
  db.prepare("UPDATE article_publishes SET status = 'edited' WHERE id = ?").run(publishId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-004"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });

  it("NW-005 PRESENCE — batch expire update in expireRetractedArticleBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `function transitionArticleStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM article_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'drafted') throw new NewsError("E409-PUBLISH", "Invalid", 409);
  db.prepare("UPDATE article_publishes SET status = 'edited' WHERE id = ?").run(publishId);
}
function expireRetractedArticleBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM article_syndications WHERE status = 'retracted' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE article_syndications SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-005"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });

  it("NW-006 PRESENCE — db.transaction() in processSubscriptionRefund (atomic subscription_refund_records+subscription_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "news.ts",
      `function processSubscriptionRefund(db, subscriberId, articleSyndicationId, subscriptionCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO subscription_refund_records (id, subscriber_id, article_syndication_id, subscription_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, subscriberId, articleSyndicationId, subscriptionCost, refundRate, refundAmount);
    db.prepare("INSERT INTO subscription_refunds (id, refund_record_id, subscriber_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, subscriberId, refundAmount, refundedAt);
    db.prepare("UPDATE subscription_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["NW-006"]!(src, "news.ts");
    expect(markers).toHaveLength(0);
  });
});

// F528 (세션 305 후속3) — broadcast domain BR-001~006 via withRuleId (🏆 60 Sprint round 마일스톤, 61 Sprint 연속 정점 도전)
// 거울 변환 13회차 (carsharing → ... → news → broadcast).
// MU+PB+AD+GM+VD+SM+NW+BR 디지털 콘텐츠 8-클러스터 확장. 🏆 60번째 도메인 마일스톤 (S262 5 → S305+++ 60, 12배 확장).
describe("broadcast domain — BR-001~006 via withRuleId (세션 305 후속3 F528, 🏆 60 Sprint round 마일스톤)", () => {
  it("BR-001 PRESENCE — active_broadcasts >= MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `const MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION = 24;
function scheduleBroadcast(db, stationId, contractId) {
  const station = db.prepare("SELECT active_broadcasts, total_capacity FROM stations WHERE id = ?").get(stationId);
  const limit = station.total_capacity ?? MAX_CONCURRENT_ACTIVE_BROADCASTS_PER_STATION;
  if (station.active_broadcasts >= limit) {
    throw new BroadcastError('E422-STATION-CAPACITY-EXCEEDED', 'Station is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-001"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("BR-002 PRESENCE — viewership_used + viewership >= dailyViewershipLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `function applyViewershipLimit(db, sponsorId, contractId, viewership) {
  const contract = db.prepare("SELECT viewership_used, viewership_limit FROM sponsor_contracts WHERE id = ? AND sponsor_id = ? LIMIT 1").get(contractId, sponsorId);
  const dailyViewershipLimit = contract.viewership_limit;
  if (contract.viewership_used + viewership >= dailyViewershipLimit) {
    throw new BroadcastError('E422-DAILY-VIEWERSHIP-LIMIT-EXCEEDED', 'Daily viewership quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-002"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("BR-003 PRESENCE — db.transaction() in processAiring (atomic airings+broadcast_schedules+sponsor_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `function processAiring(db, stationId, scheduleId, airingNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO airings (id, station_id, schedule_id, airing_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(airingId, stationId, scheduleId, airingNo, startedAt);
    db.prepare("UPDATE broadcast_schedules SET status = 'airing', airing_id = ?, sponsor_payment_id = ? WHERE id = ?").run(airingId, sponsorPaymentId, scheduleId);
    db.prepare("INSERT INTO sponsor_payments (id, schedule_id, airing_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(sponsorPaymentId, scheduleId, airingId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-003"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("BR-004 PRESENCE — status comparison + 'airing'/'updated'/'archived'/'preempted'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `function transitionBroadcastStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM broadcast_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new BroadcastError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE broadcast_schedules SET status = 'airing' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-004"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("BR-005 PRESENCE — batch expire update in expirePreemptedBroadcastBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `function transitionBroadcastStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM broadcast_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new BroadcastError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE broadcast_schedules SET status = 'airing' WHERE id = ?").run(scheduleId);
}
function expirePreemptedBroadcastBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM airings WHERE status = 'preempted' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE airings SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-005"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("BR-006 PRESENCE — db.transaction() in processSponsorRefund (atomic sponsor_refund_records+sponsor_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "broadcast.ts",
      `function processSponsorRefund(db, sponsorId, airingId, sponsorCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO sponsor_refund_records (id, sponsor_id, airing_id, sponsor_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, sponsorId, airingId, sponsorCost, refundRate, refundAmount);
    db.prepare("INSERT INTO sponsor_refunds (id, refund_record_id, sponsor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, sponsorId, refundAmount, refundedAt);
    db.prepare("UPDATE sponsor_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["BR-006"]!(src, "broadcast.ts");
    expect(markers).toHaveLength(0);
  });
});

// F529 (세션 305 후속4) — esports domain ER-001~006 via withRuleId (🏆🏆 50 신규 산업 round 마일스톤, 62 Sprint 연속 정점 도전)
// 거울 변환 14회차 (carsharing → ... → broadcast → esports).
// MU+PB+AD+GM+VD+SM+NW+BR+ER 디지털 콘텐츠 9-클러스터 확장 + GM/SM 융합 모델. 🏆 61번째 도메인 마일스톤 (S262 5 → S305++++ 61, 12.2배 확장).
describe("esports domain — ER-001~006 via withRuleId (세션 305 후속4 F529, 🏆🏆 50 신규 산업 round 마일스톤)", () => {
  it("ER-001 PRESENCE — active_tournaments >= MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `const MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER = 16;
function registerTournament(db, organizerId, contractId) {
  const organizer = db.prepare("SELECT active_tournaments, total_capacity FROM organizers WHERE id = ?").get(organizerId);
  const limit = organizer.total_capacity ?? MAX_CONCURRENT_ACTIVE_TOURNAMENTS_PER_ORGANIZER;
  if (organizer.active_tournaments >= limit) {
    throw new EsportsError('E422-ORGANIZER-CAPACITY-EXCEEDED', 'Organizer is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-001"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });

  it("ER-002 PRESENCE — prize_earned + prize >= dailyPrizeLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `function applyPrizeLimit(db, teamId, contractId, prize) {
  const contract = db.prepare("SELECT prize_earned, prize_limit FROM team_contracts WHERE id = ? AND team_id = ? LIMIT 1").get(contractId, teamId);
  const dailyPrizeLimit = contract.prize_limit;
  if (contract.prize_earned + prize >= dailyPrizeLimit) {
    throw new EsportsError('E422-DAILY-PRIZE-LIMIT-EXCEEDED', 'Daily prize quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-002"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });

  it("ER-003 PRESENCE — db.transaction() in processMatch (atomic matches+tournament_schedules+prize_distributions INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `function processMatch(db, organizerId, scheduleId, matchNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO matches (id, organizer_id, schedule_id, match_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(matchId, organizerId, scheduleId, matchNo, startedAt);
    db.prepare("UPDATE tournament_schedules SET status = 'live', match_id = ?, prize_distribution_id = ? WHERE id = ?").run(matchId, prizeDistributionId, scheduleId);
    db.prepare("INSERT INTO prize_distributions (id, schedule_id, match_id, amount, status, distributed_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(prizeDistributionId, scheduleId, matchId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-003"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });

  it("ER-004 PRESENCE — status comparison + 'registered'/'live'/'completed'/'forfeited' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `function transitionTournamentStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tournament_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new EsportsError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE tournament_schedules SET status = 'registered' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-004"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });

  it("ER-005 PRESENCE — batch expire update in expireForfeitedMatchBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `function transitionTournamentStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tournament_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new EsportsError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE tournament_schedules SET status = 'registered' WHERE id = ?").run(scheduleId);
}
function expireForfeitedMatchBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM matches WHERE status = 'forfeited' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE matches SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-005"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });

  it("ER-006 PRESENCE — db.transaction() in processPrizeClawback (atomic prize_clawback_records+prize_clawbacks INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "esports.ts",
      `function processPrizeClawback(db, teamId, matchId, prizeCost, clawbackRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO prize_clawback_records (id, team_id, match_id, prize_cost, clawback_rate, clawback_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(clawbackRecordId, teamId, matchId, prizeCost, clawbackRate, clawbackAmount);
    db.prepare("INSERT INTO prize_clawbacks (id, clawback_record_id, team_id, amount, status, clawed_back_at) VALUES (?, ?, ?, ?, 'clawed_back', ?)").run(clawbackId, clawbackRecordId, teamId, clawbackAmount, clawedBackAt);
    db.prepare("UPDATE prize_clawback_records SET status = 'clawed_back' WHERE id = ?").run(clawbackRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ER-006"]!(src, "esports.ts");
    expect(markers).toHaveLength(0);
  });
});

// F530 (세션 305 후속5) — podcast domain PC-001~006 via withRuleId (63 Sprint 연속 정점 도전)
// 거울 변환 15회차 (carsharing → ... → esports → podcast).
// MU+PB+AD+GM+VD+SM+NW+BR+ER+PC 디지털 콘텐츠 10-클러스터 확장. 🏆 62번째 도메인 마일스톤.
describe("podcast domain — PC-001~006 via withRuleId (세션 305 후속5 F530)", () => {
  it("PC-001 PRESENCE — active_published_episodes >= MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `const MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST = 5000;
function publishEpisode(db, hostId, contractId) {
  const host = db.prepare("SELECT active_published_episodes, total_capacity FROM hosts WHERE id = ?").get(hostId);
  const limit = host.total_capacity ?? MAX_CONCURRENT_PUBLISHED_EPISODES_PER_HOST;
  if (host.active_published_episodes >= limit) {
    throw new PodcastError('E422-HOST-CAPACITY-EXCEEDED', 'Host is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-001"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("PC-002 PRESENCE — listen_used + listens >= dailyListenLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `function applyListenLimit(db, listenerId, contractId, listens) {
  const contract = db.prepare("SELECT listen_used, listen_limit FROM listener_contracts WHERE id = ? AND listener_id = ? LIMIT 1").get(contractId, listenerId);
  const dailyListenLimit = contract.listen_limit;
  if (contract.listen_used + listens >= dailyListenLimit) {
    throw new PodcastError('E422-DAILY-LISTEN-LIMIT-EXCEEDED', 'Daily listen quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-002"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("PC-003 PRESENCE — db.transaction() in processDistribution (atomic episode_distributions+episode_publishes+ad_insertions INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `function processDistribution(db, hostId, publishId, distributionNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO episode_distributions (id, host_id, publish_id, distribution_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(episodeDistributionId, hostId, publishId, distributionNo, startedAt);
    db.prepare("UPDATE episode_publishes SET status = 'published', episode_distribution_id = ?, ad_insertion_id = ? WHERE id = ?").run(episodeDistributionId, adInsertionId, publishId);
    db.prepare("INSERT INTO ad_insertions (id, publish_id, episode_distribution_id, amount, status, inserted_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(adInsertionId, publishId, episodeDistributionId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-003"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("PC-004 PRESENCE — status comparison + 'edited'/'published'/'updated'/'archived' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `function transitionEpisodeStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM episode_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'recorded') throw new PodcastError("E409-PUBLISH", "Invalid transition", 409);
  db.prepare("UPDATE episode_publishes SET status = 'edited' WHERE id = ?").run(publishId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-004"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("PC-005 PRESENCE — batch expire update in expireRemovedEpisodeBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `function transitionEpisodeStatus(db, publishId, newStatus) {
  const publish = db.prepare("SELECT status FROM episode_publishes WHERE id = ?").get(publishId);
  if (publish.status === 'recorded') throw new PodcastError("E409-PUBLISH", "Invalid", 409);
  db.prepare("UPDATE episode_publishes SET status = 'edited' WHERE id = ?").run(publishId);
}
function expireRemovedEpisodeBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM episode_distributions WHERE status = 'removed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE episode_distributions SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-005"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });

  it("PC-006 PRESENCE — db.transaction() in processListenerRefund (atomic listener_refund_records+listener_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "podcast.ts",
      `function processListenerRefund(db, listenerId, episodeDistributionId, subscriptionCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO listener_refund_records (id, listener_id, episode_distribution_id, subscription_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, listenerId, episodeDistributionId, subscriptionCost, refundRate, refundAmount);
    db.prepare("INSERT INTO listener_refunds (id, refund_record_id, listener_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, listenerId, refundAmount, refundedAt);
    db.prepare("UPDATE listener_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["PC-006"]!(src, "podcast.ts");
    expect(markers).toHaveLength(0);
  });
});

// F531 (세션 305 후속6) — radio domain RA-001~006 via withRuleId (🏆🏆 1세션 9 Sprint 신기록, 64 Sprint 연속 정점 도전)
// 거울 변환 16회차 (carsharing → ... → podcast → radio).
// MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA 디지털 콘텐츠 11-클러스터 확장. 🏆 63번째 도메인 마일스톤.
describe("radio domain — RA-001~006 via withRuleId (세션 305 후속6 F531, 🏆🏆 1세션 9 Sprint 신기록)", () => {
  it("RA-001 PRESENCE — active_programs >= MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `const MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL = 48;
function scheduleProgram(db, channelId, contractId) {
  const channel = db.prepare("SELECT active_programs, total_capacity FROM channels WHERE id = ?").get(channelId);
  const limit = channel.total_capacity ?? MAX_CONCURRENT_ACTIVE_PROGRAMS_PER_CHANNEL;
  if (channel.active_programs >= limit) {
    throw new RadioError('E422-CHANNEL-CAPACITY-EXCEEDED', 'Channel is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-001"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });

  it("RA-002 PRESENCE — listenership_used + listenership >= dailyListenershipLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `function applyListenershipLimit(db, sponsorId, contractId, listenership) {
  const contract = db.prepare("SELECT listenership_used, listenership_limit FROM sponsor_contracts WHERE id = ? AND sponsor_id = ? LIMIT 1").get(contractId, sponsorId);
  const dailyListenershipLimit = contract.listenership_limit;
  if (contract.listenership_used + listenership >= dailyListenershipLimit) {
    throw new RadioError('E422-DAILY-LISTENERSHIP-LIMIT-EXCEEDED', 'Daily listenership quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-002"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });

  it("RA-003 PRESENCE — db.transaction() in processBroadcast (atomic broadcasts+program_schedules+sponsor_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `function processBroadcast(db, channelId, scheduleId, broadcastNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO broadcasts (id, channel_id, schedule_id, broadcast_no, status, started_at) VALUES (?, ?, ?, ?, 'live', ?)").run(broadcastId, channelId, scheduleId, broadcastNo, startedAt);
    db.prepare("UPDATE program_schedules SET status = 'airing', broadcast_id = ?, sponsor_payment_id = ? WHERE id = ?").run(broadcastId, sponsorPaymentId, scheduleId);
    db.prepare("INSERT INTO sponsor_payments (id, schedule_id, broadcast_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(sponsorPaymentId, scheduleId, broadcastId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-003"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });

  it("RA-004 PRESENCE — status comparison + 'airing'/'updated'/'archived'/'preempted'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `function transitionProgramStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM program_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new RadioError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE program_schedules SET status = 'airing' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-004"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });

  it("RA-005 PRESENCE — batch expire update in expirePreemptedBroadcastBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `function transitionProgramStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM program_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new RadioError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE program_schedules SET status = 'airing' WHERE id = ?").run(scheduleId);
}
function expirePreemptedBroadcastBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM broadcasts WHERE status = 'preempted' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE broadcasts SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-005"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });

  it("RA-006 PRESENCE — db.transaction() in processSponsorRefund (atomic sponsor_refund_records+sponsor_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "radio.ts",
      `function processSponsorRefund(db, sponsorId, broadcastId, sponsorCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO sponsor_refund_records (id, sponsor_id, broadcast_id, sponsor_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, sponsorId, broadcastId, sponsorCost, refundRate, refundAmount);
    db.prepare("INSERT INTO sponsor_refunds (id, refund_record_id, sponsor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, sponsorId, refundAmount, refundedAt);
    db.prepare("UPDATE sponsor_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["RA-006"]!(src, "radio.ts");
    expect(markers).toHaveLength(0);
  });
});

// F532 (세션 306) — art domain AR-001~006 via withRuleId (🏆 64번째 도메인 마일스톤, 65 Sprint 연속 정점 도전)
// 거울 변환 17회차 (carsharing → ... → radio → art).
// MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR 디지털 콘텐츠 12-클러스터 확장 (시각 예술 / NFT 디지털 아트 확장 가능).
describe("art domain — AR-001~006 via withRuleId (세션 306 F532, 🏆 64번째 도메인 마일스톤)", () => {
  it("AR-001 PRESENCE — active_artworks >= MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `const MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY = 60;
function registerArtwork(db, galleryId, contractId) {
  const gallery = db.prepare("SELECT active_artworks, total_capacity FROM galleries WHERE id = ?").get(galleryId);
  const limit = gallery.total_capacity ?? MAX_CONCURRENT_ACTIVE_ARTWORKS_PER_GALLERY;
  if (gallery.active_artworks >= limit) {
    throw new ArtError('E422-GALLERY-CAPACITY-EXCEEDED', 'Gallery is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-001"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });

  it("AR-002 PRESENCE — acquisition_used + acquisition >= dailyAcquisitionLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `function applyAcquisitionLimit(db, collectorId, contractId, acquisition) {
  const contract = db.prepare("SELECT acquisition_used, acquisition_limit FROM collector_contracts WHERE id = ? AND collector_id = ? LIMIT 1").get(contractId, collectorId);
  const dailyAcquisitionLimit = contract.acquisition_limit;
  if (contract.acquisition_used + acquisition >= dailyAcquisitionLimit) {
    throw new ArtError('E422-DAILY-ACQUISITION-LIMIT-EXCEEDED', 'Daily acquisition quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-002"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });

  it("AR-003 PRESENCE — db.transaction() in processArtworkTransaction (atomic artworks+exhibition_schedules+commission_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `function processArtworkTransaction(db, galleryId, scheduleId, artworkNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO artworks (id, gallery_id, schedule_id, artwork_no, status, started_at) VALUES (?, ?, ?, ?, 'exhibited', ?)").run(artworkId, galleryId, scheduleId, artworkNo, startedAt);
    db.prepare("UPDATE exhibition_schedules SET status = 'exhibited', artwork_id = ?, commission_payment_id = ? WHERE id = ?").run(artworkId, commissionPaymentId, scheduleId);
    db.prepare("INSERT INTO commission_payments (id, schedule_id, artwork_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(commissionPaymentId, scheduleId, artworkId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-003"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });

  it("AR-004 PRESENCE — status comparison + 'exhibited'/'updated'/'archived'/'withdrawn'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `function transitionArtworkStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM exhibition_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ArtError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE exhibition_schedules SET status = 'exhibited' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-004"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });

  it("AR-005 PRESENCE — batch expire update in expireWithdrawnArtworkBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `function transitionArtworkStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM exhibition_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ArtError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE exhibition_schedules SET status = 'exhibited' WHERE id = ?").run(scheduleId);
}
function expireWithdrawnArtworkBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM artworks WHERE status = 'withdrawn' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE artworks SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-005"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });

  it("AR-006 PRESENCE — db.transaction() in processCommissionRefund (atomic commission_refund_records+commission_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "art.ts",
      `function processCommissionRefund(db, collectorId, artworkId, commissionCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO commission_refund_records (id, collector_id, artwork_id, commission_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, collectorId, artworkId, commissionCost, refundRate, refundAmount);
    db.prepare("INSERT INTO commission_refunds (id, refund_record_id, collector_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, collectorId, refundAmount, refundedAt);
    db.prepare("UPDATE commission_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AR-006"]!(src, "art.ts");
    expect(markers).toHaveLength(0);
  });
});

// F533 (세션 306 후속) — gambling domain GA-001~006 via withRuleId (🏆 65번째 도메인 마일스톤, 66 Sprint 연속 정점 도전)
// 거울 변환 18회차 (carsharing → ... → art → gambling).
// 🎮 GM+GA 게임엔터 2-클러스터 신규 형성 (게임 in-app purchase + 카지노/베팅 payout 통합 추상화).
describe("gambling domain — GA-001~006 via withRuleId (세션 306 후속 F533, 🏆 65번째 도메인 마일스톤)", () => {
  it("GA-001 PRESENCE — active_bets >= MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `const MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO = 200;
function placeBet(db, casinoId, contractId) {
  const casino = db.prepare("SELECT active_bets, total_capacity FROM casinos WHERE id = ?").get(casinoId);
  const limit = casino.total_capacity ?? MAX_CONCURRENT_ACTIVE_BETS_PER_CASINO;
  if (casino.active_bets >= limit) {
    throw new GamblingError('E422-CASINO-CAPACITY-EXCEEDED', 'Casino is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-001"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });

  it("GA-002 PRESENCE — bet_used + bet >= dailyBetLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `function applyBetLimit(db, playerId, contractId, bet) {
  const contract = db.prepare("SELECT bet_used, bet_limit FROM player_contracts WHERE id = ? AND player_id = ? LIMIT 1").get(contractId, playerId);
  const dailyBetLimit = contract.bet_limit;
  if (contract.bet_used + bet >= dailyBetLimit) {
    throw new GamblingError('E422-DAILY-BET-LIMIT-EXCEEDED', 'Daily bet quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-002"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });

  it("GA-003 PRESENCE — db.transaction() in processBetSettlement (atomic bets+game_schedules+wager_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `function processBetSettlement(db, casinoId, scheduleId, betNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO bets (id, casino_id, schedule_id, bet_no, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)").run(betId, casinoId, scheduleId, betNo, startedAt);
    db.prepare("UPDATE game_schedules SET status = 'active', bet_id = ?, wager_payment_id = ? WHERE id = ?").run(betId, wagerPaymentId, scheduleId);
    db.prepare("INSERT INTO wager_payments (id, schedule_id, bet_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(wagerPaymentId, scheduleId, betId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-003"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });

  it("GA-004 PRESENCE — status comparison + 'active'/'updated'/'settled'/'voided'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `function transitionBetStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM game_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new GamblingError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE game_schedules SET status = 'active' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-004"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });

  it("GA-005 PRESENCE — batch expire update in expireVoidedBetBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `function transitionBetStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM game_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new GamblingError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE game_schedules SET status = 'active' WHERE id = ?").run(scheduleId);
}
function expireVoidedBetBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM bets WHERE status = 'voided' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE bets SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-005"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });

  it("GA-006 PRESENCE — db.transaction() in processWagerRefund (atomic wager_refund_records+wager_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "gambling.ts",
      `function processWagerRefund(db, playerId, betId, wagerAmount, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO wager_refund_records (id, player_id, bet_id, wager_amount, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, playerId, betId, wagerAmount, refundRate, refundAmount);
    db.prepare("INSERT INTO wager_refunds (id, refund_record_id, player_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, playerId, refundAmount, refundedAt);
    db.prepare("UPDATE wager_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GA-006"]!(src, "gambling.ts");
    expect(markers).toHaveLength(0);
  });
});

// F534 (세션 306 후속2) — amusement domain AM-001~006 via withRuleId (🏆 66번째 도메인 마일스톤, 67 Sprint 연속 정점 도전)
// 거울 변환 19회차 (carsharing → ... → gambling → amusement).
// 🎢 오프라인 엔터테인먼트 신규 클러스터 출범 (디지털 12 + 게임엔터 2 + 오프라인 엔터 1 = 3 메타 카테고리).
describe("amusement domain — AM-001~006 via withRuleId (세션 306 후속2 F534, 🏆 66번째 도메인 마일스톤)", () => {
  it("AM-001 PRESENCE — active_tickets >= MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `const MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK = 5000;
function reserveTicket(db, parkId, contractId) {
  const park = db.prepare("SELECT active_tickets, total_capacity FROM parks WHERE id = ?").get(parkId);
  const limit = park.total_capacity ?? MAX_CONCURRENT_ACTIVE_TICKETS_PER_PARK;
  if (park.active_tickets >= limit) {
    throw new AmusementError('E422-PARK-CAPACITY-EXCEEDED', 'Park is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-001"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });

  it("AM-002 PRESENCE — visit_used + visit >= dailyVisitLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `function applyVisitLimit(db, visitorId, contractId, visit) {
  const contract = db.prepare("SELECT visit_used, visit_limit FROM visitor_contracts WHERE id = ? AND visitor_id = ? LIMIT 1").get(contractId, visitorId);
  const dailyVisitLimit = contract.visit_limit;
  if (contract.visit_used + visit >= dailyVisitLimit) {
    throw new AmusementError('E422-DAILY-VISIT-LIMIT-EXCEEDED', 'Daily visit quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-002"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });

  it("AM-003 PRESENCE — db.transaction() in processRideAdmission (atomic tickets+ride_schedules+ticket_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `function processRideAdmission(db, parkId, scheduleId, ticketNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO tickets (id, park_id, schedule_id, ticket_no, status, started_at) VALUES (?, ?, ?, ?, 'admitted', ?)").run(ticketId, parkId, scheduleId, ticketNo, startedAt);
    db.prepare("UPDATE ride_schedules SET status = 'admitted', ticket_id = ?, ticket_payment_id = ? WHERE id = ?").run(ticketId, ticketPaymentId, scheduleId);
    db.prepare("INSERT INTO ticket_payments (id, schedule_id, ticket_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(ticketPaymentId, scheduleId, ticketId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-003"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });

  it("AM-004 PRESENCE — status comparison + 'admitted'/'updated'/'completed'/'revoked'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `function transitionTicketStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM ride_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new AmusementError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE ride_schedules SET status = 'admitted' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-004"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });

  it("AM-005 PRESENCE — batch expire update in expireRevokedTicketBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `function transitionTicketStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM ride_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new AmusementError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE ride_schedules SET status = 'admitted' WHERE id = ?").run(scheduleId);
}
function expireRevokedTicketBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM tickets WHERE status = 'revoked' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE tickets SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-005"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });

  it("AM-006 PRESENCE — db.transaction() in processTicketRefund (atomic ticket_refund_records+ticket_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "amusement.ts",
      `function processTicketRefund(db, visitorId, ticketId, ticketCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO ticket_refund_records (id, visitor_id, ticket_id, ticket_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, visitorId, ticketId, ticketCost, refundRate, refundAmount);
    db.prepare("INSERT INTO ticket_refunds (id, refund_record_id, visitor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, visitorId, refundAmount, refundedAt);
    db.prepare("UPDATE ticket_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AM-006"]!(src, "amusement.ts");
    expect(markers).toHaveLength(0);
  });
});

// F535 (세션 306 후속3) — theater domain TH-001~006 via withRuleId (🏆 67번째 도메인 마일스톤, 68 Sprint 연속 정점 도전)
// 거울 변환 20회차 정점 (carsharing → ... → amusement → theater).
// 🎭 AM+TH 오프라인 엔터 2-클러스터 확장 (테마파크 입장권 + 극장 좌석권 통합 추상화).
describe("theater domain — TH-001~006 via withRuleId (세션 306 후속3 F535, 🏆 67번째 도메인 마일스톤)", () => {
  it("TH-001 PRESENCE — active_seats >= MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `const MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER = 2000;
function bookSeat(db, theaterId, contractId) {
  const theater = db.prepare("SELECT active_seats, total_capacity FROM theaters WHERE id = ?").get(theaterId);
  const limit = theater.total_capacity ?? MAX_CONCURRENT_ACTIVE_SEATS_PER_THEATER;
  if (theater.active_seats >= limit) {
    throw new TheaterError('E422-THEATER-CAPACITY-EXCEEDED', 'Theater is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-001"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });

  it("TH-002 PRESENCE — attendance_used + attendance >= dailyAttendanceLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `function applyAttendanceLimit(db, patronId, contractId, attendance) {
  const contract = db.prepare("SELECT attendance_used, attendance_limit FROM patron_contracts WHERE id = ? AND patron_id = ? LIMIT 1").get(contractId, patronId);
  const dailyAttendanceLimit = contract.attendance_limit;
  if (contract.attendance_used + attendance >= dailyAttendanceLimit) {
    throw new TheaterError('E422-DAILY-ATTENDANCE-LIMIT-EXCEEDED', 'Daily attendance quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-002"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });

  it("TH-003 PRESENCE — db.transaction() in processShowAdmission (atomic seats+performance_schedules+seat_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `function processShowAdmission(db, theaterId, scheduleId, seatNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO seats (id, theater_id, schedule_id, seat_no, status, started_at) VALUES (?, ?, ?, ?, 'seated', ?)").run(seatId, theaterId, scheduleId, seatNo, startedAt);
    db.prepare("UPDATE performance_schedules SET status = 'seated', seat_id = ?, seat_payment_id = ? WHERE id = ?").run(seatId, seatPaymentId, scheduleId);
    db.prepare("INSERT INTO seat_payments (id, schedule_id, seat_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(seatPaymentId, scheduleId, seatId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-003"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });

  it("TH-004 PRESENCE — status comparison + 'seated'/'updated'/'ended'/'withdrawn'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `function transitionSeatStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM performance_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new TheaterError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE performance_schedules SET status = 'seated' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-004"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });

  it("TH-005 PRESENCE — batch expire update in expireWithdrawnSeatBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `function transitionSeatStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM performance_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new TheaterError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE performance_schedules SET status = 'seated' WHERE id = ?").run(scheduleId);
}
function expireWithdrawnSeatBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM seats WHERE status = 'withdrawn' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE seats SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-005"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });

  it("TH-006 PRESENCE — db.transaction() in processShowRefund (atomic seat_refund_records+seat_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "theater.ts",
      `function processShowRefund(db, patronId, seatId, seatCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO seat_refund_records (id, patron_id, seat_id, seat_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, patronId, seatId, seatCost, refundRate, refundAmount);
    db.prepare("INSERT INTO seat_refunds (id, refund_record_id, patron_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, patronId, refundAmount, refundedAt);
    db.prepare("UPDATE seat_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["TH-006"]!(src, "theater.ts");
    expect(markers).toHaveLength(0);
  });
});

// F536 (세션 306 후속4) — skiing domain SK-001~006 via withRuleId (🏆 68번째 도메인 마일스톤, 69 Sprint 연속 정점 도전)
// 거울 변환 21회차 (carsharing → ... → theater → skiing).
// 🏔️ SP+SK 스포츠 레저 2-클러스터 신규 형성 (피트니스/스포츠 + 윈터 레저 통합 추상화).
describe("skiing domain — SK-001~006 via withRuleId (세션 306 후속4 F536, 🏆 68번째 도메인 마일스톤)", () => {
  it("SK-001 PRESENCE — active_passes >= MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `const MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT = 8000;
function reservePass(db, resortId, contractId) {
  const resort = db.prepare("SELECT active_passes, total_capacity FROM resorts WHERE id = ?").get(resortId);
  const limit = resort.total_capacity ?? MAX_CONCURRENT_ACTIVE_PASSES_PER_RESORT;
  if (resort.active_passes >= limit) {
    throw new SkiingError('E422-RESORT-CAPACITY-EXCEEDED', 'Resort is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-001"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SK-002 PRESENCE — ride_used + ride >= dailyRideLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `function applyRideLimit(db, skierId, contractId, ride) {
  const contract = db.prepare("SELECT ride_used, ride_limit FROM skier_contracts WHERE id = ? AND skier_id = ? LIMIT 1").get(contractId, skierId);
  const dailyRideLimit = contract.ride_limit;
  if (contract.ride_used + ride >= dailyRideLimit) {
    throw new SkiingError('E422-DAILY-RIDE-LIMIT-EXCEEDED', 'Daily ride quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-002"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SK-003 PRESENCE — db.transaction() in processLiftBoarding (atomic passes+lift_schedules+pass_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `function processLiftBoarding(db, resortId, scheduleId, passNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO passes (id, resort_id, schedule_id, pass_no, status, started_at) VALUES (?, ?, ?, ?, 'boarded', ?)").run(passId, resortId, scheduleId, passNo, startedAt);
    db.prepare("UPDATE lift_schedules SET status = 'boarded', pass_id = ?, pass_payment_id = ? WHERE id = ?").run(passId, passPaymentId, scheduleId);
    db.prepare("INSERT INTO pass_payments (id, schedule_id, pass_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(passPaymentId, scheduleId, passId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-003"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SK-004 PRESENCE — status comparison + 'boarded'/'updated'/'completed'/'suspended'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `function transitionPassStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM lift_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new SkiingError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE lift_schedules SET status = 'boarded' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-004"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SK-005 PRESENCE — batch expire update in expireSuspendedPassBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `function transitionPassStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM lift_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new SkiingError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE lift_schedules SET status = 'boarded' WHERE id = ?").run(scheduleId);
}
function expireSuspendedPassBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM passes WHERE status = 'suspended' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE passes SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-005"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SK-006 PRESENCE — db.transaction() in processSlopeRefund (atomic pass_refund_records+pass_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "skiing.ts",
      `function processSlopeRefund(db, skierId, passId, passCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO pass_refund_records (id, skier_id, pass_id, pass_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, skierId, passId, passCost, refundRate, refundAmount);
    db.prepare("INSERT INTO pass_refunds (id, refund_record_id, skier_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, skierId, refundAmount, refundedAt);
    db.prepare("UPDATE pass_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SK-006"]!(src, "skiing.ts");
    expect(markers).toHaveLength(0);
  });
});

// F537 (세션 306 후속5) — exhibition domain EX-001~006 via withRuleId (🏆 69번째 도메인 마일스톤, 70 Sprint 연속 정점 round 마일스톤 도전)
// 거울 변환 22회차 (carsharing → ... → skiing → exhibition).
// 🎨 AR+EX 예술/전시 2-클러스터 신규 형성 (시각 예술 갤러리 + 박람회/컨벤션 부스 통합 추상화).
describe("exhibition domain — EX-001~006 via withRuleId (세션 306 후속5 F537, 🏆 69번째 도메인 마일스톤)", () => {
  it("EX-001 PRESENCE — active_admissions >= MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `const MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE = 10000;
function bookBooth(db, venueId, contractId) {
  const venue = db.prepare("SELECT active_admissions, total_capacity FROM venues WHERE id = ?").get(venueId);
  const limit = venue.total_capacity ?? MAX_CONCURRENT_ACTIVE_ADMISSIONS_PER_VENUE;
  if (venue.active_admissions >= limit) {
    throw new ExhibitionError('E422-VENUE-CAPACITY-EXCEEDED', 'Venue is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-001"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });

  it("EX-002 PRESENCE — visitor_used + visitor >= dailyVisitorLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `function applyVisitorLimit(db, exhibitorId, contractId, visitor) {
  const contract = db.prepare("SELECT visitor_used, visitor_limit FROM exhibitor_contracts WHERE id = ? AND exhibitor_id = ? LIMIT 1").get(contractId, exhibitorId);
  const dailyVisitorLimit = contract.visitor_limit;
  if (contract.visitor_used + visitor >= dailyVisitorLimit) {
    throw new ExhibitionError('E422-DAILY-VISITOR-LIMIT-EXCEEDED', 'Daily visitor quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-002"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });

  it("EX-003 PRESENCE — db.transaction() in processBoothOpening (atomic admissions+booth_schedules+booth_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `function processBoothOpening(db, venueId, scheduleId, admissionNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO admissions (id, venue_id, schedule_id, admission_no, status, started_at) VALUES (?, ?, ?, ?, 'exhibited', ?)").run(admissionId, venueId, scheduleId, admissionNo, startedAt);
    db.prepare("UPDATE booth_schedules SET status = 'exhibited', admission_id = ?, booth_payment_id = ? WHERE id = ?").run(admissionId, boothPaymentId, scheduleId);
    db.prepare("INSERT INTO booth_payments (id, schedule_id, admission_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(boothPaymentId, scheduleId, admissionId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-003"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });

  it("EX-004 PRESENCE — status comparison + 'exhibited'/'updated'/'closed'/'withdrawn'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `function transitionBoothStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM booth_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ExhibitionError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE booth_schedules SET status = 'exhibited' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-004"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });

  it("EX-005 PRESENCE — batch expire update in expireWithdrawnAdmissionBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `function transitionBoothStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM booth_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ExhibitionError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE booth_schedules SET status = 'exhibited' WHERE id = ?").run(scheduleId);
}
function expireWithdrawnAdmissionBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM admissions WHERE status = 'withdrawn' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE admissions SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-005"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });

  it("EX-006 PRESENCE — db.transaction() in processBoothRefund (atomic admission_refund_records+admission_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "exhibition.ts",
      `function processBoothRefund(db, exhibitorId, admissionId, boothCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO admission_refund_records (id, exhibitor_id, admission_id, booth_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, exhibitorId, admissionId, boothCost, refundRate, refundAmount);
    db.prepare("INSERT INTO admission_refunds (id, refund_record_id, exhibitor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, exhibitorId, refundAmount, refundedAt);
    db.prepare("UPDATE admission_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["EX-006"]!(src, "exhibition.ts");
    expect(markers).toHaveLength(0);
  });
});

// F538 (세션 306 후속6) — golf domain GF-001~006 via withRuleId (🏆🏆 70번째 도메인 round 마일스톤, 71 Sprint 연속 정점 도전)
// 거울 변환 23회차 (carsharing → ... → exhibition → golf).
// ⛳ SP+SK+GF 스포츠 레저 3-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 통합 추상화 — 단일 클러스터 3 도메인 첫 사례).
describe("golf domain — GF-001~006 via withRuleId (세션 306 후속6 F538, 🏆🏆 70번째 도메인 round 마일스톤)", () => {
  it("GF-001 PRESENCE — active_rounds >= MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `const MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE = 200;
function reserveTeeTime(db, courseId, contractId) {
  const course = db.prepare("SELECT active_rounds, total_capacity FROM courses WHERE id = ?").get(courseId);
  const limit = course.total_capacity ?? MAX_CONCURRENT_ACTIVE_ROUNDS_PER_COURSE;
  if (course.active_rounds >= limit) {
    throw new GolfError('E422-COURSE-CAPACITY-EXCEEDED', 'Course is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-001"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });

  it("GF-002 PRESENCE — round_used + round >= dailyRoundLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `function applyRoundLimit(db, memberId, contractId, round) {
  const contract = db.prepare("SELECT round_used, round_limit FROM member_contracts WHERE id = ? AND member_id = ? LIMIT 1").get(contractId, memberId);
  const dailyRoundLimit = contract.round_limit;
  if (contract.round_used + round >= dailyRoundLimit) {
    throw new GolfError('E422-DAILY-ROUND-LIMIT-EXCEEDED', 'Daily round quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-002"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });

  it("GF-003 PRESENCE — db.transaction() in processTeeOff (atomic rounds+tee_schedules+round_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `function processTeeOff(db, courseId, scheduleId, roundNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO rounds (id, course_id, schedule_id, round_no, status, started_at) VALUES (?, ?, ?, ?, 'teedoff', ?)").run(roundId, courseId, scheduleId, roundNo, startedAt);
    db.prepare("UPDATE tee_schedules SET status = 'teedoff', round_id = ?, round_payment_id = ? WHERE id = ?").run(roundId, roundPaymentId, scheduleId);
    db.prepare("INSERT INTO round_payments (id, schedule_id, round_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(roundPaymentId, scheduleId, roundId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-003"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });

  it("GF-004 PRESENCE — status comparison + 'teedoff'/'updated'/'finished'/'suspended'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `function transitionRoundStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tee_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new GolfError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE tee_schedules SET status = 'teedoff' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-004"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });

  it("GF-005 PRESENCE — batch expire update in expireSuspendedRoundBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `function transitionRoundStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tee_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new GolfError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE tee_schedules SET status = 'teedoff' WHERE id = ?").run(scheduleId);
}
function expireSuspendedRoundBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM rounds WHERE status = 'suspended' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE rounds SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-005"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });

  it("GF-006 PRESENCE — db.transaction() in processCourseRefund (atomic round_refund_records+round_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "golf.ts",
      `function processCourseRefund(db, memberId, roundId, roundCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO round_refund_records (id, member_id, round_id, round_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, memberId, roundId, roundCost, refundRate, refundAmount);
    db.prepare("INSERT INTO round_refunds (id, refund_record_id, member_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, memberId, refundAmount, refundedAt);
    db.prepare("UPDATE round_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["GF-006"]!(src, "golf.ts");
    expect(markers).toHaveLength(0);
  });
});

// F539 (세션 306 후속7) — kpop domain KP-001~006 via withRuleId (🏆 71번째 도메인 마일스톤, 72 Sprint 연속 정점 도전)
// 거울 변환 24회차 (carsharing → ... → golf → kpop).
// 🎤 AM+TH+KP 오프라인 엔터 3-클러스터 확장 (놀이공원 + 극장 + 콘서트 통합 추상화 — 단일 클러스터 3 도메인 두 번째 사례, 한국 특화).
describe("kpop domain — KP-001~006 via withRuleId (세션 306 후속7 F539, 🏆 71번째 도메인 마일스톤)", () => {
  it("KP-001 PRESENCE — active_entries >= MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `const MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA = 50000;
function bookTicket(db, arenaId, contractId) {
  const arena = db.prepare("SELECT active_entries, total_capacity FROM arenas WHERE id = ?").get(arenaId);
  const limit = arena.total_capacity ?? MAX_CONCURRENT_ACTIVE_ENTRIES_PER_ARENA;
  if (arena.active_entries >= limit) {
    throw new KpopError('E422-ARENA-CAPACITY-EXCEEDED', 'Arena is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-001"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });

  it("KP-002 PRESENCE — fan_used + entry >= dailyFanLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `function applyFanLimit(db, fanId, contractId, entry) {
  const contract = db.prepare("SELECT fan_used, fan_limit FROM fan_contracts WHERE id = ? AND fan_id = ? LIMIT 1").get(contractId, fanId);
  const dailyFanLimit = contract.fan_limit;
  if (contract.fan_used + entry >= dailyFanLimit) {
    throw new KpopError('E422-DAILY-FAN-LIMIT-EXCEEDED', 'Daily fan quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-002"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });

  it("KP-003 PRESENCE — db.transaction() in processConcertAdmission (atomic entries+concert_schedules+entry_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `function processConcertAdmission(db, arenaId, scheduleId, entryNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO entries (id, arena_id, schedule_id, entry_no, status, started_at) VALUES (?, ?, ?, ?, 'admitted', ?)").run(entryId, arenaId, scheduleId, entryNo, startedAt);
    db.prepare("UPDATE concert_schedules SET status = 'admitted', entry_id = ?, entry_payment_id = ? WHERE id = ?").run(entryId, entryPaymentId, scheduleId);
    db.prepare("INSERT INTO entry_payments (id, schedule_id, entry_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(entryPaymentId, scheduleId, entryId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-003"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });

  it("KP-004 PRESENCE — status comparison + 'admitted'/'updated'/'ended'/'postponed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `function transitionEntryStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM concert_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new KpopError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE concert_schedules SET status = 'admitted' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-004"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });

  it("KP-005 PRESENCE — batch expire update in expirePostponedEntryBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `function transitionEntryStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM concert_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new KpopError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE concert_schedules SET status = 'admitted' WHERE id = ?").run(scheduleId);
}
function expirePostponedEntryBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM entries WHERE status = 'postponed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE entries SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-005"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });

  it("KP-006 PRESENCE — db.transaction() in processConcertRefund (atomic entry_refund_records+entry_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "kpop.ts",
      `function processConcertRefund(db, fanId, entryId, entryCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO entry_refund_records (id, fan_id, entry_id, entry_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, fanId, entryId, entryCost, refundRate, refundAmount);
    db.prepare("INSERT INTO entry_refunds (id, refund_record_id, fan_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, fanId, refundAmount, refundedAt);
    db.prepare("UPDATE entry_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["KP-006"]!(src, "kpop.ts");
    expect(markers).toHaveLength(0);
  });
});

// F540 (세션 306 후속8) — surfing domain SF-001~006 via withRuleId (🏆🏆 1세션 9 Sprint 신기록 동률 도달, 73 Sprint 연속 정점 도전)
// 거울 변환 25회차 정점 round (carsharing → ... → kpop → surfing).
// 🏄 SP+SK+GF+SF 스포츠 레저 4-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 + 서핑 통합 추상화 — 단일 클러스터 4 도메인 첫 사례).
describe("surfing domain — SF-001~006 via withRuleId (세션 306 후속8 F540, 🏆🏆 1세션 9 Sprint 신기록 동률 도달)", () => {
  it("SF-001 PRESENCE — active_boards >= MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `const MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT = 300;
function reserveBoard(db, spotId, contractId) {
  const spot = db.prepare("SELECT active_boards, total_capacity FROM spots WHERE id = ?").get(spotId);
  const limit = spot.total_capacity ?? MAX_CONCURRENT_ACTIVE_BOARDS_PER_SPOT;
  if (spot.active_boards >= limit) {
    throw new SurfingError('E422-SPOT-CAPACITY-EXCEEDED', 'Spot is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-001"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SF-002 PRESENCE — session_used + session >= dailySessionLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `function applySessionLimit(db, surferId, contractId, session) {
  const contract = db.prepare("SELECT session_used, session_limit FROM surfer_contracts WHERE id = ? AND surfer_id = ? LIMIT 1").get(contractId, surferId);
  const dailySessionLimit = contract.session_limit;
  if (contract.session_used + session >= dailySessionLimit) {
    throw new SurfingError('E422-DAILY-SESSION-LIMIT-EXCEEDED', 'Daily session quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-002"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SF-003 PRESENCE — db.transaction() in processSurfSession (atomic boards+session_schedules+board_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `function processSurfSession(db, spotId, scheduleId, boardNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO boards (id, spot_id, schedule_id, board_no, status, started_at) VALUES (?, ?, ?, ?, 'riding', ?)").run(boardId, spotId, scheduleId, boardNo, startedAt);
    db.prepare("UPDATE session_schedules SET status = 'riding', board_id = ?, board_payment_id = ? WHERE id = ?").run(boardId, boardPaymentId, scheduleId);
    db.prepare("INSERT INTO board_payments (id, schedule_id, board_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(boardPaymentId, scheduleId, boardId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-003"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SF-004 PRESENCE — status comparison + 'riding'/'updated'/'finished'/'suspended'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `function transitionBoardStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM session_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new SurfingError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE session_schedules SET status = 'riding' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-004"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SF-005 PRESENCE — batch expire update in expireSuspendedBoardBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `function transitionBoardStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM session_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new SurfingError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE session_schedules SET status = 'riding' WHERE id = ?").run(scheduleId);
}
function expireSuspendedBoardBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM boards WHERE status = 'suspended' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE boards SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-005"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });

  it("SF-006 PRESENCE — db.transaction() in processSessionRefund (atomic board_refund_records+board_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "surfing.ts",
      `function processSessionRefund(db, surferId, boardId, boardCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO board_refund_records (id, surfer_id, board_id, board_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, surferId, boardId, boardCost, refundRate, refundAmount);
    db.prepare("INSERT INTO board_refunds (id, refund_record_id, surfer_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, surferId, refundAmount, refundedAt);
    db.prepare("UPDATE board_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["SF-006"]!(src, "surfing.ts");
    expect(markers).toHaveLength(0);
  });
});

// F541 (세션 306 후속9) — aquarium domain AQ-001~006 via withRuleId (🏆🏆🏆 1세션 10 Sprint 신기록 도전, 74 Sprint 연속 정점 도전)
// 거울 변환 26회차 (carsharing → ... → surfing → aquarium).
// 🐠 AM+TH+KP+AQ 오프라인 엔터 4-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 통합 추상화 — 단일 클러스터 4 도메인 두 번째 사례, 두 클러스터 동시 4 도메인 첫 사례).
describe("aquarium domain — AQ-001~006 via withRuleId (세션 306 후속9 F541, 🏆🏆🏆 1세션 10 Sprint 신기록 도전)", () => {
  it("AQ-001 PRESENCE — active_admits >= MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `const MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM = 8000;
function bookAdmit(db, aquariumId, contractId) {
  const aquarium = db.prepare("SELECT active_admits, total_capacity FROM aquariums WHERE id = ?").get(aquariumId);
  const limit = aquarium.total_capacity ?? MAX_CONCURRENT_ACTIVE_ADMITS_PER_AQUARIUM;
  if (aquarium.active_admits >= limit) {
    throw new AquariumError('E422-AQUARIUM-CAPACITY-EXCEEDED', 'Aquarium is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-001"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });

  it("AQ-002 PRESENCE — tour_used + tour >= dailyTourLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `function applyTourLimit(db, guestId, contractId, tour) {
  const contract = db.prepare("SELECT tour_used, tour_limit FROM guest_contracts WHERE id = ? AND guest_id = ? LIMIT 1").get(contractId, guestId);
  const dailyTourLimit = contract.tour_limit;
  if (contract.tour_used + tour >= dailyTourLimit) {
    throw new AquariumError('E422-DAILY-TOUR-LIMIT-EXCEEDED', 'Daily tour quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-002"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });

  it("AQ-003 PRESENCE — db.transaction() in processAdmitEntry (atomic admits+tour_schedules+admit_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `function processAdmitEntry(db, aquariumId, scheduleId, admitNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO admits (id, aquarium_id, schedule_id, admit_no, status, started_at) VALUES (?, ?, ?, ?, 'toured', ?)").run(admitId, aquariumId, scheduleId, admitNo, startedAt);
    db.prepare("UPDATE tour_schedules SET status = 'toured', admit_id = ?, admit_payment_id = ? WHERE id = ?").run(admitId, admitPaymentId, scheduleId);
    db.prepare("INSERT INTO admit_payments (id, schedule_id, admit_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(admitPaymentId, scheduleId, admitId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-003"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });

  it("AQ-004 PRESENCE — status comparison + 'toured'/'updated'/'ended'/'closed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `function transitionAdmitStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tour_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new AquariumError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE tour_schedules SET status = 'toured' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-004"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });

  it("AQ-005 PRESENCE — batch expire update in expireClosedAdmitBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `function transitionAdmitStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM tour_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new AquariumError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE tour_schedules SET status = 'toured' WHERE id = ?").run(scheduleId);
}
function expireClosedAdmitBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM admits WHERE status = 'closed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE admits SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-005"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });

  it("AQ-006 PRESENCE — db.transaction() in processTourRefund (atomic admit_refund_records+admit_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "aquarium.ts",
      `function processTourRefund(db, guestId, admitId, admitCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO admit_refund_records (id, guest_id, admit_id, admit_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, guestId, admitId, admitCost, refundRate, refundAmount);
    db.prepare("INSERT INTO admit_refunds (id, refund_record_id, guest_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, guestId, refundAmount, refundedAt);
    db.prepare("UPDATE admit_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["AQ-006"]!(src, "aquarium.ts");
    expect(markers).toHaveLength(0);
  });
});

describe("zoo domain — ZO-001~006 via withRuleId (세션 307 F542, 🦁 단일 클러스터 5 도메인 첫 사례 마일스톤)", () => {
  it("ZO-001 PRESENCE — active_visits >= MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `const MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO = 15000;
function bookVisit(db, zooId, passId) {
  const zoo = db.prepare("SELECT active_visits, total_capacity FROM zoos WHERE id = ?").get(zooId);
  const limit = zoo.total_capacity ?? MAX_CONCURRENT_ACTIVE_VISITS_PER_ZOO;
  if (zoo.active_visits >= limit) {
    throw new ZooError('E422-ZOO-CAPACITY-EXCEEDED', 'Zoo is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-001"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });

  it("ZO-002 PRESENCE — zone_used + zone >= zoneLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `function applyZoneLimit(db, visitorId, passId, zone) {
  const pass = db.prepare("SELECT zone_used, zone_limit FROM visitor_passes WHERE id = ? AND visitor_id = ? LIMIT 1").get(passId, visitorId);
  const zoneLimit = pass.zone_limit;
  if (pass.zone_used + zone >= zoneLimit) {
    throw new ZooError('E422-DAILY-ZONE-LIMIT-EXCEEDED', 'Daily zone quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-002"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });

  it("ZO-003 PRESENCE — db.transaction() in processExhibitEntry (atomic zoo_visits+exhibit_schedules+visit_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `function processExhibitEntry(db, zooId, scheduleId, visitNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO zoo_visits (id, zoo_id, schedule_id, visit_no, status, started_at) VALUES (?, ?, ?, ?, 'visited', ?)").run(visitId, zooId, scheduleId, visitNo, startedAt);
    db.prepare("UPDATE exhibit_schedules SET status = 'visited', visit_id = ?, payment_id = ? WHERE id = ?").run(visitId, visitPaymentId, scheduleId);
    db.prepare("INSERT INTO visit_payments (id, schedule_id, visit_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(visitPaymentId, scheduleId, visitId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-003"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });

  it("ZO-004 PRESENCE — status comparison + 'visited'/'updated'/'ended'/'closed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `function transitionVisitStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM exhibit_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ZooError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE exhibit_schedules SET status = 'visited' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-004"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });

  it("ZO-005 PRESENCE — batch expire update in expireClosedVisitBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `function transitionVisitStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM exhibit_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new ZooError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE exhibit_schedules SET status = 'visited' WHERE id = ?").run(scheduleId);
}
function expireClosedVisitBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM zoo_visits WHERE status = 'closed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE zoo_visits SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-005"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });

  it("ZO-006 PRESENCE — db.transaction() in processVisitRefund (atomic visit_refund_records+visit_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "zoo.ts",
      `function processVisitRefund(db, visitorId, visitId, visitCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO visit_refund_records (id, visitor_id, visit_id, visit_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, visitorId, visitId, visitCost, refundRate, refundAmount);
    db.prepare("INSERT INTO visit_refunds (id, refund_record_id, visitor_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, visitorId, refundAmount, refundedAt);
    db.prepare("UPDATE visit_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["ZO-006"]!(src, "zoo.ts");
    expect(markers).toHaveLength(0);
  });
});

describe("museum domain — MS-001~006 via withRuleId (세션 307 F543, 🏛️ 단일 클러스터 6 도메인 첫 사례 마일스톤)", () => {
  it("MS-001 PRESENCE — active_visits >= MAX_CONCURRENT_VISITORS_PER_MUSEUM threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `const MAX_CONCURRENT_VISITORS_PER_MUSEUM = 5000;
function bookAdmission(db, museumId, passId) {
  const museum = db.prepare("SELECT active_visits, total_capacity FROM museums WHERE id = ?").get(museumId);
  const limit = museum.total_capacity ?? MAX_CONCURRENT_VISITORS_PER_MUSEUM;
  if (museum.active_visits >= limit) {
    throw new MuseumError('E422-MUSEUM-CAPACITY-EXCEEDED', 'Museum is at full capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-001"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });

  it("MS-002 PRESENCE — gallery_used + galleries >= galleryLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `function applyGalleryLimit(db, memberId, cardId, galleries) {
  const card = db.prepare("SELECT gallery_used, gallery_limit FROM member_cards WHERE id = ? AND member_id = ? LIMIT 1").get(cardId, memberId);
  const galleryLimit = card.gallery_limit;
  if (card.gallery_used + galleries >= galleryLimit) {
    throw new MuseumError('E422-DAILY-GALLERY-LIMIT-EXCEEDED', 'Daily gallery quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-002"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });

  it("MS-003 PRESENCE — db.transaction() in processGalleryEntry (atomic museum_visits+gallery_schedules+visit_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `function processGalleryEntry(db, museumId, scheduleId, visitNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO museum_visits (id, museum_id, schedule_id, visit_no, status, started_at) VALUES (?, ?, ?, ?, 'visited', ?)").run(visitId, museumId, scheduleId, visitNo, startedAt);
    db.prepare("UPDATE gallery_schedules SET status = 'visited', visit_id = ?, payment_id = ? WHERE id = ?").run(visitId, visitPaymentId, scheduleId);
    db.prepare("INSERT INTO visit_payments (id, schedule_id, visit_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(visitPaymentId, scheduleId, visitId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-003"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });

  it("MS-004 PRESENCE — status comparison + 'visited'/'updated'/'ended'/'closed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `function transitionGalleryStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM gallery_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new MuseumError("E409-SCHEDULE", "Invalid transition", 409);
  db.prepare("UPDATE gallery_schedules SET status = 'visited' WHERE id = ?").run(scheduleId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-004"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });

  it("MS-005 PRESENCE — batch expire update in expireClosedGalleryBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `function transitionGalleryStatus(db, scheduleId, newStatus) {
  const schedule = db.prepare("SELECT status FROM gallery_schedules WHERE id = ?").get(scheduleId);
  if (schedule.status === 'cancelled') throw new MuseumError("E409-SCHEDULE", "Invalid", 409);
  db.prepare("UPDATE gallery_schedules SET status = 'visited' WHERE id = ?").run(scheduleId);
}
function expireClosedGalleryBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM museum_visits WHERE status = 'closed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE museum_visits SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-005"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });

  it("MS-006 PRESENCE — db.transaction() in processAdmissionRefund (atomic visit_refund_records+visit_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "museum.ts",
      `function processAdmissionRefund(db, memberId, visitId, visitCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO visit_refund_records (id, member_id, visit_id, visit_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, memberId, visitId, visitCost, refundRate, refundAmount);
    db.prepare("INSERT INTO visit_refunds (id, refund_record_id, member_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, memberId, refundAmount, refundedAt);
    db.prepare("UPDATE visit_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MS-006"]!(src, "museum.ts");
    expect(markers).toHaveLength(0);
  });
});

describe("movie domain — MV-001~006 via withRuleId (세션 307 후속2 F544, 🎬 단일 클러스터 7 도메인 첫 사례 마일스톤)", () => {
  it("MV-001 PRESENCE — active_screenings >= MAX_CONCURRENT_SCREENINGS_PER_THEATER threshold (UPPERCASE constant)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `const MAX_CONCURRENT_SCREENINGS_PER_THEATER = 20;
function bookSeat(db, theaterId, passId) {
  const theater = db.prepare("SELECT active_screenings, total_screening_capacity FROM theaters WHERE id = ?").get(theaterId);
  const limit = theater.total_screening_capacity ?? MAX_CONCURRENT_SCREENINGS_PER_THEATER;
  if (theater.active_screenings >= limit) {
    throw new MovieError('E422-THEATER-SCREENING-LIMIT-EXCEEDED', 'Theater is at full screening capacity', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-001"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
  });

  it("MV-002 PRESENCE — ticket_used + tickets >= ticketLimit (var-vs-var, limit keyword)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `function applyTicketLimit(db, memberId, passId, tickets) {
  const pass = db.prepare("SELECT ticket_used, ticket_limit FROM member_passes WHERE id = ? AND member_id = ? LIMIT 1").get(passId, memberId);
  const ticketLimit = pass.ticket_limit;
  if (pass.ticket_used + tickets >= ticketLimit) {
    throw new MovieError('E422-DAILY-TICKET-LIMIT-EXCEEDED', 'Daily ticket quota exhausted', 422);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-002"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
  });

  it("MV-003 PRESENCE — db.transaction() in processSeatEntry (atomic theater_visits+screenings+ticket_payments INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `function processSeatEntry(db, theaterId, screeningId, visitNo, amount) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO theater_visits (id, theater_id, screening_id, visit_no, status, started_at) VALUES (?, ?, ?, ?, 'watched', ?)").run(visitId, theaterId, screeningId, visitNo, startedAt);
    db.prepare("UPDATE screenings SET status = 'watched', visit_id = ?, payment_id = ? WHERE id = ?").run(visitId, ticketPaymentId, screeningId);
    db.prepare("INSERT INTO ticket_payments (id, screening_id, visit_id, amount, status, paid_at) VALUES (?, ?, ?, ?, 'paid', ?)").run(ticketPaymentId, screeningId, visitId, amount, startedAt);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-003"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
  });

  it("MV-004 PRESENCE — status comparison + 'watched'/'ended'/'closed'/'cancelled' SQL assignment (status transition)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `function transitionScreeningStatus(db, screeningId, newStatus) {
  const screening = db.prepare("SELECT status FROM screenings WHERE id = ?").get(screeningId);
  if (screening.status === 'cancelled') throw new MovieError("E409-SCREENING", "Invalid transition", 409);
  db.prepare("UPDATE screenings SET status = 'watched' WHERE id = ?").run(screeningId);
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-004"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
  });

  it("MV-005 PRESENCE — batch expire update in expireClosedScreeningBatch (file context)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `function transitionScreeningStatus(db, screeningId, newStatus) {
  const screening = db.prepare("SELECT status FROM screenings WHERE id = ?").get(screeningId);
  if (screening.status === 'cancelled') throw new MovieError("E409-SCREENING", "Invalid", 409);
  db.prepare("UPDATE screenings SET status = 'watched' WHERE id = ?").run(screeningId);
}
function expireClosedScreeningBatch(db, now) {
  const candidates = db.prepare("SELECT id FROM theater_visits WHERE status = 'closed' AND started_at <= ?").all(now);
  for (const item of candidates) {
    db.prepare("UPDATE theater_visits SET status = 'expired' WHERE id = ?").run(item.id);
  }
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-005"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
  });

  it("MV-006 PRESENCE — db.transaction() in processTicketRefund (atomic ticket_refund_records+ticket_refunds INSERT/UPDATE)", () => {
    const src = parseTypeScriptSource(
      "movie.ts",
      `function processTicketRefund(db, memberId, visitId, ticketCost, refundRate) {
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO ticket_refund_records (id, member_id, visit_id, ticket_cost, refund_rate, refund_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'calculated')").run(refundRecordId, memberId, visitId, ticketCost, refundRate, refundAmount);
    db.prepare("INSERT INTO ticket_refunds (id, refund_record_id, member_id, amount, status, refunded_at) VALUES (?, ?, ?, ?, 'refunded', ?)").run(refundId, refundRecordId, memberId, refundAmount, refundedAt);
    db.prepare("UPDATE ticket_refund_records SET status = 'refunded' WHERE id = ?").run(refundRecordId);
  });
  tx();
}`,
    );
    const markers = BL_DETECTOR_REGISTRY["MV-006"]!(src, "movie.ts");
    expect(markers).toHaveLength(0);
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
