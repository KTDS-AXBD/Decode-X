/**
 * D1 인터페이스 설계서 마크다운 렌더러 (AIF-REQ-017)
 * Gap analysis 데이터를 SI 인터페이스 설계서 형식으로 변환한다.
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

function domainFromOrgId(orgId: string): string {
  if (orgId.includes("giftvoucher") || orgId.includes("lpon")) return "온누리상품권";
  if (orgId.includes("pension") || orgId.includes("miraeasset")) return "퇴직연금";
  return "일반";
}

// ─── Section builders ────────────────────────────────────────────

function renderOverviewSection(
  lines: string[],
  overview: GapOverview,
): void {
  const { sourceStats } = overview;
  lines.push("## 1. 문서 개요");
  lines.push("");
  lines.push("| 항목 | 값 |");
  lines.push("|------|----|");
  lines.push(`| 컨트롤러 수 | ${sourceStats.controllerCount}개 |`);
  lines.push(`| 엔드포인트 수 | ${sourceStats.endpointCount}개 |`);
  lines.push(`| 테이블 수 | ${sourceStats.tableCount}개 |`);
  lines.push(`| 매퍼 수 | ${sourceStats.mapperCount}개 |`);
  lines.push(`| 트랜잭션 수 | ${sourceStats.transactionCount}개 |`);
  lines.push("");
}

function renderSummaryTable(
  lines: string[],
  allItems: PerspectiveItem[],
): void {
  lines.push("## 2. 인터페이스 요약");
  lines.push("");
  lines.push("| # | 인터페이스명 | 출처 | 상태 | 심각도 | 상세 |");
  lines.push("|---|-------------|------|------|--------|------|");

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i]!;
    const statusLabel = item.status === "matched" ? "✅ 매칭" : "⚠️ Gap";
    lines.push(
      `| ${i + 1} | ${escMd(item.name)} | ${escMd(item.source)} | ${statusLabel} | ${severityBadge(item.severity)} | ${truncate(item.detail, 50)} |`,
    );
  }
  lines.push("");
}

function renderMatchedSection(
  lines: string[],
  matchedItems: PerspectiveItem[],
): void {
  lines.push(`## 3. 검증 완료 인터페이스 (${matchedItems.length}건)`);
  lines.push("");

  if (matchedItems.length === 0) {
    lines.push("검증 완료된 인터페이스가 없어요.");
    lines.push("");
    return;
  }

  for (let i = 0; i < matchedItems.length; i++) {
    const item = matchedItems[i]!;
    lines.push(`### 3.${i + 1} ${escMd(item.name)}`);
    lines.push("");
    lines.push(`- **출처**: ${escMd(item.source)}`);
    lines.push(`- **상세**: ${escMd(item.detail)}`);
    if (item.documentId) {
      lines.push(`- **문서 ID**: \`${item.documentId}\``);
    }
    lines.push("");
  }
}

function renderGapSection(
  lines: string[],
  gapItems: PerspectiveItem[],
): void {
  lines.push(`## 4. 미문서화 인터페이스 (${gapItems.length}건)`);
  lines.push("");

  if (gapItems.length === 0) {
    lines.push("미문서화 인터페이스가 없어요.");
    lines.push("");
    return;
  }

  lines.push("| # | 인터페이스명 | 출처 | 심각도 | 상세 |");
  lines.push("|---|-------------|------|--------|------|");

  for (let i = 0; i < gapItems.length; i++) {
    const item = gapItems[i]!;
    lines.push(
      `| ${i + 1} | ${escMd(item.name)} | ${escMd(item.source)} | ${severityBadge(item.severity)} | ${truncate(item.detail, 60)} |`,
    );
  }
  lines.push("");
}

function renderMappingMatrix(
  lines: string[],
  overview: GapOverview,
): void {
  lines.push("## 5. As-Is vs To-Be 매핑 매트릭스");
  lines.push("");
  lines.push("| 관점 | As-Is (소스) | To-Be (문서) | 매칭 | Gap | 커버리지 |");
  lines.push("|------|------------:|------------:|-----:|----:|---------:|");

  const entries: Array<[string, PerspectiveSummary]> = [
    ["API", overview.perspectives.api],
    ["Table", overview.perspectives.table],
  ];

  let totalAsIs = 0;
  let totalToBe = 0;
  let totalMatched = 0;
  let totalGap = 0;

  for (const [label, p] of entries) {
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

// ─── Main renderer ──────────────────────────────────────────────

export function renderInterfaceSpec(overview: GapOverview): string {
  const today = new Date().toISOString().slice(0, 10);
  const domain = domainFromOrgId(overview.organizationId);

  // Combine api + table items for interface perspective
  const allItems: PerspectiveItem[] = [
    ...overview.perspectives.api.items,
    ...overview.perspectives.table.items,
  ];

  const matchedItems = allItems.filter((i) => i.status === "matched");
  const gapItems = allItems.filter((i) => i.status.includes("gap"));

  const lines: string[] = [];

  // ── Header
  lines.push(`# 인터페이스 설계서 — ${domain}`);
  lines.push("");
  lines.push(`> 생성일: ${today} | AI Foundry 역공학`);
  lines.push("");

  renderOverviewSection(lines, overview);
  renderSummaryTable(lines, allItems);
  renderMatchedSection(lines, matchedItems);
  renderGapSection(lines, gapItems);
  renderMappingMatrix(lines, overview);

  return lines.join("\n");
}
