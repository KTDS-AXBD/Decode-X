import { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  BookOpen,
  Puzzle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "./MetricCard";
import { SectionHeader, SourceFileInfo } from "./StatusReportWidgets";
import { DynamicStatusReport } from "./DynamicStatusReport";
import { FactCheckAnalysisSection } from "./FactCheckAnalysisSection";
import { fetchDocuments } from "@/api/ingestion";
import { fetchPolicies } from "@/api/policy";
import { fetchSkills } from "@/api/skill";
import { fetchTermsStats } from "@/api/ontology";
import { useOrganization } from "@/contexts/OrganizationContext";

/* ═══ Pipeline counts from each service DB ═══ */
interface PipelineCounts {
  totalDocs: number;
  approvedPolicies: number;
  totalPolicies: number;
  totalTerms: number;
  totalSkills: number;
}

/* ═══ Org-specific source file info ═══ */
interface OrgSourceInfo {
  leftCount: string;
  leftLabel: string;
  leftSub: string;
  rightCount: string;
  rightLabel: string;
  rightSub: string;
  hitlCount?: string;
  hitlSub?: string;
}

function getSourceInfo(orgId: string): OrgSourceInfo | null {
  switch (orgId) {
    case "Miraeasset":
    case "org-mirae-pension":
      return {
        leftCount: "1,034",
        leftLabel: "전체 소스 파일",
        leftSub: "미래에셋 787 + 현대해상/LLM 247",
        rightCount: "787",
        rightLabel: "파일럿 대상",
        rightSub: "미래에셋 퇴직연금 문서만 분석",
        hitlCount: "18건",
        hitlSub: "BN 4 · WD 3 · CT 2 · EN 3 · TR 2 · CL 1 · RG 3",
      };
    case "LPON":
      return {
        leftCount: "215",
        leftLabel: "전체 소스 파일",
        leftSub: "Wave 1: 88건 + Wave 2 Archive: 127건",
        rightCount: "88",
        rightLabel: "Wave 1 분석 완료",
        rightSub: "전자식 온누리상품권 플랫폼 문서",
        hitlCount: "333건",
        hitlSub: "벌크 승인 운영 검증 완료",
      };
    default:
      return null;
  }
}

/* ═══ Main Component ═══ */
export function ProjectStatusTab() {
  const { organizationId } = useOrganization();
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [docsRes, approvedRes, allPolRes, termsRes, skillsRes] = await Promise.all([
          fetchDocuments(organizationId, 1),
          fetchPolicies(organizationId, { status: "approved", limit: 1 }),
          fetchPolicies(organizationId, { limit: 1 }),
          fetchTermsStats(organizationId),
          fetchSkills(organizationId, { limit: 1 }),
        ]);
        if (cancelled) return;
        setCounts({
          totalDocs: docsRes.success ? docsRes.data.total : 0,
          approvedPolicies: approvedRes.success ? approvedRes.data.total : 0,
          totalPolicies: allPolRes.success ? allPolRes.data.total : 0,
          totalTerms: termsRes.success ? termsRes.data.totalTerms : 0,
          totalSkills: skillsRes.success ? skillsRes.data.total : 0,
        });
      } catch {
        if (!cancelled) toast.error("현황 데이터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <span className="ml-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          현황 데이터 로딩 중...
        </span>
      </div>
    );
  }

  const totalDocs = counts?.totalDocs ?? 0;
  const approvedPolicies = counts?.approvedPolicies ?? 0;
  const totalPolicies = counts?.totalPolicies ?? 0;
  const totalTerms = counts?.totalTerms ?? 0;
  const totalSkills = counts?.totalSkills ?? 0;
  const approvalRate = totalPolicies > 0 ? approvedPolicies / totalPolicies : 0;

  const sourceInfo = getSourceInfo(organizationId);

  return (
    <div className="space-y-8">
      {/* ─── Section A: 파이프라인 현황 (공통 — API 동적) ─── */}
      <section>
        <SectionHeader
          icon={TrendingUp}
          title="파이프라인 현황"
          subtitle="5-Stage Core Engine 실행 결과 요약"
        />

        {/* 소스 파일 → 파이프라인 흐름 */}
        {sourceInfo && (
          <div className="p-4 rounded-lg border mb-4" style={{
            borderColor: "var(--border)",
            backgroundColor: "color-mix(in srgb, var(--accent) 5%, transparent)",
          }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                소스 파일 현황
              </span>
            </div>
            <SourceFileInfo {...sourceInfo} />
          </div>
        )}

        {/* 파이프라인 산출물 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={FileText} label="시스템 등록 문서" count={totalDocs} color="#3b82f6" />
          <MetricCard icon={ShieldCheck} label="정책 (Approved)" count={approvedPolicies} color="#10b981" />
          <MetricCard icon={BookOpen} label="온톨로지 용어" count={totalTerms} color="#8b5cf6" />
          <MetricCard icon={Puzzle} label="Skill 패키지" count={totalSkills} color="#f59e0b" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>정책 승인율</div>
            <div className="text-xl font-bold" style={{ color: "#10b981" }}>
              {(approvalRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>전체 정책</div>
            <div className="text-xl font-bold" style={{ color: "#3b82f6" }}>
              {totalPolicies.toLocaleString()}건
            </div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
              candidate {(totalPolicies - approvedPolicies).toLocaleString()} 포함
            </div>
          </div>
          {sourceInfo?.hitlCount && (
            <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>HITL 리뷰</div>
              <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
                {sourceInfo.hitlCount}
              </div>
              {sourceInfo.hitlSub && (
                <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
                  {sourceInfo.hitlSub}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── Section B: FactCheck 커버리지 분석 ─── */}
      <FactCheckAnalysisSection organizationId={organizationId} />

      {/* ─── 조직별 보고서 콘텐츠 (API/DB 동적) ─── */}
      <DynamicStatusReport organizationId={organizationId} />
    </div>
  );
}
