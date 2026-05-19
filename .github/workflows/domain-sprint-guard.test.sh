#!/usr/bin/env bash
# domain-sprint-guard.test.sh
# Sprint 379 F551 — CI Guard 로컬 시나리오 검증 (4종)
# Usage: bash .github/workflows/domain-sprint-guard.test.sh

set -euo pipefail

PASS=0
FAIL=0
SKIP_CNT=0

log_pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }
log_info() { echo "  ℹ️  $1"; }

# ── helper: PR title → match boolean ───────────────────────────────────────
title_matches() {
  local title="$1"
  echo "$title" | grep -qE 'F[0-9]+.*([0-9]+번째 도메인|신규 산업|[0-9]+번째 산업)'
}

# ── helper: simulate diff container count ──────────────────────────────────
count_containers() {
  local diff_output="$1"
  echo "$diff_output" | grep -cE '^\+\s*container:\s*"' || true
}

# ── simulate guard logic ────────────────────────────────────────────────────
run_guard() {
  local pr_title="$1"
  local diff_output="$2"
  local expected="$3"   # PASS | FAIL | SKIP

  echo ""
  echo "━━━ Scenario: $(echo "$pr_title" | head -c 60) ━━━"
  log_info "Expected: $expected"

  # Step 1: detect
  if ! title_matches "$pr_title"; then
    log_info "PR title → SKIP (non-domain)"
    if [ "$expected" = "SKIP" ]; then
      log_pass "SKIP correctly applied"
      SKIP_CNT=$((SKIP_CNT+1))
    else
      log_fail "Expected $expected but got SKIP"
    fi
    return
  fi
  log_info "PR title → matched (domain sprint)"

  # Step 2: verify diff
  local count
  count=$(count_containers "$diff_output")
  log_info "DOMAIN_MAP added containers: $count"

  if [ "$count" -lt 1 ]; then
    if [ "$expected" = "FAIL" ]; then
      log_pass "FAIL correctly triggered (DOMAIN_MAP 0 entries)"
    else
      log_fail "Expected $expected but guard FAILED (0 containers)"
    fi
  else
    if [ "$expected" = "PASS" ]; then
      log_pass "PASS (+${count} containers)"
    else
      log_fail "Expected $expected but guard PASSED (+${count} containers)"
    fi
  fi
}

echo "======================================================="
echo "  domain-sprint-guard.test.sh — 4 Scenarios"
echo "  Sprint 379 F551 (DoD 6축 (f) CI Guard)"
echo "======================================================="

# ── MOCK DIFF DATA ──────────────────────────────────────────────────────────

DIFF_WITH_ENTRY='
+  {
+    container: "observatory",
+    rulesPath: ".decode-x/spec-containers/observatory/rules/observatory-rules.md",
+    sourcePath: "src/domain/observatory.ts",
+    provenancePath: ".decode-x/spec-containers/observatory/provenance.yaml",
+    sourceCodeStatus: "present",
+  },'

DIFF_NO_ENTRY='
+import { someHelper } from "../utils";
+// observatory domain added
+ // container reference in comment only'

# ── SCENARIO i: 매칭 + DOMAIN_MAP diff>0 → PASS ────────────────────────────
run_guard \
  "feat: Sprint 377 F549 OB Observatory 81번째 도메인 / 70번째 신규 산업" \
  "$DIFF_WITH_ENTRY" \
  "PASS"

# ── SCENARIO ii: 매칭 + DOMAIN_MAP diff=0 → FAIL ───────────────────────────
run_guard \
  "feat: Sprint 378 F550 PL Planetarium 82번째 도메인 / 71번째 신규 산업" \
  "$DIFF_NO_ENTRY" \
  "FAIL"

# ── SCENARIO iii: non-domain PR title → SKIP ───────────────────────────────
run_guard \
  "docs: SPEC §5 마지막 실측 + CHANGELOG 세션 308 entry 갱신" \
  "$DIFF_NO_ENTRY" \
  "SKIP"

# ── SCENARIO iv: 변형 패턴 (신규 산업) → PASS ──────────────────────────────
run_guard \
  "feat: Sprint 379 F551 신규 산업 도입 (CV Convention)" \
  "$DIFF_WITH_ENTRY" \
  "PASS"

# ── SUMMARY ─────────────────────────────────────────────────────────────────
echo ""
echo "======================================================="
echo "  Results: $PASS PASS / $FAIL FAIL / $SKIP_CNT SKIP"
echo "======================================================="

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ Test suite FAILED ($FAIL failures)"
  exit 1
fi

echo "  ✅ All scenarios PASS — CI Guard 로직 정합"
exit 0
