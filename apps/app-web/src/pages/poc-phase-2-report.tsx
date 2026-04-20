import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Activity, Database, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  phase2Metrics,
  trackAFill,
  scenarioResults,
  unsupportedDomains,
  sourceFirstMarkers,
} from "@/data/poc-phase-2-report-data";

const FAIL_REASON_LABEL: Record<string, string> = {
  WRONG_OUTCOME:          "결과 방향 불일치",
  WRONG_VALUE:            "값 불일치",
  UNEXPECTED_ERROR:       "예상치 못한 에러",
  EXPECTED_ERROR_MISSING: "에러 미발생",
  UNSUPPORTED_WHEN:       "미구현 서비스",
};

function KpiGauge({ rate, kpiMet }: { rate: number; kpiMet: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-5xl font-bold tabular-nums ${kpiMet ? "text-green-500" : "text-red-500"}`}>
        {rate}%
      </div>
      <Badge variant={kpiMet ? "default" : "destructive"} className="text-xs">
        {kpiMet ? "✓ KPI 달성 (≥90%)" : "✗ KPI 미달 (<90%)"}
      </Badge>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function TrackAGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {trackAFill.map((s) => (
        <Card key={s.service} className={`p-3 flex flex-col gap-1 ${s.implemented ? "border-green-500/40" : "border-muted"}`}>
          <div className="flex items-center gap-2">
            {s.implemented
              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            }
            <span className="text-sm font-medium">{s.label}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Spec Fill {s.fillPercent}%
            {!s.implemented && <span className="ml-1 text-yellow-600"> (미검증)</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ScenarioTable() {
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");
  const shown = scenarioResults.filter((r) =>
    filter === "all" ? true : filter === "pass" ? r.passed : !r.passed
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["all", "pass", "fail"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {f === "all" ? "전체" : f === "pass" ? "통과" : "실패"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 font-medium text-muted-foreground">시나리오 ID</th>
              <th className="text-left p-2 font-medium text-muted-foreground">이름</th>
              <th className="text-left p-2 font-medium text-muted-foreground">파일</th>
              <th className="text-left p-2 font-medium text-muted-foreground">결과</th>
              <th className="text-left p-2 font-medium text-muted-foreground">원인</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.scenarioId} className="hover:bg-muted/20 transition-colors">
                <td className="p-2 font-mono text-xs text-muted-foreground">{r.scenarioId}</td>
                <td className="p-2 max-w-xs text-xs">{r.scenarioName}</td>
                <td className="p-2 font-mono text-xs text-muted-foreground">{r.contractFile}</td>
                <td className="p-2">
                  {r.passed
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />
                  }
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {r.failReason ? (
                    <div>
                      <Badge variant="outline" className="text-xs mb-1">
                        {FAIL_REASON_LABEL[r.failReason] ?? r.failReason}
                      </Badge>
                      {r.failDetail && <div className="mt-1 text-destructive">{r.failDetail}</div>}
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceFirstSection() {
  const { summary } = sourceFirstMarkers;
  const markerColors = {
    SOURCE_MISSING: "text-red-500",
    DOC_ONLY: "text-yellow-500",
    DIVERGENCE: "text-orange-500",
  } as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(["SOURCE_MISSING", "DOC_ONLY", "DIVERGENCE"] as const).map((k) => (
          <Card key={k} className="p-4">
            <div className={`text-2xl font-bold tabular-nums ${markerColors[k]}`}>{summary[k]}</div>
            <div className="text-xs text-muted-foreground mt-1">{k}</div>
          </Card>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Source-First 원칙: 소스코드(원장) &gt; 문서(참고). 마커는 spec과 소스 간 불일치 신호.
        TC-REFUND-002 실패가 SOURCE_MISSING 케이스 (BL-024 기간 체크 코드 미존재).
      </div>
    </div>
  );
}

export default function PocPhase2ReportPage() {
  const unsupportedTotal = unsupportedDomains.reduce((s, d) => s + d.scenarios, 0);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Hero */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Phase 2 — Working Prototype 동작 검증 리포트</h1>
        <p className="text-sm text-muted-foreground">
          AIF-REQ-035 Sprint 216 | {phase2Metrics.generatedAt.slice(0, 10)} |
          목표: Foundry-X 핸드오프 E2E 첫 사례
        </p>
      </div>

      {/* KPI Banner */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <Activity className="w-6 h-6 text-muted-foreground mb-1" />
            <div className="text-xs text-muted-foreground">구현 서비스 일치율 (KPI)</div>
            <KpiGauge rate={phase2Metrics.implementedRate} kpiMet={phase2Metrics.kpiMet} />
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
            <MetricCard
              label="구현 시나리오"
              value={`${phase2Metrics.implementedPassed} / ${phase2Metrics.implementedTotal}`}
              sub="통과 / 전체"
            />
            <MetricCard
              label="전체 시나리오"
              value={phase2Metrics.total}
              sub={`미구현 ${phase2Metrics.unsupportedCount}건 포함`}
            />
            <MetricCard
              label="미구현 서비스"
              value={unsupportedTotal}
              sub="budget/charge/purchase"
            />
            <MetricCard
              label="구현 서비스"
              value="2/7"
              sub="결제 + 환불"
            />
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="track-b">
        <TabsList>
          <TabsTrigger value="track-b">
            <BarChart3 className="w-4 h-4 mr-1" />
            Track B — Round-trip
          </TabsTrigger>
          <TabsTrigger value="track-a">
            <Database className="w-4 h-4 mr-1" />
            Track A — Spec Fill
          </TabsTrigger>
          <TabsTrigger value="source-first">Source-First 마커</TabsTrigger>
        </TabsList>

        <TabsContent value="track-b" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">시나리오 결과 (구현 서비스 12건)</div>
            <Badge variant="outline" className="text-green-600 border-green-600">
              {phase2Metrics.implementedPassed} Pass
            </Badge>
            <Badge variant="outline" className="text-red-600 border-red-600">
              {phase2Metrics.implementedTotal - phase2Metrics.implementedPassed} Fail
            </Badge>
          </div>
          <ScenarioTable />

          <Card className="p-4 bg-muted/30">
            <div className="text-xs font-medium mb-2">미구현 서비스 (UNSUPPORTED_WHEN)</div>
            <div className="grid grid-cols-3 gap-2">
              {unsupportedDomains.map((d) => (
                <div key={d.domain} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" />
                  <span>{d.label} ({d.scenarios}건)</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="track-a" className="mt-4 space-y-4">
          <div className="text-sm text-muted-foreground">
            Tier-A 7개 서비스 Spec Container Fill 현황. 구현(Working Prototype)과 무관하게
            Spec Container는 모두 100% 완성 상태예요.
          </div>
          <TrackAGrid />
        </TabsContent>

        <TabsContent value="source-first" className="mt-4">
          <SourceFirstSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
