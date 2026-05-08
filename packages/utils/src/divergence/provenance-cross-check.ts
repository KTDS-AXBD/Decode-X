/**
 * F426 (Sprint 259) — provenance.yaml manual markers vs auto-detected markers cross-check.
 *
 * Read-only — yaml write는 user 검토 후 별도 작업.
 * js-yaml 의존성 회피를 위해 정규식 기반 가벼운 파서 (ruleId + status 필드만 추출).
 */
import type { CrossCheckRecommendation, BLDivergenceMarker } from "@ai-foundry/types";
import { BL_DETECTOR_REGISTRY } from "./bl-detector.js";

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
 *
 * F446 (Sprint 280): BL_DETECTOR_REGISTRY를 source of truth로 자동 derive.
 * - 이전: manual whitelist 유지(F426 Sprint 259~F436 Sprint 269 P-007까지) — 매 Sprint 동기화 필요했음.
 *   V/LP/BL-042/CC 누락으로 write-provenance가 자동 status 전환 skip하는 부작용 발생.
 * - 현재: `Object.keys(BL_DETECTOR_REGISTRY)` 자동 sync → 새 detector 등록 시 즉시 supported.
 *
 * 미지원 ruleId는 BL_DETECTOR_REGISTRY 미등록 BL — cross-check에서 UNKNOWN 처리.
 * 추가 detector 작성 시 BL_DETECTOR_REGISTRY에만 등록 (본 Set 별도 갱신 불필요).
 */
export const DETECTOR_SUPPORTED_RULES: ReadonlySet<string> = new Set(
  Object.keys(BL_DETECTOR_REGISTRY),
);

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
