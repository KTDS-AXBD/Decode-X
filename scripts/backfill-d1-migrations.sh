#!/usr/bin/env bash
# backfill-d1-migrations.sh — Mark pre-existing migrations as applied in production
#
# Usage: bash scripts/backfill-d1-migrations.sh [--env production|staging] [--dry-run]
# Requires: CLOUDFLARE_API_TOKEN set
#
# Background (TD-40, session 223):
# Production D1 was initialized via `wrangler d1 execute --file` before CI/CD existed.
# The `d1_migrations` tracking table is empty, so `wrangler d1 migrations apply` tries
# to re-apply all migrations from zero, failing on non-idempotent ones (ALTER TABLE etc).
# This script backfills `d1_migrations` rows for migrations whose effects already exist
# in the live schema, letting CI only apply genuinely new migrations going forward.
#
# Strategy: INSERT OR IGNORE (UNIQUE on name). Safe to re-run.
#
# IMPORTANT — review the list below BEFORE running. Any migration that has NOT been
# manually applied yet must be EXCLUDED from backfill so CI applies it properly.
# Session 223 context: db-skill 0010_policy_classifications.sql is NEW from F366 —
# include only if you've already run it manually; otherwise omit.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="production"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --env=*) ENV="${arg#--env=}" ;;
    --env) shift; ENV="${1:-production}" ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# Service → binding → expected-applied migration list
# Edit this list if a migration is not actually applied yet in the target env.
declare -A SERVICES=(
  [svc-ingestion]="DB_INGESTION"
  [svc-extraction]="DB_EXTRACTION"
  [svc-policy]="DB_POLICY"
  [svc-ontology]="DB_ONTOLOGY"
  [svc-skill]="DB_SKILL"
)

declare -A DB_DIR=(
  [svc-ingestion]="db-ingestion"
  [svc-extraction]="db-structure"
  [svc-policy]="db-policy"
  [svc-ontology]="db-ontology"
  [svc-skill]="db-skill"
)

# Migrations to EXCLUDE from backfill (i.e. not yet applied, let CI apply them).
# Format: "svc:filename"
EXCLUDE=(
  # "svc-skill:0010_policy_classifications.sql"  # uncomment if 0010 not yet applied
)

is_excluded() {
  local svc="$1" file="$2"
  for ex in "${EXCLUDE[@]}"; do
    [[ "$ex" == "$svc:$file" ]] && return 0
  done
  return 1
}

echo "=== Decode-X D1 Migrations Backfill ==="
echo "Root: $ROOT_DIR"
echo "Env:  $ENV"
echo "Dry run: $DRY_RUN"
echo ""

FAILED=0

for svc in svc-ingestion svc-extraction svc-policy svc-ontology svc-skill; do
  binding="${SERVICES[$svc]}"
  db="${DB_DIR[$svc]}"
  svc_dir="$ROOT_DIR/services/$svc"
  mig_dir="$ROOT_DIR/infra/migrations/$db"

  echo "--- $svc ($binding, $db) ---"

  if [[ ! -d "$mig_dir" ]]; then
    echo "  ERROR: migration dir not found: $mig_dir" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  # Collect migration file names to backfill (respecting EXCLUDE list)
  values=""
  for f in "$mig_dir"/*.sql; do
    [[ -f "$f" ]] || continue
    name="$(basename "$f")"
    if is_excluded "$svc" "$name"; then
      echo "  [skip] $name (excluded — CI will apply)"
      continue
    fi
    if [[ -z "$values" ]]; then
      values="('${name}')"
    else
      values="${values},('${name}')"
    fi
  done

  if [[ -z "$values" ]]; then
    echo "  (no migrations to backfill)"
    echo ""
    continue
  fi

  # Ensure d1_migrations table exists, then INSERT OR IGNORE.
  # Wrangler auto-creates this table on first `migrations apply`, but we guard to make
  # this script runnable even if `apply` has never completed against the env.
  sql="CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ${values};
SELECT COUNT(*) AS backfilled FROM d1_migrations;"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] would execute on $binding --env $ENV:"
    echo "$sql" | sed 's/^/    /'
    echo ""
    continue
  fi

  if ! (cd "$svc_dir" && npx wrangler d1 execute "$binding" --env "$ENV" --remote --command "$sql" 2>&1); then
    echo "  ERROR: backfill failed for $svc" >&2
    FAILED=$((FAILED + 1))
  else
    echo "  OK"
  fi

  echo ""
done

if [[ "$FAILED" -gt 0 ]]; then
  echo "ERROR: $FAILED service(s) failed backfill" >&2
  exit 1
fi

echo "=== Backfill complete. Next: retry CI deploy or 'cd services/svc-* && npx wrangler d1 migrations list <BINDING> --env $ENV --remote' to verify. ==="
