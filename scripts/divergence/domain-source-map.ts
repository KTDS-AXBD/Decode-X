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
  {
    container: "delivery",
    rulesPath: `${SPEC_CONTAINER_BASE}/delivery/rules/delivery-rules.md`,
    // Sprint 283 (F449): Delivery 합성 도메인 — 13번째 도메인 (배송 산업 다양성).
    // DV-001~DV-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 11 Sprint 연속 정점 (S264~S283).
    // detector 신뢰도 5 Sprint cascade (S278~S282) 완전 활용.
    sourcePath: `${DOMAIN_SOURCE_BASE}/delivery.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/delivery/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "requestDelivery",
      "checkRegionLimit",
      "startShipping",
      "transitionDeliveryStatus",
      "markDelayedDeliveries",
      "cancelAndReturn",
    ],
  },
  {
    container: "subscription",
    rulesPath: `${SPEC_CONTAINER_BASE}/subscription/rules/subscription-rules.md`,
    // Sprint 284 (F450): Subscription 합성 도메인 — 14번째 도메인 (SaaS 구독 산업 다양성).
    // SB-001~SB-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 12 Sprint 연속 정점 (S264~S284).
    // 3번째 신규 산업 도메인 (CC S278 + DV S283 + SB S284).
    sourcePath: `${DOMAIN_SOURCE_BASE}/subscription.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/subscription/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "createSubscription",
      "checkAutoChargeLimit",
      "autoRenew",
      "transitionSubscriptionStatus",
      "markExpiredSubscriptions",
      "cancelWithRefund",
    ],
  },
  {
    container: "insurance",
    rulesPath: `${SPEC_CONTAINER_BASE}/insurance/rules/insurance-rules.md`,
    // Sprint 285 (F451): Insurance 합성 도메인 — 15번째 도메인 (보험 산업, 4번째 신규 산업).
    // IN-001~IN-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 13 Sprint 연속 정점 (S264~S285).
    // 4번째 신규 산업 도메인 (CC + DV + SB + IN).
    sourcePath: `${DOMAIN_SOURCE_BASE}/insurance.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/insurance/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "issuePolicy",
      "checkClaimLimit",
      "approveClaim",
      "transitionPolicyStatus",
      "markExpiredPolicies",
      "rejectClaimWithRefund",
    ],
  },
  {
    container: "healthcare",
    rulesPath: `${SPEC_CONTAINER_BASE}/healthcare/rules/healthcare-rules.md`,
    // Sprint 286 (F452): Healthcare 합성 도메인 — 16번째 도메인 (의료 산업, 5번째 신규 산업).
    // HC-001~HC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 14 Sprint 연속 정점 (S264~S286).
    // 5번째 신규 산업 도메인 (CC + DV + SB + IN + HC).
    sourcePath: `${DOMAIN_SOURCE_BASE}/healthcare.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/healthcare/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerPatient",
      "checkDosageLimit",
      "bookAppointment",
      "transitionAppointmentStatus",
      "markExpiredPrescriptions",
      "cancelAppointmentWithRefund",
    ],
  },
  {
    container: "education",
    rulesPath: `${SPEC_CONTAINER_BASE}/education/rules/education-rules.md`,
    // Sprint 287 (F453): Education 합성 도메인 — 17번째 도메인 (교육 산업, 6번째 신규 산업).
    // ED-001~ED-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 15 Sprint 연속 정점 (S264~S287).
    // 6번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED).
    sourcePath: `${DOMAIN_SOURCE_BASE}/education.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/education/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerStudent",
      "checkCreditsLimit",
      "enrollCourse",
      "transitionEnrollmentStatus",
      "markFailedEnrollmentsByTerm",
      "withdrawEnrollmentWithRefund",
    ],
  },
  {
    container: "realestate",
    rulesPath: `${SPEC_CONTAINER_BASE}/realestate/rules/realestate-rules.md`,
    // Sprint 288 (F454): Real Estate 합성 도메인 — 18번째 도메인 (부동산 산업, 7번째 신규 산업).
    // RE-001~RE-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 16 Sprint 연속 정점 (S264~S288).
    // 7번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE).
    sourcePath: `${DOMAIN_SOURCE_BASE}/realestate.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/realestate/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "listProperty",
      "checkRentAffordabilityLimit",
      "signLease",
      "transitionLeaseStatus",
      "markExpiringLeases",
      "cancelLeaseWithRefund",
    ],
  },
  {
    container: "logistics",
    rulesPath: `${SPEC_CONTAINER_BASE}/logistics/rules/logistics-rules.md`,
    // Sprint 289 (F455): Logistics 합성 도메인 — 19번째 도메인 (물류 산업, 8번째 신규 산업).
    // LG-001~LG-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 17 Sprint 연속 정점 (S264~S278+S283~S289).
    // 8번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG).
    sourcePath: `${DOMAIN_SOURCE_BASE}/logistics.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/logistics/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "checkShipmentLimits",
      "optimizeRoute",
      "clearCustoms",
      "transitionDeliveryStatus",
      "markStaleInventory",
      "processReturnRma",
    ],
  },
  {
    container: "hospitality",
    rulesPath: `${SPEC_CONTAINER_BASE}/hospitality/rules/hospitality-rules.md`,
    // Sprint 290 (F456): Hospitality 합성 도메인 — 20번째 도메인 (숙박 산업, 9번째 신규 산업).
    // HO-001~HO-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 18 Sprint 연속 정점 (S264~S278+S283~S290).
    // 9번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO).
    sourcePath: `${DOMAIN_SOURCE_BASE}/hospitality.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/hospitality/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookRoom",
      "applyCancellationPolicy",
      "processCheckIn",
      "transitionBookingStatus",
      "markHousekeepingComplete",
      "handleOverbookingCompensation",
    ],
  },
  {
    container: "travel",
    rulesPath: `${SPEC_CONTAINER_BASE}/travel/rules/travel-rules.md`,
    // Sprint 291 (F457): Travel 합성 도메인 — 21번째 도메인 (여행 산업, 10번째 신규 산업).
    // TR-001~TR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 19 Sprint 연속 정점 (S264~S278+S283~S291).
    // 10번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR).
    sourcePath: `${DOMAIN_SOURCE_BASE}/travel.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/travel/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookFlight",
      "upgradeFareClass",
      "confirmItinerary",
      "transitionTripStatus",
      "markDisruptedTrips",
      "processCancellationRefund",
    ],
  },
  {
    container: "manufacturing",
    rulesPath: `${SPEC_CONTAINER_BASE}/manufacturing/rules/manufacturing-rules.md`,
    // Sprint 292 (F458): Manufacturing 합성 도메인 — 22번째 도메인 (제조 산업, 11번째 신규 산업).
    // MF-001~MF-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 20 Sprint 연속 정점 (S264~S278+S283~S292).
    // 11번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF).
    sourcePath: `${DOMAIN_SOURCE_BASE}/manufacturing.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/manufacturing/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "explodeBom",
      "placeProductionOrder",
      "confirmProductionOrder",
      "transitionProductionStatus",
      "quarantineDefectiveLots",
      "releaseForShipment",
    ],
  },
  {
    container: "retail",
    rulesPath: `${SPEC_CONTAINER_BASE}/retail/rules/retail-rules.md`,
    // Sprint 293 (F459): Retail 합성 도메인 — 23번째 도메인 (소매 산업, 12번째 신규 산업).
    // RT-001~RT-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 21 Sprint 연속 정점 (S264~S278+S283~S293).
    // 12번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT).
    sourcePath: `${DOMAIN_SOURCE_BASE}/retail.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/retail/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "listSku",
      "applyPromotion",
      "processCheckout",
      "transitionOrderStatus",
      "markInventorySync",
      "processReturnRefund",
    ],
  },
  {
    container: "energy",
    rulesPath: `${SPEC_CONTAINER_BASE}/energy/rules/energy-rules.md`,
    // Sprint 294 (F460): Energy 합성 도메인 — 24번째 도메인 (에너지 산업, 13번째 신규 산업).
    // EN-001~EN-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 22 Sprint 연속 정점 (S264~S278+S283~S294).
    // 13번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN).
    sourcePath: `${DOMAIN_SOURCE_BASE}/energy.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/energy/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "recordMeterReading",
      "computeBillingTier",
      "triggerUsageAlert",
      "transitionMeterStatus",
      "markOutageNotified",
      "processOverdueSuspension",
    ],
  },
  {
    container: "government",
    rulesPath: `${SPEC_CONTAINER_BASE}/government/rules/government-rules.md`,
    // Sprint 295 (F461): Government 합성 도메인 — 25번째 도메인 (공공 산업, 14번째 신규 산업).
    // GV-001~GV-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 23 Sprint 연속 정점 (S264~S278+S283~S295).
    // 14번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV).
    sourcePath: `${DOMAIN_SOURCE_BASE}/government.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/government/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "submitPermitApplication",
      "computeFeeTier",
      "processApproval",
      "transitionApplicationStatus",
      "applyOverduePenalty",
      "validateDocument",
    ],
  },
  {
    container: "telecom",
    rulesPath: `${SPEC_CONTAINER_BASE}/telecom/rules/telecom-rules.md`,
    // Sprint 296 (F462): Telecom 합성 도메인 — 26번째 도메인 (통신 산업, 15번째 신규 산업).
    // TC-001~TC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 24 Sprint 연속 정점 (S264~S278+S283~S296).
    // 15번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC).
    sourcePath: `${DOMAIN_SOURCE_BASE}/telecom.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/telecom/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "activateSubscription",
      "checkDataUsage",
      "upgradePlan",
      "transitionSubscriptionStatus",
      "runBillingCycle",
      "processPortOut",
    ],
  },
  {
    container: "banking",
    rulesPath: `${SPEC_CONTAINER_BASE}/banking/rules/banking-rules.md`,
    // Sprint 297 (F463): Banking 합성 도메인 — 27번째 도메인 (은행 산업, 16번째 신규 산업).
    // BK-001~BK-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 25 Sprint 연속 정점 (S264~S278+S283~S297).
    // 16번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK).
    sourcePath: `${DOMAIN_SOURCE_BASE}/banking.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/banking/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "processWithdrawal",
      "computeTransferFee",
      "processAccountTransfer",
      "transitionAccountStatus",
      "markDormantAccounts",
      "verifyKyc",
    ],
  },
  {
    container: "media",
    rulesPath: `${SPEC_CONTAINER_BASE}/media/rules/media-rules.md`,
    // Sprint 298 (F464): Media 합성 도메인 — 28번째 도메인 (미디어 산업, 17번째 신규 산업).
    // MD-001~MD-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 26 Sprint 연속 정점 (S264~S278+S283~S298).
    // 17번째 신규 산업 도메인 (CC + DV + SB + IN + HC + ED + RE + LG + HO + TR + MF + RT + EN + GV + TC + BK + MD).
    // 🎯 90% coverage 마일스톤 돌파 예상.
    sourcePath: `${DOMAIN_SOURCE_BASE}/media.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/media/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "activateMediaSubscription",
      "checkViewQuota",
      "processLicensing",
      "transitionContentStatus",
      "markExpiringContent",
      "processTakedown",
    ],
  },
  {
    container: "pharmacy",
    rulesPath: `${SPEC_CONTAINER_BASE}/pharmacy/rules/pharmacy-rules.md`,
    // Sprint 299 (F465): Pharmacy 합성 도메인 — 29번째 도메인 (제약/약국 산업, 18번째 신규 산업).
    // PH-001~PH-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 27 Sprint 연속 정점 (S264~S278+S283~S299).
    // 18번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH).
    // 🎯 90.4% coverage 안정화 (90% 돌파 직후).
    sourcePath: `${DOMAIN_SOURCE_BASE}/pharmacy.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/pharmacy/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "validateDosage",
      "checkRefillQuota",
      "dispensePrescription",
      "transitionPrescriptionStatus",
      "markRecalledBatches",
      "checkDrugInteraction",
    ],
  },
  {
    container: "agriculture",
    rulesPath: `${SPEC_CONTAINER_BASE}/agriculture/rules/agriculture-rules.md`,
    // Sprint 300 (F466): Agriculture 합성 도메인 — 30번째 도메인 (농업 산업, 19번째 신규 산업).
    // AG-001~AG-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 28 Sprint 연속 정점 (S264~S278+S283~S300).
    // 19번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG).
    // 🏆 Sprint 300 마일스톤: 30번째 도메인 + 30 Sprint 연속 동시 도달.
    sourcePath: `${DOMAIN_SOURCE_BASE}/agriculture.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/agriculture/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "recordCropYield",
      "applyPesticide",
      "processHarvest",
      "transitionCropStatus",
      "markBatchGrading",
      "issueCertification",
    ],
  },
  {
    container: "construction",
    rulesPath: `${SPEC_CONTAINER_BASE}/construction/rules/construction-rules.md`,
    // Sprint 301 (F467): Construction 합성 도메인 — 31번째 도메인 (건설 산업, 20번째 신규 산업).
    // CN-001~CN-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 29 Sprint 연속 정점 (S264~S278+S283~S301).
    // 20번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN).
    // 🏆 20 산업 round number 마일스톤.
    sourcePath: `${DOMAIN_SOURCE_BASE}/construction.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/construction/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "submitBid",
      "computePaymentRetention",
      "processChangeOrder",
      "transitionProjectStatus",
      "markMilestoneCompletion",
      "processSafetyInspection",
    ],
  },
  {
    container: "maritime",
    rulesPath: `${SPEC_CONTAINER_BASE}/maritime/rules/maritime-rules.md`,
    // Sprint 302 (F468): Maritime 합성 도메인 — 32번째 도메인 (해운 산업, 21번째 신규 산업).
    // MR-001~MR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 30 Sprint 연속 정점 (S264~S278+S283~S302).
    // 21번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR).
    // 🎯 AIF-PLAN-100 마일스톤 — Plan 100번째 산출물.
    sourcePath: `${DOMAIN_SOURCE_BASE}/maritime.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/maritime/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "loadCargo",
      "computeFreightRate",
      "processCustoms",
      "transitionShipmentStatus",
      "markPortHandled",
      "processDamageClaim",
    ],
  },
  {
    container: "transit",
    rulesPath: `${SPEC_CONTAINER_BASE}/transit/rules/transit-rules.md`,
    // Sprint 303 (F469): Public Transport 합성 도메인 — 33번째 도메인 (대중교통 산업, 22번째 신규 산업).
    // TS-001~TS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 31 Sprint 연속 정점 (S264~S278+S283~S303).
    // 22번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS).
    sourcePath: `${DOMAIN_SOURCE_BASE}/transit.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/transit/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "checkRouteCapacity",
      "computeFare",
      "processTransfer",
      "transitionTripStatus",
      "markSeasonPassRenewal",
      "processSuspensionRefund",
    ],
  },
  {
    container: "aviation",
    rulesPath: `${SPEC_CONTAINER_BASE}/aviation/rules/aviation-rules.md`,
    // Sprint 304 (F470): Aviation 합성 도메인 — 34번째 도메인 (항공 산업, 23번째 신규 산업).
    // AV-001~AV-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 32 Sprint 연속 정점 (S264~S278+S283~S304).
    // 23번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV).
    sourcePath: `${DOMAIN_SOURCE_BASE}/aviation.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/aviation/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "boardPassenger",
      "allocateFuel",
      "dispatchFlight",
      "transitionFlightStatus",
      "rotateCrewSchedule",
      "processBaggageClaim",
    ],
  },
  {
    container: "mining",
    rulesPath: `${SPEC_CONTAINER_BASE}/mining/rules/mining-rules.md`,
    // Sprint 305 (F471): Mining 합성 도메인 — 35번째 도메인 (광업 산업, 24번째 신규 산업).
    // MN-001~MN-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 33 Sprint 연속 정점 (S264~S278+S283~S305).
    // 24번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN).
    // 🏆 1차 산업 클러스터 형성 (AG + MN). 6 BLs 균형 패턴 25번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/mining.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/mining/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "recordExtraction",
      "computeRoyalty",
      "processBlastOperation",
      "transitionOreStatus",
      "runComplianceBatch",
      "processSafetyIncident",
    ],
  },
  {
    container: "defense",
    rulesPath: `${SPEC_CONTAINER_BASE}/defense/rules/defense-rules.md`,
    // Sprint 306 (F472): Defense 합성 도메인 — 36번째 도메인 (국방 산업, 25번째 신규 산업).
    // DF-001~DF-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 34 Sprint 연속 정점 (S264~S278+S283~S306).
    // 25번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF).
    // 🏆 25 산업 연속 0 ABSENCE round number 마일스톤. 정부 클러스터 형성 (GV + DF). 6 BLs 균형 패턴 26번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/defense.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/defense/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "recordWeaponInventory",
      "checkClearanceLevel",
      "dispatchMission",
      "transitionMissionStatus",
      "markTrainingRotation",
      "processClassifiedDocument",
    ],
  },
  {
    container: "sports",
    rulesPath: `${SPEC_CONTAINER_BASE}/sports/rules/sports-rules.md`,
    // Sprint 307 (F473): Sports 합성 도메인 — 37번째 도메인 (스포츠 산업, 26번째 신규 산업).
    // SP-001~SP-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 35 Sprint 연속 정점 (S264~S278+S283~S307).
    // 26번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP).
    // 🏆 26 산업 연속 0 ABSENCE 마일스톤. event mgmt 산업 클러스터 형성. 6 BLs 균형 패턴 27번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/sports.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/sports/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookVenueSeat",
      "applySeasonTicketTier",
      "processTicketSale",
      "transitionEventStatus",
      "markMerchandiseSync",
      "processRefundRebook",
    ],
  },
  {
    container: "charity",
    rulesPath: `${SPEC_CONTAINER_BASE}/charity/rules/charity-rules.md`,
    // Sprint 308 (F474): Charity 합성 도메인 — 38번째 도메인 (비영리 산업, 27번째 신규 산업).
    // CH-001~CH-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 36 Sprint 연속 정점 (S264~S278+S283~S308).
    // 27번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH).
    // 🏆 27 산업 연속 0 ABSENCE 마일스톤. nonprofit 추가. 6 BLs 균형 패턴 28번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/charity.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/charity/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "recordDonation",
      "applyGrant",
      "disburseFund",
      "transitionCampaignStatus",
      "markVolunteerSchedule",
      "issueTaxCertificate",
    ],
  },
  {
    container: "wellness",
    rulesPath: `${SPEC_CONTAINER_BASE}/wellness/rules/wellness-rules.md`,
    // Sprint 309 (F475): Wellness 합성 도메인 — 39번째 도메인 (웰니스 산업, 28번째 신규 산업).
    // WL-001~WL-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 37 Sprint 연속 정점 (S264~S278+S283~S309).
    // 28번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL).
    // 🏆 28 산업 연속 0 ABSENCE 마일스톤. wellness/spa 추가. Hospitality 클러스터 (HO+WL) 형성. 6 BLs 균형 패턴 29번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/wellness.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/wellness/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookSession",
      "usePackageSession",
      "confirmAppointment",
      "transitionAppointmentStatus",
      "markNoShowSessions",
      "processCancellationFee",
    ],
  },
  {
    container: "pet",
    rulesPath: `${SPEC_CONTAINER_BASE}/pet/rules/pet-rules.md`,
    // Sprint 310 (F476): Pet Services 합성 도메인 — 40번째 도메인 (반려동물 산업, 29번째 신규 산업).
    // PT-001~PT-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 38 Sprint 연속 정점 (S264~S278+S283~S310).
    // 29번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT).
    // 🏆 29 산업 연속 0 ABSENCE 도전. 동물병원+미용 클러스터 (HC+WL+PT) 형성. 6 BLs 균형 패턴 30번째 정착 (round).
    sourcePath: `${DOMAIN_SOURCE_BASE}/pet.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/pet/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookBoarding",
      "applyVaccination",
      "processGrooming",
      "transitionCareStatus",
      "markHealthRecordBatch",
      "processEmergency",
    ],
  },
  {
    container: "property",
    rulesPath: `${SPEC_CONTAINER_BASE}/property/rules/property-rules.md`,
    // Sprint 311 (F477): Property Mgmt 합성 도메인 — 41번째 도메인 (임대관리 산업, 30번째 신규 산업).
    // PR-001~PR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 39 Sprint 연속 정점 (S264~S278+S283~S311).
    // 30번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR).
    // 🏆 30 산업 연속 0 ABSENCE round number 마일스톤. RE 부동산 + PR 임대관리 클러스터. 6 BLs 균형 패턴 31번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/property.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/property/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "computeUtilityBill",
      "approveMaintenance",
      "renewLease",
      "transitionLeaseStatus",
      "markInspectionBatch",
      "processEviction",
    ],
  },
  {
    container: "fitness",
    rulesPath: `${SPEC_CONTAINER_BASE}/fitness/rules/fitness-rules.md`,
    // Sprint 312 (F478): Fitness 합성 도메인 — 42번째 도메인 (피트니스 산업, 31번째 신규 산업).
    // FT-001~FT-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 40 Sprint 연속 정점 (S264~S278+S283~S312). 🏆 round number
    // 31번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT).
    // 🏆 31 산업 연속 0 ABSENCE 도전. WL+SP+FT 클러스터 (서비스+이벤트+운동) 형성. 6 BLs 균형 패턴 32번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/fitness.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/fitness/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookClassSlot",
      "usePtSession",
      "bookPersonalTraining",
      "transitionProgressStatus",
      "markNoShowBatch",
      "reserveEquipment",
    ],
  },
  {
    container: "beauty",
    rulesPath: `${SPEC_CONTAINER_BASE}/beauty/rules/beauty-rules.md`,
    // Sprint 313 (F479): Beauty Salon 합성 도메인 — 43번째 도메인 (미용실 산업, 32번째 신규 산업).
    // BT-001~BT-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 41 Sprint 연속 정점 (S264~S278+S283~S313).
    // 32번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT).
    // 🏆 32 산업 연속 0 ABSENCE 도전. WL+SP+FT+BT 서비스 4-클러스터 완성. 6 BLs 균형 패턴 33번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/beauty.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/beauty/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookSeat",
      "applyLoyaltyDiscount",
      "confirmAppointment",
      "transitionAppointmentStatus",
      "markInventoryRestockBatch",
      "processCommission",
    ],
  },
  {
    container: "telemedicine",
    rulesPath: `${SPEC_CONTAINER_BASE}/telemedicine/rules/telemedicine-rules.md`,
    // Sprint 318 (F484): Telemedicine 합성 도메인 — 44번째 도메인 (원격진료 산업, 33번째 신규 산업).
    // TM-001~TM-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 45 Sprint 연속 정점 (S264~S278+S283~S318).
    // 33번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM).
    // 🏆 33 산업 연속 0 ABSENCE 도전. HC+PH+TM 의료 3-클러스터 형성. 6 BLs 균형 패턴 34번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/telemedicine.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/telemedicine/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookConsultationSlot",
      "applyPrescriptionLimit",
      "confirmConsultation",
      "transitionConsultationStatus",
      "markPrescriptionExpiryBatch",
      "processBilling",
    ],
  },
  {
    container: "veterinary",
    rulesPath: `${SPEC_CONTAINER_BASE}/veterinary/rules/veterinary-rules.md`,
    // Sprint 319 (F485): Veterinary 합성 도메인 — 45번째 도메인 (동물병원 진료 산업, 34번째 신규 산업).
    // VT-001~VT-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 46 Sprint 연속 정점 도전 (S264~S278+S283~S319).
    // 34번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT).
    // 🏆 34 산업 연속 0 ABSENCE 도전. PT+VT 동물 케어 2-클러스터 형성. 6 BLs 균형 패턴 35번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/veterinary.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/veterinary/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookAppointmentSlot",
      "applyVaccineLimit",
      "confirmAppointment",
      "transitionAppointmentStatus",
      "markMedicalRecordArchiveBatch",
      "processVeterinaryBilling",
    ],
  },
  {
    container: "gym",
    rulesPath: `${SPEC_CONTAINER_BASE}/gym/rules/gym-rules.md`,
    // 세션 295 (F488): Gym 합성 도메인 — 46번째 도메인 (헬스장 매장 산업, 35번째 신규 산업).
    // GY-001~GY-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 47 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295).
    // 35번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY).
    // 🏆 35 산업 연속 0 ABSENCE 도전. PT+FT+GY 3-클러스터 스포츠/헬스 형성. 6 BLs 균형 패턴 36번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/gym.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/gym/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerGymMember",
      "applyPtLimit",
      "registerMemberWithLocker",
      "transitionMembershipStatus",
      "markExpiredMembershipBatch",
      "processTrainerBilling",
    ],
  },
  {
    container: "parking",
    rulesPath: `${SPEC_CONTAINER_BASE}/parking/rules/parking-rules.md`,
    // 세션 296 (F494): Parking 합성 도메인 — 47번째 도메인 (주차 관리 산업, 36번째 신규 산업).
    // PK-001~PK-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 48 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296).
    // 36번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK).
    // 🏆 36 산업 연속 0 ABSENCE 도전. RE+PR+PK 부동산 3-클러스터 형성. 6 BLs 균형 패턴 37번째 정착.
    // S283 audit fix 1차: HT(Hotel→hospitality 중복) + FD(Food Delivery→delivery 중복) → PK 채택.
    sourcePath: `${DOMAIN_SOURCE_BASE}/parking.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/parking/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveParkingSlot",
      "applyMonthlyPassLimit",
      "confirmEntry",
      "transitionReservationStatus",
      "markUnauthorizedExitBatch",
      "processOperatorBilling",
    ],
  },
  {
    container: "carsharing",
    rulesPath: `${SPEC_CONTAINER_BASE}/carsharing/rules/carsharing-rules.md`,
    // 세션 297 (F500): Car Sharing 합성 도메인 — 48번째 도메인 (카쉐어링 산업, 37번째 신규 산업).
    // CS-001~CS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 49 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297).
    // 37번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS).
    // 🏆 37 산업 연속 0 ABSENCE 도전. TR+AV+CS 운송 3-클러스터 형성. 6 BLs 균형 패턴 38번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/carsharing.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/carsharing/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveSharingVehicle",
      "applyDistanceLimit",
      "confirmPickup",
      "transitionRentalStatus",
      "markOverdueReturnBatch",
      "processOperatorBilling",
    ],
  },
  {
    container: "fastfood",
    rulesPath: `${SPEC_CONTAINER_BASE}/fastfood/rules/fastfood-rules.md`,
    // 세션 298 (F502): Fast Food 합성 도메인 — 49번째 도메인 (패스트푸드 산업, 38번째 신규 산업).
    // FS-001~FS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 50 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297+S298).
    // 38번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS).
    // 🏆 38 산업 연속 0 ABSENCE 도전. DV+WL+FT+FS QSR 외식 4-클러스터 확장. 6 BLs 균형 패턴 39번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/fastfood.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/fastfood/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "placeOrder",
      "applyComboDiscount",
      "processPayment",
      "transitionOrderStatus",
      "markStaleOrderBatch",
      "settleDailyRevenue",
    ],
  },
  {
    container: "aerospace",
    rulesPath: `${SPEC_CONTAINER_BASE}/aerospace/rules/aerospace-rules.md`,
    // 세션 299 (F506): Aerospace 합성 도메인 — 50번째 도메인 (항공우주 산업, 39번째 신규 산업).
    // AS-001~AS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 51 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297+S298+S299).
    // 39번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS).
    // 🏆 50번째 도메인 마일스톤 (S262 5 → S299 50, 10배 확장).
    // 🏆 39 산업 연속 0 ABSENCE 도전. TR+AV+CS+AS 항공/운송 4-클러스터 확장 (Travel 여행 + Aviation 항공 + Car Sharing 카셰어링 + Aerospace 항공우주).
    // 6 BLs 균형 패턴 40번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/aerospace.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/aerospace/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "scheduleLaunch",
      "applyOrbitFeeTier",
      "executeMission",
      "transitionMissionStatus",
      "retireSatelliteBatch",
      "processAbortRefund",
    ],
  },
  {
    container: "music",
    rulesPath: `${SPEC_CONTAINER_BASE}/music/rules/music-rules.md`,
    // 세션 300 (F509): Music streaming 합성 도메인 — 51번째 도메인 (음악 스트리밍 산업, 40번째 신규 산업).
    // MU-001~MU-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 52 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S300).
    // 40번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU).
    // 거울 변환 4회차 (carsharing → fastfood → aerospace → music) — 디지털 콘텐츠 도메인 신규.
    // 6 BLs 균형 패턴 41번째 정착.
    sourcePath: `${DOMAIN_SOURCE_BASE}/music.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/music/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "startStream",
      "applyRoyaltyTier",
      "playTrack",
      "transitionSessionStatus",
      "expireTrackPlayBatch",
      "processCancellationRefund",
    ],
  },
  {
    container: "shipping",
    rulesPath: `${SPEC_CONTAINER_BASE}/shipping/rules/shipping-rules.md`,
    // 세션 301 (F511): Shipping 합성 도메인 — 52번째 도메인 (해운/선적 산업, 41번째 신규 산업).
    // SH-001~SH-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 53 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S301).
    // 41번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH).
    // 거울 변환 5회차 (carsharing → fastfood → aerospace → music → shipping) — LG+SH 국제무역 클러스터 신규 형성.
    // 6 BLs 균형 패턴 42번째 정착. 🏆 52번째 도메인 마일스톤 (S262 5 → S301 52, 10.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/shipping.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/shipping/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookVoyage",
      "applyFreightTier",
      "loadCargo",
      "transitionBookingStatus",
      "expireCargoLoadBatch",
      "processDemurrageRefund",
    ],
  },
  {
    container: "publishing",
    rulesPath: `${SPEC_CONTAINER_BASE}/publishing/rules/publishing-rules.md`,
    // 세션 304 (F518): Publishing 합성 도메인 — 53번째 도메인 (출판 산업, 42번째 신규 산업).
    // PB-001~PB-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 54 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S301+S304).
    // 42번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB).
    // 거울 변환 6회차 (carsharing → fastfood → aerospace → music → shipping → publishing) — MU+PB 디지털 콘텐츠 클러스터 확장 형성.
    // 6 BLs 균형 패턴 43번째 정착. 🏆 53번째 도메인 마일스톤 (S262 5 → S304 53, 10.6배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/publishing.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/publishing/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerVolume",
      "applyRoyaltyTier",
      "processPrintBatch",
      "transitionRegistrationStatus",
      "expirePrintBatchInventory",
      "processRoyaltyRefund",
    ],
  },
  {
    container: "textile",
    rulesPath: `${SPEC_CONTAINER_BASE}/textile/rules/textile-rules.md`,
    // 세션 304 후속 (F521): Textile 합성 도메인 — 54번째 도메인 (방직/섬유 산업, 43번째 신규 산업).
    // TX-001~TX-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 55 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S304).
    // 43번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX).
    // 거울 변환 7회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile) — MF+TX 제조 클러스터 확장 형성.
    // 6 BLs 균형 패턴 44번째 정착. 🏆 54번째 도메인 마일스톤 (S262 5 → S304 54, 10.8배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/textile.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/textile/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "startWeavingBatch",
      "applyDyeFeeTier",
      "processFabricBatch",
      "transitionOrderStatus",
      "expireRejectedFabricBatch",
      "processReturnRefund",
    ],
  },
  {
    container: "advertising",
    rulesPath: `${SPEC_CONTAINER_BASE}/advertising/rules/advertising-rules.md`,
    // 세션 304 후속 (F522): Advertising 합성 도메인 — 55번째 도메인 (광고 산업, 44번째 신규 산업).
    // AD-001~AD-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 56 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S304).
    // 44번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD).
    // 거울 변환 8회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising) — MU+PB+AD 디지털 콘텐츠 3-클러스터 확장.
    // 6 BLs 균형 패턴 45번째 정착. 🏆 55번째 도메인 마일스톤 (S262 5 → S304 55, 11배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/advertising.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/advertising/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookCampaign",
      "applyMediaFeeTier",
      "processImpressionBatch",
      "transitionCampaignStatus",
      "expireEndedCampaignBatch",
      "processChargebackRefund",
    ],
  },
  {
    container: "gaming",
    rulesPath: `${SPEC_CONTAINER_BASE}/gaming/rules/gaming-rules.md`,
    // 세션 304 후속 (F523): Gaming 합성 도메인 — 56번째 도메인 (게임 산업, 45번째 신규 산업).
    // GM-001~GM-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 57 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S304).
    // 45번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM).
    // 거울 변환 9회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming) — MU+PB+AD+GM 디지털 콘텐츠 4-클러스터 확장.
    // 6 BLs 균형 패턴 46번째 정착. 🏆 56번째 도메인 마일스톤 (S262 5 → S304 56, 11.2배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/gaming.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/gaming/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "launchGame",
      "applyInAppPurchase",
      "processGameSession",
      "transitionGameStatus",
      "expireRetiredGameBatch",
      "processRefundClaim",
    ],
  },
  {
    container: "video",
    rulesPath: `${SPEC_CONTAINER_BASE}/video/rules/video-rules.md`,
    // 세션 305 (F524): Video 합성 도메인 — 57번째 도메인 (영상 산업, 46번째 신규 산업).
    // VD-001~VD-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 58 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S305).
    // 46번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD).
    // 거울 변환 10회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video) — MU+PB+AD+GM+VD 디지털 콘텐츠 5-클러스터 확장.
    // 6 BLs 균형 패턴 47번째 정착. 🏆 57번째 도메인 마일스톤 (S262 5 → S305 57, 11.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/video.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/video/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "publishVideo",
      "applyViewLimit",
      "processStream",
      "transitionVideoStatus",
      "expireRetiredVideoBatch",
      "processRefundClaim",
    ],
  },
  {
    container: "socialmedia",
    rulesPath: `${SPEC_CONTAINER_BASE}/socialmedia/rules/socialmedia-rules.md`,
    // 세션 305 후속 (F526): SocialMedia 합성 도메인 — 58번째 도메인 (소셜미디어 산업, 47번째 신규 산업).
    // SM-001~SM-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 59 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S305+).
    // 47번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM).
    // 거울 변환 11회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia) — MU+PB+AD+GM+VD+SM 디지털 콘텐츠 6-클러스터 확장.
    // 6 BLs 균형 패턴 48번째 정착. 🏆 58번째 도메인 마일스톤 (S262 5 → S305+ 58, 11.6배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/socialmedia.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/socialmedia/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "publishPost",
      "applyMonetizationLimit",
      "processFeedDistribution",
      "transitionPostStatus",
      "expireRemovedPostBatch",
      "processCreatorClawback",
    ],
  },
  {
    container: "news",
    rulesPath: `${SPEC_CONTAINER_BASE}/news/rules/news-rules.md`,
    // 세션 305 후속2 (F527): News 합성 도메인 — 59번째 도메인 (뉴스 산업, 48번째 신규 산업).
    // NW-001~NW-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 60 Sprint 연속 정점 도전 (S264~S305++).
    // 48번째 신규 산업 도메인 (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF+SP+CH+WL+PT+PR+FT+BT+TM+VT+GY+PK+CS+FS+AS+MU+SH+PB+TX+AD+GM+VD+SM+NW).
    // 거울 변환 12회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news) — MU+PB+AD+GM+VD+SM+NW 디지털 콘텐츠 7-클러스터 확장.
    // 6 BLs 균형 패턴 49번째 정착. 🏆 59번째 도메인 마일스톤 (S262 5 → S305++ 59, 11.8배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/news.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/news/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "publishArticle",
      "applyArticleQuotaLimit",
      "processSyndication",
      "transitionArticleStatus",
      "expireRetractedArticleBatch",
      "processSubscriptionRefund",
    ],
  },
  {
    container: "broadcast",
    rulesPath: `${SPEC_CONTAINER_BASE}/broadcast/rules/broadcast-rules.md`,
    // 세션 305 후속3 (F528): Broadcast 합성 도메인 — 60번째 도메인 (방송 산업, 49번째 신규 산업). 🏆 60 Sprint round 마일스톤.
    // BR-001~BR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 61 Sprint 연속 정점 도전 (S264~S305+++).
    // 49번째 신규 산업 도메인 (...+VD+SM+NW+BR).
    // 거울 변환 13회차 (carsharing → ... → news → broadcast) — MU+PB+AD+GM+VD+SM+NW+BR 디지털 콘텐츠 8-클러스터 확장 (실시간 편성 방송 추가).
    // 6 BLs 균형 패턴 50번째 정착. 🏆 60번째 도메인 마일스톤 (S262 5 → S305+++ 60, 12배 확장) + 🏆 60 Sprint round 마일스톤.
    sourcePath: `${DOMAIN_SOURCE_BASE}/broadcast.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/broadcast/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "scheduleBroadcast",
      "applyViewershipLimit",
      "processAiring",
      "transitionBroadcastStatus",
      "expirePreemptedBroadcastBatch",
      "processSponsorRefund",
    ],
  },
  {
    container: "esports",
    rulesPath: `${SPEC_CONTAINER_BASE}/esports/rules/esports-rules.md`,
    // 세션 305 후속4 (F529): Esports 합성 도메인 — 61번째 도메인 (이스포츠 산업, 50번째 신규 산업). 🏆🏆 50 신규 산업 round 마일스톤.
    // ER-001~ER-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 신규 detector 0개 — withRuleId 재사용 62 Sprint 연속 정점 도전 (S264~S305++++).
    // 50번째 신규 산업 도메인 (...+VD+SM+NW+BR+ER).
    // 거울 변환 14회차 (carsharing → ... → broadcast → esports) — MU+PB+AD+GM+VD+SM+NW+BR+ER 디지털 콘텐츠 9-클러스터 확장 + GM/SM 융합 모델.
    // 6 BLs 균형 패턴 51번째 정착. 🏆 61번째 도메인 마일스톤 (S262 5 → S305++++ 61, 12.2배 확장) + 🏆🏆 50 신규 산업 round 마일스톤.
    sourcePath: `${DOMAIN_SOURCE_BASE}/esports.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/esports/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerTournament",
      "applyPrizeLimit",
      "processMatch",
      "transitionTournamentStatus",
      "expireForfeitedMatchBatch",
      "processPrizeClawback",
    ],
  },
  {
    container: "podcast",
    rulesPath: `${SPEC_CONTAINER_BASE}/podcast/rules/podcast-rules.md`,
    // 세션 305 후속5 (F530): Podcast 합성 도메인 — 62번째 도메인 (팟캐스트 산업, 51번째 신규 산업).
    // PC-001~PC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 15회차 (carsharing → ... → esports → podcast) — MU+PB+AD+GM+VD+SM+NW+BR+ER+PC 디지털 콘텐츠 10-클러스터 확장.
    // 🏆 62번째 도메인 마일스톤 (S262 5 → S305+++++ 62, 12.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/podcast.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/podcast/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "publishEpisode",
      "applyListenLimit",
      "processDistribution",
      "transitionEpisodeStatus",
      "expireRemovedEpisodeBatch",
      "processListenerRefund",
    ],
  },
  {
    container: "radio",
    rulesPath: `${SPEC_CONTAINER_BASE}/radio/rules/radio-rules.md`,
    // 세션 305 후속6 (F531): Radio 합성 도메인 — 63번째 도메인 (라디오 산업, 52번째 신규 산업). 🏆🏆 1세션 9 Sprint 신기록.
    // RA-001~RA-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 16회차 (carsharing → ... → podcast → radio) — MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA 디지털 콘텐츠 11-클러스터 확장.
    // 🏆 63번째 도메인 마일스톤 (S262 5 → S305++++++ 63, 12.6배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/radio.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/radio/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "scheduleProgram",
      "applyListenershipLimit",
      "processBroadcast",
      "transitionProgramStatus",
      "expirePreemptedBroadcastBatch",
      "processSponsorRefund",
    ],
  },
  {
    container: "art",
    rulesPath: `${SPEC_CONTAINER_BASE}/art/rules/art-rules.md`,
    // 세션 306 (F532): Art 합성 도메인 — 64번째 도메인 (예술/갤러리 산업, 53번째 신규 산업). 🏆 64번째 도메인 마일스톤.
    // AR-001~AR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 17회차 (carsharing → ... → radio → art) — MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR 디지털 콘텐츠 12-클러스터 확장 (시각 예술 / 갤러리 / NFT 디지털 아트 확장 가능).
    // 🏆 64번째 도메인 마일스톤 (S262 5 → S306 64, 12.8배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/art.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/art/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerArtwork",
      "applyAcquisitionLimit",
      "processArtworkTransaction",
      "transitionArtworkStatus",
      "expireWithdrawnArtworkBatch",
      "processCommissionRefund",
    ],
  },
  {
    container: "gambling",
    rulesPath: `${SPEC_CONTAINER_BASE}/gambling/rules/gambling-rules.md`,
    // 세션 306 후속 (F533): Gambling 합성 도메인 — 65번째 도메인 (카지노/베팅 산업, 54번째 신규 산업). 🏆 65번째 도메인 마일스톤.
    // GA-001~GA-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 18회차 (carsharing → ... → art → gambling) — 🎮 GM+GA 게임엔터 2-클러스터 신규 형성 (게임 in-app purchase + 카지노/베팅 payout 통합 추상화).
    // 🏆 65번째 도메인 마일스톤 (S262 5 → S306 65, 13.0배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/gambling.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/gambling/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "placeBet",
      "applyBetLimit",
      "processBetSettlement",
      "transitionBetStatus",
      "expireVoidedBetBatch",
      "processWagerRefund",
    ],
  },
  {
    container: "amusement",
    rulesPath: `${SPEC_CONTAINER_BASE}/amusement/rules/amusement-rules.md`,
    // 세션 306 후속2 (F534): Amusement 합성 도메인 — 66번째 도메인 (놀이공원/테마파크 산업, 55번째 신규 산업). 🏆 66번째 도메인 마일스톤.
    // AM-001~AM-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 19회차 (carsharing → ... → gambling → amusement) — 🎢 오프라인 엔터테인먼트 신규 클러스터 출범 (디지털 12 + 게임엔터 2 + 오프라인 엔터 1 = 3 메타 카테고리).
    // 🏆 66번째 도메인 마일스톤 (S262 5 → S306 66, 13.2배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/amusement.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/amusement/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveTicket",
      "applyVisitLimit",
      "processRideAdmission",
      "transitionTicketStatus",
      "expireRevokedTicketBatch",
      "processTicketRefund",
    ],
  },
  {
    container: "theater",
    rulesPath: `${SPEC_CONTAINER_BASE}/theater/rules/theater-rules.md`,
    // 세션 306 후속3 (F535): Theater 합성 도메인 — 67번째 도메인 (영화관/극장/공연장 산업, 56번째 신규 산업). 🏆 67번째 도메인 마일스톤.
    // TH-001~TH-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 20회차 정점 (carsharing → ... → amusement → theater) — 🎭 AM+TH 오프라인 엔터 2-클러스터 확장 (테마파크 입장권 + 극장 좌석권 통합 추상화).
    // 🏆 67번째 도메인 마일스톤 (S262 5 → S306 67, 13.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/theater.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/theater/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookSeat",
      "applyAttendanceLimit",
      "processShowAdmission",
      "transitionSeatStatus",
      "expireWithdrawnSeatBatch",
      "processShowRefund",
    ],
  },
  {
    container: "skiing",
    rulesPath: `${SPEC_CONTAINER_BASE}/skiing/rules/skiing-rules.md`,
    // 세션 306 후속4 (F536): Skiing 합성 도메인 — 68번째 도메인 (스키 리조트 산업, 57번째 신규 산업). 🏆 68번째 도메인 마일스톤.
    // SK-001~SK-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 21회차 (carsharing → ... → theater → skiing) — 🏔️ SP+SK 스포츠 레저 2-클러스터 신규 형성 (피트니스/스포츠 + 윈터 레저 통합 추상화).
    // 🏆 68번째 도메인 마일스톤 (S262 5 → S306 68, 13.6배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/skiing.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/skiing/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reservePass",
      "applyRideLimit",
      "processLiftBoarding",
      "transitionPassStatus",
      "expireSuspendedPassBatch",
      "processSlopeRefund",
    ],
  },
  {
    container: "exhibition",
    rulesPath: `${SPEC_CONTAINER_BASE}/exhibition/rules/exhibition-rules.md`,
    // 세션 306 후속5 (F537): Exhibition 합성 도메인 — 69번째 도메인 (박람회/컨벤션 산업, 58번째 신규 산업). 🏆 69번째 도메인 마일스톤.
    // EX-001~EX-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 22회차 (carsharing → ... → skiing → exhibition) — 🎨 AR+EX 예술/전시 2-클러스터 신규 형성 (시각 예술 갤러리 + 박람회/컨벤션 부스 통합 추상화).
    // 🏆 69번째 도메인 마일스톤 (S262 5 → S306 69, 13.8배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/exhibition.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/exhibition/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookBooth",
      "applyVisitorLimit",
      "processBoothOpening",
      "transitionBoothStatus",
      "expireWithdrawnAdmissionBatch",
      "processBoothRefund",
    ],
  },
  {
    container: "golf",
    rulesPath: `${SPEC_CONTAINER_BASE}/golf/rules/golf-rules.md`,
    // 세션 306 후속6 (F538): Golf 합성 도메인 — 70번째 도메인 🏆🏆 round 마일스톤 (골프장/필드 운영 산업, 59번째 신규 산업).
    // GF-001~GF-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 23회차 (carsharing → ... → exhibition → golf) — ⛳ SP+SK+GF 스포츠 레저 3-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 통합 추상화 — 단일 클러스터 3 도메인 첫 사례).
    // 🏆🏆 70번째 도메인 round 마일스톤 (S262 5 → S306 70, 14.0배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/golf.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/golf/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveTeeTime",
      "applyRoundLimit",
      "processTeeOff",
      "transitionRoundStatus",
      "expireSuspendedRoundBatch",
      "processCourseRefund",
    ],
  },
  {
    container: "kpop",
    rulesPath: `${SPEC_CONTAINER_BASE}/kpop/rules/kpop-rules.md`,
    // 세션 306 후속7 (F539): K-pop 합성 도메인 — 71번째 도메인 (콘서트/팬미팅 산업, 60번째 신규 산업, 한국 특화). 🏆 71번째 도메인 마일스톤.
    // KP-001~KP-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 24회차 (carsharing → ... → golf → kpop) — 🎤 AM+TH+KP 오프라인 엔터 3-클러스터 확장 (놀이공원 + 극장 + 콘서트 통합 추상화 — 단일 클러스터 3 도메인 두 번째 사례).
    // 🏆 71번째 도메인 마일스톤 (S262 5 → S306 71, 14.2배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/kpop.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/kpop/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookTicket",
      "applyFanLimit",
      "processConcertAdmission",
      "transitionEntryStatus",
      "expirePostponedEntryBatch",
      "processConcertRefund",
    ],
  },
  {
    container: "surfing",
    rulesPath: `${SPEC_CONTAINER_BASE}/surfing/rules/surfing-rules.md`,
    // 세션 306 후속8 (F540): Surfing 합성 도메인 — 72번째 도메인 (서핑/해양 스포츠 산업, 61번째 신규 산업). 🏆🏆 1세션 9 Sprint 신기록 동률 도달.
    // SF-001~SF-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 25회차 정점 round (carsharing → ... → kpop → surfing) — 🏄 SP+SK+GF+SF 스포츠 레저 4-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 + 서핑 통합 추상화 — 단일 클러스터 4 도메인 첫 사례).
    // 🏆 72번째 도메인 마일스톤 (S262 5 → S306 72, 14.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/surfing.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/surfing/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveBoard",
      "applySessionLimit",
      "processSurfSession",
      "transitionBoardStatus",
      "expireSuspendedBoardBatch",
      "processSessionRefund",
    ],
  },
  {
    container: "aquarium",
    rulesPath: `${SPEC_CONTAINER_BASE}/aquarium/rules/aquarium-rules.md`,
    // 세션 306 후속9 (F541): Aquarium 합성 도메인 — 73번째 도메인 (수족관/해양생물 산업, 62번째 신규 산업). 🏆🏆🏆 1세션 10 Sprint 신기록 도전.
    // AQ-001~AQ-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 26회차 (carsharing → ... → surfing → aquarium) — 🐠 AM+TH+KP+AQ 오프라인 엔터 4-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 통합 추상화 — 단일 클러스터 4 도메인 두 번째 사례, 두 클러스터 동시 4 도메인 첫 사례).
    // 🏆 73번째 도메인 마일스톤 (S262 5 → S306 73, 14.6배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/aquarium.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/aquarium/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookAdmit",
      "applyTourLimit",
      "processAdmitEntry",
      "transitionAdmitStatus",
      "expireClosedAdmitBatch",
      "processTourRefund",
    ],
  },
  {
    container: "zoo",
    rulesPath: `${SPEC_CONTAINER_BASE}/zoo/rules/zoo-rules.md`,
    // 세션 307 (F542): Zoo 합성 도메인 — 74번째 도메인 (동물원 산업, 63번째 신규 산업). Sprint WT autopilot 분리.
    // ZO-001~ZO-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 27회차 (carsharing → ... → aquarium → zoo) — 🦁 AM+TH+KP+AQ+ZO 오프라인 엔터 5-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 + 동물원 통합 추상화 — 단일 클러스터 5 도메인 첫 사례 마일스톤).
    // 🏆 74번째 도메인 마일스톤 (S262 5 → S370 74, 14.8배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/zoo.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/zoo/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookVisit",
      "applyZoneLimit",
      "processExhibitEntry",
      "transitionVisitStatus",
      "expireClosedVisitBatch",
      "processVisitRefund",
    ],
  },
  {
    container: "museum",
    rulesPath: `${SPEC_CONTAINER_BASE}/museum/rules/museum-rules.md`,
    // 세션 307 후속 (F543): Museum 합성 도메인 — 75번째 도메인 (박물관/미술관 산업, 64번째 신규 산업). Sprint WT autopilot 분리 작업 2회차.
    // MS-001~MS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 28회차 (carsharing → ... → zoo → museum) — 🏛️ AM+TH+KP+AQ+ZO+MS 오프라인 엔터 6-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 + 동물원 + 박물관 통합 추상화 — 단일 클러스터 6 도메인 첫 사례 마일스톤).
    // 🏆🏆 75번째 도메인 15배 round 마일스톤 (S262 5 → S371 75, 15.0배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/museum.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/museum/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookAdmission",
      "applyGalleryLimit",
      "processGalleryEntry",
      "transitionGalleryStatus",
      "expireClosedGalleryBatch",
      "processAdmissionRefund",
    ],
  },
  {
    container: "movie",
    rulesPath: `${SPEC_CONTAINER_BASE}/movie/rules/movie-rules.md`,
    // 세션 307 후속2 (F544): Movie 합성 도메인 — 76번째 도메인 (영화관 산업, 65번째 신규 산업). Sprint WT autopilot 분리 작업 3회차.
    // MV-001~MV-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 29회차 (carsharing → ... → museum → movie) — 🎬 AM+TH+KP+AQ+ZO+MS+MV 오프라인 엔터 7-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 + 동물원 + 박물관 + 영화관 통합 추상화 — 단일 클러스터 7 도메인 첫 사례 마일스톤).
    // 🏆 76번째 도메인 마일스톤 (S262 5 → S372 76, 15.2배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/movie.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/movie/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookSeat",
      "applyTicketLimit",
      "processSeatEntry",
      "transitionScreeningStatus",
      "expireClosedScreeningBatch",
      "processTicketRefund",
    ],
  },
  {
    container: "library",
    rulesPath: `${SPEC_CONTAINER_BASE}/library/rules/library-rules.md`,
    // 세션 307 후속3 (F545): Library 합성 도메인 — 77번째 도메인 (도서관 산업, 66번째 신규 산업). Sprint WT autopilot 분리 작업 4회차.
    // LB-001~LB-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 30회차 round 마일스톤 (carsharing → ... → movie → library) — 📚 AM+TH+KP+AQ+ZO+MS+MV+LB 오프라인 엔터 8-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 + 동물원 + 박물관 + 영화관 + 도서관 통합 추상화 — 단일 클러스터 8 도메인 첫 사례 마일스톤).
    // 🏆 77번째 도메인 마일스톤 (S262 5 → S373 77, 15.4배 확장).
    sourcePath: `${DOMAIN_SOURCE_BASE}/library.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/library/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "borrowBook",
      "applyMemberLimit",
      "processBookEntry",
      "transitionLoanStatus",
      "expireOverdueLoanBatch",
      "processOverdueRefund",
    ],
  },
  {
    container: "park",
    rulesPath: `${SPEC_CONTAINER_BASE}/park/rules/park-rules.md`,
    // 세션 307 후속4 (F546): Park 합성 도메인 — 78번째 도메인 (자연공원 산업, 67번째 신규 산업). Sprint WT autopilot 분리 작업 5회차.
    // PA-001~PA-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 31회차 (carsharing → ... → library → park) — 🌲 AM+TH+KP+AQ+ZO+MS+MV+LB+PA 오프라인 엔터 9-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 + 동물원 + 박물관 + 영화관 + 도서관 + 자연공원 통합 추상화 — 단일 클러스터 9 도메인 첫 사례 마일스톤).
    // 🏆 78번째 도메인 마일스톤 (S262 5 → S374 78, 15.6배 확장). PA 차별성: AM 놀이공원과 분리 (트레일/캠핑/가이드 투어 모델).
    sourcePath: `${DOMAIN_SOURCE_BASE}/park.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/park/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveVisit",
      "applyTrailLimit",
      "processTrailEntry",
      "transitionVisitStatus",
      "expireClosedVisitBatch",
      "processVisitRefund",
    ],
  },
  {
    container: "festival",
    rulesPath: `${SPEC_CONTAINER_BASE}/festival/rules/festival-rules.md`,
    // 세션 307 후속5 (F547): Festival 합성 도메인 — 79번째 도메인 (페스티벌 산업, 68번째 신규 산업). Sprint WT autopilot 분리 작업 6회차.
    // FE-001~FE-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 32회차 (carsharing → ... → park → festival) — 🎪 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE 오프라인 엔터 10-클러스터 확장 (단일 클러스터 10 도메인 첫 사례 round 마일스톤).
    // 🏆 79번째 도메인 마일스톤 (S262 5 → S375 79, 15.8배 확장). FE 차별성: KP 콘서트와 분리 (다일정+멀티 stage+festival pass 모델).
    sourcePath: `${DOMAIN_SOURCE_BASE}/festival.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/festival/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveEntry",
      "applyStageLimit",
      "processStageEntry",
      "transitionEntryStatus",
      "expireClosedEntryBatch",
      "processEntryRefund",
    ],
  },
  {
    container: "garden",
    rulesPath: `${SPEC_CONTAINER_BASE}/garden/rules/garden-rules.md`,
    // 세션 307 후속6 (F548): Garden 합성 도메인 — 80번째 도메인 (식물원/수목원 산업, 69번째 신규 산업). Sprint WT autopilot 분리 작업 7회차.
    // GR-001~GR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 33회차 (carsharing → ... → festival → garden) — 🌷 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR 오프라인 엔터 11-클러스터 확장 (단일 클러스터 11 도메인 첫 사례 + 80번째 도메인 16배 round 마일스톤).
    // 🏆 80번째 도메인 round 마일스톤 (S262 5 → S376 80, 16배 확장). GR 차별성: PA(자연공원)와 MS(박물관)의 중간 모델 — 식물 관람 + 온실 전시 + 계절권 멤버십.
    sourcePath: `${DOMAIN_SOURCE_BASE}/garden.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/garden/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveVisit",
      "applyZoneLimit",
      "processGardenEntry",
      "transitionVisitStatus",
      "expireClosedVisitBatch",
      "processVisitRefund",
    ],
  },
  {
    container: "observatory",
    rulesPath: `${SPEC_CONTAINER_BASE}/observatory/rules/observatory-rules.md`,
    // 세션 307 후속7 (F549): Observatory 합성 도메인 — 81번째 도메인 (천문대 산업, 70번째 신규 산업). Sprint WT autopilot 분리 작업 8회차 (DoD 5축 강화).
    // OB-001~OB-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 34회차 (carsharing → ... → garden → observatory) — 🔭 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB 오프라인 엔터 12-클러스터 확장 (단일 클러스터 12 도메인 첫 사례 + 8 Sprint 연속 첫 사례 마일스톤).
    // OB 차별성: telescope 시간 슬롯 + 야간 관측 + 기상 의존 모델 — 동시 한도 200 (telescope 수 기반, GR 3000보다 훨씬 작음).
    sourcePath: `${DOMAIN_SOURCE_BASE}/observatory.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/observatory/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveObservation",
      "applyTelescopeLimit",
      "processTelescopeObservation",
      "transitionObservationStatus",
      "expireClosedObservationBatch",
      "processObservationRefund",
    ],
  },
  {
    container: "planetarium",
    rulesPath: `${SPEC_CONTAINER_BASE}/planetarium/rules/planetarium-rules.md`,
    // 세션 308 (F550): Planetarium 합성 도메인 — 82번째 도메인 (천문관 산업, 71번째 신규 산업). Sprint WT autopilot 분리 작업 9회차 (DoD 5축 정착 검증).
    // PL-001~PL-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 35회차 (carsharing → ... → observatory → planetarium) — 🔭 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL 오프라인 엔터 13-클러스터 확장 (단일 클러스터 13 도메인 첫 사례 + 9 Sprint 연속 첫 사례 마일스톤).
    // PL 차별성: OB(천문대 실 천체 관측, 야간+기상 의존) vs PL(천문관 돔 영상 시뮬레이션, 낮/저녁 정기 상영 + 해설/VR 옵션 + 좌석 우선 예약). MV(영화관 일반 영화 상영)와 차별: PL은 천문 시뮬레이션 + 교육 콘텐츠 특화.
    sourcePath: `${DOMAIN_SOURCE_BASE}/planetarium.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/planetarium/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "bookSession",
      "applyDomeSeatLimit",
      "processDomeScreening",
      "transitionSessionStatus",
      "expireClosedSessionBatch",
      "processSessionRefund",
    ],
  },
  {
    container: "convention",
    rulesPath: `${SPEC_CONTAINER_BASE}/convention/rules/convention-rules.md`,
    // 세션 309 (F552): Convention 합성 도메인 — 83번째 도메인 (컨벤션 산업, 72번째 신규 산업). Sprint WT autopilot 분리 작업 10회차 (DoD 6축 실감증 — domain-sprint-guard.yml 첫 실 작동).
    // CV-001~CV-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 36회차 (carsharing → ... → planetarium → convention) — ✏️ AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV 오프라인 엔터 14-클러스터 확장 (단일 클러스터 14 도메인 첫 사례 신기록 + 10 Sprint 연속 첫 사례 마일스톤 신기록 도전).
    // CV 차별성: MS(정적 전시/갤러리 입장) vs EX(단기 박람회 부스 임대) vs CV(다중 트랙 회의/컨벤션 세션 + 부스 배정 + 등록자 운영). 동시 한도 200 (B2B 컨벤션 세션별 동시 진행).
    sourcePath: `${DOMAIN_SOURCE_BASE}/convention.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/convention/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveSession",
      "applyBoothLimit",
      "processBoothBooking",
      "transitionSessionStatus",
      "expireClosedSessionBatch",
      "processSessionRefund",
    ],
  },
  {
    container: "wedding-hall",
    rulesPath: `${SPEC_CONTAINER_BASE}/wedding-hall/rules/wedding-hall-rules.md`,
    // 세션 309 (F553): Wedding hall 합성 도메인 — 84번째 도메인 (예식장 산업, 73번째 신규 산업). Sprint WT autopilot 분리 작업 11회차 (DoD 6축 실감증 2회차).
    // WB-001~WB-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 37회차 (carsharing → ... → convention → wedding-hall) — 💒 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB 오프라인 엔터 15-클러스터 (단일 클러스터 15 도메인 첫 사례 + 11 Sprint 연속 첫 사례 마일스톤 신기록).
    // WB 차별성: B2C 단일 1회성 예식 + 시간대 슬롯 + 강한 계약금/위약금 (CV 컨벤션 다중 트랙 B2B와 대비). 동시 한도 3 (예식장 홀 수 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/wedding-hall.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/wedding-hall/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveCeremony",
      "applyHallLimit",
      "processCeremonyBooking",
      "transitionCeremonyStatus",
      "expireClosedCeremonyBatch",
      "processCeremonyRefund",
    ],
  },
  {
    container: "beach-club",
    rulesPath: `${SPEC_CONTAINER_BASE}/beach-club/rules/beach-club-rules.md`,
    // 세션 309 (F554): Beach club 합성 도메인 — 85번째 도메인 (비치클럽 산업, 74번째 신규 산업). Sprint WT autopilot 분리 작업 12회차 (DoD 6축 실감증 3회차 정착 완료 트리거).
    // BC-001~BC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 38회차 (carsharing → ... → convention → wedding-hall → beach-club) — 🏖️ AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC 오프라인 엔터 16-클러스터 (단일 클러스터 16 도메인 첫 사례 + 12 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆 85번째 도메인 17배 round 마일스톤 (S262 5 → S382 85).
    // BC 차별성: 풀 + 사교 + DJ 공연 + 시즌제 + VIP 프라이빗 + 종일권/시즌권 통합 (WB 예식장 단일 1회성 + KP 콘서트 좌석 등급 인접하되 B2C 시즌제 + 카바나 임대 + 음료/식음 옵션 차별). 동시 한도 500 (비치클럽별 동시 active visitor 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/beach-club.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/beach-club/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveDayPass",
      "applyCabanaLimit",
      "processCabanaBooking",
      "transitionVisitStatus",
      "expireClosedVisitBatch",
      "processVisitRefund",
    ],
  },
  {
    container: "concert-hall",
    rulesPath: `${SPEC_CONTAINER_BASE}/concert-hall/rules/concert-hall-rules.md`,
    // 세션 311 (F555): Concert hall 합성 도메인 — 86번째 도메인 (클래식 콘서트홀 산업, 75번째 신규 산업). Sprint WT autopilot 분리 작업 13회차 (DoD 6축 실감증 4회차 표준 확정).
    // CO-001~CO-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 39회차 (carsharing → ... → wedding-hall → beach-club → concert-hall) — 🎻 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO 오프라인 엔터 17-클러스터 (단일 클러스터 17 도메인 첫 사례 + 13 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆 86번째 도메인 17.2배 확장 (S262 5 → S383 86).
    // CO 차별성: KP(K-pop 1회성 콘서트) 인접하되 시즌 구독 + 정기 프로그램 + 좌석 등급(VIP/A/B/C) + 음악감독별 시리즈 모델. 동시 한도 1500 (대형 클래식 콘서트홀 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/concert-hall.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/concert-hall/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveTicket",
      "applySeasonLimit",
      "processTicketBooking",
      "transitionTicketStatus",
      "expireClosedTicketBatch",
      "processTicketRefund",
    ],
  },
  {
    container: "karaoke",
    rulesPath: `${SPEC_CONTAINER_BASE}/karaoke/rules/karaoke-rules.md`,
    // 세션 384 (F556): Karaoke 합성 도메인 — 87번째 도메인 (노래방 산업, 76번째 신규 산업). Sprint WT autopilot 분리 작업 14회차 (DoD 6축 실감증 5회차 rules/ 영구 승격 트리거).
    // KR-001~KR-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 40회차 (carsharing → ... → beach-club → concert-hall → karaoke) — 🎤 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR 오프라인 엔터 18-클러스터 (단일 클러스터 18 도메인 첫 사례 + 14 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆 87번째 도메인 17.4배 확장 (S262 5 → S384 87). 🏆 거울 변환 40회차 round 마일스톤. 🏆 S283 audit 40회차 round 마일스톤.
    // KR 차별성: CO(클래식 콘서트홀 시즌권 + 정기 공연) + KP(K-pop 단일 콘서트 1회성) 인접하되 프라이빗 룸 + 시간제 + drinks/menu + 그룹 예약 + 점주별 운영 모델. 동시 한도 20 (노래방별 동시 active room, 일반 노래방 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/karaoke.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/karaoke/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveRoom",
      "applyMembershipLimit",
      "processRoomBooking",
      "transitionSessionStatus",
      "expireClosedSessionBatch",
      "processSessionRefund",
    ],
  },
  {
    container: "night-club",
    rulesPath: `${SPEC_CONTAINER_BASE}/night-club/rules/night-club-rules.md`,
    // 세션 385 (F557): Night Club 합성 도메인 — 88번째 도메인 (나이트클럽 산업, 77번째 신규 산업). Sprint WT autopilot 분리 작업 15회차 (DoD 6축 실감증 6회차 rules/ 영구 승격 정착 검증).
    // NC-001~NC-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 41회차 (carsharing → ... → concert-hall → karaoke → night-club) — 🌃 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC 오프라인 엔터 19-클러스터 (단일 클러스터 19 도메인 첫 사례 + 15 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆 88번째 도메인 17.6배 확장 (S262 5 → S385 88). 🏆 거울 변환 41회차. 🏆 S283 audit 42회차 도전.
    // NC 차별성: KR(노래방 프라이빗 룸 1-3시간) + BC(비치클럽 시즌제 + VIP 프라이빗) 인접하되 공용 도구(common floor) + DJ 바 + 드레스코드 + 종일권 없는 입장권제 + VIP 테이블 옵션 모델. 동시 한도 500 (나이트클럽별 동시 active guest, 대형 클럽 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/night-club.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/night-club/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveEntry",
      "applyVipTableLimit",
      "processVipBooking",
      "transitionVisitStatus",
      "expireClosedVisitBatch",
      "processVisitRefund",
    ],
  },
  {
    container: "studio",
    rulesPath: `${SPEC_CONTAINER_BASE}/studio/rules/studio-rules.md`,
    // 세션 386 (F558): Studio 합성 도메인 — 89번째 도메인 (다용도 스튜디오 산업, 78번째 신규 산업). Sprint WT autopilot 분리 작업 16회차 (DoD 6축 실감증 7회차 정착 완성 검증).
    // ST-001~ST-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 42회차 (carsharing → ... → concert-hall → karaoke → night-club → studio) — 🎬 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST 오프라인 엔터 20-클러스터 (단일 클러스터 20 도메인 round 마일스톤 신기록 + 16 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆 89번째 도메인 17.8배 확장 (S262 5 → S386 89). 🏆 withRuleId 90 Sprint 정점 round 마일스톤. 🏆 거울 변환 42회차. 🏆 S283 audit 43회차 도전.
    // ST 차별성: KR(노래방 프라이빗 룸 1-3시간) + NC(나이트클럽 야간 입장권) 인접하되 녹음+사진+댄스+동영상 워 임대+장비 임대+시간제+패키지 수세 모델. 동시 한도 20 (스튜디오별 동시 active slot, 소형 전문 스튜디오 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/studio.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/studio/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveSlot",
      "applyEquipmentLimit",
      "processSlotBooking",
      "transitionSlotStatus",
      "expireClosedSlotBatch",
      "processSlotRefund",
    ],
  },
  {
    container: "lasertag",
    rulesPath: `${SPEC_CONTAINER_BASE}/lasertag/rules/lasertag-rules.md`,
    // 세션 387 (F559): Laser tag 합성 도메인 — 90번째 도메인 (레이저태그 산업, 79번째 신규 산업). Sprint WT autopilot 분리 작업 17회차 (DoD 6축 실감증 8회차 정착 확인).
    // LS-001~LS-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 43회차 (carsharing → ... → night-club → studio → lasertag) — 🔫 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS 오프라인 엔터 21-클러스터 (단일 클러스터 21 도메인 첫 사례 마일스톤 신기록 + 17 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆🏆🏆 90번째 도메인 18배 round 마일스톤 (S262 5 → S387 90). 🏆 withRuleId 91 Sprint 정점 도전. 🏆 거울 변환 43회차. 🏆 S283 audit 44회차 도전.
    // LS 차별성: ST(스튜디오 전문 제작용) + NC(나이트클럽 야간 입장권) 인접하되 게임형 엔터 + 시간제 + 그룹 예약 + 점수 시스템 + 장비 임대 + 레벨별 맵 + 멤버십 모델. 동시 한도 10 (아레나별 동시 active session, 소형 레이저태그 아레나 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/lasertag.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/lasertag/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "reserveSession",
      "applyEquipmentLimit",
      "processSessionBooking",
      "transitionSessionStatus",
      "expireClosedSessionBatch",
      "processSessionRefund",
    ],
  },
  {
    container: "casino",
    rulesPath: `${SPEC_CONTAINER_BASE}/casino/rules/casino-rules.md`,
    // 세션 388 (F560): Casino 합성 도메인 — 91번째 도메인 (카지노 산업, 80번째 신규 산업). Sprint WT autopilot 분리 작업 18회차 (DoD 6축 실감증 9회차 정착 확인).
    // CA-001~CA-006 (Threshold × 2 + Atomic × 2 + Status × 2 균형 분포).
    // 거울 변환 44회차 (carsharing → ... → lasertag → casino) — 🎰 AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC+ST+LS+CA 오프라인 엔터 22-클러스터 (단일 클러스터 22 도메인 첫 사례 마일스톤 신기록 + 18 Sprint 연속 첫 사례 마일스톤 신기록).
    // 🏆🏆 80 신규 산업 round 마일스톤 (CC~CA 80 신규 산업 0 ABSENCE 연속 정점). 🏆 withRuleId 92 Sprint 정점 도전. 🏆 거울 변환 44회차. 🏆 S283 audit 44회차.
    // CA 차별성: GA(일반 도박 betting platform) + NC(나이트클럽 야간 입장 + VIP 테이블) 인접하되 물리 floor 운영 + 칩 ledger + table dealer 스케줄 + credit line/cage + jackpot/페이아웃 + responsible gaming 한도. 동시 한도 20 (floor별 동시 active session, 대형 카지노 floor 기반).
    sourcePath: `${DOMAIN_SOURCE_BASE}/casino.ts`,
    provenancePath: `${SPEC_CONTAINER_BASE}/casino/provenance.yaml`,
    sourceCodeStatus: "present",
    underImplTargets: [
      "registerSession",
      "applyBettingLimit",
      "processTableBooking",
      "transitionSessionStatus",
      "expireClosedSessionBatch",
      "processCashout",
    ],
  },
];

export function findDomainMapping(container: string): DomainMapping | undefined {
  return DOMAIN_MAP.find((m) => m.container === container);
}
