/**
 * F427 (Sprint 260) — rules.md 마크다운 테이블 파서.
 *
 * Hybrid 접근: 자연어 → AST 자동 추출은 회피. 본 파서는 markdown table 구조만 추출하고,
 * 실제 detector는 BL_DETECTOR_REGISTRY 매핑 table에서 BL-ID로 하드코딩 함수를 찾는다.
 *
 * 입력 예시 (`refund-rules.md`):
 *
 *   | ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
 *   |----|-----------------|---------------|----------------|-----------------|
 *   | BL-024 | 미사용 상품권 환불 요청 시 | 구매 후 7일 이내 환불 요청 | 전액 환불 처리한다 | 7일 초과 시 환불 불가 |
 *
 * 출력: BLRule[] (id="BL-024", condition="...", criteria="...", outcome="...", exception="...")
 */
import type { BLRule } from "@ai-foundry/types";

// F428 (Sprint 261): optional 1자 prefix (gift `BL-G001`) + 1~3 digit
// F433 (Sprint 266): BB/BP/BG/BS prefix 추가 (budget/purchase/gift-alt/settlement-alt)
// F436 (Sprint 269): P prefix 추가 (miraeasset-pension)
// F440 (Sprint 274): V prefix 추가 (generic-voucher 합성 도메인, 9번째)
// F441 (Sprint 275): LP prefix 추가 (loyalty-points 합성 도메인, 10번째). 2글자 alternation 우선 (LP가 P보다 먼저 시도)
// F444 (Sprint 278): CC prefix 추가 (credit-card 합성 도메인, 12번째 — LPON 외 첫 산업). 2글자 alternation 동일 우선순위
// F449 (Sprint 283): DV prefix 추가 (delivery 합성 도메인, 13번째 — 배송 산업). 2글자 alternation 동일 우선순위
// F450 (Sprint 284): SB prefix 추가 (subscription 합성 도메인, 14번째 — SaaS 구독 산업). 2글자 alternation 동일 우선순위
// F451 (Sprint 285): IN prefix 추가 (insurance 합성 도메인, 15번째 — 보험 산업). 2글자 alternation 동일 우선순위
// F452 (Sprint 286): HC prefix 추가 (healthcare 합성 도메인, 16번째 — 의료 산업). 2글자 alternation 동일 우선순위
// F453 (Sprint 287): ED prefix 추가 (education 합성 도메인, 17번째 — 교육 산업). 2글자 alternation 동일 우선순위
// F454 (Sprint 288): RE prefix 추가 (realestate 합성 도메인, 18번째 — 부동산 산업). 2글자 alternation 동일 우선순위
// F455 (Sprint 289): LG prefix 추가 (logistics 합성 도메인, 19번째 — 물류 산업). 2글자 alternation 동일 우선순위
// F456 (Sprint 290): HO prefix 추가 (hospitality 합성 도메인, 20번째 — 숙박 산업). 2글자 alternation 동일 우선순위
// F457 (Sprint 291): TR prefix 추가 (travel 합성 도메인, 21번째 — 여행 산업). 2글자 alternation 동일 우선순위
// F458 (Sprint 292): MF prefix 추가 (manufacturing 합성 도메인, 22번째 — 제조 산업). 2글자 alternation 동일 우선순위
// F459 (Sprint 293): RT prefix 추가 (retail 합성 도메인, 23번째 — 소매 산업). 2글자 alternation 동일 우선순위
// F460 (Sprint 294): EN prefix 추가 (energy 합성 도메인, 24번째 — 에너지 산업). 2글자 alternation 동일 우선순위
// F461 (Sprint 295): GV prefix 추가 (government 합성 도메인, 25번째 — 공공 산업). 2글자 alternation 동일 우선순위
// F462 (Sprint 296): TC prefix 추가 (telecom 합성 도메인, 26번째 — 통신 산업). 2글자 alternation 동일 우선순위
// F463 (Sprint 297): BK prefix 추가 (banking 합성 도메인, 27번째 — 은행 산업). 2글자 alternation 동일 우선순위
// F464 (Sprint 298): MD prefix 추가 (media 합성 도메인, 28번째 — 미디어 산업). 2글자 alternation 동일 우선순위
// F465 (Sprint 299): PH prefix 추가 (pharmacy 합성 도메인, 29번째 — 제약/약국 산업). longer match first 누적 입증
// F466 (Sprint 300): AG prefix 추가 (agriculture 합성 도메인, 30번째 — 농업 산업). 🏆 Sprint 300 마일스톤
// F467 (Sprint 301): CN prefix 추가 (construction 합성 도메인, 31번째 — 건설 산업). 🏆 20 산업 round number
// F468 (Sprint 302): MR prefix 추가 (maritime 합성 도메인, 32번째 — 해운 산업). 🎯 AIF-PLAN-100 마일스톤
const BL_ID_PATTERN = /^(?:BL|BB|BP|BG|BS|LP|CC|DV|SB|IN|HC|ED|RE|LG|HO|TR|MF|RT|EN|GV|TC|BK|MD|PH|AG|CN|MR|P|V)-[A-Z]?\d{1,3}$/;
const HEADER_PATTERN =
  /\|\s*ID\s*\|\s*condition[^|]*\|\s*criteria[^|]*\|\s*outcome[^|]*\|\s*exception[^|]*\|/i;
const SEPARATOR_PATTERN = /^\s*\|[\s:|-]+\|\s*$/;

/**
 * markdown 행에서 cell 추출. 라인 양 끝 `|` 제거 후 split.
 */
function parseRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  const inner = trimmed.slice(1, -1);
  return inner.split("|").map((c) => c.trim());
}

/**
 * rules.md 텍스트에서 BL-NNN 행만 추출하여 BLRule[] 반환.
 *
 * 동작:
 *   1. HEADER_PATTERN 라인 탐색
 *   2. 다음 라인이 SEPARATOR_PATTERN이면 skip
 *   3. 이후 라인은 BL-NNN 행이면 BLRule으로 변환, ID 형식 위반은 skip
 *   4. 빈 줄 또는 다른 형식(`#`, ```` ``` ````, header 라인 재출현 등) 만나면 종료
 *   5. 다중 테이블이 있으면 첫 번째 BL 테이블만 추출
 */
export function parseRulesMarkdown(markdownText: string): BLRule[] {
  const lines = markdownText.split(/\r?\n/);
  const rules: BLRule[] = [];

  let inTable = false;
  let separatorSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (!inTable) {
      if (HEADER_PATTERN.test(line)) {
        inTable = true;
        separatorSeen = false;
      }
      continue;
    }

    if (!separatorSeen) {
      if (SEPARATOR_PATTERN.test(line)) {
        separatorSeen = true;
        continue;
      }
      // 헤더 직후 separator 없이 본문 출현은 비표준 markdown. 안전하게 종료.
      inTable = false;
      continue;
    }

    if (line.trim() === "") {
      // 빈 줄 = 테이블 종료 (본 파서는 첫 테이블만 처리)
      break;
    }

    const cells = parseRow(line);
    if (cells.length < 5) {
      // 테이블 형식 이탈
      break;
    }

    const [id, condition, criteria, outcome, exception] = cells as [
      string,
      string,
      string,
      string,
      string,
    ];

    if (!BL_ID_PATTERN.test(id)) {
      // BL-NNN 외 행은 skip (e.g., 노트 줄)
      continue;
    }

    rules.push({
      id,
      condition,
      criteria,
      outcome,
      exception,
    });
  }

  return rules;
}
