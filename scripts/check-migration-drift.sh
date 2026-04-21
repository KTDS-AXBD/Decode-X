#!/usr/bin/env bash
# check-migration-drift.sh — Validate D1 migration file sequence integrity
#
# Usage: bash scripts/check-migration-drift.sh
# Exit codes: 0 = OK, 1 = drift/gap detected
#
# Checks that each DB's migration files follow NNNN_*.sql convention
# with no gaps or duplicates, starting from 0001.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_BASE="$ROOT_DIR/infra/migrations"

declare -A DB_MAP=(
  [db-ingestion]="svc-ingestion"
  [db-structure]="svc-extraction"
  [db-policy]="svc-policy"
  [db-ontology]="svc-ontology"
  [db-skill]="svc-skill"
)

ERRORS=0

echo "=== Migration Sequence Check ==="
echo ""

for db in db-ingestion db-structure db-policy db-ontology db-skill; do
  db_dir="$MIGRATION_BASE/$db"
  echo "--- $db ---"

  if [[ ! -d "$db_dir" ]]; then
    echo "  ERROR: directory not found: $db_dir"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Find all .sql files, extract sequence numbers
  mapfile -t files < <(ls "$db_dir"/*.sql 2>/dev/null | xargs -n1 basename | sort)

  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "  WARN: no migration files found (expected at least 0001_init.sql)"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  prev_num=0
  dup_check=()
  file_error=0

  for f in "${files[@]}"; do
    # Must match NNNN_*.sql
    if ! [[ "$f" =~ ^([0-9]{4})_.*\.sql$ ]]; then
      echo "  ERROR: invalid filename format: $f (expected NNNN_*.sql)"
      ERRORS=$((ERRORS + 1))
      file_error=1
      continue
    fi

    num="${BASH_REMATCH[1]}"
    num_int=$((10#$num))  # strip leading zeros

    # Check for duplicates
    if [[ " ${dup_check[*]} " == *" $num "* ]]; then
      echo "  ERROR: duplicate sequence number $num in $f"
      ERRORS=$((ERRORS + 1))
      file_error=1
      continue
    fi
    dup_check+=("$num")

    # Check sequential (no gaps)
    expected=$((prev_num + 1))
    if [[ "$num_int" -ne "$expected" ]]; then
      echo "  ERROR: gap detected — expected $(printf '%04d' "$expected"), got $num (file: $f)"
      ERRORS=$((ERRORS + 1))
      file_error=1
    fi

    prev_num=$num_int
  done

  if [[ "$file_error" -eq 0 ]]; then
    echo "  OK — ${#files[@]} migration(s), sequence 0001–$(printf '%04d' "$prev_num")"
  fi
  echo ""
done

if [[ "$ERRORS" -gt 0 ]]; then
  echo "ERROR: $ERRORS issue(s) found. Fix migration files before merging." >&2
  exit 1
fi

echo "=== All migration sequences valid ==="
