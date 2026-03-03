#!/usr/bin/env bash
# erwin-extract.sh — ERwin 바이너리(.erwin)에서 테이블/컬럼/관계 정보를 추출
#
# Usage:
#   ./scripts/erwin-extract.sh <erwin-file> [output-file]
#
# If output-file is omitted, writes to <erwin-dir>/erwin-tables-extracted.txt
#
# Requirements: strings, python3, grep, sort

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────
ERWIN_FILE="${1:-}"
OUTPUT_FILE="${2:-}"

if [[ -z "$ERWIN_FILE" ]]; then
  echo "Usage: $0 <erwin-file> [output-file]"
  echo "  Extracts table, column, and relationship info from ERwin GDM binary files."
  exit 1
fi

if [[ ! -f "$ERWIN_FILE" ]]; then
  echo "ERROR: File not found: $ERWIN_FILE" >&2
  exit 1
fi

ERWIN_BASENAME="$(basename "$ERWIN_FILE")"
ERWIN_DIR="$(dirname "$ERWIN_FILE")"

if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="${ERWIN_DIR}/erwin-tables-extracted.txt"
fi

echo "=== ERwin 테이블 추출 ==="
echo "  입력: $ERWIN_FILE ($(du -h "$ERWIN_FILE" | cut -f1))"
echo "  출력: $OUTPUT_FILE"
echo ""

# ── Prefix → 업무 영역 매핑 ──────────────────────────────────────────
declare -A PREFIX_LABEL=(
  [TB_RPOM]="운용관리"
  [TB_RPCM]="공통"
  [TB_RPST]="상태/정산"
  [TB_RPEI]="법인영업정보"
  [TB_RPAM]="자산관리"
  [TB_RPUS]="사용자"
  [TB_RPCP]="계약상품"
  [TB_RPRV]="입금"
  [TB_RPWS]="웹서비스"
)

# Ordered for output
PREFIX_ORDER=(TB_RPOM TB_RPCM TB_RPST TB_RPEI TB_RPAM TB_RPUS TB_RPCP TB_RPRV TB_RPWS)

# ── Step 1: Extract unique table codes ────────────────────────────────
echo "Step 1: 테이블 코드 추출 (strings + grep)..."

TABLES_RAW=$(strings "$ERWIN_FILE" | grep -oE 'TB_RP[A-Z]{2}[0-9]{4}' | sort -u)
TABLE_COUNT=$(echo "$TABLES_RAW" | wc -l)
echo "  고유 테이블: ${TABLE_COUNT}개"

# ── Step 2: Extract Korean logical names via Python ───────────────────
echo "Step 2: 한글 논리명 추출 (EUC-KR 디코딩)..."

LOGICAL_MAP_FILE=$(mktemp)
PY_SCRIPT=$(mktemp --suffix=.py)
trap 'rm -f "$LOGICAL_MAP_FILE" "$PY_SCRIPT"' EXIT

cat > "$PY_SCRIPT" << 'PYEOF'
import re, sys, os

erwin_path = os.environ['ERWIN_FILE']
output_path = os.environ['LOGICAL_MAP_FILE']

with open(erwin_path, 'rb') as f:
    data = f.read()

# Find first occurrence of each table -> extract nearby Korean (EUC-KR)
table_re = re.compile(rb'TB_RP[A-Z]{2}\d{4}')
seen = set()
mappings = {}

for m in table_re.finditer(data):
    tname = m.group().decode('ascii')
    if tname in seen:
        continue
    seen.add(tname)

    pos = m.start()
    # Korean logical name is typically in the 300 bytes before the physical name
    window_start = max(0, pos - 300)
    window = data[window_start:pos]

    try:
        text = window.decode('euc-kr', errors='ignore')
        korean = re.findall(r'[\uAC00-\uD7AF]{2,}', text)
        if korean:
            meaningful = [k for k in korean if k != '\ud1f4\uc9c1' and len(k) >= 2]
            if meaningful:
                mappings[tname] = max(meaningful, key=len)
    except Exception:
        pass

# Write TSV: table<tab>logical_name
with open(output_path, 'w', encoding='utf-8') as out:
    for tname in sorted(mappings.keys()):
        out.write(f"{tname}\t{mappings[tname]}\n")

print(f"  한글 논리명: {len(mappings)}/{len(seen)}개 매핑 성공", file=sys.stderr)
PYEOF

ERWIN_FILE="$ERWIN_FILE" LOGICAL_MAP_FILE="$LOGICAL_MAP_FILE" python3 "$PY_SCRIPT"

LOGICAL_COUNT=$(wc -l < "$LOGICAL_MAP_FILE")
echo "  논리명 매핑: ${LOGICAL_COUNT}개"

# ── Step 3: Extract column-like patterns ──────────────────────────────
echo "Step 3: 컬럼 패턴 추출..."

# Column candidates: uppercase identifiers with underscores, excluding tables, PKs, schema/metadata noise
COLUMNS_RAW=$(strings "$ERWIN_FILE" | grep -oE '^[A-Z][A-Z0-9_]{2,}$' \
  | grep -v '^TB_RP' | grep -v '_PK$' \
  | grep -v -E '^(RPADMIN|DATE|NUMBER|VARCHAR|CHAR|CLOB|BLOB|Entity|Attribute|Relationship|Default|GDM)' \
  | sort -u)
COLUMN_COUNT=$(echo "$COLUMNS_RAW" | wc -l)
echo "  고유 컬럼 후보: ${COLUMN_COUNT}개"

# Common audit columns (appear in most tables)
# Filter out schema names (RPADMIN), data types (DATE, NUMBER etc.), and ERwin metadata
COMMON_COLS=$(strings "$ERWIN_FILE" | grep -oE '^[A-Z][A-Z0-9_]{2,}$' \
  | grep -v '^TB_RP' | grep -v '_PK$' \
  | grep -v -E '^(RPADMIN|DATE|NUMBER|VARCHAR|CHAR|CLOB|BLOB|Entity|Attribute|Relationship|Default|GDM|PYEOF)' \
  | sort | uniq -c | sort -rn | head -20 || true)

# ── Step 4: Extract data types ────────────────────────────────────────
echo "Step 4: 데이터 타입 분포 추출..."

DTYPE_DIST=$(strings "$ERWIN_FILE" | grep -oE '(VARCHAR2?|NUMBER|DATE|CHAR|CLOB|BLOB)\([0-9,]*\)|DATE' | sort | uniq -c | sort -rn | head -15 || true)
DTYPE_TOTAL=$(strings "$ERWIN_FILE" | grep -cE '(VARCHAR2?|NUMBER|DATE|CHAR|CLOB|BLOB)\([0-9,]*\)|^DATE$')

# ── Step 5: Extract relationship info ─────────────────────────────────
echo "Step 5: 관계(FK) 정보 추출..."

FK_COUNT=$(strings "$ERWIN_FILE" | grep -c 'Migrated foreign key from' || true)
echo "  FK 관계: ${FK_COUNT}개"

# ── Step 6: Extract Korean column descriptions (top frequent) ─────────
echo "Step 6: 한글 컬럼 논리명 추출 (EUC-KR, 빈도 상위)..."

KOREAN_COLS_FILE=$(mktemp)
PY_SCRIPT2=$(mktemp --suffix=.py)
trap 'rm -f "$LOGICAL_MAP_FILE" "$PY_SCRIPT" "$KOREAN_COLS_FILE" "$PY_SCRIPT2"' EXIT

cat > "$PY_SCRIPT2" << 'PYEOF2'
import re, sys, os
from collections import Counter

erwin_path = os.environ['ERWIN_FILE']
output_path = os.environ['KOREAN_COLS_FILE']

with open(erwin_path, 'rb') as f:
    data = f.read()

# Decode full file as EUC-KR and extract all Korean strings
text = data.decode('euc-kr', errors='ignore')
korean_strings = re.findall(r'[\uAC00-\uD7AF]{2,}', text)

# Count and filter
counter = Counter(korean_strings)
noise = {'\ud1f4\uc9c1', '\uc5f0\uae08', '\ud504\ub85c\uc81d\ud2b8'}
filtered = {k: v for k, v in counter.items() if k not in noise and len(k) >= 2}

with open(output_path, 'w', encoding='utf-8') as out:
    for name, count in sorted(filtered.items(), key=lambda x: -x[1])[:200]:
        out.write(f"{count}\t{name}\n")

total = len(filtered)
print(f"  한글 용어: {total}개 (상위 200개 출력)", file=sys.stderr)
PYEOF2

ERWIN_FILE="$ERWIN_FILE" KOREAN_COLS_FILE="$KOREAN_COLS_FILE" python3 "$PY_SCRIPT2"

# ── Step 7: ERwin metadata ────────────────────────────────────────────
echo "Step 7: ERwin 메타데이터 추출..."

ERWIN_APP=$(strings "$ERWIN_FILE" | grep -A1 'Application Name' | tail -1 || echo "unknown")
ERWIN_SCHEMA=$(strings "$ERWIN_FILE" | grep -m1 'RPADMIN' || echo "RPADMIN")

# ── Generate output ───────────────────────────────────────────────────
echo ""
echo "=== 마크다운 출력 생성 ==="

{
  cat << HEADER
# ERwin 테이블 추출 -- ${ERWIN_BASENAME}

추출일: $(date +%Y-%m-%d)
소스 파일: ${ERWIN_BASENAME} ($(du -h "$ERWIN_FILE" | cut -f1))
모델러: ${ERWIN_APP}
스키마: RPADMIN
총 테이블: ${TABLE_COUNT}개
총 컬럼 후보: ${COLUMN_COUNT}개
FK 관계: ${FK_COUNT}개
한글 논리명 매핑: ${LOGICAL_COUNT}/${TABLE_COUNT}개

---

HEADER

  # ── Table listing by prefix ──
  for prefix in "${PREFIX_ORDER[@]}"; do
    label="${PREFIX_LABEL[$prefix]}"
    prefix_tables=$(echo "$TABLES_RAW" | grep "^${prefix}" || true)

    if [[ -z "$prefix_tables" ]]; then
      continue
    fi

    prefix_count=$(echo "$prefix_tables" | wc -l)
    echo "## ${label} (${prefix}) -- ${prefix_count}개"
    echo ""

    while IFS= read -r tname; do
      # Look up Korean logical name
      logical=$(grep "^${tname}	" "$LOGICAL_MAP_FILE" | cut -f2 || true)
      if [[ -n "$logical" ]]; then
        echo "- ${tname}  -- ${logical}"
      else
        echo "- ${tname}"
      fi
    done <<< "$prefix_tables"

    echo ""
  done

  # ── Catch any tables with unknown prefixes ──
  OTHER_TABLES=$(echo "$TABLES_RAW" | grep -v -E "^($(IFS='|'; echo "${PREFIX_ORDER[*]}"))" || true)
  if [[ -n "$OTHER_TABLES" ]]; then
    other_count=$(echo "$OTHER_TABLES" | wc -l)
    echo "## 기타 (${other_count}개)"
    echo ""
    while IFS= read -r tname; do
      logical=$(grep "^${tname}	" "$LOGICAL_MAP_FILE" | cut -f2 || true)
      if [[ -n "$logical" ]]; then
        echo "- ${tname}  -- ${logical}"
      else
        echo "- ${tname}"
      fi
    done <<< "$OTHER_TABLES"
    echo ""
  fi

  # ── Data type distribution ──
  cat << 'SECTION'
---

## 데이터 타입 분포 (상위 15)

SECTION
  echo '```'
  echo "$DTYPE_DIST"
  echo '```'
  echo ""
  echo "총 컬럼 데이터 타입 인스턴스: ${DTYPE_TOTAL}개"
  echo ""

  # ── Common columns ──
  cat << 'SECTION'
---

## 공통 컬럼 (전체 테이블 빈도 상위 20)

SECTION
  echo '```'
  echo "$COMMON_COLS"
  echo '```'
  echo ""

  # ── Korean column terms ──
  cat << 'SECTION'
---

## 한글 용어 (컬럼 논리명 빈도 상위 50)

SECTION
  echo '| 빈도 | 용어 |'
  echo '|---:|:---|'
  head -50 "$KOREAN_COLS_FILE" | while IFS=$'\t' read -r count term; do
    echo "| ${count} | ${term} |"
  done
  echo ""

  # ── FK relationships ──
  cat << 'SECTION'
---

## FK 관계 요약

SECTION
  echo "총 ${FK_COUNT}개의 Migrated Foreign Key 관계가 감지되었습니다."
  echo "ERwin GDM 바이너리에서 FK 소스/대상 테이블 페어는 직접 추출이 어려우나,"
  echo "테이블 간 참조 관계가 ${FK_COUNT}건 존재함을 확인했습니다."
  echo ""

  # ── Prefix summary ──
  cat << 'SECTION'
---

## 업무 영역별 요약

SECTION
  echo '| 영역 | 접두사 | 테이블 수 |'
  echo '|:---|:---|---:|'
  TOTAL=0
  for prefix in "${PREFIX_ORDER[@]}"; do
    label="${PREFIX_LABEL[$prefix]}"
    cnt=$(echo "$TABLES_RAW" | grep -c "^${prefix}" || echo "0")
    echo "| ${label} | ${prefix} | ${cnt} |"
    TOTAL=$((TOTAL + cnt))
  done

  OTHER_CNT=$((TABLE_COUNT - TOTAL))
  if [[ $OTHER_CNT -gt 0 ]]; then
    echo "| 기타 | - | ${OTHER_CNT} |"
  fi
  echo "| **합계** | | **${TABLE_COUNT}** |"
  echo ""

} > "$OUTPUT_FILE"

echo "완료: $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") 줄)"
echo ""

# ── Summary to stdout ──
echo "=== 요약 ==="
for prefix in "${PREFIX_ORDER[@]}"; do
  label="${PREFIX_LABEL[$prefix]}"
  cnt=$(echo "$TABLES_RAW" | grep -c "^${prefix}" || echo "0")
  printf "  %-12s %-14s %3d개\n" "$prefix" "($label)" "$cnt"
done
echo "  ──────────────────────────────────"
printf "  %-12s %-14s %3d개\n" "합계" "" "$TABLE_COUNT"
echo ""
echo "  컬럼 후보:  ${COLUMN_COUNT}개"
echo "  논리명:     ${LOGICAL_COUNT}개"
echo "  FK 관계:    ${FK_COUNT}개"
