#!/usr/bin/env bash
# db-init-staging.sh — Apply all pending D1 migrations to staging DBs
#
# Usage: bash scripts/db-init-staging.sh [--dry-run]
# Requires: CLOUDFLARE_API_TOKEN set (or wrangler already authenticated)
#
# Applies migrations via `wrangler d1 migrations apply` for all 5 staging DBs.
# Already-applied migrations are skipped automatically (tracked in d1_migrations table).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=false

for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

declare -A SERVICES=(
  [svc-ingestion]="DB_INGESTION"
  [svc-extraction]="DB_EXTRACTION"
  [svc-policy]="DB_POLICY"
  [svc-ontology]="DB_ONTOLOGY"
  [svc-skill]="DB_SKILL"
)

echo "=== Decode-X Staging D1 Migration Init ==="
echo "Root: $ROOT_DIR"
echo "Dry run: $DRY_RUN"
echo ""

FAILED=0

for svc in svc-ingestion svc-extraction svc-policy svc-ontology svc-skill; do
  binding="${SERVICES[$svc]}"
  svc_dir="$ROOT_DIR/services/$svc"

  echo "--- $svc ($binding) ---"

  if [[ ! -f "$svc_dir/wrangler.toml" ]]; then
    echo "  ERROR: $svc_dir/wrangler.toml not found" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] wrangler d1 migrations apply $binding --env staging --remote"
    continue
  fi

  if ! (cd "$svc_dir" && npx wrangler d1 migrations apply "$binding" --env staging --remote 2>&1); then
    echo "  ERROR: migration failed for $svc" >&2
    FAILED=$((FAILED + 1))
  else
    echo "  OK"
  fi

  echo ""
done

if [[ "$FAILED" -gt 0 ]]; then
  echo "ERROR: $FAILED service(s) failed migration" >&2
  exit 1
fi

echo "=== All staging migrations applied successfully ==="
