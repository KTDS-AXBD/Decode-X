#!/usr/bin/env bash
# Sprint 1 A-3: Decode-X → Foundry-X Plumb E2E 파이프라인
# FX-SPEC-002 v1.0 SyncResult 수집 + .foundry-x/decisions.jsonl 저장

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPEC_CONTAINER="${1:-${WT_ROOT}/.decode-x/spec-containers/lpon-charge}"
DECISIONS_DIR="${WT_ROOT}/.foundry-x"
RESULTS_DIR="${WT_ROOT}/.foundry-x/results"

mkdir -p "$DECISIONS_DIR" "$RESULTS_DIR"

echo "=== Decode-X Plumb E2E — Sprint 1 (AIF-REQ-035) ===" >&2
echo "Spec Container: $SPEC_CONTAINER" >&2
echo "Python: $(python3 --version 2>&1)" >&2

# PYTHONPATH에 plumb 패키지 위치 추가
export PYTHONPATH="${WT_ROOT}:${PYTHONPATH:-}"
export PLUMB_OUTPUT_FORMAT="json"

# CWD를 WT 루트로 설정 (.foundry-x/decisions.jsonl 경로 기준)
cd "$WT_ROOT"

TIMESTAMP=$(date -Iseconds)
START_MS=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")

# plumb review 실행
RESULT=$(python3 -m plumb review "$SPEC_CONTAINER" 2>/tmp/plumb-stderr.txt)
EXIT_CODE=$?
END_MS=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")

STDERR_OUT=$(cat /tmp/plumb-stderr.txt 2>/dev/null || true)

# 결과 저장
RESULT_FILE="${RESULTS_DIR}/plumb-run-$(date +%Y%m%dT%H%M%S).json"
echo "$RESULT" > "$RESULT_FILE"

# 요약 출력
echo "" >&2
echo "=== SyncResult ===" >&2
echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
success = r.get('success', False)
icon = '✅' if success else '❌'
print(f'{icon} success={success}', file=sys.stderr)
print(f'  duration={r.get(\"duration\", 0)}ms', file=sys.stderr)
t = r.get('triangle', {})
for k, v in t.items():
    print(f'  triangle.{k}: {v.get(\"matched\",0)}/{v.get(\"total\",0)} gaps={len(v.get(\"gaps\",[]))}', file=sys.stderr)
print(f'  decisions={len(r.get(\"decisions\",[]))}', file=sys.stderr)
print(f'  errors={len(r.get(\"errors\",[]))}', file=sys.stderr)
" 2>&1 >&2 || true

echo "" >&2
echo "결과 저장: $RESULT_FILE" >&2
echo "decisions.jsonl: $DECISIONS_DIR/decisions.jsonl" >&2
echo "exit code: $EXIT_CODE" >&2

# JSON 결과를 stdout으로 출력 (파이프라인 연결용)
echo "$RESULT"
exit $EXIT_CODE
