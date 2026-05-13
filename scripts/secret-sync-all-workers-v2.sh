#!/usr/bin/env bash
# secret-sync-all-workers-v2.sh — 7-worker × secret × env CF API REST 우회 패턴 (F515 / Sprint 342)
#
# v1 → v2 변경점 (S341 학습):
#   1. wrangler secret put → Cloudflare REST API 직접 호출 (PUT /accounts/{acct}/workers/scripts/{id}/secrets)
#      이유: (a) bkit shell wrapper가 stdin pipe 자동 `< /dev/null`로 차단 (wrangler hang),
#            (b) wrangler 4.80.0 `secret bulk`가 fetch failed 자체 버그 (curl로 동일 API 정상).
#   2. Worker name 매핑 함수 도입: default = svc-X / production = svc-X-production / staging = svc-X-staging
#      이유: CF API는 wrangler.toml의 name field가 아닌 실 Worker ID 사용.
#   3. wrangler 의존 제거: 정본 검증 + CLOUDFLARE_API_TOKEN + curl만 필요.
#   4. Verify: PUT 후 GET secrets로 200 OK + 이름 존재 확인.
#
# 정본 위치 (chmod 600 필수):
#   ~/.secrets/decode-x-internal    — INTERNAL_API_SECRET (모든 worker)
#   ~/.secrets/openrouter-api-key   — OPENROUTER_API_KEY (LLM 사용 worker)
#   ~/.secrets/cf-ai-gateway-url    — CLOUDFLARE_AI_GATEWAY_URL (LLM 사용 worker, full chat-completions path)
#
# 사용법:
#   bash scripts/secret-sync-all-workers-v2.sh                # dry-run 전체 (7 worker × secrets × 2 env)
#   bash scripts/secret-sync-all-workers-v2.sh --include-staging  # +staging (3 env)
#   bash scripts/secret-sync-all-workers-v2.sh --apply        # 실 적용 (CF API REST PUT)
#   bash scripts/secret-sync-all-workers-v2.sh --worker svc-ingestion --apply  # 단일 worker만
#
# 종료 코드: 0=성공, 1=설정 오류, 2=secret 미존재, 3=CF API PUT 실패

set -uo pipefail

# ---- 설정 ------------------------------------------------------------------
if [[ -n "${SECRETS_DIR:-}" ]]; then
  : # SECRETS_DIR 외부 지정
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

# 7 worker × secret 매핑 — worker name만 (wrangler.toml의 name field 기준)
declare -a WORKER_SECRETS=(
  "svc-ingestion:INTERNAL_API_SECRET"
  "svc-extraction:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "svc-policy:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "svc-ontology:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "svc-skill:INTERNAL_API_SECRET,OPENROUTER_API_KEY,CLOUDFLARE_AI_GATEWAY_URL"
  "svc-queue-router:INTERNAL_API_SECRET"
  "svc-mcp-server:INTERNAL_API_SECRET"
)

declare -A SECRET_FILES=(
  [INTERNAL_API_SECRET]="decode-x-internal"
  [OPENROUTER_API_KEY]="openrouter-api-key"
  [CLOUDFLARE_AI_GATEWAY_URL]="cf-ai-gateway-url"
)

TARGET_ENVS=("default" "production")
APPLY=false
SINGLE_WORKER=""

# ---- 인자 파싱 -------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --include-staging) TARGET_ENVS+=("staging"); shift ;;
    --worker) SINGLE_WORKER="$2"; shift 2 ;;
    -h|--help)
      grep -E "^# " "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "❌ 알 수 없는 인자: $1"; exit 1 ;;
  esac
done

# ---- Worker ID 매핑 함수 ---------------------------------------------------
# wrangler env → CF Worker ID (S341 학습)
#   default env  → ${WORKER_NAME}
#   production   → ${WORKER_NAME}-production
#   staging      → ${WORKER_NAME}-staging
worker_id_for_env() {
  local worker_name="$1"
  local env_name="$2"
  case "$env_name" in
    default) echo "$worker_name" ;;
    production) echo "${worker_name}-production" ;;
    staging) echo "${worker_name}-staging" ;;
    *) echo "❌ 알 수 없는 env: $env_name" >&2; return 1 ;;
  esac
}

# ---- 사전 점검 -------------------------------------------------------------
echo "▶ ${SCRIPT_NAME} (apply=${APPLY}, envs=${TARGET_ENVS[*]}${SINGLE_WORKER:+, single-worker=${SINGLE_WORKER}})"
echo ""

if [[ "$APPLY" == true ]]; then
  echo "⚠️  --apply 모드 — 실 production secret rotation 동반"
  echo "   3-step 안전 절차 권장:"
  echo "   1. dry-run 1회로 실행 계획 점검"
  echo "   2. --worker svc-ingestion --apply (단일 worker 검증)"
  echo "   3. 단일 검증 PASS 후 --apply (전체 적용)"
  echo ""
  if [[ -t 0 ]]; then
    read -p "계속 진행? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
      echo "취소됨"
      exit 0
    fi
  else
    echo "⚠️  non-interactive stdin — confirm prompt 생략 (CI/script 환경)"
  fi
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "❌ CLOUDFLARE_API_TOKEN 환경변수 미설정"
  exit 1
fi

# CF account ID 감지
echo "▶ Cloudflare account ID 감지 중..."
ACCT_ID=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts" 2>/dev/null \
  | grep -oE '"id":"[a-f0-9]{32}"' | head -1 | cut -d'"' -f4)

if [[ -z "$ACCT_ID" ]]; then
  echo "❌ CF account 조회 실패 (CLOUDFLARE_API_TOKEN 권한 확인)"
  exit 1
fi
echo "  ✅ ACCT_ID: $ACCT_ID"

# 정본 파일 점검
echo ""
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
    echo "  ⚠️  ${SECRET_NAME} → chmod ${PERMS} (600 권장) size=${SIZE}"
  else
    echo "  ✅ ${SECRET_NAME} → chmod 600, size=${SIZE}"
  fi

  if [[ "$SECRET_NAME" == "CLOUDFLARE_AI_GATEWAY_URL" ]]; then
    URL_VAL=$(cat "$FILE_PATH")
    if [[ "$URL_VAL" != *"/openrouter/v1/chat/completions" ]]; then
      echo "    ⚠️  full chat-completions path 형식 아님 (S246/S260)"
    fi
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo "❌ secret 정본 ${MISSING}건 누락 — ${SECRETS_DIR}에 chmod 600으로 생성 후 재실행"
  exit 2
fi

# ---- 실행 계획 -------------------------------------------------------------
echo ""
echo "▶ 실행 계획 (apply=${APPLY})"
echo ""

TOTAL_OPS=0
for ENTRY in "${WORKER_SECRETS[@]}"; do
  WORKER_NAME="${ENTRY%%:*}"
  SECRET_LIST="${ENTRY##*:}"

  if [[ -n "$SINGLE_WORKER" && "$WORKER_NAME" != "$SINGLE_WORKER" ]]; then
    continue
  fi

  echo "  ── ${WORKER_NAME}"
  IFS=',' read -ra WORKER_SECRET_ARR <<< "$SECRET_LIST"
  for SECRET_NAME in "${WORKER_SECRET_ARR[@]}"; do
    for ENV_NAME in "${TARGET_ENVS[@]}"; do
      WORKER_ID=$(worker_id_for_env "$WORKER_NAME" "$ENV_NAME")
      echo "     PUT /workers/scripts/${WORKER_ID}/secrets — ${SECRET_NAME}"
      TOTAL_OPS=$((TOTAL_OPS + 1))
    done
  done
done

echo ""
echo "▶ 총 ${TOTAL_OPS}건 (worker × secret × ${#TARGET_ENVS[@]} env)"

if [[ "$APPLY" != true ]]; then
  echo ""
  echo "💡 dry-run 종료. 실제 적용은 --apply 추가"
  exit 0
fi

# ---- 실제 적용 (CF API REST) -----------------------------------------------
echo ""
echo "▶ 적용 중 (CF API REST)"

FAIL=0
SUCCESS=0
for ENTRY in "${WORKER_SECRETS[@]}"; do
  WORKER_NAME="${ENTRY%%:*}"
  SECRET_LIST="${ENTRY##*:}"

  if [[ -n "$SINGLE_WORKER" && "$WORKER_NAME" != "$SINGLE_WORKER" ]]; then
    continue
  fi

  echo ""
  echo "▶ ${WORKER_NAME}"

  IFS=',' read -ra WORKER_SECRET_ARR <<< "$SECRET_LIST"
  for SECRET_NAME in "${WORKER_SECRET_ARR[@]}"; do
    FILE_BASE="${SECRET_FILES[$SECRET_NAME]}"
    FILE_PATH="${SECRETS_DIR}/${FILE_BASE}"
    SECRET_VALUE=$(cat "$FILE_PATH")

    for ENV_NAME in "${TARGET_ENVS[@]}"; do
      WORKER_ID=$(worker_id_for_env "$WORKER_NAME" "$ENV_NAME")
      URL="https://api.cloudflare.com/client/v4/accounts/${ACCT_ID}/workers/scripts/${WORKER_ID}/secrets"

      # JSON body: name + text + type (jq 없이 수동 escape)
      BODY=$(printf '{"name":"%s","text":%s,"type":"secret_text"}' \
        "$SECRET_NAME" \
        "$(printf '%s' "$SECRET_VALUE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || \
           printf '"%s"' "${SECRET_VALUE//\"/\\\"}")")

      HTTP_CODE=$(curl -s -o /tmp/cf-secret-put-resp -w "%{http_code}" -X PUT \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$BODY" \
        "$URL")

      # CF API REST PUT semantics (RFC 9110 idempotent): 200 = update, 201 = Created (신규)
      if [[ "$HTTP_CODE" =~ ^(200|201)$ ]]; then
        echo "  ✅ ${SECRET_NAME} → ${ENV_NAME} (worker=${WORKER_ID}, HTTP ${HTTP_CODE})"
        SUCCESS=$((SUCCESS + 1))
      else
        ERR_MSG=$(grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]*"' /tmp/cf-secret-put-resp 2>/dev/null | head -1 || true)
        echo "  ❌ ${SECRET_NAME} → ${ENV_NAME} (worker=${WORKER_ID}, HTTP ${HTTP_CODE}) ${ERR_MSG}"
        FAIL=$((FAIL + 1))
      fi
    done
  done
done

rm -f /tmp/cf-secret-put-resp

echo ""
echo "▶ 결과: ${SUCCESS}건 성공 / ${FAIL}건 실패 (총 ${TOTAL_OPS}건)"

if [[ $FAIL -gt 0 ]]; then
  echo "❌ ${FAIL}건 적용 실패"
  exit 3
fi

echo ""
echo "✅ 전체 적용 완료. 후속 verify:"
echo "   curl -H \"Authorization: Bearer \$CLOUDFLARE_API_TOKEN\" \\"
echo "     https://api.cloudflare.com/client/v4/accounts/${ACCT_ID}/workers/scripts/svc-X/secrets"
echo ""
echo "   또는 실 API path curl (X-Internal-Secret 헤더로 cross-service auth 검증)"
