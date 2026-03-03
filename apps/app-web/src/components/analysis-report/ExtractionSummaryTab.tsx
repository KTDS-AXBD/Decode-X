import { useState, useMemo } from "react";
import {
  GitBranch,
  Box,
  BookOpen,
  Link2,
  ArrowUpDown,
  Play,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExtractionSummary } from "@ai-foundry/types";
import { MetricCard } from "./MetricCard";
import { CategoryBadge } from "./CategoryBadge";

interface ExtractionSummaryTabProps {
  data: ExtractionSummary | null;
  loading: boolean;
  onProcessClick?: (processName: string) => void;
  onTriggerAnalysis?: () => void;
  triggering?: boolean;
}

type SortKey = "importanceScore" | "referenceCount" | "name";

export function ExtractionSummaryTab({
  data,
  loading,
  onProcessClick,
  onTriggerAnalysis,
  triggering,
}: ExtractionSummaryTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>("importanceScore");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedProcesses = useMemo(() => {
    if (!data) return [];
    return [...data.processes].sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
          분석 데이터가 없습니다.
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

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={GitBranch} label="프로세스" count={data.counts.processes} color="#9333EA" />
        <MetricCard icon={Box} label="엔티티" count={data.counts.entities} color="#3B82F6" />
        <MetricCard icon={BookOpen} label="규칙" count={data.counts.rules} color="#F59E0B" />
        <MetricCard icon={Link2} label="관계" count={data.counts.relationships} color="#22C55E" />
      </div>

      {/* Process Importance Table */}
      <div className="border rounded-lg" style={{ borderColor: "var(--border)" }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            프로세스 중요도 랭킹
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  프로세스 <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("importanceScore")}
              >
                <div className="flex items-center justify-end gap-1">
                  중요도 <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("referenceCount")}
              >
                <div className="flex items-center justify-end gap-1">
                  참조 수 <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProcesses.map((proc) => (
              <TableRow
                key={proc.name}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onProcessClick?.(proc.name)}
              >
                <TableCell className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {proc.name}
                </TableCell>
                <TableCell>
                  <CategoryBadge category={proc.category} />
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className="font-semibold"
                    style={{
                      color: proc.importanceScore >= 0.7 ? "#EF4444"
                        : proc.importanceScore >= 0.4 ? "#F59E0B"
                        : "var(--text-secondary)",
                    }}
                  >
                    {(proc.importanceScore * 100).toFixed(0)}%
                  </span>
                </TableCell>
                <TableCell className="text-right" style={{ color: "var(--text-secondary)" }}>
                  {proc.referenceCount}
                </TableCell>
              </TableRow>
            ))}
            {sortedProcesses.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8" style={{ color: "var(--text-secondary)" }}>
                  프로세스가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
