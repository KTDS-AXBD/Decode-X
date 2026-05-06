/**
 * F428 (Sprint 261) — Multi-domain mapping.
 *
 * spec-container ↔ rules.md ↔ source code ↔ provenance.yaml의 4-tuple 매핑.
 * sourcePath: null → spec-only 도메인 (source code 부재, detector 실행 skip).
 *
 * 신규 도메인 추가 시 본 배열에 명시 (의도적 hardcoding으로 명시성 확보).
 */
export interface DomainMapping {
  container: string;
  rulesPath: string;
  sourcePath: string | null;
  provenancePath: string;
  sourceCodeStatus: "present" | "spec-only";
  /**
   * BL-027 (under-implementation) detector를 적용할 함수명 화이트리스트.
   * 미지정 시 detector는 모든 함수에 적용되어 mock/helper 함수에 false positive.
   * refund 도메인은 `processRefundRequest` + `approveRefund` 양쪽 검증 필요.
   */
  underImplTargets?: string[];
}

const SPEC_CONTAINER_BASE = ".decode-x/spec-containers";
const DOMAIN_SOURCE_BASE = "반제품-스펙/pilot-lpon-cancel/working-version/src/domain";

export const DOMAIN_MAP: DomainMapping[] = [
  {
    container: "lpon-refund",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-refund/rules/refund-rules.md`,
    sourcePath: `${DOMAIN_SOURCE_BASE}/refund.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-refund/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: ["processRefundRequest", "approveRefund", "rejectRefund"],
  },
  {
    container: "lpon-charge",
    // 주의: spec-container는 "lpon-charge"이지만 source 파일은 "charging.ts" (이름 차이)
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-charge/rules/charge-rules.md`,
    sourcePath: `${DOMAIN_SOURCE_BASE}/charging.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-charge/provenance.yaml`,
    sourceCodeStatus: "present",
  },
  {
    container: "lpon-payment",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-payment/rules/payment-rules.md`,
    sourcePath: `${DOMAIN_SOURCE_BASE}/payment.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-payment/provenance.yaml`,
    sourceCodeStatus: "present",
  },
  {
    container: "lpon-gift",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-gift/rules/gift-rules.md`,
    // Sprint 264 (F431): gift source PoC — 5 BL G002~G006 PRESENCE 자동 입증.
    sourcePath: `${DOMAIN_SOURCE_BASE}/gift.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-gift/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "acceptGift",
      "rejectGift",
      "expireGift",
      "cancelGift",
      "transferGiftBalance",
    ],
  },
  {
    container: "lpon-settlement",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-settlement/rules/settlement-rules.md`,
    sourcePath: null,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-settlement/provenance.yaml`,
    sourceCodeStatus: "spec-only",
  },
  {
    container: "lpon-budget",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-budget/rules/budget-rules.md`,
    sourcePath: null,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-budget/provenance.yaml`,
    sourceCodeStatus: "spec-only",
  },
  {
    container: "lpon-purchase",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-purchase/rules/purchase-rules.md`,
    sourcePath: null,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-purchase/provenance.yaml`,
    sourceCodeStatus: "spec-only",
  },
];

export function findDomainMapping(container: string): DomainMapping | undefined {
  return DOMAIN_MAP.find((m) => m.container === container);
}
