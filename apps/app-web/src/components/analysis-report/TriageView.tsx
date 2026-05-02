import { useEffect, useState, useMemo, useCallback } from "react";
import {
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Loader2,
  Play,
  XCircle,
  Filter,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fetchTriage, batchAnalyze } from "@/api/analysis";
import { fetchDocuments } from "@/api/ingestion";
import type { DocumentRow } from "@/api/ingestion";
import type { TriageDocument, TriageResponse, ZipChunkSummary } from "@ai-foundry/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import { MetricCard } from "./MetricCard";

type SortKey = "triageScore" | "ruleCount" | "relationshipCount" | "entityCount" | "processCount";
type StatusFilter = "all" | "completed" | "not_analyzed";
type RankFilter = "all" | "high" | "medium" | "low";

export function TriageView() {
  const { organizationId } = useOrganization();

  const [triageData, setTriageData] = useState<TriageResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sort / Filter
  const [sortKey, setSortKey] = useState<SortKey>("triageScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rankFilter, setRankFilter] = useState<RankFilter>("all");

  // Load data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchTriage(organizationId),
      fetchDocuments(organizationId),
    ])
      .then(([triageRes, docRes]) => {
        if (triageRes.success) setTriageData(triageRes.data);
        else toast.error("Triage 로드 실패: " + triageRes.error.message);

        if (docRes.success) setDocuments(docRes.data.documents);
        else toast.error("문서 목록 로드 실패: " + docRes.error.message);
      })
      .catch(() => toast.error("API 호출 실패"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  // Document name lookup
  const docNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      map.set(doc.document_id, doc.original_name);
    }
    return map;
  }, [documents]);

  // Filtered + Sorted items
  const filteredDocs = useMemo(() => {
    if (!triageData) return [];
    let items = [...triageData.documents];

    if (statusFilter === "completed") {
      items = items.filter((d) => d.analysisStatus === "completed");
    } else if (statusFilter === "not_analyzed") {
      items = items.filter((d) => d.analysisStatus === null);
    }

    if (rankFilter !== "all") {
      items = items.filter((d) => d.triageRank === rankFilter);
    }

    items.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? av - bv : bv - av;
    });

    return items;
  }, [triageData, statusFilter, rankFilter, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function toggleSelect(docId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function handleSelectHigh() {
    if (!triageData) return;
    const highUnanalyzed = triageData.documents.filter(
      (d) => d.triageScore >= 0.6 && d.analysisStatus === null,
    );
    setSelectedIds(new Set(highUnanalyzed.map((d) => d.documentId)));
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
  }

  const handleBatchAnalyze = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await batchAnalyze(organizationId, {
        documentIds: [...selectedIds],
        organizationId,
      });
      if (res.success) {
        toast.success(
          `${res.data.submitted}건 분석 요청됨` +
            (res.data.skipped > 0 ? ` (${res.data.skipped}건 이미 완료)` : ""),
        );
        setSelectedIds(new Set());
        // Refresh triage data
        const refreshed = await fetchTriage(organizationId);
        if (refreshed.success) setTriageData(refreshed.data);
      } else {
        toast.error("일괄 분석 실패: " + res.error.message);
      }
    } catch {
      toast.error("일괄 분석 API 호출 실패");
    } finally {
      setSubmitting(false);
    }
  }, [organizationId, selectedIds]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!triageData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <FileSearch className="w-12 h-12" style={{ color: "var(--text-secondary)" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          추출 완료된 문서가 없습니다.
        </p>
      </div>
    );
  }

  const { summary } = triageData;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={FileSearch} label="전체 문서" count={summary.total} color="#6B7280" />
        <MetricCard icon={CheckCircle2} label="분석 완료" count={summary.analyzed} color="#22C55E" />
        <MetricCard icon={AlertTriangle} label="High 우선순위" count={summary.highPriority} color="#EF4444" />
        <MetricCard icon={Clock} label="미분석" count={summary.notAnalyzed} color="#F59E0B" />
      </div>

      {/* Action Bar */}
      <div
        className="flex flex-wrap items-center gap-3 p-3 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Button variant="outline" size="sm" onClick={handleSelectHigh}>
          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
          High 자동선택
        </Button>
        <Button
          size="sm"
          disabled={selectedIds.size === 0 || submitting}
          onClick={() => void handleBatchAnalyze()}
        >
          {submitting ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          선택({selectedIds.size})건 분석 실행
        </Button>
        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearSelection}>
            <XCircle className="w-3.5 h-3.5 mr-1" />
            선택 해제
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Filter className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="completed">분석 완료</SelectItem>
              <SelectItem value="not_analyzed">미분석</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rankFilter} onValueChange={(v) => setRankFilter(v as RankFilter)}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 랭크</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Triage Table */}
      <div className="border rounded-lg" style={{ borderColor: "var(--border)" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-10" />
              <TableHead>문서명</TableHead>
              <SortableHead label="규칙" sortKey="ruleCount" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHead label="관계" sortKey="relationshipCount" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHead label="엔티티" sortKey="entityCount" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHead label="프로세스" sortKey="processCount" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHead label="스코어" sortKey="triageScore" current={sortKey} asc={sortAsc} onSort={handleSort} />
              <TableHead>분석 상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocs.map((doc) => (
              <TriageRow
                key={doc.documentId}
                doc={doc}
                docName={docNameMap.get(doc.documentId) ?? doc.documentId.slice(0, 12)}
                selected={selectedIds.has(doc.documentId)}
                onToggle={() => toggleSelect(doc.documentId)}
              />
            ))}
            {filteredDocs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12"
                  style={{ color: "var(--text-secondary)" }}
                >
                  해당 조건에 맞는 문서가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Sortable Header ──────────────────────────────────────────────────

function SortableHead({
  label,
  sortKey: key,
  current,
  asc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = current === key;
  return (
    <TableHead
      className="cursor-pointer select-none"
      onClick={() => onSort(key)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className="w-3 h-3"
          style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)", opacity: active ? 1 : 0.5 }}
        />
        {active && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {asc ? "↑" : "↓"}
          </span>
        )}
      </div>
    </TableHead>
  );
}

// ── Triage Row ───────────────────────────────────────────────────────

const RANK_COLORS: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#6B7280",
};

const SEVERITY_COLOR: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH: "#EF4444",
  MEDIUM: "#F59E0B",
  LOW: "#6B7280",
};

function TriageRow({
  doc,
  docName,
  selected,
  onToggle,
}: {
  doc: TriageDocument;
  docName: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rankColor = RANK_COLORS[doc.triageRank] ?? "#6B7280";
  const isZip = doc.chunkSummary !== undefined;
  const partial = doc.partialExtraction;

  return (
    <>
      <TableRow className={selected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
        <TableCell className="w-8 px-2">
          {isZip && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle details"
            >
              <ChevronRight
                className="w-3 h-3 transition-transform"
                style={{ transform: expanded ? "rotate(90deg)" : undefined, color: "var(--text-secondary)" }}
              />
            </button>
          )}
        </TableCell>
        <TableCell>
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={`/analysis-report?view=detail&doc=${doc.documentId}`}
              className="text-sm font-medium hover:underline truncate block max-w-[240px]"
              style={{ color: "var(--text-primary)" }}
              title={docName}
            >
              {docName}
            </a>
            {doc.isLibOnly && (
              <Badge variant="secondary" className="text-[10px] shrink-0">라이브러리</Badge>
            )}
            {partial && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0"
                style={{ borderColor: SEVERITY_COLOR[partial.severity], color: SEVERITY_COLOR[partial.severity] }}
                title={partial.reasons.join(", ")}
              >
                부분 {Math.round(partial.rate * 100)}%
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-sm tabular-nums">{doc.ruleCount}</TableCell>
        <TableCell className="text-sm tabular-nums">{doc.relationshipCount}</TableCell>
        <TableCell className="text-sm tabular-nums">{doc.entityCount}</TableCell>
        <TableCell className="text-sm tabular-nums">{doc.processCount}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: rankColor }}
            />
            <span className="text-sm tabular-nums font-medium" style={{ color: rankColor }}>
              {doc.triageScore.toFixed(2)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          {doc.analysisStatus === "completed" ? (
            <Badge variant="outline" className="text-xs" style={{ borderColor: "#22C55E", color: "#22C55E" }}>
              완료
            </Badge>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              — 미분석
            </span>
          )}
        </TableCell>
      </TableRow>
      {expanded && doc.chunkSummary && <ZipMatrixSubRow summary={doc.chunkSummary} />}
    </>
  );
}

function ZipMatrixSubRow({ summary }: { summary: ZipChunkSummary }) {
  return (
    <TableRow>
      <TableCell colSpan={9} className="bg-slate-50 dark:bg-slate-900/30 px-10 py-3">
        <div className="flex flex-wrap gap-4 text-xs">
          <ZipMetric label="Controller" value={summary.controllerCount} />
          <ZipMetric label="Endpoint" value={summary.endpointCount} highlight />
          <ZipMetric label="DataModel" value={summary.dataModelCount} />
          <ZipMetric label="Transaction" value={summary.transactionCount} highlight />
          <ZipMetric label="DDL Table" value={summary.ddlTableCount} />
          <ZipMetric label="MyBatis" value={summary.mapperCount} />
          {summary.extractionRate !== undefined && (
            <ZipMetric label="추출률" value={`${Math.round(summary.extractionRate * 100)}%`} />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ZipMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: highlight ? "#2563EB" : "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
