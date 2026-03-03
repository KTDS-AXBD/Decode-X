import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ProcessTreeNode } from "@ai-foundry/types";
import { CategoryBadge } from "./CategoryBadge";

interface ProcessTreeProps {
  nodes: ProcessTreeNode[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  depth?: number;
}

export function ProcessTree({
  nodes,
  selectedName,
  onSelect,
  depth = 0,
}: ProcessTreeProps) {
  return (
    <div className={depth > 0 ? "ml-4 border-l pl-2" : ""} style={{ borderColor: "var(--border)" }}>
      {nodes.map((node) => (
        <TreeNode
          key={node.name}
          node={node}
          selectedName={selectedName}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  selectedName,
  onSelect,
  depth,
}: {
  node: ProcessTreeNode;
  selectedName: string | null;
  onSelect: (name: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedName === node.name;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors"
        style={{
          backgroundColor: isSelected ? "var(--accent-bg, rgba(59, 130, 246, 0.1))" : "transparent",
        }}
        onClick={() => onSelect(node.name)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 rounded hover:bg-muted/50"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              : <ChevronRight className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            }
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span
          className="text-sm flex-1 truncate"
          style={{ color: isSelected ? "var(--primary)" : "var(--text-primary)" }}
        >
          {node.name}
        </span>
        <CategoryBadge category={node.type} />
      </div>
      {hasChildren && expanded && (
        <ProcessTree
          nodes={node.children}
          selectedName={selectedName}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
