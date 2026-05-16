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
// F469 (Sprint 303): TS prefix 추가 (transit 합성 도메인, 33번째 — 대중교통 산업). longer match first 누적 입증
// F470 (Sprint 304): AV prefix 추가 (aviation 합성 도메인, 34번째 — 항공 산업). longer match first 누적 입증
// F471 (Sprint 305): MN prefix 추가 (mining 합성 도메인, 35번째 — 광업 산업). longer match first 누적 입증
// F472 (Sprint 306): DF prefix 추가 (defense 합성 도메인, 36번째 — 국방 산업). 🏆 25 산업 round number
// F473 (Sprint 307): SP prefix 추가 (sports 합성 도메인, 37번째 — 스포츠 산업). longer match first 누적 입증
// F474 (Sprint 308): CH prefix 추가 (charity 합성 도메인, 38번째 — 비영리 산업). longer match first 누적 입증
// F475 (Sprint 309): WL prefix 추가 (wellness 합성 도메인, 39번째 — 웰니스 산업). Hospitality 클러스터 (HO+WL)
// F476 (Sprint 310): PT prefix 추가 (pet services 합성 도메인, 40번째 — 반려동물 산업). longer match first (PT 앞 P)
// F477 (Sprint 311): PR prefix 추가 (property mgmt 합성 도메인, 41번째 — 임대관리 산업). longer match first (PR 앞 P). 🏆 30 산업 round number
// F478 (Sprint 312): FT prefix 추가 (fitness 합성 도메인, 42번째 — 피트니스 산업). 🏆 40 Sprint 연속 정점 round number. WL+SP+FT 클러스터
// F479 (Sprint 313): BT prefix 추가 (beauty salon 합성 도메인, 43번째 — 미용실 산업). WL+SP+FT+BT 서비스 4-클러스터 완성
// F484 (Sprint 318): TM prefix 추가 (telemedicine 합성 도메인, 44번째 — 원격진료 산업, 33번째 신규). HC+PH+TM 의료 3-클러스터 형성
// F485 (Sprint 319): VT prefix 추가 (veterinary 합성 도메인, 45번째 — 동물병원 진료 산업, 34번째 신규). PT+VT 동물 케어 2-클러스터 형성. longer match first (VT 앞 V)
// F488 (세션 295): GY prefix 추가 (gym 합성 도메인, 46번째 — 헬스장 매장 산업, 35번째 신규). PT+FT+GY 스포츠/헬스 3-클러스터 형성. 47 Sprint 연속 정점 도전 (S264~S278+S283~S319+S295)
// F494 (세션 296): PK prefix 추가 (parking 합성 도메인, 47번째 — 주차 관리 산업, 36번째 신규). RE+PR+PK 부동산 3-클러스터 형성. 48 Sprint 연속 정점 도전. S283 audit fix 1차(HT/FD 중복 → PK 채택).
// F500 (세션 297): CS prefix 추가 (carsharing 합성 도메인, 48번째 — 카쉐어링 산업, 37번째 신규). TR+AV+CS 운송 3-클러스터 형성. 49 Sprint 연속 정점 도전.
// F502 (세션 298): FS prefix 추가 (fastfood 합성 도메인, 49번째 — 패스트푸드 산업, 38번째 신규). DV+WL+FT+FS QSR 외식 4-클러스터 확장. 50 Sprint 연속 정점 도전.
// F506 (세션 299): AS prefix 추가 (aerospace 합성 도메인, 50번째 — 항공우주 산업, 39번째 신규). TR+AV+CS+AS 항공/운송 4-클러스터 확장. 51 Sprint 연속 정점 도전. 🏆 50번째 도메인 마일스톤 (S262 5 → S299 50, 10배 확장).
// F509 (세션 300): MU prefix 추가 (music 합성 도메인, 51번째 — 음악 스트리밍 산업, 40번째 신규). 디지털 콘텐츠 도메인. 52 Sprint 연속 정점 도전. 거울 변환 4회차 (carsharing → fastfood → aerospace → music).
// F511 (세션 301): SH prefix 추가 (shipping 합성 도메인, 52번째 — 해운/선적 산업, 41번째 신규). LG+SH 국제무역 클러스터 신규 형성 (LG 물류 + SH 해운 분리). 53 Sprint 연속 정점 도전. 거울 변환 5회차 (carsharing → fastfood → aerospace → music → shipping). 🏆 52번째 도메인 마일스톤 (S262 5 → S301 52, 10.4배 확장).
// F524 (세션 305): VD prefix 추가 (video 합성 도메인, 57번째 — 영상 산업, 46번째 신규). MU+PB+AD+GM+VD 디지털 콘텐츠 5-클러스터 확장 (음악 + 출판 + 광고 + 게임 + 영상). 58 Sprint 연속 정점 도전. 거울 변환 10회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video). 🏆 57번째 도메인 마일스톤 (S262 5 → S305 57, 11.4배 확장).
// F526 (세션 305 후속): SM prefix 추가 (socialmedia 합성 도메인, 58번째 — 소셜미디어 산업, 47번째 신규). MU+PB+AD+GM+VD+SM 디지털 콘텐츠 6-클러스터 확장 (영상→소셜미디어 UGC + 크리에이터 수익 모델). 59 Sprint 연속 정점 도전. 거울 변환 11회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia). 🏆 58번째 도메인 마일스톤 (S262 5 → S305+ 58, 11.6배 확장).
// F527 (세션 305 후속2): NW prefix 추가 (news 합성 도메인, 59번째 — 뉴스 산업, 48번째 신규). MU+PB+AD+GM+VD+SM+NW 디지털 콘텐츠 7-클러스터 확장 (구독 미디어 + 신디케이션 모델). 60 Sprint 연속 정점 도전. 거울 변환 12회차 (carsharing → fastfood → aerospace → music → shipping → publishing → textile → advertising → gaming → video → socialmedia → news). 🏆 59번째 도메인 마일스톤 (S262 5 → S305++ 59, 11.8배 확장).
// F528 (세션 305 후속3): BR prefix 추가 (broadcast 합성 도메인, 60번째 — 방송 산업, 49번째 신규). MU+PB+AD+GM+VD+SM+NW+BR 디지털 콘텐츠 8-클러스터 확장 (실시간 편성 방송 추가). 61 Sprint 연속 정점 도전. 거울 변환 13회차 (carsharing → ... → news → broadcast). 🏆 60번째 도메인 마일스톤 (S262 5 → S305+++ 60, 12배 확장) + 🏆 60 Sprint round 마일스톤.
// F529 (세션 305 후속4): ER prefix 추가 (esports 합성 도메인, 61번째 — 이스포츠 산업, 50번째 신규). MU+PB+AD+GM+VD+SM+NW+BR+ER 디지털 콘텐츠 9-클러스터 확장 + GM/SM 융합 모델. 62 Sprint 연속 정점 도전. 거울 변환 14회차 (carsharing → ... → broadcast → esports). 🏆 61번째 도메인 마일스톤 (S262 5 → S305++++ 61, 12.2배 확장) + 🏆🏆 50 신규 산업 round 마일스톤.
// F530 (세션 305 후속5): PC prefix 추가 (podcast 합성 도메인, 62번째 — 팟캐스트 산업, 51번째 신규). MU+PB+AD+GM+VD+SM+NW+BR+ER+PC 디지털 콘텐츠 10-클러스터 확장 (오디오 구독+광고 하이브리드). 63 Sprint 연속 정점 도전. 거울 변환 15회차 (carsharing → ... → esports → podcast). 🏆 62번째 도메인 마일스톤 (S262 5 → S305+++++ 62, 12.4배 확장).
// F531 (세션 305 후속6): RA prefix 추가 (radio 합성 도메인, 63번째 — 라디오 산업, 52번째 신규). MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA 디지털 콘텐츠 11-클러스터 확장. 64 Sprint 연속 정점 도전. 거울 변환 16회차 (carsharing → ... → podcast → radio). 🏆 63번째 도메인 마일스톤 (S262 5 → S305++++++ 63, 12.6배 확장) + 🏆🏆 1세션 9 Sprint 신기록.
// F532 (세션 306): AR prefix 추가 (art 합성 도메인, 64번째 — 예술/갤러리 산업, 53번째 신규). MU+PB+AD+GM+VD+SM+NW+BR+ER+PC+RA+AR 디지털 콘텐츠 12-클러스터 확장 (시각 예술 / NFT 디지털 아트 확장 가능). 65 Sprint 연속 정점 도전. 거울 변환 17회차 (carsharing → ... → radio → art). 🏆 64번째 도메인 마일스톤 (S262 5 → S306 64, 12.8배 확장).
// F533 (세션 306 후속): GA prefix 추가 (gambling 합성 도메인, 65번째 — 카지노/베팅 산업, 54번째 신규). 🎮 GM+GA 게임엔터 2-클러스터 신규 형성 (게임 in-app purchase + 카지노/베팅 payout 통합 추상화). 66 Sprint 연속 정점 도전. 거울 변환 18회차 (carsharing → ... → art → gambling). 🏆 65번째 도메인 마일스톤 (S262 5 → S306 65, 13.0배 확장).
const BL_ID_PATTERN = /^(?:BL|BB|BP|BG|BS|BK|BR|BT|LP|AD|AR|AS|CC|CH|CS|DV|SB|SH|SP|IN|HC|ED|ER|GA|RA|RE|LG|HO|TM|TR|MF|RT|EN|GM|GV|TC|MD|PC|PH|AG|CN|MR|TS|AV|MN|DF|FS|FT|GY|MU|NW|PB|PK|TX|VD|SM|WL|PT|PR|VT|P|V)-[A-Z]?\d{1,3}$/;
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
