import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPii, applyTokens, tokenize } from "../masking/tokenizer.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
      }),
    }),
    batch: vi.fn().mockResolvedValue([]),
  } as unknown as D1Database;
}

// ── detectPii ───────────────────────────────────────────────────

describe("detectPii", () => {
  it("detects a single SSN (주민등록번호)", () => {
    const detections = detectPii("주민번호: 901231-1234567");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_SSN");
    expect(detections[0]?.original).toBe("901231-1234567");
  });

  it("detects a single email", () => {
    const detections = detectPii("이메일: admin@test.com");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_EMAIL");
    expect(detections[0]?.original).toBe("admin@test.com");
  });

  it("detects a single phone number", () => {
    const detections = detectPii("전화: 010-1234-5678");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_PHONE");
    expect(detections[0]?.original).toBe("010-1234-5678");
  });

  it("detects a card number", () => {
    const detections = detectPii("카드: 1234-5678-9012-3456");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_CARD");
    expect(detections[0]?.original).toBe("1234-5678-9012-3456");
  });

  it("detects a 법인등록번호 (CORP_ID)", () => {
    const detections = detectPii("법인번호: 123456-5678901");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_CORP_ID");
    expect(detections[0]?.original).toBe("123456-5678901");
  });

  it("detects an account number", () => {
    const detections = detectPii("계좌: 110-12-123456");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_ACCOUNT");
    expect(detections[0]?.original).toBe("110-12-123456");
  });

  it("detects multiple different PII types in a single text", () => {
    const text = "이름: 홍길동, 주민번호: 901231-1234567, 이메일: test@example.com, 전화: 010-9999-8888";
    const detections = detectPii(text);
    const types = detections.map((d) => d.entityType).sort();
    expect(types).toContain("PII_SSN");
    expect(types).toContain("PII_EMAIL");
    expect(types).toContain("PII_PHONE");
  });

  it("assigns a token in [PII:TYPE:hex] format", () => {
    const detections = detectPii("test@example.com");
    expect(detections).toHaveLength(1);
    expect(detections[0]?.token).toMatch(/^\[PII:EMAIL:[0-9a-f]{6}\]$/);
  });

  it("assigns same token for same value appearing multiple times", () => {
    const text = "연락처: 010-1234-5678, 확인: 010-1234-5678";
    const detections = detectPii(text);
    expect(detections).toHaveLength(2);
    expect(detections[0]?.token).toBe(detections[1]?.token);
  });

  it("assigns different tokens for different values", () => {
    const text = "A: 010-1111-2222, B: 010-3333-4444";
    const detections = detectPii(text);
    expect(detections).toHaveLength(2);
    expect(detections[0]?.token).not.toBe(detections[1]?.token);
  });

  it("returns empty array when no PII found", () => {
    const detections = detectPii("아무런 개인정보가 없는 텍스트입니다.");
    expect(detections).toHaveLength(0);
  });

  it("removes overlapping matches (SSN takes priority over ACCOUNT for same position)", () => {
    // 901231-1234567 matches both SSN (6-[1-4]7) and could partially match ACCOUNT.
    // SSN pattern is ordered before ACCOUNT, so SSN wins via overlap removal.
    const text = "901231-1234567";
    const detections = detectPii(text);
    expect(detections).toHaveLength(1);
    expect(detections[0]?.entityType).toBe("PII_SSN");
  });

  it("returns detections sorted by position descending (for safe replacement)", () => {
    const text = "이메일: test@a.com, 전화: 010-1234-5678";
    const detections = detectPii(text);
    expect(detections.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < detections.length; i++) {
      const prev = detections[i - 1];
      const curr = detections[i];
      if (prev && curr) {
        expect(prev.start).toBeGreaterThanOrEqual(curr.start);
      }
    }
  });
});

// ── applyTokens ─────────────────────────────────────────────────

describe("applyTokens", () => {
  it("replaces PII with tokens in the text", () => {
    const text = "이메일: test@example.com";
    const detections = detectPii(text);
    const masked = applyTokens(text, detections);
    expect(masked).not.toContain("test@example.com");
    expect(masked).toContain("[PII:EMAIL:");
  });

  it("preserves surrounding text", () => {
    const text = "전화: 010-1234-5678 입니다.";
    const detections = detectPii(text);
    const masked = applyTokens(text, detections);
    expect(masked).toContain("전화: ");
    expect(masked).toContain(" 입니다.");
    expect(masked).not.toContain("010-1234-5678");
  });

  it("replaces multiple PII values correctly", () => {
    const text = "SSN: 901231-1234567, 이메일: user@test.com";
    const detections = detectPii(text);
    const masked = applyTokens(text, detections);
    expect(masked).not.toContain("901231-1234567");
    expect(masked).not.toContain("user@test.com");
    expect(masked).toContain("[PII:SSN:");
    expect(masked).toContain("[PII:EMAIL:");
  });

  it("returns original text when no detections", () => {
    const text = "아무것도 없습니다.";
    const masked = applyTokens(text, []);
    expect(masked).toBe(text);
  });

  it("handles same value appearing multiple times", () => {
    const text = "A: 010-1234-5678, B: 010-1234-5678";
    const detections = detectPii(text);
    const masked = applyTokens(text, detections);
    expect(masked).not.toContain("010-1234-5678");
    // Both occurrences replaced with same token
    const token = detections[0]?.token ?? "";
    const occurrences = masked.split(token).length - 1;
    expect(occurrences).toBe(2);
  });
});

// ── tokenize (full pipeline) ────────────────────────────────────

describe("tokenize", () => {
  let db: D1Database;

  beforeEach(() => {
    db = mockDb();
  });

  it("returns unmodified text for 'public' classification", async () => {
    const result = await tokenize("doc-1", "주민번호: 901231-1234567", "public", db);
    expect(result.maskedText).toBe("주민번호: 901231-1234567");
    expect(result.tokenCount).toBe(0);
    expect(result.tokens).toHaveLength(0);
    expect(result.dataClassification).toBe("public");
  });

  it("masks PII for 'internal' classification", async () => {
    const result = await tokenize("doc-2", "이메일: admin@corp.com", "internal", db);
    expect(result.maskedText).not.toContain("admin@corp.com");
    expect(result.tokenCount).toBe(1);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]?.entityType).toBe("PII_EMAIL");
    expect(result.dataClassification).toBe("internal");
  });

  it("masks PII for 'confidential' classification", async () => {
    const result = await tokenize("doc-3", "전화: 010-9999-8888", "confidential", db);
    expect(result.maskedText).not.toContain("010-9999-8888");
    expect(result.tokenCount).toBe(1);
    expect(result.dataClassification).toBe("confidential");
  });

  it("persists tokens to D1 when PII is found", async () => {
    await tokenize("doc-4", "SSN: 901231-1234567", "internal", db);
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it("does not persist to D1 when no PII is found", async () => {
    await tokenize("doc-5", "아무런 개인정보 없음", "internal", db);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("does not persist to D1 for public classification", async () => {
    await tokenize("doc-6", "주민번호: 901231-1234567", "public", db);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("returns correct documentId in response", async () => {
    const result = await tokenize("doc-42", "test@a.com", "internal", db);
    expect(result.documentId).toBe("doc-42");
  });

  it("returns tokens sorted by position ascending", async () => {
    const text = "이메일: test@a.com, 전화: 010-1234-5678";
    const result = await tokenize("doc-7", text, "internal", db);
    expect(result.tokens.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.tokens.length; i++) {
      const prev = result.tokens[i - 1];
      const curr = result.tokens[i];
      if (prev && curr) {
        expect(curr.position).toBeGreaterThan(prev.position);
      }
    }
  });

  it("deduplicates tokens before persisting to D1", async () => {
    const text = "A: 010-1234-5678, B: 010-1234-5678";
    await tokenize("doc-8", text, "internal", db);
    // batch receives an array of prepared statements — should only have 1 (deduplicated)
    const batchCall = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const stmts = batchCall[0] as unknown[];
    expect(stmts).toHaveLength(1);
  });

  it("handles text with many PII types simultaneously", async () => {
    const text = "SSN: 901231-1234567, 이메일: x@y.com, 전화: 010-1111-2222, 계좌: 110-12-123456";
    const result = await tokenize("doc-9", text, "internal", db);
    expect(result.tokenCount).toBeGreaterThanOrEqual(4);
    expect(result.maskedText).not.toContain("901231-1234567");
    expect(result.maskedText).not.toContain("x@y.com");
    expect(result.maskedText).not.toContain("010-1111-2222");
    expect(result.maskedText).not.toContain("110-12-123456");
  });
});
