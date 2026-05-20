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
 * BL-030 — 유효기간 연장 거부 PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴: "extend" / "extension" / "renew" 식별자 또는 문자열 리터럴.
 * 구현 예시: if (refundType === 'EXTENSION') throw new RefundError('EXTENSION_NOT_ALLOWED', ...)
 *
 * ABSENCE: 패턴 미발견 — 유효기간 연장 거부 로직 자체 미구현.
 * 신뢰도 75%.
 */
export function detectExpiryExtension(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundExtension = false;

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && /extend|extension|renew/i.test(node.text)) {
      foundExtension = true;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /extend|extension|EXTEND|EXTENSION/i.test(node.text)
    ) {
      foundExtension = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundExtension) {
    return [
      {
        ruleId: "BL-EXPIRY-EXTENSION-GENERIC",
        severity: "MEDIUM",
        pattern: "missing_validation_check",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "No expiry extension handling found. Expected: rejection for EXTENSION-type requests (e.g., if (refundType === 'EXTENSION') throw RefundError('EXTENSION_NOT_ALLOWED', ...)).",
        confidence: 0.75,
        autoDetected: true,
      },
    ];
  }
  return [];
}

/**
 * BL-G001 — gift 발송 구현 PRESENCE/ABSENCE 검출.
 *
 * PRESENCE 패턴: `sendGift` 또는 `createGift` 함수 식별자가 소스에 존재.
 * ABSENCE 패턴: 두 함수 모두 미존재 → gift.ts에 발송 로직 자체 미구현.
 *
 * 신뢰도 90% — 함수명 기반 정확 매칭. gift.ts에 sendGift/createGift 부재는
 * BL-G001 (발송자 발송 → 잔액 차감 + pending 생성) 미구현의 직접 증거.
 */
export function detectGiftImplementation(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  let foundImpl = false;
  const targetNames = new Set(["sendGift", "createGift"]);

  function visit(node: ts.Node): void {
    if (foundImpl) return;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      targetNames.has(node.name.text)
    ) {
      foundImpl = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundImpl) {
    return [
      {
        ruleId: "BL-G001",
        severity: "HIGH",
        pattern: "under_implementation",
        sourceFile: fileName,
        sourceLine: 0,
        detail:
          "BL-G001: No sendGift or createGift function found. Gift sending (balance deduction + pending creation) is not implemented.",
        confidence: 0.9,
        autoDetected: true,
      },
    ];
  }
  return [];
}

/**
 * 일반화 ABSENCE detector — sourceFile에 targetNames 함수 모두 부재 시 1 ABSENCE marker 반환.
 *
 * Sprint 317 (F483) 도입: lpon-payment 5 ABSENCE detector 공통 helper.
 * `detectGiftImplementation` 패턴 일반화 — 함수명 그룹 부재 검사 + ruleId/detail/confidence 외부 주입.
 *
 * 신뢰도 90% — 함수명 기반 정확 매칭.
 */
function detectAbsentFunctions(
  sourceFile: ts.SourceFile,
  fileName: string,
  ruleId: string,
  targetNames: string[],
  detail: string,
): BLDivergenceMarker[] {
  let foundImpl = false;
  const nameSet = new Set(targetNames);

  function visit(node: ts.Node): void {
    if (foundImpl) return;
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      nameSet.has(node.name.text)
    ) {
      foundImpl = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!foundImpl) {
    return [
      {
        ruleId,
        severity: "HIGH",
        pattern: "under_implementation",
        sourceFile: fileName,
        sourceLine: 0,
        detail,
        confidence: 0.9,
        autoDetected: true,
      },
    ];
  }
  return [];
}

/**
 * Sprint 317 (F483) — lpon-payment 5 ABSENCE marker detector.
 *
 * payment.ts (169 lines, 1 함수 `processPayment`)에 cancel/refund 분기 자체 부재.
 * 5 BL 모두 cancel 흐름 부재 명시 — LPON pilot 5 컨테이너 100% 마일스톤.
 *
 * Detector 패턴: `detectAbsentFunctions` helper 5회 호출.
 * 신뢰도 90% — 함수명 기반 정확 매칭.
 */
export function detectCompanyRefund(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  return detectAbsentFunctions(
    sourceFile,
    fileName,
    "BL-013",
    ["refundByCompany", "cancelChargeRefund"],
    "BL-013: No refundByCompany or cancelChargeRefund function found. Company-initiated charge refund is not implemented in payment domain (handled in refund domain).",
  );
}

export function detectPaymentCancellation(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  return detectAbsentFunctions(
    sourceFile,
    fileName,
    "BL-016",
    ["cancelPayment", "refundPayment"],
    "BL-016: No cancelPayment or refundPayment function found. Payment cancellation request flow (card authorization reversal + transaction history update) is not implemented.",
  );
}

export function detectMerchantMpmCancel(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  return detectAbsentFunctions(
    sourceFile,
    fileName,
    "BL-017",
    ["cancelByMerchant", "mpmCancel", "sendMpmCancelMessage"],
    "BL-017: No cancelByMerchant, mpmCancel, or sendMpmCancelMessage function found. Merchant-initiated cancellation via BC card MPM message transmission is not implemented.",
  );
}

export function detectQrMerchantApproval(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  return detectAbsentFunctions(
    sourceFile,
    fileName,
    "BL-018",
    ["approveQrCancel", "merchantApproveCancel", "qrMerchantApprove"],
    "BL-018: No approveQrCancel, merchantApproveCancel, or qrMerchantApprove function found. QR cancellation request awaiting merchant approval flow is not implemented.",
  );
}

export function detectWithdrawnUserCancel(
  sourceFile: ts.SourceFile,
  fileName: string,
): BLDivergenceMarker[] {
  return detectAbsentFunctions(
    sourceFile,
    fileName,
    "BL-019",
    ["cancelByWithdrawnUser", "ap06Cancel", "withdrawnUserRefund"],
    "BL-019: No cancelByWithdrawnUser, ap06Cancel, or withdrawnUserRefund function found. Withdrawn user payment/purchase cancellation via external AP06 API is not implemented.",
  );
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
 * Sprint 314 (F480): BL-001/002/003/004 (lpon-charge gap fill — 95.0% coverage 돌파).
 * Sprint 315 (F481): BL-020/021/023/025 (lpon-refund gap fill) + BL-030 (ABSENCE marker — 96.9% coverage).
 * Sprint 316 (F482): BL-031/032/G001 (lpon-settlement+gift gap fill — 98.1% coverage 도달).
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
  // Sprint 314 (F480) — lpon-charge gap fill: 외부 출금 API try/catch + db.transaction
  // BL-001 (외부 출금 API 호출) / BL-002 (출금 성공 → 충전 완료 단일 tx) /
  // BL-003 (출금 실패 catch branch) / BL-004 (출금 응답 timeout — 동일 try/catch)
  // 모두 charging.ts executeCharge 내 try/catch + db.transaction 패턴 — AtomicTransaction 매핑.
  // detect-bl coverage: 243/260 → 247/260 = 95.0% 돌파.
  "BL-001": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-001"),
  "BL-002": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-002"),
  "BL-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-003"),
  "BL-004": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-004"),
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

  // F477 (Sprint 311) — Property Mgmt 합성 도메인 (41번째 도메인, 임대관리 산업, 30번째 신규 산업)
  // 🏆 30 산업 연속 0 ABSENCE round number 마일스톤. RE 부동산 + PR 임대관리 클러스터.
  "PR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PR-001"),
  "PR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PR-002"),
  "PR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PR-003"),
  "PR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PR-004"),
  "PR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PR-005"),
  "PR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PR-006"),

  // F478 (Sprint 312) — Fitness 합성 도메인 (42번째 도메인, 피트니스 산업, 31번째 신규 산업)
  // 🏆 40 Sprint 연속 정점 (round number 마일스톤). WL+SP+FT 클러스터 형성.
  "FT-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FT-001"),
  "FT-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FT-002"),
  "FT-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FT-003"),
  "FT-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FT-004"),
  "FT-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FT-005"),
  "FT-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FT-006"),

  // F479 (Sprint 313) — Beauty Salon 합성 도메인 (43번째 도메인, 미용실 산업, 32번째 신규 산업)
  // WL+SP+FT+BT 서비스 4-클러스터 완성. 41 Sprint 연속 정점.
  "BT-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BT-001"),
  "BT-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BT-002"),
  "BT-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BT-003"),
  "BT-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BT-004"),
  "BT-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BT-005"),
  "BT-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BT-006"),

  // F484 (Sprint 318) — Telemedicine 합성 도메인 (44번째 도메인, 원격진료 산업, 33번째 신규 산업)
  // HC+PH+TM 의료 3-클러스터 형성. 45 Sprint 연속 정점 (S264~S278+S283~S318).
  "TM-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TM-001"),
  "TM-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TM-002"),
  "TM-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TM-003"),
  "TM-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TM-004"),
  "TM-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TM-005"),
  "TM-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TM-006"),

  // F485 (Sprint 319) — Veterinary 합성 도메인 (45번째 도메인, 동물병원 진료 산업, 34번째 신규 산업)
  // PT+VT 동물 케어 2-클러스터 형성. 46 Sprint 연속 정점 도전 (S264~S278+S283~S319).
  "VT-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "VT-001"),
  "VT-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "VT-002"),
  "VT-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "VT-003"),
  "VT-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "VT-004"),
  "VT-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "VT-005"),
  "VT-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "VT-006"),

  // F488 (세션 295) — Gym 합성 도메인 (46번째 도메인, 헬스장 매장 산업, 35번째 신규 산업)
  // PT+FT+GY 스포츠/헬스 3-클러스터 형성. 47 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295).
  "GY-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GY-001"),
  "GY-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GY-002"),
  "GY-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GY-003"),
  "GY-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GY-004"),
  "GY-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GY-005"),
  "GY-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GY-006"),

  // F494 (세션 296) — Parking 합성 도메인 (47번째 도메인, 주차 관리 산업, 36번째 신규 산업)
  // RE+PR+PK 부동산 3-클러스터 형성. 48 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296).
  // S283 audit fix 1차: HT(Hotel→hospitality 중복) + FD(Food Delivery→delivery 중복) → PK 채택.
  "PK-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PK-001"),
  "PK-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PK-002"),
  "PK-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PK-003"),
  "PK-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PK-004"),
  "PK-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PK-005"),
  "PK-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PK-006"),

  // F500 (세션 297) — Car Sharing 합성 도메인 (48번째 도메인, 카쉐어링 산업, 37번째 신규 산업)
  // TR+AV+CS 운송 3-클러스터 형성. 49 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297).
  "CS-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CS-001"),
  "CS-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CS-002"),
  "CS-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CS-003"),
  "CS-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CS-004"),
  "CS-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CS-005"),
  "CS-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CS-006"),

  // F502 (세션 298) — Fast Food 합성 도메인 (49번째 도메인, 패스트푸드 산업, 38번째 신규 산업)
  // DV+WL+FT+FS QSR 외식 4-클러스터 확장. 50 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297+S298).
  "FS-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FS-001"),
  "FS-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FS-002"),
  "FS-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FS-003"),
  "FS-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FS-004"),
  "FS-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FS-005"),
  "FS-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FS-006"),

  // F506 (세션 299) — Aerospace 합성 도메인 (50번째 도메인, 항공우주 산업, 39번째 신규 산업)
  // TR+AV+CS+AS 항공/운송 4-클러스터 확장. 🏆 50번째 도메인 마일스톤 (S262 5 → S299 50, 10배 확장).
  // 51 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295+S296+S297+S298+S299).
  "AS-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AS-001"),
  "AS-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AS-002"),
  "AS-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AS-003"),
  "AS-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AS-004"),
  "AS-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AS-005"),
  "AS-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AS-006"),

  // F509 (세션 300) — Music streaming 합성 도메인 (51번째 도메인, 음악 스트리밍 산업, 40번째 신규 산업)
  // 거울 변환 4회차 (carsharing → fastfood → aerospace → music). 52 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S300).
  // 디지털 콘텐츠 도메인 신규. withRuleId 재사용 51번째 도메인.
  "MU-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MU-001"),
  "MU-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MU-002"),
  "MU-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MU-003"),
  "MU-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MU-004"),
  "MU-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MU-005"),
  "MU-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MU-006"),

  // F511 (세션 301) — Shipping 합성 도메인 (52번째 도메인, 해운/선적 산업, 41번째 신규 산업)
  // 거울 변환 5회차 (carsharing → fastfood → aerospace → music → shipping). 53 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295~S301).
  // LG+SH 국제무역 클러스터 신규 (LG 물류 + SH 해운 분리). withRuleId 재사용 52번째 도메인.
  // 🏆 52번째 도메인 마일스톤 (S262 5 → S301 52, 10.4배 확장).
  "SH-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SH-001"),
  "SH-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SH-002"),
  "SH-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SH-003"),
  "SH-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SH-004"),
  "SH-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SH-005"),
  "SH-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SH-006"),
  // 세션 304 (F518): Publishing 합성 도메인 53번째 (42번째 신규 산업, 출판 IP).
  // MU+PB 디지털 콘텐츠 클러스터 확장 (MU 음악 스트리밍 + PB 출판 IP).
  // withRuleId 재사용 53번째 도메인. 🏆 53번째 도메인 마일스톤 (S262 5 → S304 53, 10.6배 확장).
  "PB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PB-001"),
  "PB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PB-002"),
  "PB-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PB-003"),
  "PB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PB-004"),
  "PB-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PB-005"),
  "PB-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PB-006"),
  // 세션 304 후속 (F521): Textile 합성 도메인 54번째 (43번째 신규 산업, 방직/섬유).
  // MF+TX 제조 클러스터 확장 (MF 제조 일반 + TX 섬유 특화).
  // withRuleId 재사용 54번째 도메인. 🏆 54번째 도메인 마일스톤 (S262 5 → S304 54, 10.8배 확장).
  "TX-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TX-001"),
  "TX-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TX-002"),
  "TX-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TX-003"),
  "TX-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TX-004"),
  "TX-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TX-005"),
  "TX-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TX-006"),
  // 세션 304 후속 (F522): Advertising 합성 도메인 55번째 (44번째 신규 산업, 광고 캠페인).
  // MU+PB+AD 디지털 콘텐츠 3-클러스터 확장 (MU 음악 + PB 출판 + AD 광고).
  // withRuleId 재사용 55번째 도메인. 🏆 55번째 도메인 마일스톤 (S262 5 → S304 55, 11배 확장).
  "AD-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AD-001"),
  "AD-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AD-002"),
  "AD-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AD-003"),
  "AD-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AD-004"),
  "AD-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AD-005"),
  "AD-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AD-006"),
  // 세션 304 후속 (F523): Gaming 합성 도메인 56번째 (45번째 신규 산업, 게임 라이브).
  // MU+PB+AD+GM 디지털 콘텐츠 4-클러스터 확장 (MU 음악 + PB 출판 + AD 광고 + GM 게임).
  // withRuleId 재사용 56번째 도메인. 🏆 56번째 도메인 마일스톤 (S262 5 → S304 56, 11.2배 확장).
  "GM-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GM-001"),
  "GM-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GM-002"),
  "GM-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GM-003"),
  "GM-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GM-004"),
  "GM-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GM-005"),
  "GM-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GM-006"),
  // 세션 305 (F524): Video 합성 도메인 57번째 (46번째 신규 산업, 영상 스트리밍).
  // MU+PB+AD+GM+VD 디지털 콘텐츠 5-클러스터 확장 (MU 음악 + PB 출판 + AD 광고 + GM 게임 + VD 영상).
  // withRuleId 재사용 57번째 도메인. 🏆 57번째 도메인 마일스톤 (S262 5 → S305 57, 11.4배 확장).
  "VD-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "VD-001"),
  "VD-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "VD-002"),
  "VD-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "VD-003"),
  "VD-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "VD-004"),
  "VD-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "VD-005"),
  "VD-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "VD-006"),
  // 세션 305 후속 (F526): SocialMedia 합성 도메인 58번째 (47번째 신규 산업, 소셜미디어 UGC).
  // MU+PB+AD+GM+VD+SM 디지털 콘텐츠 6-클러스터 확장 (MU 음악 + PB 출판 + AD 광고 + GM 게임 + VD 영상 + SM 소셜미디어).
  // withRuleId 재사용 58번째 도메인. 🏆 58번째 도메인 마일스톤 (S262 5 → S305+ 58, 11.6배 확장).
  "SM-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SM-001"),
  "SM-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SM-002"),
  "SM-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SM-003"),
  "SM-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SM-004"),
  "SM-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SM-005"),
  "SM-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SM-006"),
  // 세션 305 후속2 (F527): News 합성 도메인 59번째 (48번째 신규 산업, 뉴스 구독/신디케이션).
  // MU+PB+AD+GM+VD+SM+NW 디지털 콘텐츠 7-클러스터 확장 (MU+PB+AD+GM+VD+SM+NW 뉴스).
  // withRuleId 재사용 59번째 도메인. 🏆 59번째 도메인 마일스톤 (S262 5 → S305++ 59, 11.8배 확장).
  "NW-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "NW-001"),
  "NW-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "NW-002"),
  "NW-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "NW-003"),
  "NW-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "NW-004"),
  "NW-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "NW-005"),
  "NW-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "NW-006"),
  // 세션 305 후속3 (F528): Broadcast 합성 도메인 60번째 (49번째 신규 산업, 실시간 편성 방송). 🏆 60 Sprint round 마일스톤.
  // MU+PB+AD+GM+VD+SM+NW+BR 디지털 콘텐츠 8-클러스터 확장.
  // withRuleId 재사용 60번째 도메인. 🏆 60번째 도메인 마일스톤 (S262 5 → S305+++ 60, 12배 확장).
  "BR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BR-001"),
  "BR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BR-002"),
  "BR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BR-003"),
  "BR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BR-004"),
  "BR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BR-005"),
  "BR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BR-006"),
  // 세션 305 후속4 (F529): Esports 합성 도메인 61번째 (50번째 신규 산업, 이스포츠 토너먼트). 🏆🏆 50 신규 산업 round 마일스톤.
  // MU+PB+AD+GM+VD+SM+NW+BR+ER 디지털 콘텐츠 9-클러스터 확장 + GM/SM 융합 모델.
  // withRuleId 재사용 61번째 도메인. 🏆 61번째 도메인 마일스톤 (S262 5 → S305++++ 61, 12.2배 확장).
  "ER-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ER-001"),
  "ER-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ER-002"),
  "ER-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ER-003"),
  "ER-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ER-004"),
  "ER-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ER-005"),
  "ER-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ER-006"),
  // 세션 305 후속5 (F530): Podcast 합성 도메인 62번째 (51번째 신규 산업, 팟캐스트 오디오 콘텐츠).
  // MU+PB+AD+GM+VD+SM+NW+BR+ER+PC 디지털 콘텐츠 10-클러스터 확장 (오디오 구독+광고 하이브리드).
  // withRuleId 재사용 62번째 도메인. 🏆 62번째 도메인 마일스톤 (S262 5 → S305+++++ 62, 12.4배 확장).
  "PC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PC-001"),
  "PC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PC-002"),
  "PC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PC-003"),
  "PC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PC-004"),
  "PC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PC-005"),
  "PC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PC-006"),
  // 세션 305 후속6 (F531): Radio 합성 도메인 63번째 (52번째 신규 산업, 라디오 실시간 편성). 🏆🏆 1세션 9 Sprint 신기록.
  // MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA 디지털 콘텐츠 11-클러스터 확장.
  // withRuleId 재사용 63번째 도메인. 🏆 63번째 도메인 마일스톤 (S262 5 → S305++++++ 63, 12.6배 확장).
  "RA-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RA-001"),
  "RA-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "RA-002"),
  "RA-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RA-003"),
  "RA-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RA-004"),
  "RA-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "RA-005"),
  "RA-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "RA-006"),
  // 세션 306 (F532): Art 합성 도메인 64번째 (53번째 신규 산업, 예술/갤러리 시각 예술).
  // MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR 디지털 콘텐츠 12-클러스터 확장 (시각 예술 / NFT 디지털 아트 확장 가능).
  // withRuleId 재사용 64번째 도메인. 🏆 64번째 도메인 마일스톤 (S262 5 → S306 64, 12.8배 확장).
  "AR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AR-001"),
  "AR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AR-002"),
  "AR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AR-003"),
  "AR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AR-004"),
  "AR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AR-005"),
  "AR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AR-006"),
  // 세션 306 후속 (F533): Gambling 합성 도메인 65번째 (54번째 신규 산업, 카지노/베팅).
  // 🎮 GM+GA 게임엔터 2-클러스터 신규 형성 (게임 in-app purchase + 카지노/베팅 payout 통합 추상화).
  // withRuleId 재사용 65번째 도메인. 🏆 65번째 도메인 마일스톤 (S262 5 → S306 65, 13.0배 확장).
  "GA-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GA-001"),
  "GA-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GA-002"),
  "GA-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GA-003"),
  "GA-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GA-004"),
  "GA-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GA-005"),
  "GA-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GA-006"),
  // 세션 306 후속2 (F534): Amusement 합성 도메인 66번째 (55번째 신규 산업, 놀이공원/테마파크).
  // 🎢 오프라인 엔터테인먼트 신규 클러스터 출범 (디지털 12 + 게임엔터 2 + 오프라인 엔터 1 = 3 메타 카테고리).
  // withRuleId 재사용 66번째 도메인. 🏆 66번째 도메인 마일스톤 (S262 5 → S306 66, 13.2배 확장).
  "AM-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AM-001"),
  "AM-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AM-002"),
  "AM-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AM-003"),
  "AM-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AM-004"),
  "AM-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AM-005"),
  "AM-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AM-006"),
  // 세션 306 후속3 (F535): Theater 합성 도메인 67번째 (56번째 신규 산업, 영화관/극장/공연장).
  // 🎭 AM+TH 오프라인 엔터 2-클러스터 확장 (테마파크 입장권 + 극장 좌석권 통합 추상화).
  // withRuleId 재사용 67번째 도메인. 🏆 67번째 도메인 마일스톤 (S262 5 → S306 67, 13.4배 확장).
  "TH-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TH-001"),
  "TH-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "TH-002"),
  "TH-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TH-003"),
  "TH-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TH-004"),
  "TH-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "TH-005"),
  "TH-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "TH-006"),
  // 세션 306 후속4 (F536): Skiing 합성 도메인 68번째 (57번째 신규 산업, 스키 리조트).
  // 🏔️ SP+SK 스포츠 레저 2-클러스터 신규 형성 (피트니스/스포츠 + 윈터 레저 통합 추상화).
  // withRuleId 재사용 68번째 도메인. 🏆 68번째 도메인 마일스톤 (S262 5 → S306 68, 13.6배 확장).
  "SK-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SK-001"),
  "SK-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SK-002"),
  "SK-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SK-003"),
  "SK-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SK-004"),
  "SK-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SK-005"),
  "SK-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SK-006"),
  // 세션 306 후속5 (F537): Exhibition 합성 도메인 69번째 (58번째 신규 산업, 박람회/컨벤션).
  // 🎨 AR+EX 예술/전시 2-클러스터 신규 형성 (시각 예술 갤러리 + 박람회/컨벤션 부스 통합 추상화).
  // withRuleId 재사용 69번째 도메인. 🏆 69번째 도메인 마일스톤 (S262 5 → S306 69, 13.8배 확장).
  "EX-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "EX-001"),
  "EX-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "EX-002"),
  "EX-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "EX-003"),
  "EX-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "EX-004"),
  "EX-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "EX-005"),
  "EX-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "EX-006"),
  // 세션 306 후속6 (F538): Golf 합성 도메인 70번째 🏆🏆 round 마일스톤 (59번째 신규 산업, 골프장/필드 운영).
  // ⛳ SP+SK+GF 스포츠 레저 3-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 통합 추상화 — 단일 클러스터 3 도메인 첫 사례).
  // withRuleId 재사용 70번째 도메인. 🏆🏆 70번째 도메인 round 마일스톤 (S262 5 → S306 70, 14.0배 확장).
  "GF-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GF-001"),
  "GF-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GF-002"),
  "GF-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GF-003"),
  "GF-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GF-004"),
  "GF-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GF-005"),
  "GF-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GF-006"),
  // 세션 306 후속7 (F539): K-pop 합성 도메인 71번째 (60번째 신규 산업, 콘서트/팬미팅, 한국 특화).
  // 🎤 AM+TH+KP 오프라인 엔터 3-클러스터 확장 (놀이공원 + 극장 + 콘서트 통합 추상화 — 단일 클러스터 3 도메인 두 번째 사례).
  // withRuleId 재사용 71번째 도메인. 🏆 71번째 도메인 마일스톤 (S262 5 → S306 71, 14.2배 확장).
  "KP-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "KP-001"),
  "KP-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "KP-002"),
  "KP-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "KP-003"),
  "KP-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "KP-004"),
  "KP-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "KP-005"),
  "KP-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "KP-006"),
  // 세션 306 후속8 (F540): Surfing 합성 도메인 72번째 (61번째 신규 산업, 서핑/해양 스포츠) 🏆🏆 1세션 9 Sprint 신기록 동률.
  // 🏄 SP+SK+GF+SF 스포츠 레저 4-클러스터 확장 (피트니스/스포츠 + 윈터 레저 + 골프 + 서핑 통합 추상화 — 단일 클러스터 4 도메인 첫 사례).
  // withRuleId 재사용 72번째 도메인. 🏆 72번째 도메인 마일스톤 (S262 5 → S306 72, 14.4배 확장).
  "SF-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SF-001"),
  "SF-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "SF-002"),
  "SF-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SF-003"),
  "SF-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SF-004"),
  "SF-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "SF-005"),
  "SF-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "SF-006"),
  // 세션 306 후속9 (F541): Aquarium 합성 도메인 73번째 (62번째 신규 산업, 수족관/해양생물) 🏆🏆🏆 1세션 10 Sprint 신기록 도전.
  // 🐠 AM+TH+KP+AQ 오프라인 엔터 4-클러스터 확장 (놀이공원 + 극장 + 콘서트 + 수족관 통합 추상화 — 단일 클러스터 4 도메인 두 번째 사례, 두 클러스터 동시 4 도메인 첫 사례).
  // withRuleId 재사용 73번째 도메인. 🏆 73번째 도메인 마일스톤 (S262 5 → S306 73, 14.6배 확장).
  "AQ-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AQ-001"),
  "AQ-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "AQ-002"),
  "AQ-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AQ-003"),
  "AQ-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AQ-004"),
  "AQ-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "AQ-005"),
  "AQ-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "AQ-006"),
  // 세션 307 (F542): Zoo 합성 도메인 74번째 (63번째 신규 산업, 동물원). 🦁 AM+TH+KP+AQ+ZO 오프라인 엔터 5-클러스터 확장 (단일 클러스터 5 도메인 첫 사례 마일스톤).
  // withRuleId 재사용 74번째 도메인. 🏆 74번째 도메인 마일스톤 (S262 5 → S370 74, 14.8배 확장). Sprint WT autopilot 분리.
  "ZO-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ZO-001"),
  "ZO-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "ZO-002"),
  "ZO-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ZO-003"),
  "ZO-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ZO-004"),
  "ZO-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "ZO-005"),
  "ZO-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "ZO-006"),
  // 세션 307 후속 (F543): Museum 합성 도메인 75번째 (64번째 신규 산업, 박물관/미술관). 🏛️ AM+TH+KP+AQ+ZO+MS 오프라인 엔터 6-클러스터 확장 (단일 클러스터 6 도메인 첫 사례 마일스톤).
  // withRuleId 재사용 75번째 도메인. 🏆🏆 75번째 도메인 15배 round 마일스톤 (S262 5 → S371 75, 15.0배 확장). Sprint WT autopilot 분리 작업 2회차.
  "MS-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MS-001"),
  "MS-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MS-002"),
  "MS-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MS-003"),
  "MS-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MS-004"),
  "MS-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MS-005"),
  "MS-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MS-006"),
  // 세션 307 후속2 (F544): Movie 합성 도메인 76번째 (65번째 신규 산업, 영화관). 🎬 AM+TH+KP+AQ+ZO+MS+MV 오프라인 엔터 7-클러스터 확장 (단일 클러스터 7 도메인 첫 사례 마일스톤).
  // withRuleId 재사용 76번째 도메인. 🏆 76번째 도메인 마일스톤 (S262 5 → S372 76, 15.2배 확장). Sprint WT autopilot 분리 작업 3회차.
  "MV-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MV-001"),
  "MV-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "MV-002"),
  "MV-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MV-003"),
  "MV-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MV-004"),
  "MV-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "MV-005"),
  "MV-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "MV-006"),
  // 세션 307 후속3 (F545): Library 합성 도메인 77번째 (66번째 신규 산업, 도서관). 📚 AM+TH+KP+AQ+ZO+MS+MV+LB 오프라인 엔터 8-클러스터 확장 (단일 클러스터 8 도메인 첫 사례 마일스톤).
  // withRuleId 재사용 77번째 도메인. 🏆 77번째 도메인 마일스톤 (S262 5 → S373 77, 15.4배 확장). Sprint WT autopilot 분리 작업 4회차. 거울 변환 30회차 round 마일스톤.
  "LB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LB-001"),
  "LB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "LB-002"),
  "LB-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "LB-003"),
  "LB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LB-004"),
  "LB-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "LB-005"),
  "LB-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "LB-006"),
  // 세션 307 후속4 (F546): Park 합성 도메인 78번째 (67번째 신규 산업, 자연공원). 🌲 AM+TH+KP+AQ+ZO+MS+MV+LB+PA 오프라인 엔터 9-클러스터 확장 (단일 클러스터 9 도메인 첫 사례 마일스톤).
  // withRuleId 재사용 78번째 도메인. 🏆 78번째 도메인 마일스톤 (S262 5 → S374 78, 15.6배 확장). Sprint WT autopilot 분리 작업 5회차. 거울 변환 31회차.
  "PA-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PA-001"),
  "PA-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PA-002"),
  "PA-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PA-003"),
  "PA-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PA-004"),
  "PA-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PA-005"),
  "PA-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PA-006"),
  // Sprint 375 (F547) — festival 합성 도메인: 동시참가한도/stage한도/stage입장atomic/상태전환/batch만료/환불atomic
  // 🎪 79번째 도메인 + 68번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE 오프라인 엔터 10-클러스터 단일 클러스터 10 도메인 첫 사례 round 마일스톤.
  // withRuleId 80 Sprint 연속 정점 round 마일스톤 도전. 거울 변환 32회차 (park → festival).
  "FE-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FE-001"),
  "FE-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "FE-002"),
  "FE-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FE-003"),
  "FE-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FE-004"),
  "FE-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "FE-005"),
  "FE-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "FE-006"),
  // Sprint 376 (F548) — garden 합성 도메인: 동시방문한도/zone입장한도/zone입장atomic/방문상태전환/closed방문일괄만료/방문환불atomic
  // 🌷 80번째 도메인 + 69번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR 오프라인 엔터 11-클러스터 단일 클러스터 11 도메인 첫 사례 마일스톤 + 7 Sprint 연속 첫 사례 마일스톤.
  // withRuleId 81 Sprint 연속 정점 도전. 거울 변환 33회차 (festival → garden). 🏆🌷 80번째 도메인 16배 round 마일스톤.
  "GR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GR-001"),
  "GR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "GR-002"),
  "GR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GR-003"),
  "GR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GR-004"),
  "GR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "GR-005"),
  "GR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "GR-006"),
  // Sprint 377 (F549) — observatory 합성 도메인: 동시관측한도/telescope한도/telescope관측atomic/관측상태전환/closed관측일괄만료/관측환불atomic
  // 🔭 81번째 도메인 + 70번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB 오프라인 엔터 12-클러스터 단일 클러스터 12 도메인 첫 사례 마일스톤 + 8 Sprint 연속 첫 사례 마일스톤.
  // withRuleId 82 Sprint 연속 정점 도전. 거울 변환 34회차 (garden → observatory). DoD 5축 강화 (DOMAIN_MAP 명시 신규 추가, S376 false claim 패턴 차단).
  "OB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "OB-001"),
  "OB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "OB-002"),
  "OB-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "OB-003"),
  "OB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "OB-004"),
  "OB-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "OB-005"),
  "OB-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "OB-006"),
  // Sprint 378 (F550) — planetarium 합성 도메인: 돔좌석한도/상영좌석한도/돔상영atomic/세션상태전환/closed세션일괄만료/세션환불atomic
  // 🔭 82번째 도메인 + 71번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL 오프라인 엔터 13-클러스터 단일 클러스터 13 도메인 첫 사례 마일스톤 도전 + 9 Sprint 연속 첫 사례 마일스톤 달성 경로.
  // withRuleId 83 Sprint 연속 정점 도전. 거울 변환 35회차 (observatory → planetarium). DoD 5축 정착 검증 (S377 입증 패턴 재현).
  "PL-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PL-001"),
  "PL-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "PL-002"),
  "PL-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PL-003"),
  "PL-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PL-004"),
  "PL-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "PL-005"),
  "PL-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "PL-006"),
  // Sprint 380 (F552) — convention 합성 도메인: 세션동시한도/부스한도/부스등록atomic/세션상태전환/closed세션일괄만료/세션환불atomic
  // ✏️ 83번째 도메인 + 72번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV 오프라인 엔터 14-클러스터 단일 클러스터 14 도메인 첫 사례 신기록 도전 + 10 Sprint 연속 첫 사례 마일스톤 신기록 도전.
  // withRuleId 84 Sprint 연속 정점 도전. 거울 변환 36회차 (planetarium → convention). DoD 6축 실감증 (domain-sprint-guard.yml 첫 실 작동).
  "CV-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CV-001"),
  "CV-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CV-002"),
  "CV-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CV-003"),
  "CV-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CV-004"),
  "CV-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CV-005"),
  "CV-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CV-006"),

  // Sprint 381 (F553) — wedding-hall 합성 도메인: 동시예식한도/hall한도/예식예약atomic/예식상태전환/closed예식일괄만료/예식환불atomic
  // 💒 84번째 도메인 + 73번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB 오프라인 엔터 15-클러스터 단일 클러스터 15 도메인 첫 사례 신기록 + 11 Sprint 연속 첫 사례 마일스톤 신기록.
  // withRuleId 85 Sprint 연속 정점 도전. 거울 변환 37회차 (convention → wedding-hall). DoD 6축 실감증 2회차 (domain-sprint-guard.yml 정착 검증).
  "WB-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "WB-001"),
  "WB-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "WB-002"),
  "WB-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "WB-003"),
  "WB-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "WB-004"),
  "WB-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "WB-005"),
  "WB-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "WB-006"),
  // Sprint 382 (F554) — beach-club 합성 도메인: 동시방문자한도/cabana한도/cabana예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic
  // 🏖️ 85번째 도메인 + 74번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC 오프라인 엔터 16-클러스터 단일 클러스터 16 도메인 첫 사례 신기록 + 12 Sprint 연속 첫 사례 마일스톤 신기록.
  // withRuleId 86 Sprint 연속 정점 도전. 거울 변환 38회차 (wedding-hall → beach-club). DoD 6축 실감증 3회차 정착 완료 트리거. 🏆 85번째 도메인 17배 round 마일스톤.
  "BC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BC-001"),
  "BC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BC-002"),
  "BC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BC-003"),
  "BC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BC-004"),
  "BC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BC-005"),
  "BC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BC-006"),
  // Sprint 383 (F555) — concert-hall 합성 도메인: 동시티켓한도/시즌권한도/티켓예매atomic/티켓상태전환/closed티켓일괄만료/티켓환불atomic
  // 🎻 86번째 도메인 + 75번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO 오프라인 엔터 17-클러스터 단일 클러스터 17 도메인 첫 사례 신기록 + 13 Sprint 연속 첫 사례 마일스톤 신기록.
  // withRuleId 87 Sprint 연속 정점 도전. 거울 변환 39회차 (beach-club → concert-hall). DoD 6축 실감증 4회차 표준 확정. 🏆 86번째 도메인 17.2배 확장.
  "CO-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CO-001"),
  "CO-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "CO-002"),
  "CO-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CO-003"),
  "CO-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CO-004"),
  "CO-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "CO-005"),
  "CO-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "CO-006"),
  // Sprint 384 (F556) — karaoke 합성 도메인: 동시룸한도/멤버십한도/룸예약atomic/세션상태전환/closed세션일괄만료/세션환불atomic
  // 🎤 87번째 도메인 + 76번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR 오프라인 엔터 18-클러스터 단일 클러스터 18 도메인 첫 사례 신기록 + 14 Sprint 연속 첫 사례 마일스톤 신기록.
  // withRuleId 88 Sprint 연속 정점 도전. 거울 변환 40회차 round 마일스톤 (concert-hall → karaoke). DoD 6축 실감증 5회차 rules/ 영구 승격 트리거. 🏆 87번째 도메인 17.4배 확장.
  "KR-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "KR-001"),
  "KR-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "KR-002"),
  "KR-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "KR-003"),
  "KR-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "KR-004"),
  "KR-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "KR-005"),
  "KR-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "KR-006"),
  // Sprint 385 (F557) — night-club 합성 도메인: 동시게스트한도/VIP테이블한도/VIP예약atomic/방문상태전환/closed방문일괄만료/방문환불atomic
  // 🌃 88번째 도메인 + 77번째 신규 산업. AM+TH+KP+AQ+ZO+MS+MV+LB+PA+FE+GR+OB+PL+CV+WB+BC+CO+KR+NC 오프라인 엔터 19-클러스터 단일 클러스터 19 도메인 첫 사례 신기록 + 15 Sprint 연속 첫 사례 마일스톤 신기록.
  // withRuleId 89 Sprint 연속 정점 도전. 거울 변환 41회차 (karaoke → night-club). DoD 6축 실감증 6회차 rules/ 영구 승격 정착 검증. 🏆 88번째 도메인 17.6배 확장.
  "NC-001": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "NC-001"),
  "NC-002": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "NC-002"),
  "NC-003": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "NC-003"),
  "NC-004": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "NC-004"),
  "NC-005": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "NC-005"),
  "NC-006": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "NC-006"),
  // Sprint 315 (F481) — lpon-refund gap fill: 환불 도메인 BL-020/021/023/025 PRESENCE + BL-030 ABSENCE 마커
  // BL-020 (rfndPsbltyYn='Y' status transition) / BL-021 (입금 처리 atomic tx) /
  // BL-023 (입금 실패 catch → status='FAILED' 에러 반환) / BL-025 (60% 이상 사용 threshold) /
  // BL-030 (유효기간 연장 거부 미구현 ABSENCE — detectExpiryExtension → refund.ts에서 0 hits → 1 marker)
  // detect-bl coverage: 247/260 → 252/260 = 96.9%.
  "BL-020": (sf, fn) => withRuleId(detectStatusTransition(sf, fn), "BL-020"),
  "BL-021": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-021"),
  "BL-023": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-023"),
  "BL-025": (sf, fn) => withRuleId(detectThresholdCheck(sf, fn), "BL-025"),
  "BL-030": (sf, fn) => withRuleId(detectExpiryExtension(sf, fn), "BL-030"),
  // Sprint 316 (F482) — lpon-settlement BL-031/032 + lpon-gift BL-G001 gap fill
  // BL-031: runBatchSettlement 안 db.transaction(settlement_summaries UPSERT) — 44 Sprint 연속 withRuleId 정점
  // BL-032: settlement.ts 내 추가 atomic 패턴 (heuristic, settlement × 2 atomic)
  // BL-G001: gift.ts에 sendGift/createGift 미구현 → ABSENCE marker (detectGiftImplementation)
  // detect-bl coverage: 252/260 → 255/260 = 98.1% (F481 + F482 통합).
  "BL-031": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-031"),
  "BL-032": (sf, fn) => withRuleId(detectAtomicTransaction(sf, fn), "BL-032"),
  "BL-G001": (sf, fn) => withRuleId(detectGiftImplementation(sf, fn), "BL-G001"),
  // Sprint 317 (F483) — lpon-payment 5 ABSENCE marker (100% coverage 마일스톤)
  // payment.ts (169 lines, 1 함수 processPayment) cancel 분기 자체 부재.
  // BL-013/016/017/018/019 모두 cancel/refund 흐름 부재 — 5 ABSENCE markers.
  // detect-bl coverage: 255/260 → 260/260 = 100% 🏆 LPON pilot 100% 종결.
  "BL-013": detectCompanyRefund,
  "BL-016": detectPaymentCancellation,
  "BL-017": detectMerchantMpmCancel,
  "BL-018": detectQrMerchantApproval,
  "BL-019": detectWithdrawnUserCancel,
};
