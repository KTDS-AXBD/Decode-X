#!/usr/bin/env bash
# secret-sync-all-workers.sh — 7-worker × 3 secret × 3 env 일괄 동기 (F490 / Sprint 339)
#
# 배경 (S246 + S260 + S268 누적 교훈, CLAUDE.md "Worker Secret Store env-scoped divergence"):
#   wrangler `<name>` (default env) ↔ `<name>-production` (--env production) ↔
#   `<name>-staging` (--env staging)이 별개 secret store. rotation 시 모든 env에
#   동시 갱신해야 silent fail 회피 가능.
#
# scripts/secret-sync-svc-skill.sh의 7-worker 확장판.
# 본 스크립트는 **dry-run only** (S300 Sprint 339 scope 축소).
# 실 production rotation 은 차기 세션에서 단계적으로:
#   1. 본 스크립트로 dry-run 검증
#   2. scripts/secret-sync-svc-skill.sh --apply (단일 worker 검증)
#   3. 본 스크립트 --apply (전체 적용, 단계 1+2 PASS 후만)
#
# 정본 위치 (chmod 600 필수):
#   ~/.secrets/decode-x-internal    — INTERNAL_API_SECRET (모든 worker)
#   ~/.secrets/openrouter-api-key   — OPENROUTER_API_KEY (LLM 사용 worker)
#   ~/.secrets/cf-ai-gateway-url    — CLOUDFLARE_AI_GATEWAY_URL (LLM 사용 worker, full chat-completions path)
#
# 사용법:
#   bash scripts/secret-sync-all-workers.sh                # dry-run 전체 (7 worker × 3 secret × 2 env = 42건)
#   bash scripts/secret-sync-all-workers.sh --include-staging  # +staging (63건)
#   bash scripts/secret-sync-all-workers.sh --apply        # 실 적용 (S339 외 차기 세션 권장)
#
# 종료 코드: 0=성공, 1=설정 오류, 2=secret 미존재, 3=wrangler put 실패

set -uo pipefail

# ---- 설정 ------------------------------------------------------------------
# Shell $HOME이 real HOME과 다른 환경(Claude Code .claude-work) 대응 — getent로 real HOME 감지.
# `AX_TARGET_HOME` 또는 `SECRETS_DIR` env var로 override 가능.
if [[ -n "${SECRETS_DIR:-}" ]]; then
  : # SECRETS_DIR 외부 지정됨, 그대로 사용
elif [[ -n "${AX_TARGET_HOME:-}" ]]; then
  SECRETS_DIR="${AX_TARGET_HOME}/.secrets"
else
  REAL_HOME=$(getent passwd "$USER" 2>/dev/null | cut -d: -f6)
  if [[ -n "$REAL_HOME" && -d "${REAL_HOME}/.secrets" ]]; then
    SECRETS_DIR="${REAL_HOME}/.secrets"
  else
    SECRETS_DIR="${HOME}/.secrets"
  fi
fi
readonly SECRETS_DIR
readonly SCRIPT_NAME="$(basename "$0")"

# 7 worker × secret 매핑 — 일부 worker는 LLM secret 불필요
# format: <worker_dir>:<secret_list_csv>
declare -a WORKER_SECRETS=(
  "services/svc-ingestion:INTERNAL_API_SECRET"
  "services/svc-extraction:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "services/svc-policy:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "services/svc-ontology:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "services/svc-skill:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "services/svc-queue-router:INTERNAL_API_SECRET"
  "services/svc-mcp-server:INTERNAL_API_SECRET"
)

# secret name → 정본 파일 매핑
declare -A SECRET_FILES=(
  [INTERNAL_API_SECRET]="decode-x-internal"
  [OPENROUTER_API_KEY]="openrouter-api-key"
  [CLOUDFLARE_AI_GATEWAY_URL]="cf-ai-gateway-url"
)

TARGET_ENVS=("default" "production")

# ---- 인자 파싱 -------------------------------------------------------------
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --include-staging) TARGET_ENVS+=("staging"); shift ;;
    -h|--help)
      grep -E "^# " "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "❌ 알 수 없는 인자: $1"; exit 1 ;;
  esac
done

# ---- 사전 점검 -------------------------------------------------------------
echo "▶ ${SCRIPT_NAME} (apply=${APPLY}, envs=${TARGET_ENVS[*]})"
echo ""

if [[ "$APPLY" == true ]]; then
  echo "⚠️  --apply 모드 — 실 production secret rotation 동반"
  echo "   S339 Sprint scope에서는 dry-run only 권장. 본 스크립트 실 실행 전:"
  echo "   1. 단일 worker(svc-skill)에서 secret-sync-svc-skill.sh --apply 검증"
  echo "   2. 양 env single eval verify PASS 확인"
  echo "   3. 다른 worker는 단계적 적용 (svc-policy → svc-extraction → ...)"
  echo ""
  read -p "계속 진행? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "취소됨"
    exit 0
  fi
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ wrangler 미설치"
  exit 1
fi

# 정본 파일 존재 검증
echo "▶ 정본 파일 점검 (${SECRETS_DIR})"
MISSING=0
for SECRET_NAME in "${!SECRET_FILES[@]}"; do
  FILE_BASE="${SECRET_FILES[$SECRET_NAME]}"
  FILE_PATH="${SECRETS_DIR}/${FILE_BASE}"

  if [[ ! -f "$FILE_PATH" ]]; then
    echo "  ❌ ${SECRET_NAME} → ${FILE_PATH} 미존재"
    MISSING=$((MISSING + 1))
    continue
  fi

  PERMS=$(stat -c "%a" "$FILE_PATH" 2>/dev/null || stat -f "%A" "$FILE_PATH" 2>/dev/null)
  SIZE=$(stat -c "%s" "$FILE_PATH" 2>/dev/null || stat -f "%z" "$FILE_PATH" 2>/dev/null)

  if [[ "$PERMS" != "600" ]]; then
    echo "  ⚠️  ${SECRET_NAME} → ${FILE_PATH} chmod ${PERMS} (600 권장) size=${SIZE}"
  else
    echo "  ✅ ${SECRET_NAME} → ${FILE_PATH} (chmod 600, size=${SIZE})"
  fi

  if [[ "$SECRET_NAME" == "CLOUDFLARE_AI_GATEWAY_URL" ]]; then
    URL_VAL=$(cat "$FILE_PATH")
    if [[ "$URL_VAL" != *"/openrouter/v1/chat/completions" ]]; then
      echo "    ⚠️  CLOUDFLARE_AI_GATEWAY_URL이 full chat-completions path가 아님 (S246/S260 교훈)"
    fi
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "❌ secret 정본 ${MISSING}건 누락 — ${SECRETS_DIR}에 chmod 600으로 생성 후 재실행"
  exit 2
fi

# ---- worker 디렉토리 검증 --------------------------------------------------
echo ""
echo "▶ Worker 디렉토리 점검"
WORKER_MISSING=0
for ENTRY in "${WORKER_SECRETS[@]}"; do
  WORKER_DIR="${ENTRY%%:*}"
  if [[ ! -d "$WORKER_DIR" ]]; then
    echo "  ❌ ${WORKER_DIR} 미존재"
    WORKER_MISSING=$((WORKER_MISSING + 1))
  else
    echo "  ✅ ${WORKER_DIR}"
  fi
done

if [[ $WORKER_MISSING -gt 0 ]]; then
  echo ""
  echo "❌ worker 디렉토리 ${WORKER_MISSING}건 누락 — repo 루트에서 실행해야 함"
  exit 1
fi

# ---- 실행 계획 출력 --------------------------------------------------------
echo ""
echo "▶ 실행 계획 (apply=${APPLY})"
echo ""

TOTAL_OPS=0
for ENTRY in "${WORKER_SECRETS[@]}"; do
  WORKER_DIR="${ENTRY%%:*}"
  SECRET_LIST="${ENTRY##*:}"
  WORKER_NAME=$(basename "$WORKER_DIR")

  echo "  ── ${WORKER_NAME}"
  IFS=',' read -ra WORKER_SECRET_ARR <<< "$SECRET_LIST"
  for SECRET_NAME in "${WORKER_SECRET_ARR[@]}"; do
    for ENV_NAME in "${TARGET_ENVS[@]}"; do
      if [[ "$ENV_NAME" == "default" ]]; then
        echo "     wrangler secret put ${SECRET_NAME}"
      else
        echo "     wrangler secret put ${SECRET_NAME} --env ${ENV_NAME}"
      fi
      TOTAL_OPS=$((TOTAL_OPS + 1))
    done
  done
done

echo ""
echo "▶ 총 ${TOTAL_OPS}건 ($((${#WORKER_SECRETS[@]}))개 worker × secrets × ${#TARGET_ENVS[@]} env)"

if [[ "$APPLY" != true ]]; then
  echo ""
  echo "💡 dry-run 종료. 실제 적용은 --apply 추가 (S339 scope에서는 차기 세션 권장)"
  exit 0
fi

# ---- 실제 적용 -------------------------------------------------------------
echo ""
echo "▶ 적용 중 (CLOUDFLARE_API_TOKEN 인증 필요)"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "❌ CLOUDFLARE_API_TOKEN 미설정"
  exit 1
fi

FAIL=0
SUCCESS=0
for ENTRY in "${WORKER_SECRETS[@]}"; do
  WORKER_DIR="${ENTRY%%:*}"
  SECRET_LIST="${ENTRY##*:}"
  WORKER_NAME=$(basename "$WORKER_DIR")

  echo ""
  echo "▶ ${WORKER_NAME}"
  cd "$WORKER_DIR" || continue

  IFS=',' read -ra WORKER_SECRET_ARR <<< "$SECRET_LIST"
  for SECRET_NAME in "${WORKER_SECRET_ARR[@]}"; do
    FILE_BASE="${SECRET_FILES[$SECRET_NAME]}"
    FILE_PATH="${SECRETS_DIR}/${FILE_BASE}"
    SECRET_VALUE=$(cat "$FILE_PATH")

    for ENV_NAME in "${TARGET_ENVS[@]}"; do
      if [[ "$ENV_NAME" == "default" ]]; then
        ENV_FLAG=()
        ENV_LABEL="default"
      else
        ENV_FLAG=(--env "$ENV_NAME")
        ENV_LABEL="$ENV_NAME"
      fi

      if printf '%s' "$SECRET_VALUE" | npx wrangler secret put "$SECRET_NAME" "${ENV_FLAG[@]}" >/dev/null 2>&1; then
        echo "  ✅ ${SECRET_NAME} → ${ENV_LABEL}"
        SUCCESS=$((SUCCESS + 1))
      else
        echo "  ❌ ${SECRET_NAME} → ${ENV_LABEL} (wrangler put 실패)"
        FAIL=$((FAIL + 1))
      fi
    done
  done

  cd - >/dev/null
done

echo ""
echo "▶ 결과: ${SUCCESS}건 성공 / ${FAIL}건 실패 (총 ${TOTAL_OPS}건)"

if [[ $FAIL -gt 0 ]]; then
  echo "❌ ${FAIL}건 적용 실패"
  exit 3
fi

echo ""
echo "✅ 전체 적용 완료. 후속 verify는 secret-sync-svc-skill.sh --verify 또는"
echo "   각 worker에 실 API path curl 테스트 권장 (CLAUDE.md inter-service auth 참조)"
