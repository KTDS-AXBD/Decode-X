import { useEffect, useState, useMemo } from "react";
import {
  BookOpen,
  Link2,
  Database,
  GitBranch,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fetchDomainReport } from "@/api/analysis";
import { fetchDocuments } from "@/api/ingestion";
import type { DocumentRow } from "@/api/ingestion";
import type { DomainReport, AggregatedProcess } from "@ai-foundry/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import { MetricCard } from "./MetricCard";
import { SeverityBadge } from "./SeverityBadge";
import { CrossOrgComparisonTab } from "./CrossOrgComparisonTab";

export function DomainReportView() {
  const { organizationId } = useOrganization();
  const [report, setReport] = useState<DomainReport | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [innerTab, setInnerTab] = useState("findings");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchDomainReport(organizationId),
      fetchDocuments(organizationId),
    ])
      .then(([reportRes, docRes]) => {
        if (reportRes.success) setReport(reportRes.data);
        else toast.error("도메인 리포트 로드 실패: " + reportRes.error.message);
        if (docRes.success) setDocuments(docRes.data.documents);
      })
      .catch(() => toast.error("API 호출 실패"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const docNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      map.set(doc.document_id, doc.original_name);
    }
    return map;
  }, [documents]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!report || report.analyzedDocumentCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Database className="w-12 h-12" style={{ color: "var(--text-secondary)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          분석 완료된 문서가 없습니다. 문서 선별 탭에서 분석을 실행하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          도메인 리포트
        </h2>
        <Badge variant="outline" className="text-xs">
          {organizationId}
        </Badge>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {report.analyzedDocumentCount}건 문서 분석 기반
          {report.lastAnalyzedAt && (
            <> · 최근 분석: {new Date(report.lastAnalyzedAt).toLocaleDateString("ko-KR")}</>
          )}
        </span>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard icon={BookOpen} label="규칙" count={report.counts.rules} color="#EF4444" />
        <MetricCard icon={Link2} label="관계" count={report.counts.relationships} color="#8B5CF6" />
        <MetricCard icon={Database} label="엔티티" count={report.counts.entities} color="#3B82F6" />
        <MetricCard icon={GitBranch} label="프로세스" count={report.counts.processes} color="#22C55E" />
        <MetricCard icon={AlertTriangle} label="발견사항" count={report.findingsSummary.total} color="#F59E0B" />
      </div>

      {/* Severity Summary */}
      <div
        className="flex items-center gap-4 px-4 py-2 rounded-lg border text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        <span>발견사항 분포:</span>
        <span style={{ color: "#EF4444" }}>Critical {report.findingsSummary.bySeverity.critical}</span>
        <span>|</span>
        <span style={{ color: "#F59E0B" }}>Warning {report.findingsSummary.bySeverity.warning}</span>
        <span>|</span>
        <span style={{ color: "#3B82F6" }}>Info {report.findingsSummary.bySeverity.info}</span>
      </div>

      {/* Inner Tabs */}
      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList>
          <TabsTrigger value="findings">핵심 발견사항</TabsTrigger>
          <TabsTrigger value="processes">데이터·정책 맵</TabsTrigger>
          <TabsTrigger value="comparison">조직 비교</TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="mt-4">
          <TopFindingsSection
            findings={report.topFindings}
            docNameMap={docNameMap}
          />
        </TabsContent>

        <TabsContent value="processes" className="mt-4">
          <CoreProcessesSection
            processes={report.coreProcesses}
            docNameMap={docNameMap}
          />
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          <CrossOrgComparisonTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Top Findings Section ─────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  missing: "누락",
  duplicate: "중복",
  overspec: "오버스펙",
  inconsistency: "불일치",
};

interface TopFinding {
  findingId: string;
  documentId: string;
  type: string;
  severity: string;
  finding: string;
  evidence: string;
  recommendation: string;
  relatedProcesses: string[];
  confidence: number;
  hitlStatus: string;
}

function TopFindingsSection({
  findings,
  docNameMap,
}: {
  findings: TopFinding[];
  docNameMap: Map<string, string>;
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = findings;
    if (typeFilter !== "all") items = items.filter((f) => f.type === typeFilter);
    if (severityFilter !== "all") items = items.filter((f) => f.severity === severityFilter);
    return items;
  }, [findings, typeFilter, severityFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="missing">누락</SelectItem>
            <SelectItem value="duplicate">중복</SelectItem>
            <SelectItem value="overspec">오버스펙</SelectItem>
            <SelectItem value="inconsistency">불일치</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue placeholder="심각도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 심각도</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
          {filtered.length}건 표시 (전체 {findings.length}건)
        </span>
      </div>

      <div className="space-y-2">
        {filtered.map((f) => {
          const isExpanded = expandedId === f.findingId;
          const docName = docNameMap.get(f.documentId) ?? f.documentId.slice(0, 16);

          return (
            <div
              key={f.findingId}
              className="border rounded-lg p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="flex items-start gap-2 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : f.findingId)}
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[f.type] ?? f.type}
                    </Badge>
                    <SeverityBadge severity={f.severity} />
                    <HitlStatusBadge status={f.hitlStatus} />
                    <a
                      href={`/analysis-report?view=detail&doc=${f.documentId}`}
                      className="text-xs hover:underline flex items-center gap-0.5"
                      style={{ color: "#3B82F6" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {docName.length > 24 ? docName.slice(0, 24) + "…" : docName}
                    </a>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {f.finding}
                  </p>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    신뢰도: {(f.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <button className="p-1 shrink-0">
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                  }
                </button>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      근거
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{f.evidence}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                      권고
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{f.recommendation}</p>
                  </div>
                  {f.relatedProcesses.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.relatedProcesses.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
            해당 조건에 맞는 발견사항이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ── HITL Status Badge ────────────────────────────────────────────────

function HitlStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    accepted: "#22C55E",
    rejected: "#EF4444",
    modified: "#F59E0B",
    pending: "#9CA3AF",
  };
  const color = colors[status] ?? "#9CA3AF";
  return (
    <Badge
      variant="outline"
      className="text-xs"
      style={{ borderColor: color, color }}
    >
      {status}
    </Badge>
  );
}

// ── Core Processes Section ───────────────────────────────────────────

function CoreProcessesSection({
  processes,
  docNameMap,
}: {
  processes: AggregatedProcess[];
  docNameMap: Map<string, string>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const displayed = showAll ? processes : processes.filter((p) => p.isCore);

  const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
    mega: { bg: "rgba(239, 68, 68, 0.15)", text: "#EF4444" },
    core: { bg: "rgba(59, 130, 246, 0.15)", text: "#3B82F6" },
    supporting: { bg: "rgba(34, 197, 94, 0.15)", text: "#22C55E" },
    peripheral: { bg: "rgba(107, 114, 128, 0.15)", text: "#6B7280" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {showAll ? "전체" : "핵심"} 프로세스 ({displayed.length}건)
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "핵심만 보기" : `전체 보기 (${processes.length})`}
        </Button>
      </div>

      <div className="border rounded-lg" style={{ borderColor: "var(--border)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>프로세스명</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>중요도</TableHead>
              <TableHead>문서 수</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((proc) => {
              const catStyle = CATEGORY_COLORS[proc.category] ?? CATEGORY_COLORS["peripheral"];
              if (!catStyle) return null;
              const isExpanded = expandedName === proc.name;

              return (
                <TableRow
                  key={proc.name}
                  className="cursor-pointer"
                  onClick={() => setExpandedName(isExpanded ? null : proc.name)}
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {proc.isCore && <Star className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />}
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {proc.name}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {proc.sourceDocumentIds.map((id) => (
                          <a
                            key={id}
                            href={`/analysis-report?view=detail&doc=${id}`}
                            className="text-xs hover:underline"
                            style={{ color: "#3B82F6" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(docNameMap.get(id) ?? id).slice(0, 20)}
                          </a>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{ backgroundColor: catStyle.bg, color: catStyle.text, borderColor: catStyle.text }}
                    >
                      {proc.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${proc.avgImportanceScore * 60}px`,
                          backgroundColor: proc.avgImportanceScore >= 0.7 ? "#EF4444" : proc.avgImportanceScore >= 0.4 ? "#F59E0B" : "#6B7280",
                        }}
                      />
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {proc.avgImportanceScore.toFixed(2)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {proc.documentCount}
                  </TableCell>
                  <TableCell>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
                      : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
                    }
                  </TableCell>
                </TableRow>
              );
            })}
            {displayed.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8"
                  style={{ color: "var(--text-secondary)" }}
                >
                  프로세스 데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
