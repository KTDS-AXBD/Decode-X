/**
 * CATEGORY_MAP.ts — F439 frontmatter backfill
 *
 * 디렉토리 segment / 파일명 토큰 → category 매핑.
 * 면제 패턴(`isExempt`)에 해당하는 파일은 스크립트가 skip 한다.
 *
 * AIF-DSGN-069 §2 면제 정책 + §3 8 필드 추론 규칙 참조.
 */

export const CATEGORY_MAP: Record<string, string> = {
  "01-plan": "plan",
  "02-design": "design",
  "03-analysis": "analysis",
  "04-report": "report",
  reports: "report",
  poc: "poc",
  "req-interview": "req-interview",
  contracts: "contracts",
  archive: "archive",
};

export const EXEMPT_PATTERNS: RegExp[] = [
  /\/req-interview\/[^/]+\/review\/round-\d+\//,
  /\/archive\/2026-03\//,
  /\/decode-x-restructuring\/archive\//,
];

export function mapCategory(relPath: string): string {
  // 1차: 디렉토리 segment 매칭
  const segments = relPath.split("/");
  for (const seg of segments) {
    if (seg in CATEGORY_MAP) {
      const v = CATEGORY_MAP[seg];
      if (v !== undefined) return v;
    }
  }

  // 2차: 파일명 토큰 (`.plan.md`, `.design.md`, ...)
  if (/\.plan\.md$/i.test(relPath)) return "plan";
  if (/\.design\.md$/i.test(relPath)) return "design";
  if (/\.analysis\.md$/i.test(relPath)) return "analysis";
  if (/\.report\.md$/i.test(relPath)) return "report";

  return "general";
}

export function isExempt(relPath: string): boolean {
  return EXEMPT_PATTERNS.some((re) => re.test(relPath));
}

export function inferTypeFromPath(relPath: string): string {
  if (relPath.includes("/01-plan/")) return "PLAN";
  if (relPath.includes("/02-design/")) return "DSGN";
  if (relPath.includes("/03-analysis/")) return "ANLS";
  if (relPath.includes("/04-report/") || relPath.startsWith("reports/"))
    return "RPRT";
  if (relPath.includes("/poc/")) return "POC";
  if (relPath.includes("/req-interview/")) return "REQI";
  if (relPath.includes("/archive/")) return "ARCH";
  return "DOC";
}
