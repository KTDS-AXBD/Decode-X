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
];

export function findDomainMapping(container: string): DomainMapping | undefined {
  return DOMAIN_MAP.find((m) => m.container === container);
}
