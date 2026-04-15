#!/usr/bin/env bash
# dev-local.sh — Start all Decode-X services locally in batches
# Prevents workerd resource contention by staggering startup
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

start_service() {
  local svc="$1"
  cd "$ROOT/services/$svc"
  wrangler dev 2>&1 | sed "s/^/[$svc] /" &
  PIDS+=($!)
}

echo "=== Decode-X Local Dev ==="
echo ""

# Wave 1: Pipeline services
echo "▸ Wave 1: Pipeline services"
start_service svc-ingestion
start_service svc-extraction
start_service svc-policy
sleep 5

# Wave 2: Downstream pipeline
echo "▸ Wave 2: Downstream pipeline"
start_service svc-ontology
start_service svc-skill
sleep 5

# Wave 3: Infrastructure + MCP
echo "▸ Wave 3: Infrastructure + MCP"
start_service svc-queue-router
start_service svc-mcp-server
sleep 3

# Wave 4: Frontend
echo "▸ Wave 4: Frontend"
cd "$ROOT/apps/app-web"
npx vite 2>&1 | sed "s/^/[app-web] /" &
PIDS+=($!)

sleep 5
echo ""
echo "=== Health Check ==="
PASS=0; FAIL=0
SERVICES=(
  "8701:svc-ingestion"
  "8702:svc-extraction"
  "8703:svc-policy"
  "8704:svc-ontology"
  "8705:svc-skill"
  "8711:svc-queue-router"
  "8712:svc-mcp-server"
)
for entry in "${SERVICES[@]}"; do
  port="${entry%%:*}"
  name="${entry#*:}"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$port/health" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo "  ✅ $name → :$port"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name → :$port ($code)"
    FAIL=$((FAIL+1))
  fi
done
echo ""
echo "Workers: $PASS/7 healthy"
echo "Press Ctrl+C to stop all services."
echo ""

# Keep alive
wait
