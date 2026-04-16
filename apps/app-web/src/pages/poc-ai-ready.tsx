import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import raw from "../../../../docs/poc/ai-ready-score-lpon-raw.json";

// ── Data shape (kept loose to avoid full schema import) ────────────────────
interface CriterionScore {
  score: number;
  pass: boolean;
  signals: Record<string, unknown>;
}
interface ScoreRow {
  skillId: string;
  domain: string;
  overall: number;
  passAiReady: boolean;
  criteria: {
    machineReadable: CriterionScore;
    semanticConsistency: CriterionScore;
    testable: CriterionScore;
    traceable: CriterionScore;
    completeness: CriterionScore & { btq?: { business: number; technical: number; quality: number } };
    humanReviewable: CriterionScore;
  };
  failedCriteria: string[];
}

interface PayloadData {
  rowsQueried: number;
  scored: number;
  elapsedMs: number;
  aggregate: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    byCriterion: Record<string, { passRate: number; avgScore: number; median: number; p25: number; p75: number }>;
    overall: { avg: number; median: number; p25: number; p75: number; min: number; max: number };
    btqAvg: { business: number; technical: number; quality: number };
    topFailures: { name: string; count: number; rate: number }[];
  };
  topSamples: ScoreRow[];
  bottomSamples: ScoreRow[];
  allScores: ScoreRow[];
}

interface Payload {
  data: PayloadData;
}

const CRITERION_LABEL: Record<string, string> = {
  machineReadable: "Machine-readable",
  semanticConsistency: "Semantic Consistency",
  testable: "Testable",
  traceable: "Traceable",
  completeness: "Completeness (B+T+Q)",
  humanReviewable: "Human-reviewable",
};

function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function colorFor(pass: boolean): string {
  return pass ? "#16a34a" : "#dc2626";
}

export default function PocAiReadyPage() {
  const payload = raw as Payload;
  const d = payload.data;
  const a = d.aggregate;

  const criterionData = useMemo(
    () =>
      Object.entries(a.byCriterion).map(([k, v]) => ({
        name: CRITERION_LABEL[k] ?? k,
        passRate: Math.round(v.passRate * 1000) / 10,
        avg: Math.round(v.avgScore * 1000) / 1000,
        pass: v.passRate >= 0.9,
      })),
    [a.byCriterion],
  );

  const btqData = useMemo(
    () => [
      { dim: "Business", value: Math.round(a.btqAvg.business * 1000) / 10 },
      { dim: "Technical", value: Math.round(a.btqAvg.technical * 1000) / 10 },
      { dim: "Quality", value: Math.round(a.btqAvg.quality * 1000) / 10 },
    ],
    [a.btqAvg],
  );

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">AIF-REQ-034</Badge>
          <Badge>PoC · 2026-04-17 보고</Badge>
        </div>
        <h1 className="text-2xl font-semibold">AI-Ready 6기준 채점 리포트 — LPON</h1>
        <p className="text-sm text-muted-foreground">
          LPON 온누리상품권 {d.scored}건 skill package를 규칙 기반 채점기로 평가 (소요 {(d.elapsedMs / 1000).toFixed(1)}초).
          Foundry-X 반제품 자동 생산 필요충분조건 충족률을 수치화.
        </p>
      </header>

      {/* Deep Dive PoC 로드맵 */}
      <Card className="p-5 border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
        <h2 className="text-lg font-semibold mb-3">Deep Dive v0.3 — 3 Must-Have 진행 현황</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <span className="text-emerald-600 text-lg">&#x2713;</span>
            <div>
              <div className="font-medium text-sm">B/T/Q Spec + AI-Ready 채점기</div>
              <div className="text-xs text-muted-foreground">6기준 규칙 기반 채점기 + {d.scored}건 일괄 실행 완료</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-600 text-lg">&#x25CB;</span>
            <div>
              <div className="font-medium text-sm">Tacit Interview Agent</div>
              <div className="text-xs text-muted-foreground">
                <a href="/docs/poc/tacit-interview-agent-format.md" className="text-primary hover:underline">포맷 명세 완료</a>
                {" "}· 구현은 정식 단계
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-blue-600 text-lg">&#x25CB;</span>
            <div>
              <div className="font-medium text-sm">Handoff 패키지 검증</div>
              <div className="text-xs text-muted-foreground">
                <a href="/docs/poc/handoff-package-format.md" className="text-primary hover:underline">포맷 명세 완료</a>
                {" "}· 구현은 정식 단계
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Hero numbers */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">AI-Ready 통과</div>
          <div className="text-3xl font-semibold">{pct(a.passRate)}</div>
          <div className="text-xs mt-1 text-muted-foreground">
            {a.passed} / {a.total} (overall &ge; 0.8)
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">평균 Overall</div>
          <div className="text-3xl font-semibold">{a.overall.avg.toFixed(3)}</div>
          <div className="text-xs mt-1 text-muted-foreground">
            median {a.overall.median.toFixed(3)} · p25 {a.overall.p25.toFixed(3)} · p75 {a.overall.p75.toFixed(3)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground mb-1">Business 차원 평균</div>
          <div className="text-3xl font-semibold text-emerald-600">{pct(a.btqAvg.business, 1)}</div>
          <div className="text-xs mt-1 text-muted-foreground">업무 규칙 추출은 견고</div>
        </Card>
        <Card className="p-5 border-red-300">
          <div className="text-xs text-muted-foreground mb-1">Technical 차원 평균</div>
          <div className="text-3xl font-semibold text-red-600">{pct(a.btqAvg.technical, 1)}</div>
          <div className="text-xs mt-1 text-red-600 font-medium">핵심 Gap — 정식 구현 최우선</div>
        </Card>
      </section>

      {/* KPI 목표 vs 현재 */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">KPI 달성도 — 목표 vs 현재</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">항목</th>
                <th className="py-2 pr-4 text-right">현재</th>
                <th className="py-2 pr-4 text-right">목표</th>
                <th className="py-2 pr-4 text-right">Gap</th>
                <th className="py-2">개선 방향</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">AI-Ready 통과율</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(a.passRate)}</td>
                <td className="py-2 pr-4 text-right font-mono">&ge;90%</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(a.passRate - 0.9)}</td>
                <td className="py-2 text-xs text-muted-foreground">Technical 4축 주입 + Tacit 인터뷰 보완</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">Completeness 통과율</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(a.byCriterion["completeness"]?.passRate ?? 0)}</td>
                <td className="py-2 pr-4 text-right font-mono">&ge;80%</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct((a.byCriterion["completeness"]?.passRate ?? 0) - 0.8)}</td>
                <td className="py-2 text-xs text-muted-foreground">svc-extraction T/Q 프롬프트 강화</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4 font-medium">Testable 통과율</td>
                <td className="py-2 pr-4 text-right font-mono text-amber-600">{pct(a.byCriterion["testable"]?.passRate ?? 0)}</td>
                <td className="py-2 pr-4 text-right font-mono">&ge;70%</td>
                <td className="py-2 pr-4 text-right font-mono text-amber-600">{pct((a.byCriterion["testable"]?.passRate ?? 0) - 0.7)}</td>
                <td className="py-2 text-xs text-muted-foreground">condition/criteria/outcome 상세화</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-medium">BTQ Technical 평균</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(a.btqAvg.technical)}</td>
                <td className="py-2 pr-4 text-right font-mono">&ge;50%</td>
                <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(a.btqAvg.technical - 0.5)}</td>
                <td className="py-2 text-xs text-muted-foreground">API/테이블/데이터 흐름 구조화 추출</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          현재 수치는 기존 파이프라인(Stage 1-5) 원본 데이터 기준이에요.
          Below의 Before/After 시뮬레이션에서 Technical 4축 주입 시 도달 가능한 수준을 확인하세요.
        </p>
      </Card>

      {/* 6-criterion bar chart */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">6기준별 통과율</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={criterionData} layout="vertical" margin={{ left: 40, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={180} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="passRate" radius={[0, 4, 4, 0]}>
                {criterionData.map((e, i) => (
                  <Cell key={i} fill={colorFor(e.pass)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* BTQ */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">B / T / Q 3차원 (Completeness 세부)</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={btqData} layout="vertical" margin={{ left: 40, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="dim" width={120} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {btqData.map((e, i) => (
                  <Cell key={i} fill={e.value >= 50 ? "#16a34a" : e.value >= 25 ? "#f59e0b" : "#dc2626"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          <strong>해석</strong>: Decode-X 파이프라인은 업무 규칙(Business)은 잘 뽑지만 Technical/Quality 관점은 거의 추출 못함.
          정식 구현에서 svc-extraction 프롬프트를 API/필드/비기능 관점으로 확장하면 pass rate의 대폭 상승 기대.
        </p>
      </Card>

      {/* Top failures */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">실패 원인 랭킹</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">순위</th>
              <th className="py-2 pr-4">기준</th>
              <th className="py-2 pr-4 text-right">미달 건수</th>
              <th className="py-2 text-right">미달 비율</th>
            </tr>
          </thead>
          <tbody>
            {a.topFailures.map((f, i) => (
              <tr key={f.name} className="border-b last:border-0">
                <td className="py-2 pr-4">{i + 1}</td>
                <td className="py-2 pr-4">{CRITERION_LABEL[f.name] ?? f.name}</td>
                <td className="py-2 pr-4 text-right font-mono">{f.count}</td>
                <td className="py-2 text-right font-mono">{pct(f.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Top / Bottom samples */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4">상위 10건 (overall 상위)</h2>
          <SampleTable rows={d.topSamples.slice(0, 10)} />
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4">하위 10건 (overall 하위)</h2>
          <SampleTable rows={d.bottomSamples.slice(0, 10)} />
        </Card>
      </div>

      {/* Before/After comparison (Sprint 207) */}
      <BeforeAfterComparison allScores={d.allScores} aggregate={a} />

      {/* Calibration Note */}
      <Card className="p-5 border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
        <h2 className="text-lg font-semibold mb-2">채점 기준 보정 (Sprint 210)</h2>
        <div className="text-sm space-y-2">
          <p>PoC 데이터 분석 결과 3가지 기준을 현실에 맞게 보정했어요:</p>
          <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
            <li><strong>Testable</strong>: condition/criteria/outcome 최소 길이 20자 → 10자 (한국어 압축성 반영)</li>
            <li><strong>Completeness/Technical</strong>: adapter 가중치 0.30 → 0.20, 텍스트 signal 가중치 강화 (adapter 미존재 현실 반영)</li>
            <li><strong>Completeness/Quality</strong>: trust.score &gt; 0 필수 → trust.level 기반 부분 점수 (backfill 미완 현실 반영)</li>
            <li><strong>Completeness threshold</strong>: 0.67 → 0.50 (3차원 중 B만으로도 의미 있는 수준 인정)</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            정식 구현 시 데이터 품질 개선(Technical 4축 주입 + Tacit 인터뷰)과 함께 threshold 재조정 예정.
          </p>
        </div>
      </Card>

      {/* Next Steps */}
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">정식 구현 로드맵</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-medium mb-2">Phase 1: 데이터 품질 개선</h3>
            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
              <li>svc-extraction 프롬프트에 T/Q 관점 추가</li>
              <li>technicalSpec 4축(APIs/Tables/DataFlows/Errors) 전체 backfill</li>
              <li>Tacit Interview Agent 구현 → SME 암묵지 수집</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-2">Phase 2: 검증 + Handoff</h3>
            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
              <li>AI-Ready 채점 결과 D1 영구 저장</li>
              <li>Handoff 패키지 자동 생성 API</li>
              <li>KPI threshold 재조정 (데이터 개선 후)</li>
            </ul>
          </div>
        </div>
      </Card>

      <footer className="text-xs text-muted-foreground border-t pt-4">
        <p>
          <strong>채점 로직</strong>: services/svc-skill/src/scoring/ai-ready.ts (규칙 기반, LLM 없음) · <strong>엔드포인트</strong>:
          <code className="ml-1">POST /admin/score-ai-ready</code> · <strong>설계 문서</strong>:
          docs/poc/ai-ready-criteria-design.md · <strong>PRD</strong>:
          docs/req-interview/decode-x-deep-dive/prd-final.md (R2 82/100)
        </p>
      </footer>
    </div>
  );
}

/**
 * Before/After comparison — simulates how adapter recovery (Sprint 205)
 * and Technical prompt injection (Sprint 206-207) affect passRate.
 *
 * "Before" = raw data (adapterHit=false for most).
 * "After Adapter" = adapterHit=true → Technical += 0.3 per skill.
 * "After Technical" = additionally, techSpecHit=true → apiHit+dataFieldHit both true.
 */
function BeforeAfterComparison({
  allScores,
  aggregate,
}: {
  allScores: ScoreRow[];
  aggregate: PayloadData["aggregate"];
}) {
  const analysis = useMemo(() => {
    // Simulate "After Adapter": adapterHit becomes true → technical += 0.3
    let afterAdapterPassed = 0;
    // Simulate "After Technical": techSpec present → apiHit=true, dataFieldHit=true, adapterHit=true
    let afterTechPassed = 0;

    const techBefore = aggregate.btqAvg.technical;

    let techAfterAdapterSum = 0;
    let techAfterFullSum = 0;

    for (const row of allScores) {
      const btq = row.criteria.completeness.btq ?? { business: 0, technical: 0, quality: 0 };
      const hadAdapter = Boolean(row.criteria.completeness.signals["adapterHit"]);

      // After Adapter: add 0.3 if no adapter before
      const techAfterAdapter = hadAdapter ? btq.technical : Math.min(1, btq.technical + 0.3);
      const compAfterAdapter = (btq.business + techAfterAdapter + btq.quality) / 3;
      // Recalculate overall: replace completeness score with new value
      const otherSum =
        row.criteria.machineReadable.score +
        row.criteria.semanticConsistency.score +
        row.criteria.testable.score +
        row.criteria.traceable.score +
        row.criteria.humanReviewable.score;
      const overallAfterAdapter = (otherSum + compAfterAdapter) / 6;
      if (overallAfterAdapter >= 0.8) afterAdapterPassed++;
      techAfterAdapterSum += techAfterAdapter;

      // After Technical: apiHit=true(0.35) + dataFieldHit=true(0.35) + adapterHit=true(0.3) = 1.0
      const techAfterFull = 1.0;
      const compAfterFull = (btq.business + techAfterFull + btq.quality) / 3;
      const overallAfterFull = (otherSum + compAfterFull) / 6;
      if (overallAfterFull >= 0.8) afterTechPassed++;
      techAfterFullSum += techAfterFull;
    }

    const n = allScores.length || 1;
    return {
      before: {
        passRate: aggregate.passRate,
        passed: aggregate.passed,
        techAvg: techBefore,
      },
      afterAdapter: {
        passRate: Math.round((afterAdapterPassed / n) * 1000) / 1000,
        passed: afterAdapterPassed,
        techAvg: Math.round((techAfterAdapterSum / n) * 1000) / 1000,
      },
      afterTech: {
        passRate: Math.round((afterTechPassed / n) * 1000) / 1000,
        passed: afterTechPassed,
        techAvg: Math.round((techAfterFullSum / n) * 1000) / 1000,
      },
      total: allScores.length,
    };
  }, [allScores, aggregate]);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold mb-2">Before / After 비교 (Sprint 205-207 효과 시뮬레이션)</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Adapter 복구(S205)와 Technical 프롬프트 주입(S206-207)이 passRate에 미치는 영향을 시뮬레이션해요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">단계</th>
              <th className="py-2 pr-4 text-right">Pass Rate</th>
              <th className="py-2 pr-4 text-right">통과 건수</th>
              <th className="py-2 pr-4 text-right">Technical 평균</th>
              <th className="py-2 text-right">변화</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 pr-4 font-medium">Before (원본)</td>
              <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(analysis.before.passRate)}</td>
              <td className="py-2 pr-4 text-right font-mono">{analysis.before.passed} / {analysis.total}</td>
              <td className="py-2 pr-4 text-right font-mono text-red-600">{pct(analysis.before.techAvg)}</td>
              <td className="py-2 text-right">—</td>
            </tr>
            <tr className="border-b bg-amber-50/50 dark:bg-amber-950/10">
              <td className="py-2 pr-4 font-medium">+ Adapter 복구 <Badge variant="outline" className="text-[10px] ml-1">S205</Badge></td>
              <td className="py-2 pr-4 text-right font-mono text-amber-600">{pct(analysis.afterAdapter.passRate)}</td>
              <td className="py-2 pr-4 text-right font-mono">{analysis.afterAdapter.passed} / {analysis.total}</td>
              <td className="py-2 pr-4 text-right font-mono text-amber-600">{pct(analysis.afterAdapter.techAvg)}</td>
              <td className="py-2 text-right text-emerald-600 font-medium">
                +{pct(analysis.afterAdapter.passRate - analysis.before.passRate)}
              </td>
            </tr>
            <tr className="bg-emerald-50/50 dark:bg-emerald-950/10">
              <td className="py-2 pr-4 font-medium">+ Technical 4축 <Badge variant="outline" className="text-[10px] ml-1">S206-207</Badge></td>
              <td className="py-2 pr-4 text-right font-mono text-emerald-600">{pct(analysis.afterTech.passRate)}</td>
              <td className="py-2 pr-4 text-right font-mono">{analysis.afterTech.passed} / {analysis.total}</td>
              <td className="py-2 pr-4 text-right font-mono text-emerald-600">{pct(analysis.afterTech.techAvg)}</td>
              <td className="py-2 text-right text-emerald-600 font-medium">
                +{pct(analysis.afterTech.passRate - analysis.before.passRate)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        시뮬레이션은 기존 채점 로직에서 <code>adapterHit</code>/<code>techSpecHit</code> signal만 변경한 결과예요.
        실제 재채점은 <code>POST /admin/score-ai-ready</code>로 수행해요.
      </p>
    </Card>
  );
}

function SampleTable({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-2">skillId</th>
            <th className="py-2 pr-2 text-right">Overall</th>
            <th className="py-2 pr-2 text-right">MR</th>
            <th className="py-2 pr-2 text-right">SC</th>
            <th className="py-2 pr-2 text-right">T</th>
            <th className="py-2 pr-2 text-right">TR</th>
            <th className="py-2 pr-2 text-right">C</th>
            <th className="py-2 pr-2 text-right">HR</th>
            <th className="py-2 text-right">Pass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skillId} className="border-b last:border-0">
              <td className="py-1 pr-2">
                <Link to={`/poc/ai-ready/${r.skillId}`} className="text-primary hover:underline">
                  {r.skillId.slice(0, 8)}…
                </Link>
              </td>
              <td className="py-1 pr-2 text-right">{r.overall.toFixed(3)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.machineReadable.score.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.semanticConsistency.score.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.testable.score.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.traceable.score.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.completeness.score.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{r.criteria.humanReviewable.score.toFixed(2)}</td>
              <td className="py-1 text-right">
                {r.passAiReady ? <span className="text-emerald-600">✓</span> : <span className="text-red-600">✗</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
