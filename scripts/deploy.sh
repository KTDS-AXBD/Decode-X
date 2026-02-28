#!/usr/bin/env bash
#
# deploy.sh — Deploy AI Foundry services to Cloudflare Workers
#
# Usage:
#   ./scripts/deploy.sh --env staging              # Deploy all services to staging
#   ./scripts/deploy.sh --env production            # Deploy all services to production
#   ./scripts/deploy.sh --env staging --only svc-ingestion,svc-security
#   ./scripts/deploy.sh --env production --only svc-llm-router
#   ./scripts/deploy.sh --env staging --include-pages   # Also deploy app-web Pages
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN must be set (or logged in via `wrangler login`)
#   - Run from the repository root
#
set -euo pipefail

# All Workers services (deploy order: platform first, then pipeline, then queue-router)
ALL_SERVICES=(
  svc-security
  svc-llm-router
  svc-governance
  svc-notification
  svc-analytics
  svc-ingestion
  svc-extraction
  svc-policy
  svc-ontology
  svc-skill
  svc-queue-router
)

ENVIRONMENT=""
ONLY_SERVICES=""
INCLUDE_PAGES=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --only)
      ONLY_SERVICES="$2"
      shift 2
      ;;
    --include-pages)
      INCLUDE_PAGES=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --env <staging|production> [--only svc-a,svc-b] [--include-pages]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Error: --env must be 'staging' or 'production'"
  echo "Usage: $0 --env <staging|production> [--only svc-a,svc-b] [--include-pages]"
  exit 1
fi

# Determine repo root
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build list of services to deploy
if [[ -n "$ONLY_SERVICES" ]]; then
  IFS=',' read -ra SERVICES <<< "$ONLY_SERVICES"
else
  SERVICES=("${ALL_SERVICES[@]}")
fi

echo "========================================"
echo "  AI Foundry — Deploy to ${ENVIRONMENT}"
echo "========================================"
echo ""
echo "Services: ${SERVICES[*]}"
echo "Pages:    ${INCLUDE_PAGES}"
echo ""

# Track results
SUCCEEDED=()
FAILED=()

# Deploy each service
for svc in "${SERVICES[@]}"; do
  svc_dir="${REPO_ROOT}/services/${svc}"

  if [[ ! -d "$svc_dir" ]]; then
    echo "[SKIP] ${svc} — directory not found"
    FAILED+=("${svc} (not found)")
    continue
  fi

  echo "----------------------------------------"
  echo "[DEPLOY] ${svc} -> ${ENVIRONMENT}"
  echo "----------------------------------------"

  if (cd "$svc_dir" && wrangler deploy --env "$ENVIRONMENT"); then
    SUCCEEDED+=("$svc")
    echo "[OK] ${svc}"
  else
    FAILED+=("$svc")
    echo "[FAIL] ${svc}"
  fi
  echo ""
done

# Deploy Pages if requested
if [[ "$INCLUDE_PAGES" == "true" ]]; then
  echo "----------------------------------------"
  echo "[DEPLOY] app-web (Pages) -> ${ENVIRONMENT}"
  echo "----------------------------------------"

  PAGES_DIR="${REPO_ROOT}/apps/app-web"

  # Build the app
  (cd "$PAGES_DIR" && VITE_ENVIRONMENT="$ENVIRONMENT" bun run build)

  # Determine branch for Pages deployment
  if [[ "$ENVIRONMENT" == "production" ]]; then
    PAGES_BRANCH="main"
  else
    PAGES_BRANCH="staging"
  fi

  if (cd "$PAGES_DIR" && wrangler pages deploy dist --project-name=ai-foundry-app-web --branch="$PAGES_BRANCH"); then
    SUCCEEDED+=("app-web")
    echo "[OK] app-web"
  else
    FAILED+=("app-web")
    echo "[FAIL] app-web"
  fi
  echo ""
fi

# Summary
echo "========================================"
echo "  Deployment Summary (${ENVIRONMENT})"
echo "========================================"
echo ""

if [[ ${#SUCCEEDED[@]} -gt 0 ]]; then
  echo "Succeeded (${#SUCCEEDED[@]}):"
  for s in "${SUCCEEDED[@]}"; do
    echo "  + ${s}"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo "Failed (${#FAILED[@]}):"
  for f in "${FAILED[@]}"; do
    echo "  - ${f}"
  done
  echo ""
  exit 1
fi

echo ""
echo "All deployments succeeded."
