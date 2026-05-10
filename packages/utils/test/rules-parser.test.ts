import { describe, it, expect } from "vitest";
import { parseRulesMarkdown } from "../src/divergence/rules-parser.js";

describe("rules-parser — parseRulesMarkdown", () => {
  it("extracts BL rows from a well-formed table", () => {
    const md = `# Header

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-024 | 미사용 환불 요청 시 | 7일 이내 | 전액 환불 | 7일 초과 거부 |
| BL-026 | 캐시백 환불 시 | 캐시백 금액 | 현금 환불 불가 | 미정의 |
| BL-029 | 만료 환불 시 | 유효기간 만료 | 거부 | 강제환불 예외 |

## 다른 섹션`;

    const rules = parseRulesMarkdown(md);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({
      id: "BL-024",
      condition: "미사용 환불 요청 시",
      criteria: "7일 이내",
      outcome: "전액 환불",
      exception: "7일 초과 거부",
    });
    expect(rules[1]?.id).toBe("BL-026");
    expect(rules[2]?.id).toBe("BL-029");
  });

  it("returns [] when no header found", () => {
    const md = `# 그냥 마크다운\n\n본문에 BL 테이블 없음.\n`;
    expect(parseRulesMarkdown(md)).toEqual([]);
  });

  it("skips rows with invalid BL ID format", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BL-024 | a | b | c | d |
| BL-X | bad | id | row | skip |
| FN-001 | not | bl | row | skip |
| BL-029 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["BL-024", "BL-029"]);
  });

  it("stops at empty line (does not bleed into second table)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BL-020 | a | b | c | d |
| BL-021 | a | b | c | d |

| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BL-099 | should not | be in | output | here |
`;
    const rules = parseRulesMarkdown(md);
    // 본 파서는 첫 테이블만 추출, 빈 줄에서 종료
    expect(rules.map((r) => r.id)).toEqual(["BL-020", "BL-021"]);
  });

  // F428 Sprint 261 — multi-domain support
  it("matches gift BL-G001 prefix format", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BL-G001 | a | b | c | d |
| BL-G002 | a | b | c | d |
| BL-G006 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["BL-G001", "BL-G002", "BL-G006"]);
  });

  it("handles settlement 6-column row (extra policyId column ignored)", () => {
    const md = `| ID | condition | criteria | outcome | exception | policyId |
|----|-----------|----------|---------|-----------|----------|
| BL-031 | a | b | c | d | POL-X |
| BL-036 | a | b | c | d | POL-Y |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.id).toBe("BL-031");
    expect(rules[0]?.exception).toBe("d");
  });

  it("matches budget BB-NNN prefix (Sprint 266 F433)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BB-001 | a | b | c | d |
| BB-005 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["BB-001", "BB-005"]);
  });

  it("matches purchase BP-NNN prefix (Sprint 266 F433)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BP-001 | a | b | c | d |
| BP-004 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["BP-001", "BP-004"]);
  });

  it("matches pension P-NNN prefix (Sprint 269 F436)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| P-001 | a | b | c | d |
| P-007 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["P-001", "P-007"]);
  });

  it("rejects P- without digits (boundary)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| P- | a | b | c | d |
| P-A | a | b | c | d |
| P-001 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["P-001"]);
  });

  it("matches telemedicine TM-NNN prefix (Sprint 318 F484, 33번째 신규 산업)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| TM-001 | a | b | c | d |
| TM-006 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["TM-001", "TM-006"]);
  });

  it("matches veterinary VT-NNN prefix (Sprint 319 F485, 34번째 신규 산업)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| VT-001 | a | b | c | d |
| VT-006 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual(["VT-001", "VT-006"]);
  });

  it("rejects invalid prefix patterns (BL- without digits, BL-A only)", () => {
    const md = `| ID | condition | criteria | outcome | exception |
|----|-----------|----------|---------|-----------|
| BL- | a | b | c | d |
| BL-A | a | b | c | d |
| BL-1 | a | b | c | d |
| BL-001 | a | b | c | d |
| BL-G99 | a | b | c | d |
`;
    const rules = parseRulesMarkdown(md);
    // 매칭: 1+ digit (BL-1, BL-001) + optional prefix (BL-G99)
    // 거부: BL- (digit 부재), BL-A (digit 부재)
    expect(rules.map((r) => r.id)).toEqual(["BL-1", "BL-001", "BL-G99"]);
  });

  it("parses real refund-rules.md structure (BL-020 ~ BL-030)", () => {
    const md = `# Spec Container — POL-LPON-REFUND-001

## 비즈니스 룰

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| BL-020 | 거래 환불 요청이 접수될 때 | rfndPsbltyYn = 'Y' | 환불 처리를 진행한다 | rfndPsbltyYn = 'N'이면 환불 거부 |
| BL-021 | 환불 가능 여부 체크를 통과한 경우 | 환불 가능 조건 충족 | 입금 처리를 진행한다 | 조건 미충족 시 환불 거부 |
| BL-024 | 미사용 상품권 환불 요청 시 | 구매 후 7일 이내 환불 요청 | 전액 환불 처리한다 | 7일 초과 시 환불 불가 |
| BL-026 | 캐시백 또는 할인보전 금액 환불 요청 시 | 캐시백 및 할인보전 금액에 해당 | 현금 환불 불가 | [미정의] |
| BL-029 | 유효기간 만료 상품권 환불 요청 시 | 원칙적으로 환불 불가 | 환불을 거부한다 | 강성 민원 시 강제환불 |
`;
    const rules = parseRulesMarkdown(md);
    expect(rules.map((r) => r.id)).toEqual([
      "BL-020",
      "BL-021",
      "BL-024",
      "BL-026",
      "BL-029",
    ]);
    const bl024 = rules.find((r) => r.id === "BL-024");
    expect(bl024?.criteria).toContain("7일");
  });
});
