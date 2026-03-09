/**
 * As-Is vs To-Be 비교 매트릭스 마크다운 렌더러 (AIF-REQ-017)
 * Gap Analysis 데이터와 정책/용어 수치를 종합하여 비교 매트릭스를 생성한다.
 */
import type { GapOverview } from "../collectors/data-collector.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ComparisonInput {
  overview: GapOverview;
  policyCount: number;
  termCount: number;
}

// ─── Markdown escape ────────────────────────────────────────────

function escMd(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ─── Main renderer ──────────────────────────────────────────────

export function renderComparison(input: ComparisonInput): string {
  const { overview, policyCount, termCount } = input;
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  const api = overview.perspectives.api;
  const table = overview.perspectives.table;
  const source = overview.sourceStats;

  // ── Header
  lines.push("# As-Is vs To-Be 비교 매트릭스 — 온누리상품권");
  lines.push("");
  lines.push(`> 생성일: ${today} | AI Foundry 역공학 분석`);
  lines.push("");

  // ── §1 소스코드(As-Is) vs 설계문서(To-Be) Gap
  lines.push("## 1. 소스코드(As-Is) vs 설계문서(To-Be) Gap");
  lines.push("");
  lines.push("| 비교축 | As-Is(소스) | To-Be(문서) | 매칭 | Gap | 커버리지 |");
  lines.push("|--------|----------:|----------:|-----:|----:|--------:|");

  // API perspective: split external vs internal heuristic
  // Use sourceStats for source-side counts
  const apiAsIs = api.asIsCount;
  const apiToBe = api.toBeCount;
  const apiMatched = api.matchedCount;
  const apiGap = api.gapCount;

  // Estimate external vs internal split from source stats
  const externalApiCount = source.endpointCount;
  const internalApiCount = apiAsIs > externalApiCount ? apiAsIs - externalApiCount : 0;
  const externalGap = apiGap > internalApiCount ? apiGap - internalApiCount : 0;

  lines.push(
    `| 외부API | ${externalApiCount} | ${apiToBe} | ${apiMatched} | ${externalGap} | ${fmtPct(apiToBe > 0 ? (apiMatched / apiToBe) * 100 : 0)} |`,
  );
  lines.push(
    `| 내부API | ${internalApiCount} | — | — | ${internalApiCount} | — |`,
  );
  lines.push(
    `| 테이블 | ${table.asIsCount} | ${table.toBeCount} | ${table.matchedCount} | ${table.gapCount} | ${fmtPct(table.coveragePct)} |`,
  );
  lines.push("");

  // ── §2 기존 산출물(As-Is) vs AI 추출(To-Be) 품질
  lines.push("## 2. 기존 산출물(As-Is) vs AI 추출(To-Be) 품질");
  lines.push("");
  lines.push("| 항목 | 기존 산출물 | AI 추출 | 비교 |");
  lines.push("|------|----------:|-------:|------|");

  const totalEndpoints = source.endpointCount;
  lines.push(
    `| API 목록 건수 | ${escMd("(수동 작성)")} | ${totalEndpoints}건 (자동) | 소스코드 기반 전수 추출 |`,
  );
  lines.push(
    `| 업무규칙 건수 | ${escMd("(문서 내 산재)")} | ${policyCount}건 | 조건-기준-결과 3-tuple 정형화 |`,
  );
  lines.push(
    `| 용어 정의 건수 | ${escMd("(미정의)")} | ${termCount}건 | SKOS/JSON-LD 표준 온톨로지 |`,
  );
  lines.push(
    `| 소요 시간 | ${escMd("수주~수개월")} | ${escMd("수시간")} | 파이프라인 자동화 |`,
  );
  lines.push("");

  // ── §3 산출물별 요약
  lines.push("## 3. 산출물별 요약");
  lines.push("");
  lines.push("| 산출물 | 항목 | As-Is | To-Be | 차이 | 판정 |");
  lines.push("|--------|------|------:|------:|-----:|------|");

  // D1: 인터페이스 정의서 — API count
  const apiDiff = totalEndpoints - apiToBe;
  const apiVerdict = apiDiff > 0 ? "AI 추출이 더 많음" : apiDiff < 0 ? "문서가 더 많음" : "일치";
  lines.push(
    `| 인터페이스 정의서 | API 수 | ${apiToBe} | ${totalEndpoints} | ${apiDiff > 0 ? "+" : ""}${apiDiff} | ${escMd(apiVerdict)} |`,
  );

  // D2: 업무규칙 정의서 — policy count
  lines.push(
    `| 업무규칙 정의서 | 규칙 수 | — | ${policyCount} | +${policyCount} | 신규 정형화 |`,
  );

  // D3: 용어사전 — term count
  lines.push(
    `| 용어사전 | 용어 수 | — | ${termCount} | +${termCount} | 신규 정형화 |`,
  );

  // D4: 테이블 정의서 — table count
  const tableDiff = table.asIsCount - table.toBeCount;
  const tableVerdict = table.coveragePct >= 90
    ? "높은 커버리지"
    : table.coveragePct >= 70
      ? "보통 커버리지"
      : "보완 필요";
  lines.push(
    `| 테이블 정의서 | 테이블 수 | ${table.toBeCount} | ${table.asIsCount} | ${tableDiff > 0 ? "+" : ""}${tableDiff} | ${escMd(tableVerdict)} (${fmtPct(table.coveragePct)}) |`,
  );

  // D5: Gap 분석
  const totalGap = apiGap + table.gapCount;
  lines.push(
    `| Gap 분석 | Gap 항목 | — | ${totalGap} | — | 소스-문서 간 불일치 식별 |`,
  );
  lines.push("");

  return lines.join("\n");
}
