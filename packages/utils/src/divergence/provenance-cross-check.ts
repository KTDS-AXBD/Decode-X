/**
 * F426 (Sprint 259) — provenance.yaml manual markers vs auto-detected markers cross-check.
 *
 * Read-only — yaml write는 user 검토 후 별도 작업.
 * js-yaml 의존성 회피를 위해 정규식 기반 가벼운 파서 (ruleId + status 필드만 추출).
 */
import type { CrossCheckRecommendation, BLDivergenceMarker } from "@ai-foundry/types";

interface ParsedProvenanceMarker {
  ruleId: string;
  status: "OPEN" | "RESOLVED";
}

/**
 * provenance.yaml의 divergenceMarkers 섹션에서 ruleId + status 추출.
 */
export function parseProvenanceMarkers(yamlText: string): ParsedProvenanceMarker[] {
  const markers: ParsedProvenanceMarker[] = [];

  const dmStart = yamlText.indexOf("divergenceMarkers:");
  if (dmStart < 0) return markers;

  const sectionBody = yamlText.slice(dmStart);

  const itemPattern = /-\s+marker:\s+DIVERGENCE\s+([\s\S]*?)(?=\n\s*-\s+marker:|\n[a-zA-Z]|$)/g;

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(sectionBody)) !== null) {
    const block = match[1] ?? "";
    const ruleIdMatch = block.match(/ruleId:\s+(\S+)/);
    const statusMatch = block.match(/status:\s+(OPEN|RESOLVED)/);
    if (ruleIdMatch && statusMatch) {
      markers.push({
        ruleId: ruleIdMatch[1] ?? "",
        status: (statusMatch[1] ?? "OPEN") as "OPEN" | "RESOLVED",
      });
    }
  }

  return markers;
}

/**
 * Detector가 지원하는 ruleId 목록.
 * F426 Sprint 259: BL-027, BL-028.
 * F427 Sprint 260: BL-024, BL-026, BL-029 추가 → 5/5 (F354 자동화 완성).
 *
 * 미지원 ruleId(BL-020/021/022/023/025/030 등)는 본 detector scope 외 —
 * cross-check에서 UNKNOWN 처리. 추가 detector 작성 시 본 Set 확장.
 */
export const DETECTOR_SUPPORTED_RULES = new Set<string>([
  // Sprint 260 (F427) — refund specific
  "BL-024",
  "BL-026",
  "BL-027",
  "BL-028",
  "BL-029",
  // Sprint 262 (F429) — universal patterns
  "BL-005",
  "BL-006",
  "BL-007",
  "BL-008",
  "BL-014",
  "BL-015",
  "BL-022",
  // Sprint 264 (F431) — gift domain
  "BL-G002",
  "BL-G003",
  "BL-G004",
  "BL-G005",
  "BL-G006",
  // Sprint 265 (F432) — settlement domain
  "BL-033",
  "BL-034",
  "BL-035",
  "BL-036",
  // Sprint 266 (F433) — budget domain
  "BB-001",
  "BB-002",
  "BB-003",
  "BB-004",
  "BB-005",
  // Sprint 266 (F433) — purchase domain
  "BP-001",
  "BP-002",
  "BP-003",
  "BP-004",
  "BP-005",
]);

/**
 * Manual markers vs Auto markers cross-check 권고.
 *
 * Detector 지원(BL-027/028):
 *   manual=OPEN + auto=0   → RESOLVED 권고 (코드에서 패턴 사라짐)
 *   manual=OPEN + auto≥1   → OPEN 유지
 *   manual=RESOLVED + auto=0 → RESOLVED 일관
 *   manual=RESOLVED + auto≥1 → REGRESSION 의심
 *
 * Detector 미지원(BL-024/026/029): UNKNOWN — 별도 detector(F427 rules.md NL parser) 선결 필요.
 */
export function crossCheck(
  yamlText: string,
  autoMarkers: BLDivergenceMarker[],
): CrossCheckRecommendation[] {
  const manual = parseProvenanceMarkers(yamlText);

  return manual.map((m): CrossCheckRecommendation => {
    const autoCount = autoMarkers.filter((a) => a.ruleId === m.ruleId).length;
    const supported = DETECTOR_SUPPORTED_RULES.has(m.ruleId);

    if (!supported) {
      return {
        ruleId: m.ruleId,
        manualStatus: m.status,
        autoDetectionCount: 0,
        recommendedStatus: "UNKNOWN",
        detectorSupported: false,
        reason: `Detector does not support ${m.ruleId} (Sprint 260 scope: BL-024/026/027/028/029). Manual review required. Add detector to BL_DETECTOR_REGISTRY for automatic check.`,
      };
    }

    if (m.status === "OPEN" && autoCount === 0) {
      return {
        ruleId: m.ruleId,
        manualStatus: "OPEN",
        autoDetectionCount: 0,
        recommendedStatus: "RESOLVED",
        detectorSupported: true,
        reason:
          "Manual=OPEN but auto-detector found 0 occurrences. Code may have RESOLVED this issue. Review and update provenance.yaml status.",
      };
    }
    if (m.status === "OPEN" && autoCount > 0) {
      return {
        ruleId: m.ruleId,
        manualStatus: "OPEN",
        autoDetectionCount: autoCount,
        recommendedStatus: "OPEN",
        detectorSupported: true,
        reason: `Manual=OPEN and auto-detector confirms ${autoCount} occurrences. Status consistent.`,
      };
    }
    if (m.status === "RESOLVED" && autoCount === 0) {
      return {
        ruleId: m.ruleId,
        manualStatus: "RESOLVED",
        autoDetectionCount: 0,
        recommendedStatus: "RESOLVED",
        detectorSupported: true,
        reason: "Status consistent — RESOLVED in both manual and auto.",
      };
    }
    return {
      ruleId: m.ruleId,
      manualStatus: "RESOLVED",
      autoDetectionCount: autoCount,
      recommendedStatus: "OPEN",
      detectorSupported: true,
      reason: `Manual=RESOLVED but auto-detector found ${autoCount} occurrences. Possible code regression.`,
    };
  });
}
