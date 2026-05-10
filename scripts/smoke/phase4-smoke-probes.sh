#!/usr/bin/env bash
# F487 (Sprint 321) — Production Smoke Probes (Master 실행용)
# autopilot Production Smoke Test 14/16회차 변종 회피 세트
#
# Usage:
#   INTERNAL_API_SECRET=xxx bash scripts/smoke/phase4-smoke-probes.sh [SKILL_ID]
#
# Required:
#   INTERNAL_API_SECRET — internal auth header
#   SKILL_ID (arg1, optional) — 테스트할 skill ID. 없으면 LPON 첫 번째 skill 자동 조회.
#
# Output:
#   reports/sprint-321-f487-production-smoke-2026-05-11.md 에 결과 기록

set -euo pipefail

SKILL_API="${SVC_SKILL_URL:-https://svc-skill.ktds-axbd.workers.dev}"
SECRET="${INTERNAL_API_SECRET:-}"
REPORT_FILE="reports/sprint-321-f487-production-smoke-2026-05-11.md"
TODAY=$(date +%Y-%m-%d)

if [[ -z "$SECRET" ]]; then
  echo "❌ INTERNAL_API_SECRET 필요"
  exit 1
fi

echo "═══════════════════════════════════════════════"
echo "🔍 F487 Phase 4 Production Smoke Probes"
echo "   SKILL_API: $SKILL_API"
echo "   Report: $REPORT_FILE"
echo "═══════════════════════════════════════════════"

# Step 1: LPON skill ID 조회
if [[ $# -ge 1 ]]; then
  SKILL_ID="$1"
  echo "▶ Using provided SKILL_ID: $SKILL_ID"
else
  echo "▶ Fetching LPON skill list..."
  SKILLS_RESP=$(curl -s -w "\nHTTP=%{http_code}" \
    -H "X-Internal-Secret: $SECRET" \
    "$SKILL_API/skills?org=lpon")
  SKILLS_HTTP=$(echo "$SKILLS_RESP" | grep "^HTTP=" | cut -d= -f2)
  echo "  GET /skills?org=lpon → HTTP $SKILLS_HTTP"

  if [[ "$SKILLS_HTTP" != "200" ]]; then
    echo "❌ GET /skills?org=lpon failed (HTTP $SKILLS_HTTP)"
    exit 1
  fi

  SKILL_ID=$(echo "$SKILLS_RESP" | head -n -1 | python3 -c \
    "import json,sys; skills=json.load(sys.stdin); print(skills[0]['skillId'] if skills else '')" 2>/dev/null || echo "")

  if [[ -z "$SKILL_ID" ]]; then
    echo "❌ LPON skill ID 조회 실패 (0건 또는 파싱 오류)"
    exit 1
  fi
  echo "  ✅ SKILL_ID: $SKILL_ID"
fi

# Probe results storage
declare -A PROBE_STATUS
declare -A PROBE_BODY

run_probe() {
  local label="$1"
  local method="$2"
  local url="$3"
  local body_arg="${4:-}"

  if [[ -n "$body_arg" ]]; then
    RESP=$(curl -s -w "\nHTTP=%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -H "X-Internal-Secret: $SECRET" \
      -d "$body_arg" \
      "$url" 2>&1)
  else
    RESP=$(curl -s -w "\nHTTP=%{http_code}" -X "$method" \
      -H "X-Internal-Secret: $SECRET" \
      "$url" 2>&1)
  fi

  HTTP_CODE=$(echo "$RESP" | grep "^HTTP=" | cut -d= -f2)
  BODY=$(echo "$RESP" | grep -v "^HTTP=" | head -c 200)
  PROBE_STATUS["$label"]="$HTTP_CODE"
  PROBE_BODY["$label"]="$BODY"

  local ok_flag="✅"
  if [[ "$HTTP_CODE" == 5* ]]; then
    ok_flag="❌ 5xx"
  fi

  echo "  $ok_flag $label: HTTP $HTTP_CODE"
}

echo ""
echo "── Probe Group 1: POST /skills/{id}/ai-ready/evaluate ──"
run_probe "eval-no-body"      POST "$SKILL_API/skills/$SKILL_ID/ai-ready/evaluate" ""
run_probe "eval-empty-json"   POST "$SKILL_API/skills/$SKILL_ID/ai-ready/evaluate" "{}"
run_probe "eval-partial-body" POST "$SKILL_API/skills/$SKILL_ID/ai-ready/evaluate" '{"orgId":"LPON"}'

echo ""
echo "── Probe Group 2: POST /skills/ai-ready/batch ──"
run_probe "batch-no-body"      POST "$SKILL_API/skills/ai-ready/batch" ""
run_probe "batch-empty-json"   POST "$SKILL_API/skills/ai-ready/batch" "{}"
run_probe "batch-partial-body" POST "$SKILL_API/skills/ai-ready/batch" '{"orgId":"LPON"}'

echo ""
echo "── Probe Group 3: GET /skills?org=lpon (regression) ──"
run_probe "skills-list-lpon" GET "$SKILL_API/skills?org=lpon" ""
run_probe "skills-list-raw"  GET "$SKILL_API/skills" ""
run_probe "skills-health"    GET "$SKILL_API/health" ""

# Check for 5xx
FAIL_COUNT=0
for label in "${!PROBE_STATUS[@]}"; do
  if [[ "${PROBE_STATUS[$label]}" == 5* ]]; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "═══════════════════════════════════════════════"
echo "📊 Probe Summary"
echo "   Total probes: 9"
echo "   5xx failures: $FAIL_COUNT"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "   ❌ FAIL — 5xx 발생. 즉시 revert 검토 필요 (S341 절차)"
else
  echo "   ✅ PASS — 5xx 0건"
fi
echo "═══════════════════════════════════════════════"

# Write report markdown
mkdir -p "$(dirname "$REPORT_FILE")"
cat > "$REPORT_FILE" <<REPORT
---
id: AIF-RPRT-118-smoke
title: "F487 — Production Smoke Probe 결과"
sprint: 321
created: "$TODAY"
author: "Master (post-Sprint)"
---

# Sprint 321 F487 — Production Smoke Probe 매트릭스

**실행 시각**: $(date -Iseconds)
**SKILL_API**: $SKILL_API
**SKILL_ID**: $SKILL_ID
**5xx 실패**: $FAIL_COUNT건

## Probe 매트릭스

| Probe | Method | Endpoint | HTTP | 판정 |
|-------|--------|----------|------|------|
| eval-no-body | POST | /skills/{id}/ai-ready/evaluate (no body) | ${PROBE_STATUS[eval-no-body]:-N/A} | $([ "${PROBE_STATUS[eval-no-body]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| eval-empty-json | POST | /skills/{id}/ai-ready/evaluate ({}) | ${PROBE_STATUS[eval-empty-json]:-N/A} | $([ "${PROBE_STATUS[eval-empty-json]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| eval-partial-body | POST | /skills/{id}/ai-ready/evaluate (partial) | ${PROBE_STATUS[eval-partial-body]:-N/A} | $([ "${PROBE_STATUS[eval-partial-body]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| batch-no-body | POST | /skills/ai-ready/batch (no body) | ${PROBE_STATUS[batch-no-body]:-N/A} | $([ "${PROBE_STATUS[batch-no-body]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| batch-empty-json | POST | /skills/ai-ready/batch ({}) | ${PROBE_STATUS[batch-empty-json]:-N/A} | $([ "${PROBE_STATUS[batch-empty-json]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| batch-partial-body | POST | /skills/ai-ready/batch (partial) | ${PROBE_STATUS[batch-partial-body]:-N/A} | $([ "${PROBE_STATUS[batch-partial-body]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| skills-list-lpon | GET | /skills?org=lpon | ${PROBE_STATUS[skills-list-lpon]:-N/A} | $([ "${PROBE_STATUS[skills-list-lpon]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| skills-list-raw | GET | /skills | ${PROBE_STATUS[skills-list-raw]:-N/A} | $([ "${PROBE_STATUS[skills-list-raw]:-0}" = "5"* ] && echo "❌" || echo "✅") |
| skills-health | GET | /health | ${PROBE_STATUS[skills-health]:-N/A} | $([ "${PROBE_STATUS[skills-health]:-0}" = "5"* ] && echo "❌" || echo "✅") |

## 판정

$( [[ $FAIL_COUNT -eq 0 ]] && echo "✅ **PASS** — 9 probe 5xx 0건" || echo "❌ **FAIL** — 5xx ${FAIL_COUNT}건. S341 절차 참조." )

## wrangler tail 결과

> Master가 별도로 \`wrangler tail svc-skill --env production\` 30초 실행 후 아래에 붙여넣기

\`\`\`
[TODO: wrangler tail 30s output]
\`\`\`

## R2 LPON skill-packages 현황

> Master가 별도로 \`wrangler r2 object list --prefix=skill-packages/lpon\` 실행 후 아래에 붙여넣기

\`\`\`
[TODO: wrangler r2 object list output]
\`\`\`
REPORT

echo "📝 Report 기록: $REPORT_FILE"

exit $( [[ $FAIL_COUNT -gt 0 ]] && echo 1 || echo 0 )
