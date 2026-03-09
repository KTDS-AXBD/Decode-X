/**
 * D4 Gap 분석 종합 보고서 마크다운 렌더러 (AIF-REQ-017)
 * GapOverview 데이터를 Gap 분석 종합 보고서 형식으로 변환한다.
 */
import type { GapOverview, PerspectiveItem, PerspectiveSummary } from "../collectors/data-collector.js";

// ─── Markdown helpers ────────────────────────────────────────────

function escMd(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "—";
  const clean = text.replace(/\n/g, " ").replace(/\|/g, "\\|");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function severityBadge(severity: string): string {
  switch (severity.toUpperCase()) {
    case "HIGH": return "🔴 HIGH";
    case "MEDIUM": return "🟡 MED";
    case "LOW": return "🟢 LOW";
    default: return severity;
  }
}

type PerspectiveKey = keyof GapOverview["perspectives"];

const PERSPECTIVE_LABELS: Record<PerspectiveKey, string> = {
  process: "프로세스",
  architecture: "아키텍처",
  api: "API",
  table: "테이블",
};

// ─── Section builders ────────────────────────────────────────────

function renderExecutiveSummary(
  lines: string[],
  overview: GapOverview,
): void {
  const { api, table, process, architecture } = overview.perspectives;

  // Overall coverage = total matched / total asIs across all perspectives
  const totalAsIs = api.asIsCount + table.asIsCount + process.asIsCount + architecture.asIsCount;
  const totalMatched = api.matchedCount + table.matchedCount + process.matchedCount + architecture.matchedCount;
  const overallCoverage = totalAsIs > 0 ? (totalMatched / totalAsIs) * 100 : 0;

  lines.push("## 1. Executive Summary");
  lines.push("");
  lines.push("| 지표 | 값 |");
  lines.push("|------|----|");
  lines.push(`| 전체 커버리지 | **${overallCoverage.toFixed(1)}%** (${totalMatched}/${totalAsIs}) |`);
  lines.push(`| 외부 API 커버리지 | ${api.coveragePct.toFixed(1)}% (${api.matchedCount}/${api.asIsCount}) |`);
  lines.push(`| 테이블 커버리지 | ${table.coveragePct.toFixed(1)}% (${table.matchedCount}/${table.asIsCount}) |`);
  lines.push(`| 프로세스 커버리지 | ${process.coveragePct.toFixed(1)}% (${process.matchedCount}/${process.asIsCount}) |`);
  lines.push(`| 아키텍처 커버리지 | ${architecture.coveragePct.toFixed(1)}% (${architecture.matchedCount}/${architecture.asIsCount}) |`);
  lines.push("");
}

function renderMethodology(lines: string[]): void {
  lines.push("## 2. 분석 방법론");
  lines.push("");

  lines.push("### 2.1 5-Stage 파이프라인");
  lines.push("");
  lines.push("1. **Stage 1** Document Ingestion — 소스코드 + SI 문서 파싱");
  lines.push("2. **Stage 2** Structure Extraction — API/테이블/프로세스 구조 추출");
  lines.push("3. **Stage 3** Policy Inference — 업무규칙 추론 + HITL 검토");
  lines.push("4. **Stage 4** Ontology Normalization — 용어 정규화 + 온톨로지 매핑");
  lines.push("5. **Stage 5** Skill Packaging — AI Skill 패키징");
  lines.push("");

  lines.push("### 2.2 FactCheck 3-Phase 매칭");
  lines.push("");
  lines.push("| Phase | 방법 | 설명 |");
  lines.push("|-------|------|------|");
  lines.push("| Step 1 | Exact Match | URL 정규화 후 정확 매칭 |");
  lines.push("| Step 1.5 | Resource Path | 리소스 경로 기반 매칭 (score 0.85) |");
  lines.push("| Step 2 | Fuzzy Match | camelCase 분리 + Jaccard 유사도 |");
  lines.push("| LLM | Semantic Match | Claude를 활용한 의미 기반 매칭 |");
  lines.push("");
}

function renderPerspectiveSection(
  lines: string[],
  sectionNum: string,
  label: string,
  perspective: PerspectiveSummary,
): void {
  lines.push(`### ${sectionNum} ${label}`);
  lines.push("");

  // Summary
  lines.push("| 항목 | 값 |");
  lines.push("|------|----|");
  lines.push(`| As-Is (소스) | ${perspective.asIsCount}건 |`);
  lines.push(`| To-Be (문서) | ${perspective.toBeCount}건 |`);
  lines.push(`| 매칭 | ${perspective.matchedCount}건 |`);
  lines.push(`| Gap | ${perspective.gapCount}건 |`);
  lines.push(`| 커버리지 | ${perspective.coveragePct.toFixed(1)}% |`);
  lines.push("");

  // Item details (limit to keep report manageable)
  const items = perspective.items;
  if (items.length === 0) {
    lines.push("항목 데이터가 없어요.");
    lines.push("");
    return;
  }

  lines.push("| # | 항목명 | 출처 | 상태 | 심각도 | 상세 |");
  lines.push("|---|--------|------|------|--------|------|");

  const maxItems = Math.min(items.length, 50);
  for (let i = 0; i < maxItems; i++) {
    const item = items[i]!;
    const statusLabel = item.status === "matched" ? "✅" : "⚠️";
    lines.push(
      `| ${i + 1} | ${escMd(item.name)} | ${escMd(item.source)} | ${statusLabel} | ${severityBadge(item.severity)} | ${truncate(item.detail, 50)} |`,
    );
  }

  if (items.length > maxItems) {
    lines.push(`| … | *(외 ${items.length - maxItems}건 생략)* | | | | |`);
  }
  lines.push("");
}

function renderComparisonMatrix(
  lines: string[],
  overview: GapOverview,
): void {
  lines.push("## 4. As-Is vs To-Be 종합 비교");
  lines.push("");
  lines.push("| 관점 | As-Is (소스) | To-Be (문서) | 매칭 | Gap | 커버리지 |");
  lines.push("|------|------------:|------------:|-----:|----:|---------:|");

  let totalAsIs = 0;
  let totalToBe = 0;
  let totalMatched = 0;
  let totalGap = 0;

  const keys: PerspectiveKey[] = ["process", "architecture", "api", "table"];

  for (const key of keys) {
    const p = overview.perspectives[key];
    const label = PERSPECTIVE_LABELS[key];
    lines.push(
      `| ${label} | ${p.asIsCount} | ${p.toBeCount} | ${p.matchedCount} | ${p.gapCount} | ${p.coveragePct.toFixed(1)}% |`,
    );
    totalAsIs += p.asIsCount;
    totalToBe += p.toBeCount;
    totalMatched += p.matchedCount;
    totalGap += p.gapCount;
  }

  const totalCoverage = totalAsIs > 0 ? (totalMatched / totalAsIs) * 100 : 0;
  lines.push(
    `| **합계** | **${totalAsIs}** | **${totalToBe}** | **${totalMatched}** | **${totalGap}** | **${totalCoverage.toFixed(1)}%** |`,
  );
  lines.push("");
}

// ─── Domain gap classification ──────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  charge: "충전/결제",
  gift: "선물/쿠폰",
  payment: "결제 처리",
  member: "회원 관리",
  auth: "인증/로그인",
  wallet: "지갑/잔액",
  store: "가맹점",
  settlement: "정산",
  message: "메시지/알림",
  batch: "배치/스케줄",
  admin: "관리/수동",
  point: "포인트",
  deal: "거래 내역",
  common: "공통/유틸",
  data: "데이터/테이블",
  openbank: "오픈뱅킹",
  unknown: "미분류",
};

interface DomainCount {
  domain: string;
  label: string;
  total: number;
  matched: number;
  gap: number;
}

function classifyItemsByDomain(items: PerspectiveItem[]): DomainCount[] {
  const counts = new Map<string, { matched: number; gap: number }>();

  for (const item of items) {
    const name = (item.name ?? "").toLowerCase();
    let domain = "unknown";

    // Simple keyword matching (mirrors gap-categorizer.ts logic)
    if (/charge|충전/.test(name)) domain = "charge";
    else if (/gift|선물|coupon|쿠폰/.test(name)) domain = "gift";
    else if (/pay|결제/.test(name)) domain = "payment";
    else if (/member|회원|user/.test(name)) domain = "member";
    else if (/auth|login|인증|로그인/.test(name)) domain = "auth";
    else if (/wallet|잔액|balance/.test(name)) domain = "wallet";
    else if (/store|가맹점|merchant/.test(name)) domain = "store";
    else if (/settle|정산/.test(name)) domain = "settlement";
    else if (/message|알림|noti/.test(name)) domain = "message";
    else if (/batch|스케줄|schedule/.test(name)) domain = "batch";
    else if (/admin|관리|manual/.test(name)) domain = "admin";
    else if (/point|포인트/.test(name)) domain = "point";
    else if (/deal|거래|transaction/.test(name)) domain = "deal";
    else if (/common|공통|util/.test(name)) domain = "common";
    else if (/table|테이블|ddl/.test(name)) domain = "data";
    else if (/openbank|오픈뱅킹/.test(name)) domain = "openbank";

    const existing = counts.get(domain) ?? { matched: 0, gap: 0 };
    if (item.status === "matched") {
      existing.matched++;
    } else {
      existing.gap++;
    }
    counts.set(domain, existing);
  }

  return Array.from(counts.entries())
    .map(([domain, c]) => ({
      domain,
      label: DOMAIN_LABELS[domain] ?? domain,
      total: c.matched + c.gap,
      matched: c.matched,
      gap: c.gap,
    }))
    .sort((a, b) => b.total - a.total);
}

function renderDomainSummary(lines: string[], overview: GapOverview): void {
  // Combine api + table items for domain classification
  const allItems = [
    ...overview.perspectives.api.items,
    ...overview.perspectives.table.items,
  ];

  if (allItems.length === 0) return;

  const domains = classifyItemsByDomain(allItems);

  lines.push("## 5. 도메인별 Gap 분포");
  lines.push("");
  lines.push("| # | 도메인 | 한글명 | 총 항목 | 매칭 | Gap | 커버리지 |");
  lines.push("|---|--------|--------|--------:|-----:|----:|---------:|");

  for (let i = 0; i < domains.length; i++) {
    const d = domains[i]!;
    const cov = d.total > 0 ? ((d.matched / d.total) * 100).toFixed(1) : "0.0";
    lines.push(
      `| ${i + 1} | ${d.domain} | ${d.label} | ${d.total} | ${d.matched} | ${d.gap} | ${cov}% |`,
    );
  }
  lines.push("");
}

// ─── Main renderer ──────────────────────────────────────────────

export function renderGapReport(overview: GapOverview): string {
  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];

  // ── Header
  lines.push("# Gap 분석 종합 보고서 — 온누리상품권");
  lines.push("");
  lines.push(`> 생성일: ${today} | AI Foundry v0.6.0`);
  lines.push("");

  // ── §1 Executive Summary
  renderExecutiveSummary(lines, overview);

  // ── §2 분석 방법론
  renderMethodology(lines);

  // ── §3 Perspective별 분석
  lines.push("## 3. Perspective별 분석");
  lines.push("");

  const keys: PerspectiveKey[] = ["process", "architecture", "api", "table"];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const label = PERSPECTIVE_LABELS[key];
    renderPerspectiveSection(lines, `3.${i + 1}`, label, overview.perspectives[key]);
  }

  // ── §4 As-Is vs To-Be 종합 비교
  renderComparisonMatrix(lines, overview);

  // ── §5 도메인별 Gap 분포
  renderDomainSummary(lines, overview);

  return lines.join("\n");
}
