import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import raw from "../../../../docs/poc/ai-ready-score-lpon-raw.json";

// ── Data shape ────────────────────────────────────────────────────────
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
    completeness: CriterionScore & {
      btq?: { business: number; technical: number; quality: number };
    };
    humanReviewable: CriterionScore;
  };
  failedCriteria: string[];
}
interface Payload {
  data: {
    allScores: ScoreRow[];
  };
}

const CRITERION_LABEL: Record<string, string> = {
  machineReadable: "Machine-readable",
  semanticConsistency: "Semantic Consistency",
  testable: "Testable",
  traceable: "Traceable",
  completeness: "Completeness (B+T+Q)",
  humanReviewable: "Human-reviewable",
};

const THRESHOLD: Record<string, number> = {
  machineReadable: 0.9,
  semanticConsistency: 0.7,
  testable: 0.7,
  traceable: 0.8,
  completeness: 0.67,
  humanReviewable: 0.6,
};

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function scoreColor(score: number, threshold: number): string {
  return score >= threshold ? "text-emerald-600" : "text-red-600";
}

export default function PocAiReadyDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const payload = raw as Payload;

  const row = useMemo(() => {
    if (!skillId) return null;
    return payload.data.allScores.find((s) => s.skillId === skillId) ?? null;
  }, [skillId, payload.data.allScores]);

  if (!row) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/poc/ai-ready")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> AI-Ready 리포트로 돌아가기
        </Button>
        <Card>
          <CardContent className="p-16 text-center">
            <p className="text-muted-foreground">
              Skill ID <code>{skillId}</code>를 찾을 수 없어요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const btq = row.criteria.completeness.btq ?? { business: 0, technical: 0, quality: 0 };
  const signals = row.criteria.completeness.signals;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/poc/ai-ready")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">AIF-REQ-034</Badge>
            <Badge variant={row.passAiReady ? "default" : "destructive"}>
              {row.passAiReady ? "AI-Ready PASS" : "AI-Ready FAIL"}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold mt-1">
            Skill Drill-down: <code className="text-base">{row.skillId.slice(0, 12)}…</code>
          </h1>
          <p className="text-sm text-muted-foreground">
            Domain: {row.domain} · Overall: {row.overall.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Overall score bar */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Score</span>
          <span className={`text-lg font-bold ${row.overall >= 0.8 ? "text-emerald-600" : "text-red-600"}`}>
            {pct(row.overall)}
          </span>
        </div>
        <Progress value={row.overall * 100} className="h-3" />
        {row.failedCriteria.length > 0 && (
          <p className="text-xs text-red-600 mt-2">
            Failed: {row.failedCriteria.map((f) => CRITERION_LABEL[f] ?? f).join(", ")}
          </p>
        )}
      </Card>

      {/* 3-Tab drill-down */}
      <Tabs defaultValue="business">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
        </TabsList>

        {/* ── Business Tab ── */}
        <TabsContent value="business" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business 차원 점수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Business Score</span>
                <span className={`text-2xl font-bold ${btq.business >= 0.5 ? "text-emerald-600" : "text-red-600"}`}>
                  {pct(btq.business)}
                </span>
              </div>
              <Progress value={btq.business * 100} className="h-2" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <SignalCard label="규칙 추출" signal="hasRules" value={btq.business >= 0.5} />
                <SignalCard label="도메인 키워드" signal="domainHit" value={Boolean(signals["business"])} />
                <SignalCard label="수치 기준" signal="numericHit" value={btq.business >= 0.75} />
              </div>
            </CardContent>
          </Card>

          {/* Related criterion scores */}
          <CriterionCard name="testable" criterion={row.criteria.testable} />
          <CriterionCard name="traceable" criterion={row.criteria.traceable} />
        </TabsContent>

        {/* ── Technical Tab ── */}
        <TabsContent value="technical" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Technical 차원 점수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Technical Score</span>
                <span className={`text-2xl font-bold ${btq.technical >= 0.5 ? "text-emerald-600" : "text-red-600"}`}>
                  {pct(btq.technical)}
                </span>
              </div>
              <Progress value={btq.technical * 100} className="h-2" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <SignalCard
                  label="API 패턴"
                  signal="apiHit"
                  value={Boolean(signals["apiHit"])}
                />
                <SignalCard
                  label="데이터 필드"
                  signal="dataFieldHit"
                  value={Boolean(signals["dataFieldHit"])}
                />
                <SignalCard
                  label="어댑터 존재"
                  signal="adapterHit"
                  value={Boolean(signals["adapterHit"])}
                />
              </div>
              {!signals["adapterHit"] && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded">
                  MCP/OpenAPI 어댑터가 없으면 Technical 점수에서 0.3점 손실이에요.
                  Sprint 205에서 adapter 생성을 복구하면 이 gap이 해소돼요.
                </p>
              )}
              {!signals["techSpecHit"] && (
                <p className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 p-3 rounded">
                  technicalSpec 필드(APIs/Tables/DataFlows/Errors)가 비어 있어요.
                  svc-extraction의 Technical 4축 프롬프트가 데이터를 추출하면 apiHit/dataFieldHit이 올라가요.
                </p>
              )}
            </CardContent>
          </Card>

          <CriterionCard name="machineReadable" criterion={row.criteria.machineReadable} />
          <CriterionCard name="completeness" criterion={row.criteria.completeness} />
        </TabsContent>

        {/* ── Quality Tab ── */}
        <TabsContent value="quality" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quality 차원 점수</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Quality Score</span>
                <span className={`text-2xl font-bold ${btq.quality >= 0.5 ? "text-emerald-600" : "text-red-600"}`}>
                  {pct(btq.quality)}
                </span>
              </div>
              <Progress value={btq.quality * 100} className="h-2" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <SignalCard
                  label="품질 키워드"
                  signal="qualityKwHit"
                  value={Boolean(signals["qualityKwHit"])}
                />
                <SignalCard
                  label="신뢰 점수"
                  signal="trustScoreOk"
                  value={Boolean(signals["trustScoreOk"])}
                />
                <SignalCard
                  label="출처 발췌"
                  signal="excerptOk"
                  value={(btq.quality) >= 0.7}
                />
              </div>
            </CardContent>
          </Card>

          <CriterionCard name="humanReviewable" criterion={row.criteria.humanReviewable} />
          <CriterionCard name="semanticConsistency" criterion={row.criteria.semanticConsistency} />
        </TabsContent>
      </Tabs>

      {/* Full 6-criterion summary */}
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-3">6기준 점수 요약</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.keys(CRITERION_LABEL) as Array<keyof typeof row.criteria>).map((key) => {
            const c = row.criteria[key];
            const th = THRESHOLD[key] ?? 0.5;
            return (
              <div key={key} className="text-center p-3 rounded bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">
                  {CRITERION_LABEL[key]}
                </div>
                <div className={`text-lg font-bold ${scoreColor(c.score, th)}`}>
                  {pct(c.score)}
                </div>
                <Badge variant={c.pass ? "default" : "destructive"} className="text-[10px] mt-1">
                  {c.pass ? "PASS" : "FAIL"}
                </Badge>
              </div>
            );
          })}
        </div>
      </Card>

      <footer className="text-xs text-muted-foreground border-t pt-4">
        <Link to="/poc/ai-ready" className="text-primary hover:underline">
          ← AI-Ready 리포트 전체 보기
        </Link>
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function SignalCard({ label, signal, value }: { label: string; signal: string; value: boolean }) {
  return (
    <div className={`p-3 rounded border ${value ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:bg-red-950/20"}`}>
      <div className="text-xs text-muted-foreground">{signal}</div>
      <div className={`font-medium ${value ? "text-emerald-600" : "text-red-600"}`}>
        {label}: {value ? "YES" : "NO"}
      </div>
    </div>
  );
}

function CriterionCard({ name, criterion }: { name: string; criterion: CriterionScore }) {
  const th = THRESHOLD[name] ?? 0.5;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{CRITERION_LABEL[name] ?? name}</span>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${scoreColor(criterion.score, th)}`}>
              {pct(criterion.score)}
            </span>
            <Badge variant={criterion.pass ? "default" : "destructive"} className="text-[10px]">
              {criterion.pass ? "PASS" : "FAIL"}
            </Badge>
          </div>
        </div>
        <Progress value={criterion.score * 100} className="h-1.5 mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {Object.entries(criterion.signals).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between bg-muted/30 px-2 py-1 rounded">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono">
                {typeof v === "boolean" ? (v ? "true" : "false") : String(v)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
