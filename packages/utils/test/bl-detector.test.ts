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

describe("BL_DETECTOR_REGISTRY", () => {
  it("exposes 17 detectors (Sprint 264 F431 — gift 5 BL added)", () => {
    expect(Object.keys(BL_DETECTOR_REGISTRY).sort()).toEqual([
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
      "BL-G002",
      "BL-G003",
      "BL-G004",
      "BL-G005",
      "BL-G006",
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
