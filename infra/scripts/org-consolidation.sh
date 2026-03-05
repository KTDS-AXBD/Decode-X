#!/usr/bin/env bash
# =============================================================================
# Org Consolidation: org-mirae-pension → Miraeasset
# =============================================================================
# Phase 1: Delete downstream data for 18 duplicate documents
# Phase 2: Delete 18 duplicate documents
# Phase 3: UPDATE remaining 93 unique docs → Miraeasset
# Phase 4: Clean up test org data
# =============================================================================
# IMPORTANT: Each D1 database is independent (no cross-DB queries).
# IDs are pre-resolved and hardcoded to avoid cross-DB subquery issues.
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

CF_ENV="${1:-production}"     # default: production
DRY_RUN="${2:-true}"          # default: dry-run
ENV="--env $CF_ENV"

# 18 duplicate document IDs in org-mirae-pension (also exist in Miraeasset by original_name)
DUP_DOC_IDS=(
  c3093282-0de9-4055-8f65-291bcb127e0c
  208e5fec-336c-401a-bf21-ca1ea02854e7
  5249f14d-85ec-4201-af55-dd3ac9d4cba0
  da7cd931-218d-4d17-a496-d761fb7f3830
  b88f92c6-5c4a-4d84-8a8c-5b6dbbd24af0
  590f7386-a422-4352-9b73-23bd21a1562d
  73ce3651-05dc-4237-88a3-b115184edf8b
  4ada3d9d-9753-4dd5-b3c5-5fc376d1e8a2
  c966afb7-cd0f-4a97-a469-3f2074971757
  6a68b0c0-583a-4487-9053-5eb837b92bd3
  a6f3d352-4659-4110-a0a6-91be04865679
  ad421d89-b06e-4765-bac0-3cb81704ca47
  de2b3638-63fb-45d8-b368-f2cff550cda1
  789d1ba2-67d6-4be7-bec4-edd32ccef3c1
  0353394c-818b-4792-b129-cf87a9fac1fe
  595b2698-2547-4772-98f6-dc0822192a0e
  6b24cdde-0f13-4057-903d-a4bff8877f3a
  8a7b5087-07c3-46df-9d6a-d4c452305464
)

# 16 extraction IDs in db-structure linked to the 18 duplicate docs
DUP_EXT_IDS=(
  ef6a6211-efef-494f-b94e-086be243e4a5
  b35f22e7-d1b1-4380-9e43-9e706d8b4769
  d8fdeb95-ffa6-4402-9ee1-bc4dc4ffc6d7
  0f60c8ee-b354-4735-a092-fd1764f581e8
  b95cbe36-e668-4eac-980b-0abb81c729ee
  a71d4a87-5980-437a-b8d0-c64bc03ae1fb
  47aa13a0-7ec3-41b3-a51d-13911432e24d
  f2af6900-d986-4ac3-aa31-cafaf13beda3
  4d3ba276-1e89-4528-bc19-0e072a0bef58
  8046c5c6-f8d2-40bb-ad02-f40901a68b6c
  2136e048-25ca-45c4-b2f0-6e7e4bef8639
  b6a0dde3-8215-4d4e-bfcd-32aee366606e
  f7e5a885-1eed-4bfc-9a5e-f32306ca7dd4
  1d6d94c6-e756-4131-8cc9-090af6c43a19
  85e8eb4a-223c-4bbb-a831-a655f85f4d82
  770de560-51d8-40b7-b912-77391e49a929
)

# Pre-resolved: read dup-policy-ids.txt and dup-ontology-ids.txt
# These were queried from db-policy and db-ontology respectively
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEAM_TMP="$PROJECT_DIR/.team-tmp"

load_ids_from_file() {
  local file="$1"
  local -n target=$2
  if [ -f "$file" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && target+=("$line")
    done < "$file"
  else
    echo "ERROR: $file not found. Run data collection first."
    exit 1
  fi
}

DUP_POLICY_IDS=()
load_ids_from_file "$TEAM_TMP/dup-policy-ids.txt" DUP_POLICY_IDS

DUP_ONTOLOGY_IDS=()
load_ids_from_file "$TEAM_TMP/dup-ontology-ids.txt" DUP_ONTOLOGY_IDS

run_sql() {
  local db="$1"
  local sql="$2"
  local label="$3"

  if [ "$DRY_RUN" = "true" ]; then
    echo "[DRY-RUN] $label"
    echo "  DB: $db"
  else
    echo "[EXEC] $label"
    wrangler d1 execute "$db" --remote $ENV --command "$sql" 2>&1 | grep -E '"changes"|"rows_'
  fi
}

make_in_clause() {
  local -n arr=$1
  local result=""
  for id in "${arr[@]}"; do
    [ -n "$result" ] && result+=","
    result+="'$id'"
  done
  echo "$result"
}

DUP_DOC_IN=$(make_in_clause DUP_DOC_IDS)
DUP_EXT_IN=$(make_in_clause DUP_EXT_IDS)
DUP_POL_IN=$(make_in_clause DUP_POLICY_IDS)
DUP_ONT_IN=$(make_in_clause DUP_ONTOLOGY_IDS)

echo "============================================"
echo "  Org Consolidation: org-mirae-pension → Miraeasset"
echo "  Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY-RUN" || echo "EXECUTE")"
echo "  Env: $ENV"
echo "============================================"
echo ""
echo "Data to process:"
echo "  Duplicate docs: ${#DUP_DOC_IDS[@]}"
echo "  Duplicate extractions: ${#DUP_EXT_IDS[@]}"
echo "  Duplicate policies: ${#DUP_POLICY_IDS[@]}"
echo "  Duplicate ontologies: ${#DUP_ONTOLOGY_IDS[@]}"
echo ""

# =============================================================================
# PRE-CHECK: Count rows before changes
# =============================================================================
echo "=== PRE-CHECK ==="

run_sql db-ingestion \
  "SELECT organization_id, COUNT(*) as cnt FROM documents WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count documents per org"

run_sql db-structure \
  "SELECT organization_id, COUNT(*) as cnt FROM extractions WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count extractions per org"

run_sql db-policy \
  "SELECT organization_id, COUNT(*) as cnt FROM policies WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count policies per org"

run_sql db-ontology \
  "SELECT organization_id, COUNT(*) as cnt FROM ontologies WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count ontologies per org"

echo ""

# =============================================================================
# PHASE 1: Delete downstream of 18 duplicate docs (leaf → root order)
# Each DB is independent; IDs are pre-resolved to avoid cross-DB subqueries.
# =============================================================================
echo "=== PHASE 1: Delete duplicate downstream (leaf → root) ==="

# 1a. db-skill: delete 58 skills linked to duplicate ontologies
run_sql db-skill \
  "DELETE FROM skill_downloads WHERE skill_id IN (SELECT skill_id FROM skills WHERE ontology_id IN ($DUP_ONT_IN))" \
  "Delete skill_downloads for dup ontologies (58 skills)"

run_sql db-skill \
  "DELETE FROM skills WHERE ontology_id IN ($DUP_ONT_IN)" \
  "Delete skills for dup ontologies (58 skills)"

# 1b. db-ontology: delete 435 terms → 58 ontologies
run_sql db-ontology \
  "DELETE FROM terms WHERE ontology_id IN ($DUP_ONT_IN)" \
  "Delete terms for dup ontologies (435 terms)"

run_sql db-ontology \
  "DELETE FROM ontologies WHERE ontology_id IN ($DUP_ONT_IN)" \
  "Delete dup ontologies (58)"

# 1c. db-policy: hitl_actions → hitl_sessions → 58 policies
run_sql db-policy \
  "DELETE FROM hitl_actions WHERE session_id IN (SELECT session_id FROM hitl_sessions WHERE policy_id IN ($DUP_POL_IN))" \
  "Delete hitl_actions for dup policies"

run_sql db-policy \
  "DELETE FROM hitl_sessions WHERE policy_id IN ($DUP_POL_IN)" \
  "Delete hitl_sessions for dup policies"

run_sql db-policy \
  "DELETE FROM policies WHERE policy_id IN ($DUP_POL_IN)" \
  "Delete dup policies (58)"

# 1d. db-structure: extraction_chunks → 16 extractions
run_sql db-structure \
  "DELETE FROM extraction_chunks WHERE extraction_id IN ($DUP_EXT_IN)" \
  "Delete extraction_chunks for dup extractions"

# Also delete analysis-related rows (migration 0003: analyses, diagnosis_findings)
run_sql db-structure \
  "DELETE FROM diagnosis_findings WHERE analysis_id IN (SELECT analysis_id FROM analyses WHERE extraction_id IN ($DUP_EXT_IN))" \
  "Delete diagnosis_findings for dup extractions"

run_sql db-structure \
  "DELETE FROM analyses WHERE extraction_id IN ($DUP_EXT_IN)" \
  "Delete analyses for dup extractions"

run_sql db-structure \
  "DELETE FROM extractions WHERE id IN ($DUP_EXT_IN)" \
  "Delete dup extractions (16)"

echo ""

# =============================================================================
# PHASE 2: Delete 18 duplicate documents from db-ingestion
# =============================================================================
echo "=== PHASE 2: Delete 18 duplicate documents ==="

run_sql db-ingestion \
  "DELETE FROM documents WHERE organization_id='org-mirae-pension' AND document_id IN ($DUP_DOC_IN)" \
  "Delete 18 duplicate documents"

echo ""

# =============================================================================
# PHASE 3: UPDATE remaining 93 unique docs + downstream → Miraeasset
# =============================================================================
echo "=== PHASE 3: Migrate unique docs to Miraeasset ==="

# 3a. db-ingestion: documents (93 remaining)
run_sql db-ingestion \
  "UPDATE documents SET organization_id='Miraeasset' WHERE organization_id='org-mirae-pension'" \
  "UPDATE documents org → Miraeasset (~93 rows)"

# 3b. db-structure: extractions (200 remaining)
run_sql db-structure \
  "UPDATE extractions SET organization_id='Miraeasset' WHERE organization_id='org-mirae-pension'" \
  "UPDATE extractions org → Miraeasset (~200 rows)"

# 3c. db-policy: policies (259 remaining)
run_sql db-policy \
  "UPDATE policies SET organization_id='Miraeasset' WHERE organization_id='org-mirae-pension'" \
  "UPDATE policies org → Miraeasset (~259 rows)"

# 3d. db-ontology: ontologies (278 remaining)
run_sql db-ontology \
  "UPDATE ontologies SET organization_id='Miraeasset' WHERE organization_id='org-mirae-pension'" \
  "UPDATE ontologies org → Miraeasset (~278 rows)"

echo ""

# =============================================================================
# PHASE 4: Clean up test org data (count only — manual delete separate)
# =============================================================================
echo "=== PHASE 4: Test org data inventory ==="

for pattern in "org-e2e-test%" "org-test%" "org-batch%" "org-001" "org-diag%" "default" "system"; do
  run_sql db-ingestion \
    "SELECT COUNT(*) as cnt FROM documents WHERE organization_id LIKE '$pattern'" \
    "[COUNT] documents LIKE '$pattern'"
done

echo ""

# =============================================================================
# POST-CHECK: Verify consolidation
# =============================================================================
echo "=== POST-CHECK ==="

run_sql db-ingestion \
  "SELECT organization_id, COUNT(*) as cnt FROM documents WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count documents per org (after)"

run_sql db-structure \
  "SELECT organization_id, COUNT(*) as cnt FROM extractions WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count extractions per org (after)"

run_sql db-policy \
  "SELECT organization_id, COUNT(*) as cnt FROM policies WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count policies per org (after)"

run_sql db-ontology \
  "SELECT organization_id, COUNT(*) as cnt FROM ontologies WHERE organization_id IN ('Miraeasset','org-mirae-pension') GROUP BY organization_id" \
  "Count ontologies per org (after)"

echo ""
echo "============================================"
echo "  Done!"
echo "============================================"
