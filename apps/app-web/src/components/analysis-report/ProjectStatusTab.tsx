import { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  BookOpen,
  Puzzle,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Target,
  Zap,
  ArrowRight,
  Search,
  Layers,
  CircleDot,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MetricCard } from "./MetricCard";
import { fetchDocuments } from "@/api/ingestion";
import { fetchPolicies } from "@/api/policy";
import { fetchSkills } from "@/api/skill";
import { fetchTermsStats } from "@/api/ontology";
import { useOrganization } from "@/contexts/OrganizationContext";

/* ─── Section Header ─── */
function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
      >
        <Icon className="w-5 h-5" style={{ color: "var(--accent)" }} />
      </div>
      <div>
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Data Table ─── */
function DataTable({ headers, rows, highlightCol }: {
  headers: string[];
  rows: string[][];
  highlightCol?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--bg-secondary)" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-t"
              style={{ borderColor: "var(--border)" }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-2.5"
                  style={{
                    color: ci === highlightCol ? "var(--accent)" : "var(--text-primary)",
                    fontWeight: ci === highlightCol ? 600 : 400,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Task Card ─── */
function TaskCard({ priority, title, description, status }: {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  status: string;
}) {
  const colorMap = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
  const labelMap = { high: "높음", medium: "보통", low: "낮음" };
  const color = colorMap[priority];
  return (
    <div
      className="p-4 rounded-lg border flex items-start gap-3"
      style={{ borderColor: "var(--border)", borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <Badge variant="outline" style={{ color, borderColor: color, fontSize: "0.65rem" }}>
            {labelMap[priority]}
          </Badge>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{description}</p>
      </div>
      <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
        {status}
      </span>
    </div>
  );
}

/* ─── Finding Card ─── */
function FindingCard({ icon: Icon, title, items, color }: {
  icon: React.ElementType;
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{title}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Policy Example Card ─── */
function PolicyExampleCard({ code, title, description }: {
  code: string;
  title: string;
  description: string;
}) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="secondary" className="text-xs font-mono">{code}</Badge>
        <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{title}</span>
      </div>
      <p className="text-xs ml-1" style={{ color: "var(--text-secondary)" }}>{description}</p>
    </div>
  );
}

/* ═══ Pipeline counts from each service DB ═══ */
interface PipelineCounts {
  totalDocs: number;
  approvedPolicies: number;
  totalPolicies: number;
  totalTerms: number;
  totalSkills: number;
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

  return (
    <div className="space-y-8">
      {/* ─── Section A: 파이프라인 현황 ─── */}
      <section>
        <SectionHeader
          icon={TrendingUp}
          title="파이프라인 현황"
          subtitle="5-Stage Core Engine 실행 결과 요약"
        />

        {/* 소스 파일 → 파이프라인 흐름 */}
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
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold" style={{ color: "#3b82f6" }}>1,034</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>전체 소스 파일</div>
              <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
                미래에셋 787 + 현대해상/LLM 247
              </div>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: "#10b981" }}>787</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>파일럿 대상</div>
              <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
                미래에셋 퇴직연금 문서만 분석
              </div>
            </div>
          </div>
        </div>

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
          <div className="p-3 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>HITL 데모</div>
            <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
              18건
            </div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
              BN 4 · WD 3 · CT 2 · EN 3 · TR 2 · CL 1 · RG 3
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section B: 핵심 평가 — Reverse Engineering 가능성 ─── */}
      <section>
        <SectionHeader
          icon={Search}
          title="핵심 평가 — Reverse Engineering은 가능한가?"
          subtitle="기존 산출물에서 신규 시스템 개발에 필요한 스펙·정책·암묵지를 추출할 수 있는가"
        />

        {/* 핵심 질문 프레이밍 */}
        <div className="p-4 rounded-lg border mb-5" style={{
          borderColor: "var(--accent)",
          backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
        }}>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            <strong>프로젝트 핵심 질문:</strong> 기존 SI 산출물(ERD, 화면설계서, API 스펙, ISP, 요구사항 등)을 AI로 분석하여,
            <em> 신규 시스템을 설계·개발할 수 있는 수준의 도메인 지식 자산</em>을 구축할 수 있는가?
            산출물에 명시되지 않은 암묵지를 어디까지 추론·정제할 수 있는가?
          </p>
        </div>

        {/* 추출 차원별 평가 */}
        <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          <Layers className="w-4 h-4 inline mr-1" />
          추출 차원별 평가
        </h4>
        <DataTable
          headers={["추출 차원", "수준", "현재 결과", "시스템 개발 활용도"]}
          rows={[
            [
              "업무 규칙·정책",
              "★★★★☆",
              "787건 → 3,046 정책 추출",
              "높음 — 비즈니스 로직 구현에 직접 활용 가능",
            ],
            [
              "도메인 용어·개념",
              "★★★★☆",
              "26,825 용어 자동 수집",
              "높음 — 데이터 모델링, 필드명, UI 레이블에 활용",
            ],
            [
              "암묵지 추론",
              "★★★☆☆",
              "교육자료·FAQ에서 비명시 규범 도출",
              "보통 — HITL 검증 후 신뢰 가능, 단독 의존 위험",
            ],
            [
              "프로세스 흐름",
              "★★★☆☆",
              "화면설계서·API 스펙에서 부분 복원",
              "보통 — 주요 흐름 파악 가능, 예외 분기 누락",
            ],
            [
              "데이터 모델",
              "★★☆☆☆",
              "ERD 파싱 → 엔티티·관계 추출",
              "제한적 — 구조는 얻으나 제약조건·의미 해석 부족",
            ],
            [
              "화면 흐름·UX",
              "★★☆☆☆",
              "화면 목록·필드 추출 수준",
              "제한적 — 레이아웃·인터랙션 로직은 미추출",
            ],
            [
              "비기능 요구사항",
              "★☆☆☆☆",
              "산출물에 거의 미기재",
              "불가 — 성능·보안·확장성은 별도 정의 필요",
            ],
          ]}
        />

        {/* 종합 판정 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          {/* 잘 되는 것 */}
          <div className="p-4 rounded-lg border" style={{ borderColor: "#10b981" }}>
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp className="w-4 h-4" style={{ color: "#10b981" }} />
              <span className="text-sm font-semibold" style={{ color: "#10b981" }}>
                생각보다 잘 되는 것
              </span>
            </div>
            <ul className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>업무 규칙의 자동 추출 품질</strong> — 규정·약관에서 조건-기준-결과 트리플을 99% 자동 승인 수준으로 추출</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>다중 문서 교차 추론</strong> — 여러 문서의 단편 정보를 조합해 완성된 정책 도출 (CT-361 사례)</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>비용 효율</strong> — 787건 문서 전체 파이프라인 처리에 ~$25, 문서당 3센트</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#10b981" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>확장성</strong> — 도메인 변경 시 모델 재학습 없이 동일 파이프라인으로 새 도메인 적용 가능</span>
              </li>
            </ul>
          </div>

          {/* 부족한 것 */}
          <div className="p-4 rounded-lg border" style={{ borderColor: "#ef4444" }}>
            <div className="flex items-center gap-2 mb-3">
              <ThumbsDown className="w-4 h-4" style={{ color: "#ef4444" }} />
              <span className="text-sm font-semibold" style={{ color: "#ef4444" }}>
                아직 부족한 것
              </span>
            </div>
            <ul className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>프로세스 간 연결 관계</strong> — 개별 정책은 추출하나, 업무 흐름의 선후 관계·의존성 자동 구성은 미완</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>예외 처리·경계 조건</strong> — &quot;정상 경로&quot;는 잘 추출하나, 예외 분기·에러 핸들링은 산출물에 부재</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>데이터 모델 의미 해석</strong> — ERD 구조는 파싱 가능하나, 컬럼의 비즈니스 의미·제약조건은 추론 한계</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>산출물 자체의 불완전성</strong> — 실무에서 산출물이 현행과 불일치하거나 미갱신된 경우 감지 불가</span>
              </li>
            </ul>
          </div>

          {/* 보강 필요 */}
          <div className="p-4 rounded-lg border" style={{ borderColor: "#f59e0b" }}>
            <div className="flex items-center gap-2 mb-3">
              <Minus className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <span className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
                보강하면 가능한 것
              </span>
            </div>
            <ul className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>HITL + 도메인 전문가 검증</strong> — AI 추출 → 전문가 보정 루프를 체계화하면 암묵지 품질 대폭 향상</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>프로세스 마이닝 연계</strong> — 실 운영 로그와 결합하면 산출물의 누락·불일치 보완 가능</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>온톨로지 고도화</strong> — 26,825 용어를 타입별 분류·계층화하면 데이터 모델링 자동화에 활용 가능</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <span><strong style={{ color: "var(--text-primary)" }}>멀티모달 확장</strong> — 화면 이미지·ERD 다이어그램 직접 분석으로 UI/데이터 모델 추출 강화</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 결론: 어디까지 만들 수 있는가 */}
        <div className="mt-5">
          <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            <Target className="w-4 h-4 inline mr-1" />
            이 추출 결과로 시스템을 만든다면?
          </h4>
          <DataTable
            headers={["시스템 구성 요소", "AI 자동 생성", "전문가 보완", "종합"]}
            rows={[
              ["비즈니스 로직 (업무 규칙)", "70~80%", "20~30%", "✅ 핵심 업무 규칙 구현 가능"],
              ["데이터 모델 (테이블·관계)", "40~50%", "50~60%", "⚠️ 스키마 초안 수준, 정제 필요"],
              ["API 인터페이스 (서비스 계약)", "30~40%", "60~70%", "⚠️ 엔드포인트 도출 가능, 상세 설계 필요"],
              ["화면·UX (인터랙션)", "20~30%", "70~80%", "❌ 필드·목록까지, 레이아웃은 별도"],
              ["통합·연동 (시스템 간)", "10~20%", "80~90%", "❌ API 목록은 있으나 오케스트레이션 필요"],
              ["비기능 (성능·보안)", "5~10%", "90~95%", "❌ 별도 아키텍처 설계 필수"],
            ]}
          />
        </div>

        {/* 최종 판정 */}
        <div className="mt-4 p-4 rounded-lg" style={{
          backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
        }}>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            종합 판정
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>현재 수준:</strong>{" "}
            기존 산출물에서 <em>비즈니스 로직의 70~80%</em>를 자동 추출할 수 있으며,
            이는 신규 시스템의 &quot;업무 규칙 계층&quot;을 AI가 초안 작성하고 전문가가 검증하는 워크플로를 현실화한다.
            특히 규정·약관 기반 도메인(금융, 보험, 공공)에서 효과가 높다.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>한계:</strong>{" "}
            데이터 모델·화면·통합 설계는 산출물만으로 50% 이하 수준이며, &quot;산출물에 적히지 않은 것&quot;(예외 처리, 운영 노하우, 비기능 요구)은
            AI 단독으로 채울 수 없다. 이 영역은 HITL + 운영 데이터 연계가 필수다.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>결론:</strong>{" "}
            Reverse Engineering으로 &quot;설계 초안 + 핵심 업무 규칙&quot;까지는 자동화 가능하며,
            이것만으로도 신규 개발 시 <em>요구사항 분석 기간을 40~60% 단축</em>하는 효과가 기대된다.
            완전 자동 시스템 생성은 아직 불가하지만, <em>&quot;AI가 초안, 사람이 완성&quot;</em>하는 협업 모델의 실현 가능성은 이번 파일럿으로 입증되었다.
          </p>
        </div>
      </section>

      {/* ─── Section C: 품질 평가 ─── */}
      <section>
        <SectionHeader
          icon={Target}
          title="품질 평가"
          subtitle="암묵지 추출 성과 및 한계 분석"
        />

        {/* 잘 되는 것 */}
        <FindingCard
          icon={CheckCircle2}
          title="잘 되는 것 — 암묵지 추출 사례"
          color="#10b981"
          items={[
            "BN-724: 퇴직연금 사업자 변경 시 이전 수수료 면제 조건 — 문서에 명시되지 않은 3년 유지 조건을 추론",
            "CL-409: 고객 민원 대응 시 '확약 금지' 원칙 — 교육 자료에서만 확인 가능한 운영 규범 자동 추출",
            "CT-361: 계약 이전 심사 시 자산 유동성 검증 기준 — 여러 문서의 단편 정보를 조합해 완성된 정책 도출",
            "787건 미래에셋 문서에서 3,000+ 정책 자동 생성 — 문서당 평균 3.8건 정책 추출",
          ]}
        />

        <div className="mt-4">
          <FindingCard
            icon={AlertTriangle}
            title="한계점"
            color="#f59e0b"
            items={[
              "신호 대 잡음 (Signal-to-Noise): 787건 문서 기준 유효 정책 비율 ~78%, 나머지는 일반적인 설명 또는 중복",
              "메타데이터 미완성: 원본 문서의 section/page 매핑이 불완전 — provenance 추적에 한계",
              "깊이 한계: 복합 조건(AND/OR 3단계 이상) 정책은 단순화되는 경향",
              "온톨로지 26,000+ 용어 중 타입 분류가 entity 단일 — 세부 분류(process, rule, metric 등) 필요",
            ]}
          />
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            종합 판단
          </h4>
          <DataTable
            headers={["평가 항목", "수준", "비고"]}
            rows={[
              ["단순 정책 추출", "★★★★☆", "규정·약관 기반 조건-기준-결과 추출 안정적"],
              ["암묵지 추론", "★★★☆☆", "교육 자료·FAQ에서 비명시 규범 도출 가능, 복합 추론 한계"],
              ["정책 품질 (정밀도)", "★★★★☆", "3,028/3,046 자동 승인, HITL 18건 데모"],
              ["커버리지 (재현율)", "★★★☆☆", "787건 → 3,046 정책, 문서당 3.8건"],
              ["온톨로지 일관성", "★★★☆☆", "26,825 용어, 타입 세분화 및 병합 필요"],
            ]}
          />
        </div>

        <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>결론:</strong>{" "}
            787건 미래에셋 문서에서 3,046건 정책을 자동 추출하고 3,104건 Skill로 패키징 완료.
            규정 기반 정책은 99%+ 자동 승인율이며, 암묵지 추론은 HITL 보정으로 실용 수준 달성 가능.
            다음 단계는 도메인 전문가 리뷰(HITL) 고도화와 온톨로지 품질 개선.
          </p>
        </div>
      </section>

      {/* ─── Section C: LLM 비용 분석 ─── */}
      <section>
        <SectionHeader
          icon={DollarSign}
          title="LLM 비용 분석"
          subtitle="Anthropic API 사용량 및 멀티 프로바이더 전략"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4" style={{ color: "#ef4444" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>파일럿 누적 비용</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>~$25</div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>787건 문서 · 3,046 정책 · 3,104 Skill 생성</div>
          </div>
          <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>일평균 비용</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#f59e0b" }}>$11~25</div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>작업 강도에 따라 변동</div>
          </div>
          <div className="p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4" style={{ color: "#10b981" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>비용 절감률</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#10b981" }}>60~70%</div>
            <div className="text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>티어 라우팅 vs 단일 모델</div>
          </div>
        </div>

        <h4 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          멀티 프로바이더 티어 매핑
        </h4>
        <DataTable
          headers={["티어", "Anthropic", "OpenAI", "Google", "Workers AI"]}
          highlightCol={0}
          rows={[
            ["Tier 1 (Opus)", "claude-opus-4-6", "gpt-4.1", "gemini-2.5-pro", "—"],
            ["Tier 2 (Sonnet)", "claude-sonnet-4-6", "gpt-4.1-mini", "gemini-2.5-flash", "glm-4.7-flash"],
            ["Tier 3 (Haiku)", "claude-haiku-4-5", "gpt-4.1-nano", "gemini-2.5-flash-lite", "llama-3.1-8b"],
            ["Embedding", "—", "—", "—", "bge-m3 (100+ 언어)"],
          ]}
        />

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            비용 최적화 후속 과제
          </h4>
          <DataTable
            headers={["과제", "예상 효과", "우선순위"]}
            rows={[
              ["AI Gateway 캐싱 활성화", "반복 프롬프트 40~60% 비용 절감", "높음"],
              ["Prompt 최적화 (토큰 축소)", "입력 토큰 20~30% 감소", "높음"],
              ["Workers AI 비중 확대", "분류·임베딩 비용 → 무료", "보통"],
              ["Google AI Studio 과금 설정", "429 에러 해소, fallback 활용", "보통"],
            ]}
          />
        </div>
      </section>

      {/* ─── Section D: 향후 과제 ─── */}
      <section>
        <SectionHeader
          icon={Target}
          title="향후 과제"
          subtitle="파일럿 완료 후 프로덕션 전환 로드맵"
        />
        <div className="space-y-3">
          <TaskCard
            priority="high"
            title="HITL 고도화"
            description="Reviewer 다중 승인, 충돌 해결 워크플로, 정책 버전 관리 도입"
            status="Phase 5"
          />
          <TaskCard
            priority="high"
            title="품질 평가 자동화"
            description="Golden Test Set 구축 + 자동 회귀 테스트, Prompt Registry Blue-Green 배포"
            status="Phase 5"
          />
          <TaskCard
            priority="high"
            title="온톨로지 전문가 리뷰"
            description="유사 용어 병합, 계층 구조 검증, 도메인 전문가 참여 프로세스 수립"
            status="Phase 5"
          />
          <TaskCard
            priority="medium"
            title="MCP 서버 실서비스 연동"
            description="Claude Desktop에서 실제 Skill 조회·실행 검증, 외부 시스템 연동 테스트"
            status="검증 중"
          />
          <TaskCard
            priority="medium"
            title="온톨로지 용어 타입 세분화"
            description="현재 26,825 용어 전체가 entity 타입 — process, rule, metric 등 세부 분류 + 유사 용어 병합"
            status="진행 중"
          />
          <TaskCard
            priority="low"
            title="SCDSA002 복호화"
            description="Samsung SDS 암호화 파일 4건 — 복호화 도구/키 확보 후 처리"
            status="대기"
          />
        </div>
      </section>

      {/* ─── 대표 정책 예시 ─── */}
      <section>
        <SectionHeader
          icon={ShieldCheck}
          title="대표 추출 정책 예시"
          subtitle="HITL 데모 18건 중 주요 사례"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PolicyExampleCard
            code="POL-PENSION-BN-724"
            title="사업자 변경 수수료 면제"
            description="퇴직연금 사업자 변경 시 3년 이상 유지 고객에 대해 이전 수수료를 면제하는 비명시 운영 규범"
          />
          <PolicyExampleCard
            code="POL-PENSION-CL-409"
            title="고객 민원 확약 금지"
            description="민원 대응 시 결과를 사전 확약하지 않는 원칙 — 교육 자료에서 추출된 암묵지"
          />
          <PolicyExampleCard
            code="POL-PENSION-CT-361"
            title="계약 이전 자산 유동성 검증"
            description="계약 이전 심사 시 자산 유동성 비율 검증 기준 — 다중 문서 조합 추론"
          />
          <PolicyExampleCard
            code="POL-PENSION-WD-015"
            title="중도 인출 사유 검증"
            description="퇴직연금 중도 인출 시 법정 사유(주택 구입, 의료비 등) 증빙 검증 절차"
          />
        </div>
      </section>
    </div>
  );
}
