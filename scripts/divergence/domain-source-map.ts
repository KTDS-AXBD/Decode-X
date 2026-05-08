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
    sourcePath: `${DOMAIN_SOURCE_BASE}/settlement.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-settlement/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "runBatchSettlement",
      "processCalculations",
      "getSettlementCheck",
      "applyFeeAdjustment",
    ],
  },
  {
    container: "lpon-budget",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-budget/rules/budget-rules.md`,
    // Sprint 266 (F433): budget source PoC — 5 BL BB-001~005 PRESENCE 자동 입증.
    sourcePath: `${DOMAIN_SOURCE_BASE}/budget.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-budget/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "allocateBudget",
      "deductForCharge",
      "checkLowBalanceAlert",
      "rolloverBudget",
      "refundDeductedBudget",
    ],
  },
  {
    container: "lpon-purchase",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-purchase/rules/purchase-rules.md`,
    // Sprint 266 (F433): purchase source PoC — 5 BL BP-001~005 PRESENCE 자동 입증.
    sourcePath: `${DOMAIN_SOURCE_BASE}/purchase.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-purchase/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "requestPurchase",
      "completePurchase",
      "checkMonthlyLimit",
      "handleIdempotentPurchase",
      "refundUnusedPurchase",
    ],
  },
  {
    container: "miraeasset-pension",
    rulesPath: `${SPEC_CONTAINER_BASE}/miraeasset-pension/rules/pension-rules.md`,
    // Sprint 269 (F436): Miraeasset 퇴직연금 source PoC — 7 BL P-001~P-007 PRESENCE 자동 입증.
    sourcePath: `${DOMAIN_SOURCE_BASE}/pension.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/miraeasset-pension/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "validateEnrollmentEligibility",
      "checkAnnualAccumulationLimit",
      "requestEarlyWithdrawal",
      "initiateReceiptPayout",
      "applyTaxBenefit",
      "terminatePlan",
      "disbursePrincipalAndInterest",
    ],
  },
  {
    container: "generic-voucher",
    rulesPath: `${SPEC_CONTAINER_BASE}/generic-voucher/rules/voucher-rules.md`,
    // Sprint 274 (F440): Generic Voucher 합성 도메인 PoC — 6 BL V-001~V-006 PRESENCE 자동 입증.
    // 9번째 도메인 (LPON 7 + miraeasset-pension 8 + generic-voucher 9). 신규 detector 0개.
    sourcePath: `${DOMAIN_SOURCE_BASE}/voucher.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/generic-voucher/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "issueVoucher",
      "useVoucher",
      "redeemVoucher",
      "autoDestroyVoucher",
      "refundVoucher",
      "transferVoucher",
    ],
  },
  {
    container: "loyalty-points",
    rulesPath: `${SPEC_CONTAINER_BASE}/loyalty-points/rules/loyalty-rules.md`,
    // Sprint 275 (F441): Loyalty Points 합성 도메인 PoC — 6 BL LP-001~LP-006 PRESENCE 자동 입증.
    // 10번째 도메인. 신규 detector 0개. 2글자 prefix 'LP' 첫 도입.
    sourcePath: `${DOMAIN_SOURCE_BASE}/loyalty.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/loyalty-points/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "earnPoints",
      "usePoints",
      "redeemPoints",
      "expirePoints",
      "promoteGrade",
      "clawbackOnRefund",
    ],
  },
  {
    container: "lpon-cancel",
    rulesPath: `${SPEC_CONTAINER_BASE}/lpon-cancel/rules/cancel-rules.md`,
    // Sprint 277 (F443): lpon-payment의 cancel sub-flow 분리 — 11번째 도메인 활성화.
    // 신규 BL은 BL-042 (network cancel) 1건. BL-014/016/017은 lpon-payment reference.
    // 신규 detector 0개 — withRuleId 재사용 (AtomicTransaction).
    sourcePath: `${DOMAIN_SOURCE_BASE}/cancel.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lpon-cancel/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "processCancel",
      "processNetworkCancel",
    ],
  },
  {
    container: "credit-card",
    rulesPath: `${SPEC_CONTAINER_BASE}/credit-card/rules/credit-card-rules.md`,
    // Sprint 278 (F444): Credit Card 합성 도메인 — 12번째 도메인 (LPON 외 첫 산업 다양성).
    // CC-001~CC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 10 Sprint 연속 정점 (S264~S278).
    sourcePath: `${DOMAIN_SOURCE_BASE}/credit-card.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/credit-card/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "issueCard",
      "checkPaymentLimit",
      "approvePayment",
      "transitionCardStatus",
      "markDelinquentCards",
      "cancelTransaction",
    ],
  },
];

export function findDomainMapping(container: string): DomainMapping | undefined {
  return DOMAIN_MAP.find((m) => m.container === container);
}
