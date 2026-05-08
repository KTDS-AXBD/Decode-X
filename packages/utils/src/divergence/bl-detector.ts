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
      const leftIsVarLike =
        THRESHOLD_VAR_PATTERN.test(leftText) || leftText.includes(".");
      const rightIsLiteral = ts.isNumericLiteral(node.right);
      const rightIsConstant = /^[A-Z][A-Z_0-9]+$/.test(rightText);

      if (leftIsVarLike && (rightIsLiteral || rightIsConstant)) {
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
};
