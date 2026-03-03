import { useState, useMemo, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CoreIdentification, CoreJudgment, ProcessTreeNode } from "@ai-foundry/types";
import { ProcessTree } from "./ProcessTree";
import { ProcessDetailPanel } from "./ProcessDetailPanel";

interface CoreProcessesTabProps {
  data: CoreIdentification | null;
  loading: boolean;
  initialProcess?: string | null;
  onTriggerAnalysis?: () => void;
  triggering?: boolean;
}

function findTreeNode(
  nodes: ProcessTreeNode[],
  name: string,
): ProcessTreeNode | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    const found = findTreeNode(node.children, name);
    if (found) return found;
  }
  return null;
}

export function CoreProcessesTab({
  data,
  loading,
  initialProcess,
  onTriggerAnalysis,
  triggering,
}: CoreProcessesTabProps) {
  const [selectedName, setSelectedName] = useState<string | null>(
    initialProcess ?? null,
  );

  const selectedJudgment: CoreJudgment | null = useMemo(() => {
    if (!data || !selectedName) return null;
    return data.coreProcesses.find((j) => j.processName === selectedName) ?? null;
  }, [data, selectedName]);

  const selectedTreeNode: ProcessTreeNode | null = useMemo(() => {
    if (!data || !selectedName) return null;
    return findTreeNode(data.processTree, selectedName);
  }, [data, selectedName]);

  const handleSelect = useCallback((name: string) => {
    setSelectedName(name);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-[60%_40%] gap-4">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          핵심 프로세스 데이터가 없습니다.
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
    <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-4">
      {/* Left: Process Tree */}
      <div
        className="border rounded-lg p-4 overflow-auto max-h-[calc(100vh-18rem)]"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            프로세스 계층
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Mega {data.summary.megaProcessCount} | Core {data.summary.coreProcessCount} | Supporting {data.summary.supportingProcessCount} | Peripheral {data.summary.peripheralProcessCount}
          </p>
        </div>
        <ProcessTree
          nodes={data.processTree}
          selectedName={selectedName}
          onSelect={handleSelect}
        />
      </div>

      {/* Right: Detail Panel */}
      <div className="overflow-auto max-h-[calc(100vh-18rem)]">
        <ProcessDetailPanel
          judgment={selectedJudgment}
          treeNode={selectedTreeNode}
        />
      </div>
    </div>
  );
}
