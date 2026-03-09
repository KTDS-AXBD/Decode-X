/**
 * D3 용어사전 마크다운 렌더러 (AIF-REQ-017)
 * 용어 데이터를 계층 트리 구조로 분류하여 SI 용어사전 형식으로 변환한다.
 */
import type { TermRow, TermStats } from "../collectors/data-collector.js";

// ─── Hierarchy tree ─────────────────────────────────────────────

export interface HierarchyNode {
  termId: string;
  label: string;
  definition: string | null;
  termType: string;
  children: HierarchyNode[];
  depth: number;
}

/**
 * Build a hierarchy tree from flat term rows using broaderTermId.
 * Roots are terms with broaderTermId === null.
 */
export function buildHierarchyTree(terms: TermRow[]): HierarchyNode[] {
  const nodeMap = new Map<string, HierarchyNode>();

  // Create all nodes
  for (const t of terms) {
    nodeMap.set(t.termId, {
      termId: t.termId,
      label: t.label,
      definition: t.definition,
      termType: t.termType,
      children: [],
      depth: 0,
    });
  }

  const roots: HierarchyNode[] = [];

  // Link children to parents
  for (const t of terms) {
    const node = nodeMap.get(t.termId);
    if (!node) continue;

    if (t.broaderTermId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(t.broaderTermId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan — treat as root
        roots.push(node);
      }
    }
  }

  // Set depths recursively
  function setDepth(nodes: HierarchyNode[], depth: number): void {
    for (const n of nodes) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  }
  setDepth(roots, 0);

  return roots.sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Markdown escape ────────────────────────────────────────────

function escMd(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "—";
  const clean = text.replace(/\n/g, " ").replace(/\|/g, "\\|");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// ─── Section renderers ─────────────────────────────────────────

function renderTermTable(
  lines: string[],
  terms: TermRow[],
  allTerms: TermRow[],
): void {
  if (terms.length === 0) {
    lines.push("_(해당 유형의 용어가 없습니다.)_");
    lines.push("");
    return;
  }

  // Build a quick lookup for broader term labels
  const labelMap = new Map<string, string>();
  for (const t of allTerms) {
    labelMap.set(t.termId, t.label);
  }

  lines.push("| # | 용어 | 정의 | 상위 개념 | SKOS URI |");
  lines.push("|---|------|------|-----------|----------|");

  for (let i = 0; i < terms.length; i++) {
    const t = terms[i]!;
    const broader = t.broaderTermId
      ? (labelMap.get(t.broaderTermId) ?? "—")
      : "—";
    lines.push(
      `| ${i + 1} | ${escMd(t.label)} | ${truncate(t.definition, 80)} | ${escMd(broader)} | \`${escMd(t.skosUri)}\` |`,
    );
  }
  lines.push("");
}

function renderTree(
  lines: string[],
  nodes: HierarchyNode[],
  prefix: string,
  maxDepth: number,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    const typeTag = node.termType ? ` [${node.termType}]` : "";
    lines.push(`${prefix}${connector}${node.label}${typeTag}`);

    if (node.children.length > 0 && node.depth < maxDepth - 1) {
      renderTree(lines, node.children, `${prefix}${childPrefix}`, maxDepth);
    }
  }
}

// ─── Main renderer ──────────────────────────────────────────────

export function renderGlossary(terms: TermRow[], stats: TermStats): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  // ── Header
  lines.push("# 용어사전 — 온누리상품권");
  lines.push("");
  lines.push(`> 생성일: ${today} | 총 용어 수: ${terms.length}건`);
  lines.push("");

  // ── §1 문서 개요
  lines.push("## 1. 문서 개요");
  lines.push("");
  lines.push(`- **총 용어 수**: ${stats.totalTerms}건`);
  lines.push(`- **고유 레이블 수**: ${stats.distinctLabels}건`);
  lines.push(`- **온톨로지 수**: ${stats.ontologyCount}개`);
  lines.push(`- **추출 방식**: AI Foundry 5-Stage 파이프라인 Stage 4 (온톨로지 정규화)`);
  lines.push(`- **온톨로지 스키마**: SKOS/JSON-LD + Neo4j Aura`);
  lines.push("");

  // ── §2 용어 유형 분포
  lines.push("## 2. 용어 유형 분포");
  lines.push("");
  lines.push("| 유형 | 건수 | 비율 |");
  lines.push("|------|-----:|-----:|");

  const totalForPct = stats.totalTerms || 1;
  const sortedTypes = Object.entries(stats.typeDistribution)
    .sort(([, a], [, b]) => b - a);

  for (const [type, count] of sortedTypes) {
    const pct = ((count / totalForPct) * 100).toFixed(1);
    lines.push(`| ${escMd(type)} | ${count} | ${pct}% |`);
  }
  lines.push("");

  // ── §3 핵심 용어 (Entity)
  lines.push("## 3. 핵심 용어 (Entity)");
  lines.push("");
  const entityTerms = terms.filter((t) => t.termType.toLowerCase().includes("entity"));
  renderTermTable(lines, entityTerms, terms);

  // ── §4 관계 용어 (Relationship)
  lines.push("## 4. 관계 용어 (Relationship)");
  lines.push("");
  const relationTerms = terms.filter((t) => t.termType.toLowerCase().includes("relation"));
  renderTermTable(lines, relationTerms, terms);

  // ── §5 속성 용어 (Attribute)
  lines.push("## 5. 속성 용어 (Attribute)");
  lines.push("");
  const attrTerms = terms.filter((t) => t.termType.toLowerCase().includes("attribute"));
  renderTermTable(lines, attrTerms, terms);

  // ── §6 용어 계층 트리
  lines.push("## 6. 용어 계층 트리");
  lines.push("");
  const tree = buildHierarchyTree(terms);

  if (tree.length === 0) {
    lines.push("_(계층 관계가 정의된 용어가 없습니다.)_");
  } else {
    lines.push("```");
    renderTree(lines, tree, "", 4);
    lines.push("```");
  }
  lines.push("");

  return lines.join("\n");
}
