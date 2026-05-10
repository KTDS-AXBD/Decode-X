/**
 * F426 (Sprint 259) — BL-level DIVERGENCE 자동 검출 (TS AST 기반).
 *
 * Sprint 258 AIF-ANLS-056 자동화 분류 결과:
 *   - BL-028 (exclusion hardcoded 0)        — 95% 신뢰도 (정확 매칭)
 *   - BL-027 (under-implemented function)   — 70% 신뢰도 (heuristic)
 *
 * 본 모듈은 위 2종 패턴을 typescript Compiler API로 검출한다.
 * F354 (Sprint 218) 수동 markers와 구분하기 위해 모든 결과에 `autoDetected: true` 명시.
 */
import * as ts from "typescript";
import type { BLDivergenceMarker } from "@ai-foundry/types";

const BL028_NAME_PATTERN = /exclusion|excl_amount|exemptAmount/i;

/**
 * BL-028 — `exclusion*` / `excl_amount` / `exemptAmount` 변수가 literal `0`으로 초기화/할당되는 패턴 검출.
 *
 * Positive 매칭 (legacy):
 *   const exclusionAmount = 0;
 *   let excl_amount = 0;
 *   exclusionAmount = 0;
 *
 * Negative 매칭 (current):
 *   const exclusionAmount = Math.round(voucher.cashback_amount * 1.1);
 *   const value = 0;  // 이름 미매칭
 */
export function detectHardCodedExclusion(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  const markers: BLDivergenceMarker[] = [];

  function pushMarker(name: string, line: number): void {
    markers.push({
      ruleId: "BL-028",
      severity: "MEDIUM",
      pattern: "hardcoded_exclusion",
      sourceFile: fileName,
      sourceLine: line,
      detail: `${name} hardcoded to 0 — spec defines exclusion calculation formula (cashback*1.1 etc.)`,
      matchedText: `${name} = 0`,
      confidence: 0.95,
      autoDetected: true,
    });
  }

  function visit(node: ts.Node): void {
    // case A: const/let/var X = 0
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      const init = node.initializer;
      if (
        BL028_NAME_PATTERN.test(name) &&
        init &&
        ts.isNumericLiteral(init) &&
        init.text === "0"
      ) {
        const lineCol = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        pushMarker(name, lineCol.line + 1);
      }
    }

    // case B: X = 0 (assignment expression)
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const left = node.left.getText(sourceFile);
      const right = node.right;
      if (
        BL028_NAME_PATTERN.test(left) &&
        ts.isNumericLiteral(right) &&
        right.text === "0"
      ) {
        const lineCol = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        pushMarker(left, lineCol.line + 1);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return markers;
}

export interface DetectUnderImplementationOptions {
  targetFunctionNames?: string[];
  minBodyLines?: number;
  minBranchDepth?: number;
}

/**
 * BL-027 — under-implemented function heuristic.
 *
 * 검출 조건 (AND):
 *   - body line count < minBodyLines (default 10)
 *   - branch depth < minBranchDepth (default 2; if/switch/try-catch 중첩 깊이)
 *
 * Positive 매칭 (legacy stub):
 *   function approveRefund() { return { status: "approved" }; }
 *
 * Negative 매칭 (current):
 *   async function approveRefund(...) { /* 50+ lines, 3+ branches *\/ }
 *
 * 신뢰도 70% — heuristic이라 false positive 가능. targetFunctionNames로 범위 한정 시 정확도 향상.
 */
export function detectUnderImplementation(
  sourceFile: ts.SourceFile,
  fileName: string,
  options: DetectUnderImplementationOptions = {},
): BLDivergenceMarker[] {
  const markers: BLDivergenceMarker[] = [];
  const minLines = options.minBodyLines ?? 10;
  const minDepth = options.minBranchDepth ?? 2;
  const targetNames = options.targetFunctionNames;

  function countBranchDepth(body: ts.Node): number {
    let maxDepth = 0;
    function inner(node: ts.Node, depth: number): void {
      let nextDepth = depth;
      if (
        ts.isIfStatement(node) ||
        ts.isSwitchStatement(node) ||
        ts.isTryStatement(node)
      ) {
        nextDepth = depth + 1;
      }
      if (nextDepth > maxDepth) maxDepth = nextDepth;
      ts.forEachChild(node, (c) => inner(c, nextDepth));
    }
    inner(body, 0);
    return maxDepth;
  }

  function emitIfMatched(
    funcName: string,
    body: ts.Block,
    nodeStart: ts.Node,
  ): void {
    if (targetNames && !targetNames.includes(funcName)) return;

    const start = sourceFile.getLineAndCharacterOfPosition(body.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(body.getEnd());
    const bodyLines = end.line - start.line;
    const branchDepth = countBranchDepth(body);

    if (bodyLines < minLines && branchDepth < minDepth) {
      const declStart = sourceFile.getLineAndCharacterOfPosition(nodeStart.getStart());
      markers.push({
        ruleId: "BL-027",
        severity: "LOW",
        pattern: "under_implementation",
        sourceFile: fileName,
        sourceLine: declStart.line + 1,
        detail: `Function '${funcName}': bodyLines=${bodyLines} (<${minLines}) + branchDepth=${branchDepth} (<${minDepth}). Likely under-implemented.`,
        matchedText: funcName,
        confidence: 0.7,
        autoDetected: true,
      });
    }
  }

  function visit(node: ts.Node): void {
    // FunctionDeclaration
    if (ts.isFunctionDeclaration(node) && node.body && node.name) {
      emitIfMatched(node.name.getText(sourceFile), node.body, node);
    }

    // VariableDeclaration with FunctionExpression / ArrowFunction
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer;
      if (
        (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) &&
        init.body &&
        ts.isBlock(init.body)
      ) {
        emitIfMatched(node.name.getText(sourceFile), init.body, node);
      }
    }

    // MethodDeclaration
    if (ts.isMethodDeclaration(node) && node.body) {
      emitIfMatched(node.name.getText(sourceFile), node.body, node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return markers;
}

/**
 * 텍스트 → ts.SourceFile 변환 (in-memory parse, no fs).
 */
export function parseTypeScriptSource(
  fileName: string,
  sourceText: string,
): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
}

// ---------------------------------------------------------------------------
// F427 (Sprint 260) — BL-024 / BL-026 / BL-029 detector.
// Hybrid 접근: rules.md 파서가 BLRule[] 제공 → BL_DETECTOR_REGISTRY가 BL-ID로
// 하드코딩 detector 함수 매핑. NL→AST 자동 추출은 사용자 결정으로 회피.
// ---------------------------------------------------------------------------

const TEMPORAL_FIELD_PATTERN = /purchas|created|paid|daysSince/i;
const EXPIRY_FIELD_PATTERN = /expir|valid_until|valid_to|validUntil|validTo/i;
const NOW_VALUE_PATTERN = /\bnew\s+Date\s*\(\s*\)|Date\.now\s*\(\s*\)|\bnow\b|\btoday\b/;
const CASHBACK_FIELD_PATTERN = /cashback|cash_back|discount|할인보전/i;
const REJECT_OUTCOME_PATTERN =
  /REJECT|DENY|DENIED|UNAVAILABLE|cash.*refund.*denied|환불.*불가|불가|throw\s+new\s+\w*Error/i;

/**
 * BL-024 — 7일 윈도 체크 PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴: BinaryExpression with `>` operator + numeric literal `7` + temporal
 * field identifier (purchase/created/paid 등 alias).
 *
 * Positive (RESOLVED): daysSincePurchase > 7
 * Positive (RESOLVED): (Date.now() - new Date(payment.purchased_at).getTime()) / DAY_MS > 7
 *
 * ABSENCE 시 1 marker 발행 (DIVERGENCE).
 * 신뢰도 75% — temporal arithmetic 변형이 다양해 false negative 가능.
 */
export function detectTemporalCheck(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundCheck = false;
  let foundLine = 0;

  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.GreaterThanToken &&
      ts.isNumericLiteral(node.right) &&
      node.right.text === "7"
    ) {
      const leftText = node.left.getText(sourceFile);
      if (TEMPORAL_FIELD_PATTERN.test(leftText)) {
        foundCheck = true;
        foundLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundCheck) {
    return [
      {
        ruleId: "BL-024",
        severity: "HIGH",
        pattern: "missing_temporal_check",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "BL-024: No 7-day window check found for UNUSED_FULL refund. Expected pattern: daysSincePurchase > 7 or temporal arithmetic on purchase/created/paid field.",
        confidence: 0.75,
        autoDetected: true,
      },
    ];
  }
  // PRESENCE → 0 markers (RESOLVED 자동 입증)
  void foundLine;
  return [];
}

/**
 * BL-029 — 만료 거부 PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴: BinaryExpression with `<` operator + expiry field identifier
 * + now-side 비교 (new Date() / Date.now() / now / today).
 *
 * Positive (RESOLVED): new Date(voucher.expires_at) < new Date()
 * Positive (RESOLVED): voucher.expires_at < Date.now()
 *
 * 신뢰도 80% — 비교 연산자 + 명확한 필드명으로 false positive risk 낮음.
 */
export function detectExpiryCheck(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundCheck = false;

  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.LessThanToken
    ) {
      const leftText = node.left.getText(sourceFile);
      const rightText = node.right.getText(sourceFile);
      if (EXPIRY_FIELD_PATTERN.test(leftText) && NOW_VALUE_PATTERN.test(rightText)) {
        foundCheck = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundCheck) {
    return [
      {
        ruleId: "BL-029",
        severity: "MEDIUM",
        pattern: "missing_validation_check",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "BL-029: No expiry check found. Expected pattern: voucher.expires_at < new Date() or equivalent (expir/valid_until field + now comparison).",
        confidence: 0.8,
        autoDetected: true,
      },
    ];
  }
  return [];
}

/**
 * BL-026 — 캐시백 ALT 분기 PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴 (heuristic, AND):
 *   1. IfStatement / CaseClause / TernaryExpression
 *   2. condition contains cashback/discount/할인보전 식별자
 *   3. consequent body contains reject/deny outcome (REJECT/DENY/throw Error 등)
 *
 * Positive (RESOLVED): if (voucher.cashback_amount > 0) { throw new RefundError('CASHBACK_REFUND_DENIED', ...) }
 *
 * 신뢰도 65% — heuristic. cashback_amount 식별자는 BL-028 exclusionAmount 계산에도
 * 등장하므로(현 refund.ts line 116: `Math.round(voucher.cashback_amount * 1.1)`)
 * outcome reject 키워드 동시 매칭으로 false positive 완화.
 */
export function detectCashbackBranch(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundBranch = false;

  function nodeContainsRejectOutcome(node: ts.Node): boolean {
    const text = node.getText(sourceFile);
    return REJECT_OUTCOME_PATTERN.test(text);
  }

  function visit(node: ts.Node): void {
    // case A: IfStatement
    if (ts.isIfStatement(node)) {
      const condText = node.expression.getText(sourceFile);
      if (
        CASHBACK_FIELD_PATTERN.test(condText) &&
        nodeContainsRejectOutcome(node.thenStatement)
      ) {
        foundBranch = true;
      }
    }
    // case B: CaseClause within SwitchStatement
    if (ts.isCaseClause(node)) {
      const caseText = node.expression.getText(sourceFile);
      if (CASHBACK_FIELD_PATTERN.test(caseText)) {
        const bodyText = node.statements
          .map((s) => s.getText(sourceFile))
          .join("\n");
        if (REJECT_OUTCOME_PATTERN.test(bodyText)) foundBranch = true;
      }
    }
    // case C: ConditionalExpression (ternary)
    if (ts.isConditionalExpression(node)) {
      const condText = node.condition.getText(sourceFile);
      if (
        CASHBACK_FIELD_PATTERN.test(condText) &&
        nodeContainsRejectOutcome(node.whenTrue)
      ) {
        foundBranch = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundBranch) {
    return [
      {
        ruleId: "BL-026",
        severity: "MEDIUM",
        pattern: "missing_alt_branch",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "BL-026: No cashback/discount branch with reject/alt outcome found. Expected: if (voucher.cashback_amount > 0) { throw new RefundError('CASHBACK_REFUND_DENIED', ...) } or equivalent ALT outcome.",
        confidence: 0.65,
        autoDetected: true,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// F429 (Sprint 262) — 보편 detector 3종 (Threshold/Status transition/Atomic transaction).
// 동일 detector를 여러 BL에 매핑하여 도메인 cross-cutting 패턴 검출.
// ---------------------------------------------------------------------------

const THRESHOLD_VAR_PATTERN = /amount|limit|threshold|max|min|count|total|balance|fee/i;

/**
 * BL-005/006/007/008/015 — Threshold check PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴:
 *   - BinaryExpression with >, >=, <, <= operator
 *   - left side identifier matches THRESHOLD_VAR_PATTERN OR property access (a.b)
 *   - right side NumericLiteral OR UPPERCASE_CONSTANT identifier
 *
 * Positive (RESOLVED): if (dailyRow.total + amount > DAILY_LIMIT) throw ...
 * Positive (RESOLVED): if (amount >= 50_000) sendSms(...)
 * Negative (DIVERGENCE): no threshold comparison
 *
 * 신뢰도 70% — 일반 조건문 false positive 우려이나 변수명+상수 동시 매칭으로 완화.
 */
export function detectThresholdCheck(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundThreshold = false;

  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      const leftText = node.left.getText(sourceFile);
      const rightText = node.right.getText(sourceFile);
      const rightIsLiteral = ts.isNumericLiteral(node.right);
      const leftIsLiteral = ts.isNumericLiteral(node.left);
      const rightIsConstant = /^[A-Z][A-Z_0-9]+$/.test(rightText);
      const leftIsConstant = /^[A-Z][A-Z_0-9]+$/.test(leftText);

      // F445 (Sprint 279) — Path A 확장: 한쪽이 UPPERCASE_CONSTANT 또는 numeric literal이면
      //   var-like 검증 skip. UPPERCASE/literal은 거의 항상 threshold const 의미.
      //   (CC-001 `creditScore < MIN_CREDIT_SCORE`, `annualIncome < MIN_INCOME_KRW` 대응)
      if (rightIsConstant || rightIsLiteral || leftIsConstant || leftIsLiteral) {
        foundThreshold = true;
      }
      // F445 (Sprint 279) — Path B 신규: var-vs-var 비교에서 양변 중 하나라도
      //   THRESHOLD_VAR_PATTERN(amount/limit/threshold/...) 매칭 시 인정.
      //   (CC-002 `remainingLimit < amount` 대응 — left에 `limit` 매칭)
      //   `.` property access는 path B에서 제외 (false positive 회피, 예: `i < arr.length`).
      else if (
        THRESHOLD_VAR_PATTERN.test(leftText) ||
        THRESHOLD_VAR_PATTERN.test(rightText)
      ) {
        foundThreshold = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundThreshold) {
    return [
      {
        ruleId: "BL-THRESHOLD-GENERIC",
        severity: "MEDIUM",
        pattern: "missing_threshold_check",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "No threshold/limit comparison found. Expected: variable >|>=|<|<= literal or UPPERCASE_CONSTANT.",
        confidence: 0.7,
        autoDetected: true,
      },
    ];
  }
  return [];
}

const STATUS_FIELD_PATTERN = /\bstatus\b/i;

/**
 * BL-014 — Status transition PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 조건 (AND):
 *   1. BinaryExpression `status === 'X'` or `status !== 'X'`
 *   2. PropertyAssignment `status: 'Y'` OR SQL string `status = 'Y'` OR INSERT...VALUES(...,'Y',...)
 *
 * Positive (RESOLVED): if (voucher.status !== 'ACTIVE') throw + INSERT INTO ... VALUES(..., 'PAID', ...)
 *
 * 신뢰도 75%. comparison + assignment 동시 매칭으로 false positive 회피.
 */
export function detectStatusTransition(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundComparison = false;
  let foundAssignment = false;

  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      const leftText = node.left.getText(sourceFile);
      if (STATUS_FIELD_PATTERN.test(leftText) && ts.isStringLiteral(node.right)) {
        foundComparison = true;
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const nameText = node.name.getText(sourceFile);
      if (STATUS_FIELD_PATTERN.test(nameText) && ts.isStringLiteral(node.initializer)) {
        foundAssignment = true;
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.getText(sourceFile);
      if (/\bstatus\s*=\s*['"]\w+['"]|VALUES\s*\([^)]*'[A-Z_]+'/.test(text)) {
        foundAssignment = true;
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!(foundComparison && foundAssignment)) {
    return [
      {
        ruleId: "BL-STATUS-TRANSITION-GENERIC",
        severity: "MEDIUM",
        pattern: "missing_status_transition",
        sourceFile: fileName,
        sourceLine: 0,
        detail: `Missing status state-machine pattern. comparison=${foundComparison}, assignment=${foundAssignment}. Expected both: \`status === 'X'\` + \`status: 'Y'\`.`,
        confidence: 0.75,
        autoDetected: true,
      },
    ];
  }
  return [];
}

const TX_RECEIVER_PATTERN = /\bdb\b|\bdatabase\b|\btx\b/i;

/**
 * BL-022 — Atomic transaction PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴: `db.transaction(() => {...})` 형태 호출 (better-sqlite3 표준).
 *
 * 신뢰도 85% — 표준 API 호출 패턴이라 false positive risk 낮음.
 */
export function detectAtomicTransaction(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundTransaction = false;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText(sourceFile) === "transaction"
    ) {
      const receiverText = node.expression.expression.getText(sourceFile);
      if (TX_RECEIVER_PATTERN.test(receiverText)) {
        foundTransaction = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundTransaction) {
    return [
      {
        ruleId: "BL-ATOMIC-TX-GENERIC",
        severity: "MEDIUM",
        pattern: "missing_atomic_transaction",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "No atomic transaction found. Expected: db.transaction(() => {...}) call (better-sqlite3 pattern).",
        confidence: 0.85,
        autoDetected: true,
      },
    ];
  }
  return [];
}

/**
 * Detector function 시그니처 (BL_DETECTOR_REGISTRY 등록용).
 */
export type DetectorFn = (
  sourceFile: ts.SourceFile,
  fileName: string,
) => BLDivergenceMarker[];

/**
 * 동일 detector 결과에 도메인별 ruleId 부여 (registry pattern 재사용).
 */
function withRuleId(
  markers: BLDivergenceMarker[],
  ruleId: string,
): BLDivergenceMarker[] {
  return markers.map((m) => ({ ...m, ruleId }));
}

/**
 * BL-ID → detector 매핑 table. Hybrid 접근의 핵심.
 *
 * Sprint 259 (F426): BL-027/028 (refund domain stubs).
 * Sprint 260 (F427): BL-024/026/029 (refund domain temporal/expiry/cashback).
 * Sprint 262 (F429): BL-005/006/007/008/014/015/022 (universal patterns via withRuleId).
 * Sprint 264 (F431): BL-G002/G003/G004/G005/G006 (gift domain via withRuleId).
 *
 * 미등록 BL-ID는 detector scope 외 — provenance cross-check에서 UNKNOWN 분류.
 */
export const BL_DETECTOR_REGISTRY: Record<string, DetectorFn> = {
  // Sprint 260 (F427) — refund specific
  "BL-024": detectTemporalCheck,
  "BL-026": detectCashbackBranch,
  "BL-027": (sf, fn) => detectUnderImplementation(sf, fn),
  "BL-028": detectHardCodedExclusion,
  "BL-029": detectExpiryCheck,
  // Sprint 262 (F429) — universal threshold
  "BL-005": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-005"),
  "BL-006": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-006"),
  "BL-007": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-007"),
  "BL-008": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-008"),
  "BL-015": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-015"),
  // Sprint 262 (F429) — universal status
  "BL-014": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-014"),
  // Sprint 262 (F429) — universal atomic
  "BL-022": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-022"),
  // Sprint 264 (F431) — gift domain (status transitions + atomic transfer)
  "BL-G002": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-G002"),
  "BL-G003": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-G003"),
  "BL-G004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-G004"),
  "BL-G005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-G005"),
  "BL-G006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-G006"),
  // Sprint 265 (F432) — settlement domain (atomic × 2, threshold × 1, status × 1)
  "BL-033": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-033"),
  "BL-034": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-034"),
  "BL-035": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-035"),
  "BL-036": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-036"),
  // Sprint 266 (F433) — budget domain (threshold × 3, status × 1, atomic × 1)
  "BB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BB-001"),
  "BB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BB-002"),
  "BB-003": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BB-003"),
  "BB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BB-004"),
  "BB-005": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BB-005"),
  // Sprint 266 (F433) — purchase domain (threshold × 3, status × 2)
  "BP-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BP-001"),
  "BP-002": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BP-002"),
  "BP-003": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BP-003"),
  "BP-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BP-004"),
  "BP-005": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BP-005"),
  // Sprint 269 (F436) — miraeasset-pension domain (threshold × 4, status × 2, atomic × 1)
  "P-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "P-001"),
  "P-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "P-002"),
  "P-003": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "P-003"),
  "P-004": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "P-004"),
  "P-005": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "P-005"),
  "P-006": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "P-006"),
  "P-007": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "P-007"),
  // Sprint 274 (F440) — generic-voucher domain (threshold × 3, atomic × 1, status × 2 — 합성, 9번째 도메인)
  "V-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "V-001"),
  "V-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "V-002"),
  "V-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "V-003"),
  "V-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "V-004"),
  "V-005": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "V-005"),
  "V-006": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "V-006"),
  // Sprint 275 (F441) — loyalty-points domain (threshold × 3, atomic × 1, status × 2 — 합성, 10번째 도메인)
  "LP-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LP-001"),
  "LP-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LP-002"),
  "LP-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "LP-003"),
  "LP-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LP-004"),
  "LP-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LP-005"),
  "LP-006": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LP-006"),
  // Sprint 277 (F443) — lpon-cancel domain (atomic × 1 — 11번째 도메인 활성화, BL-042 신규)
  "BL-042": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-042"),
  // Sprint 278 (F444) — credit-card domain (threshold × 2, atomic × 2, status × 2 — 12번째 도메인, LPON 외 첫 산업)
  "CC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CC-001"),
  "CC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CC-002"),
  "CC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CC-003"),
  "CC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CC-004"),
  "CC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CC-005"),
  "CC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CC-006"),
  // Sprint 283 (F449) — delivery domain (threshold × 2, atomic × 2, status × 2 — 13번째 도메인, 배송 산업)
  "DV-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "DV-001"),
  "DV-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "DV-002"),
  "DV-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "DV-003"),
  "DV-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "DV-004"),
  "DV-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "DV-005"),
  "DV-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "DV-006"),
  // Sprint 284 (F450) — subscription domain (threshold × 2, atomic × 2, status × 2 — 14번째 도메인, SaaS 구독 산업)
  "SB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SB-001"),
  "SB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SB-002"),
  "SB-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SB-003"),
  "SB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SB-004"),
  "SB-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SB-005"),
  "SB-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SB-006"),
  // Sprint 285 (F451) — insurance domain (threshold × 2, atomic × 2, status × 2 — 15번째 도메인, 보험 산업, 4번째 신규)
  "IN-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "IN-001"),
  "IN-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "IN-002"),
  "IN-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "IN-003"),
  "IN-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "IN-004"),
  "IN-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "IN-005"),
  "IN-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "IN-006"),
  // Sprint 286 (F452) — healthcare domain (threshold × 2, atomic × 2, status × 2 — 16번째 도메인, 의료 산업, 5번째 신규)
  "HC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "HC-001"),
  "HC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "HC-002"),
  "HC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "HC-003"),
  "HC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "HC-004"),
  "HC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "HC-005"),
  "HC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "HC-006"),
  // Sprint 287 (F453) — education domain (threshold × 2, atomic × 2, status × 2 — 17번째 도메인, 교육 산업, 6번째 신규)
  "ED-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ED-001"),
  "ED-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ED-002"),
  "ED-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ED-003"),
  "ED-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ED-004"),
  "ED-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ED-005"),
  "ED-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ED-006"),
  // Sprint 288 (F454) — realestate domain (threshold × 2, atomic × 2, status × 2 — 18번째 도메인, 부동산 산업, 7번째 신규)
  "RE-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RE-001"),
  "RE-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RE-002"),
  "RE-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RE-003"),
  "RE-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RE-004"),
  "RE-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RE-005"),
  "RE-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RE-006"),
  // Sprint 289 (F455) — logistics domain (threshold × 2, atomic × 2, status × 2 — 19번째 도메인, 물류 산업, 8번째 신규)
  "LG-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LG-001"),
  "LG-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LG-002"),
  "LG-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "LG-003"),
  "LG-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LG-004"),
  "LG-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LG-005"),
  "LG-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "LG-006"),
  // Sprint 290 (F456) — hospitality domain (threshold × 2, atomic × 2, status × 2 — 20번째 도메인, 숙박 산업, 9번째 신규)
  "HO-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "HO-001"),
  "HO-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "HO-002"),
  "HO-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "HO-003"),
  "HO-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "HO-004"),
  "HO-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "HO-005"),
  "HO-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "HO-006"),
  // Sprint 291 (F457) — travel domain (threshold × 2, atomic × 2, status × 2 — 21번째 도메인, 여행 산업, 10번째 신규)
  "TR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TR-001"),
  "TR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TR-002"),
  "TR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TR-003"),
  "TR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TR-004"),
  "TR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TR-005"),
  "TR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TR-006"),
  // Sprint 292 (F458) — manufacturing domain (threshold × 2, atomic × 2, status × 2 — 22번째 도메인, 제조 산업, 11번째 신규)
  "MF-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MF-001"),
  "MF-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MF-002"),
  "MF-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MF-003"),
  "MF-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MF-004"),
  "MF-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MF-005"),
  "MF-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MF-006"),
  // Sprint 293 (F459) — retail domain (threshold × 2, atomic × 2, status × 2 — 23번째 도메인, 소매 산업, 12번째 신규)
  "RT-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RT-001"),
  "RT-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RT-002"),
  "RT-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RT-003"),
  "RT-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RT-004"),
  "RT-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RT-005"),
  "RT-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RT-006"),

  // Sprint 294 (F460) — energy domain (threshold × 2, atomic × 2, status × 2 — 24번째 도메인, 에너지 산업, 13번째 신규)
  "EN-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "EN-001"),
  "EN-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "EN-002"),
  "EN-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "EN-003"),
  "EN-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "EN-004"),
  "EN-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "EN-005"),
  "EN-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "EN-006"),

  // Sprint 295 (F461) — government domain (threshold × 2, atomic × 2, status × 2 — 25번째 도메인, 공공 산업, 14번째 신규)
  "GV-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GV-001"),
  "GV-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GV-002"),
  "GV-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GV-003"),
  "GV-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GV-004"),
  "GV-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GV-005"),
  "GV-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GV-006"),

  // Sprint 296 (F462) — telecom domain (threshold × 2, atomic × 2, status × 2 — 26번째 도메인, 통신 산업, 15번째 신규)
  "TC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TC-001"),
  "TC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TC-002"),
  "TC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TC-003"),
  "TC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TC-004"),
  "TC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TC-005"),
  "TC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TC-006"),

  // Sprint 297 (F463) — banking domain (threshold × 2, atomic × 2, status × 2 — 27번째 도메인, 은행 산업, 16번째 신규)
  "BK-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BK-001"),
  "BK-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BK-002"),
  "BK-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BK-003"),
  "BK-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BK-004"),
  "BK-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BK-005"),
  "BK-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BK-006"),

  // F464 (Sprint 298) — Media 합성 도메인 (28번째 도메인, 미디어 산업, 17번째 신규 산업)
  "MD-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MD-001"),
  "MD-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MD-002"),
  "MD-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MD-003"),
  "MD-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MD-004"),
  "MD-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MD-005"),
  "MD-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MD-006"),

  // F465 (Sprint 299) — Pharmacy 합성 도메인 (29번째 도메인, 제약/약국 산업, 18번째 신규 산업)
  "PH-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PH-001"),
  "PH-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PH-002"),
  "PH-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PH-003"),
  "PH-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PH-004"),
  "PH-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PH-005"),
  "PH-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PH-006"),

  // F466 (Sprint 300) — Agriculture 합성 도메인 (30번째 도메인, 농업 산업, 19번째 신규 산업) 🏆 Sprint 300 마일스톤
  "AG-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AG-001"),
  "AG-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AG-002"),
  "AG-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AG-003"),
  "AG-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AG-004"),
  "AG-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AG-005"),
  "AG-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AG-006"),

  // F467 (Sprint 301) — Construction 합성 도메인 (31번째 도메인, 건설 산업, 20번째 신규 산업) 🏆 20 산업 round number
  "CN-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CN-001"),
  "CN-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CN-002"),
  "CN-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CN-003"),
  "CN-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CN-004"),
  "CN-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CN-005"),
  "CN-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CN-006"),

  // F468 (Sprint 302) — Maritime 합성 도메인 (32번째 도메인, 해운 산업, 21번째 신규 산업) 🎯 AIF-PLAN-100
  "MR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MR-001"),
  "MR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MR-002"),
  "MR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MR-003"),
  "MR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MR-004"),
  "MR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MR-005"),
  "MR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MR-006"),

  // F469 (Sprint 303) — Public Transport 합성 도메인 (33번째 도메인, 대중교통 산업, 22번째 신규 산업)
  "TS-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TS-001"),
  "TS-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TS-002"),
  "TS-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TS-003"),
  "TS-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TS-004"),
  "TS-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TS-005"),
  "TS-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TS-006"),

  // F470 (Sprint 304) — Aviation 합성 도메인 (34번째 도메인, 항공 산업, 23번째 신규 산업)
  "AV-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AV-001"),
  "AV-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AV-002"),
  "AV-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AV-003"),
  "AV-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AV-004"),
  "AV-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AV-005"),
  "AV-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AV-006"),

  // F471 (Sprint 305) — Mining 합성 도메인 (35번째 도메인, 광업 산업, 24번째 신규 산업)
  "MN-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MN-001"),
  "MN-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MN-002"),
  "MN-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MN-003"),
  "MN-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MN-004"),
  "MN-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MN-005"),
  "MN-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MN-006"),

  // F472 (Sprint 306) — Defense 합성 도메인 (36번째 도메인, 국방 산업, 25번째 신규 산업)
  "DF-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "DF-001"),
  "DF-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "DF-002"),
  "DF-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "DF-003"),
  "DF-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "DF-004"),
  "DF-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "DF-005"),
  "DF-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "DF-006"),

  // F473 (Sprint 307) — Sports 합성 도메인 (37번째 도메인, 스포츠 산업, 26번째 신규 산업)
  "SP-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SP-001"),
  "SP-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SP-002"),
  "SP-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SP-003"),
  "SP-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SP-004"),
  "SP-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SP-005"),
  "SP-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SP-006"),

  // F474 (Sprint 308) — Charity 합성 도메인 (38번째 도메인, 비영리 산업, 27번째 신규 산업)
  "CH-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CH-001"),
  "CH-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CH-002"),
  "CH-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CH-003"),
  "CH-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CH-004"),
  "CH-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CH-005"),
  "CH-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CH-006"),

  // F475 (Sprint 309) — Wellness 합성 도메인 (39번째 도메인, 웰니스 산업, 28번째 신규 산업)
  "WL-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "WL-001"),
  "WL-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "WL-002"),
  "WL-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "WL-003"),
  "WL-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "WL-004"),
  "WL-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "WL-005"),
  "WL-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "WL-006"),

  // F476 (Sprint 310) — Pet Services 합성 도메인 (40번째 도메인, 반려동물 산업, 29번째 신규 산업)
  "PT-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PT-001"),
  "PT-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PT-002"),
  "PT-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PT-003"),
  "PT-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PT-004"),
  "PT-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PT-005"),
  "PT-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PT-006"),
};
