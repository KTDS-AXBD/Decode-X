import { buildHeaders } from "./headers";

export type DeliverableType =
  | "interface-spec"
  | "business-rules"
  | "terminology"
  | "gap-report"
  | "comparison";

export const DELIVERABLE_INFO: Record<
  DeliverableType,
  { code: string; title: string; description: string }
> = {
  "interface-spec": {
    code: "D1",
    title: "인터페이스 설계서",
    description: "API 엔드포인트 명세 + 요청/응답 스키마",
  },
  "business-rules": {
    code: "D2",
    title: "업무 규칙",
    description: "정책 condition-criteria-outcome 트리플 전체 목록",
  },
  terminology: {
    code: "D3",
    title: "용어 사전",
    description: "도메인 용어 + SKOS 개념 매핑",
  },
  "gap-report": {
    code: "D4",
    title: "Gap 분석 보고서",
    description: "소스코드↔문서 커버리지 분석",
  },
  comparison: {
    code: "D5",
    title: "비교표",
    description: "As-Is/To-Be 관점별 비교",
  },
};

export async function fetchDeliverableMarkdown(
  orgId: string,
  type: DeliverableType,
): Promise<string> {
  const res = await fetch(
    `/api/deliverables/export/${type}?organizationId=${orgId}`,
    { headers: buildHeaders(orgId) },
  );
  if (!res.ok)
    throw new Error(`Deliverable fetch failed: ${res.status}`);
  return res.text();
}
