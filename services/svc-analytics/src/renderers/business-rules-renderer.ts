/**
 * D2 업무규칙 정의서 마크다운 렌더러 (AIF-REQ-017)
 * 정책 데이터를 도메인별로 분류하여 SI 업무규칙 정의서 형식으로 변환한다.
 */
import type { PolicyRow } from "../collectors/data-collector.js";

// ─── Policy domain classification ─────────────────────────────────

const GIFTVOUCHER_TYPES: Record<string, string> = {
  IS: "발행 (Issuance)",
  DT: "유통 (Distribution)",
  US: "사용 (Usage)",
  ST: "정산 (Settlement)",
  MG: "관리 (Management)",
  RG: "규정 (Regulation)",
  RF: "환불 (Refund)",
  VL: "검증 (Validation)",
  NF: "알림 (Notification)",
  EX: "예외 (Exception)",
};

const PENSION_TYPES: Record<string, string> = {
  WD: "인출 (Withdrawal)",
  EN: "가입 (Enrollment)",
  TR: "이전 (Transfer)",
  CT: "부담금 (Contribution)",
  BN: "급여 (Benefit)",
  MG: "관리 (Management)",
  RG: "규정 (Regulation)",
  CL: "산출 (Calculation)",
  NF: "알림 (Notification)",
  EX: "예외 (Exception)",
};

interface PolicyDomainGroup {
  typeCode: string;
  typeName: string;
  policies: PolicyRow[];
}

function classifyPoliciesByDomain(policies: PolicyRow[]): PolicyDomainGroup[] {
  const groups = new Map<string, PolicyRow[]>();

  for (const p of policies) {
    const parts = p.policyCode.split("-");
    const typeCode = parts[2] ?? "UNKNOWN";
    const existing = groups.get(typeCode);
    if (existing) {
      existing.push(p);
    } else {
      groups.set(typeCode, [p]);
    }
  }

  // Detect domain from first policy code
  const firstCode = policies[0]?.policyCode ?? "";
  const typeMap = firstCode.includes("GIFTVOUCHER")
    ? GIFTVOUCHER_TYPES
    : firstCode.includes("PENSION")
      ? PENSION_TYPES
      : GIFTVOUCHER_TYPES;

  return Array.from(groups.entries())
    .map(([typeCode, items]) => ({
      typeCode,
      typeName: typeMap[typeCode] ?? `미분류 (${typeCode})`,
      policies: items.sort((a, b) => a.policyCode.localeCompare(b.policyCode)),
    }))
    .sort((a, b) => b.policies.length - a.policies.length);
}

// ─── Trust level stats ─────────────────────────────────────────────

function trustStats(policies: PolicyRow[]): Record<string, number> {
  const counts: Record<string, number> = { unreviewed: 0, reviewed: 0, validated: 0 };
  for (const p of policies) {
    const level = p.trustLevel ?? "unreviewed";
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return counts;
}

// ─── Markdown escape ────────────────────────────────────────────────

function escMd(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "—";
  const clean = text.replace(/\n/g, " ").replace(/\|/g, "\\|");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// ─── Main renderer ──────────────────────────────────────────────────

export function renderBusinessRules(policies: PolicyRow[]): string {
  const groups = classifyPoliciesByDomain(policies);
  const trust = trustStats(policies);
  const today = new Date().toISOString().slice(0, 10);

  // Detect domain name
  const firstCode = policies[0]?.policyCode ?? "";
  const domainName = firstCode.includes("GIFTVOUCHER")
    ? "온누리상품권"
    : firstCode.includes("PENSION")
      ? "퇴직연금"
      : "일반";

  const lines: string[] = [];

  // ── Header
  lines.push(`# 업무규칙 정의서 — ${domainName}`);
  lines.push("");
  lines.push(`> 생성일: ${today} | 총 규칙 수: ${policies.length}건 | 도메인: ${groups.length}개 유형`);
  lines.push(`> 생성 방식: AI Foundry Stage 3 (Claude Opus 정책 추론) + HITL 승인`);
  lines.push("");

  // ── §1 문서 개요
  lines.push("## 1. 문서 개요");
  lines.push("");
  lines.push(`- **대상 도메인**: ${domainName}`);
  lines.push(`- **추출 방식**: AI Foundry 5-Stage 파이프라인 Stage 3 (정책 추론)`);
  lines.push(`- **추론 엔진**: Claude Opus (Tier 1)`);
  lines.push(`- **검증 상태**: 전량 approved (HITL 검토 완료)`);
  lines.push(`- **신뢰 수준 분포**: validated ${trust["validated"] ?? 0}건 / reviewed ${trust["reviewed"] ?? 0}건 / unreviewed ${trust["unreviewed"] ?? 0}건`);
  lines.push("");

  // ── §2 분류 체계
  lines.push("## 2. 업무규칙 분류 체계");
  lines.push("");
  lines.push("| # | 유형 코드 | 유형명 | 규칙 수 | 비율 |");
  lines.push("|---|----------|--------|--------:|-----:|");
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const pct = ((g.policies.length / policies.length) * 100).toFixed(1);
    lines.push(`| ${i + 1} | ${g.typeCode} | ${g.typeName} | ${g.policies.length} | ${pct}% |`);
  }
  lines.push("");

  // ── §3 도메인별 업무규칙
  lines.push("## 3. 도메인별 업무규칙");
  lines.push("");

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    lines.push(`### 3.${i + 1} ${g.typeName} (${g.typeCode}) — ${g.policies.length}건`);
    lines.push("");
    lines.push("| # | 규칙 코드 | 제목 | 조건 (IF) | 판단 기준 | 결과 (THEN) | 신뢰도 |");
    lines.push("|---|-----------|------|-----------|-----------|-------------|:------:|");

    for (let j = 0; j < g.policies.length; j++) {
      const p = g.policies[j]!;
      lines.push(
        `| ${j + 1} | \`${p.policyCode}\` | ${escMd(p.title)} | ${truncate(p.condition, 60)} | ${truncate(p.criteria, 60)} | ${truncate(p.outcome, 60)} | ${p.trustLevel} |`,
      );
    }
    lines.push("");
  }

  // ── §4 정책 코드 체계
  const domainPrefix = firstCode.includes("GIFTVOUCHER") ? "GIFTVOUCHER" : "PENSION";
  const typeMap = firstCode.includes("GIFTVOUCHER") ? GIFTVOUCHER_TYPES : PENSION_TYPES;

  lines.push("## 4. 정책 코드 체계");
  lines.push("");
  lines.push(`- **형식**: \`POL-${domainPrefix}-{TYPE}-{SEQ}\``);
  lines.push("- **TYPE 목록**:");
  for (const [code, name] of Object.entries(typeMap)) {
    lines.push(`  - \`${code}\`: ${name}`);
  }
  lines.push("- **SEQ**: 3자리 일련번호 (001~999)");
  lines.push("");

  // ── §5 검토 이력 (placeholder)
  lines.push("## 5. 검토 및 조정 이력");
  lines.push("");
  lines.push("| 일자 | 평가자 | Tier | 변경 내용 |");
  lines.push("|------|--------|------|-----------|");
  lines.push("| | | | (인터뷰 후 추가) |");
  lines.push("");

  return lines.join("\n");
}
