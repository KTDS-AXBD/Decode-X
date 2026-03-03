import { useState, useMemo } from "react";
import { AlertTriangle, AlertCircle, Info, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DiagnosisResult, DiagnosisFinding } from "@ai-foundry/types";
import { MetricCard } from "./MetricCard";
import { FindingCard } from "./FindingCard";

interface DiagnosticFindingsTabProps {
  data: DiagnosisResult | null;
  loading: boolean;
  documentId: string;
  onRefresh?: () => void;
  onTriggerAnalysis?: () => void;
  triggering?: boolean;
}

type SeverityFilter = "all" | "critical" | "warning" | "info";
type TypeFilter = "all" | "missing" | "duplicate" | "overspec" | "inconsistency";

export function DiagnosticFindingsTab({
  data,
  loading,
  documentId,
  onRefresh,
  onTriggerAnalysis,
  triggering,
}: DiagnosticFindingsTabProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filtered: DiagnosisFinding[] = useMemo(() => {
    if (!data) return [];
    return data.findings.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      return true;
    });
  }, [data, severityFilter, typeFilter]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          진단 소견 데이터가 없습니다.
        </p>
        {onTriggerAnalysis && (
          <Button onClick={onTriggerAnalysis} disabled={triggering} size="sm">
            {triggering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            분석 실행
          </Button>
        )}
      </div>
    );
  }

  const severityButtons: { key: SeverityFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "critical", label: "Critical" },
    { key: "warning", label: "Warning" },
    { key: "info", label: "Info" },
  ];

  const typeButtons: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "missing", label: "누락" },
    { key: "duplicate", label: "중복" },
    { key: "overspec", label: "오버스펙" },
    { key: "inconsistency", label: "불일치" },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard icon={AlertTriangle} label="Critical" count={data.summary.bySeverity.critical} color="#EF4444" />
        <MetricCard icon={AlertCircle} label="Warning" count={data.summary.bySeverity.warning} color="#F59E0B" />
        <MetricCard icon={Info} label="Info" count={data.summary.bySeverity.info} color="#3B82F6" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold mr-1" style={{ color: "var(--text-secondary)" }}>심각도:</span>
          {severityButtons.map((btn) => (
            <Button
              key={btn.key}
              size="sm"
              variant={severityFilter === btn.key ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => setSeverityFilter(btn.key)}
            >
              {btn.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold mr-1" style={{ color: "var(--text-secondary)" }}>유형:</span>
          {typeButtons.map((btn) => (
            <Button
              key={btn.key}
              size="sm"
              variant={typeFilter === btn.key ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => setTypeFilter(btn.key)}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Findings list */}
      <div className="space-y-3">
        {filtered.map((f) => (
          <FindingCard
            key={f.findingId}
            finding={f}
            documentId={documentId}
            onReviewComplete={onRefresh}
          />
        ))}
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: "var(--text-secondary)" }}>
            해당 필터에 맞는 소견이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
