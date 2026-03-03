import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  Network,
  Box,
  Link as LinkIcon,
  Loader2,
  List,
  Share2,
  Database,
  GitBranch,
  Hash,
  X,
} from "lucide-react";
import {
  fetchTerms,
  fetchTermsStats,
  fetchGraphVisualization,
  type TermRow,
  type TermsStats,
  type GraphNode,
  type GraphLink,
} from "@/api/ontology";
import { useOrganization } from "@/contexts/OrganizationContext";
import OntologyGraph from "@/components/OntologyGraph";

// ── Types ────────────────────────────────────────────────────────────

interface OntologyNode {
  id: string;
  name: string;
  nameEn: string;
  type: "domain" | "concept" | "attribute" | "relation";
  description: string;
  parent?: string | undefined;
  children?: string[] | undefined;
  relatedConcepts?: string[] | undefined;
}

type ViewMode = "list" | "graph";

// ── Helpers ──────────────────────────────────────────────────────────

function termsToNodes(terms: TermRow[]): OntologyNode[] {
  const broaderMap = new Map<string, string[]>();
  for (const term of terms) {
    if (term.broaderTermId) {
      const existing = broaderMap.get(term.broaderTermId);
      if (existing) {
        existing.push(term.termId);
      } else {
        broaderMap.set(term.broaderTermId, [term.termId]);
      }
    }
  }

  return terms.map((term): OntologyNode => {
    const children = broaderMap.get(term.termId);
    const hasBroader = term.broaderTermId !== null;
    const type: OntologyNode["type"] = !hasBroader
      ? "domain"
      : children !== undefined && children.length > 0
        ? "concept"
        : "attribute";

    const node: OntologyNode = {
      id: term.termId,
      name: term.label,
      nameEn: term.skosUri.split("/").pop() ?? term.label,
      type,
      description: term.definition ?? "",
    };
    if (term.broaderTermId) {
      node.parent = term.broaderTermId;
    }
    if (children !== undefined && children.length > 0) {
      node.children = children;
    }
    return node;
  });
}

const getNodeIcon = (type: OntologyNode["type"]) => {
  switch (type) {
    case "domain":
      return <Network className="w-5 h-5" style={{ color: "#3B82F6" }} />;
    case "concept":
      return <Box className="w-5 h-5" style={{ color: "var(--accent)" }} />;
    case "attribute":
      return (
        <LinkIcon className="w-5 h-5" style={{ color: "#10B981" }} />
      );
    case "relation":
      return (
        <LinkIcon className="w-5 h-5" style={{ color: "#9333EA" }} />
      );
  }
};

const getTypeBadge = (type: OntologyNode["type"]) => {
  const config = {
    domain: {
      label: "도메인",
      color: "#3B82F6",
      bg: "rgba(59, 130, 246, 0.1)",
    },
    concept: {
      label: "개념",
      color: "var(--accent)",
      bg: "rgba(246, 173, 85, 0.15)",
    },
    attribute: {
      label: "속성",
      color: "#10B981",
      bg: "rgba(16, 185, 129, 0.1)",
    },
    relation: {
      label: "관계",
      color: "#9333EA",
      bg: "rgba(147, 51, 234, 0.1)",
    },
  };
  const { label, color, bg } = config[type];
  return (
    <Badge
      style={{ backgroundColor: bg, color, border: "none" }}
      className="text-xs"
    >
      {label}
    </Badge>
  );
};

// ── Main Page ────────────────────────────────────────────────────────

export default function OntologyPage() {
  const { organizationId } = useOrganization();
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  // Stats
  const [stats, setStats] = useState<TermsStats | null>(null);

  // List view
  const [nodes, setNodes] = useState<OntologyNode[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Graph view
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedGraphTerm, setSelectedGraphTerm] = useState<string | null>(
    null,
  );
  const [graphSearchQuery, setGraphSearchQuery] = useState("");
  const [graphSearchOpen, setGraphSearchOpen] = useState(false);
  const [allTermLabels, setAllTermLabels] = useState<string[]>([]);
  const graphSearchRef = useRef<HTMLDivElement>(null);

  // Graph container sizing
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        graphSearchRef.current &&
        !graphSearchRef.current.contains(e.target as Node)
      ) {
        setGraphSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load all term labels for autocomplete (from initial full graph)
  useEffect(() => {
    if (graphNodes.length > 0 && allTermLabels.length === 0) {
      setAllTermLabels(graphNodes.map((n) => n.label));
    }
  }, [graphNodes, allTermLabels.length]);

  // Resize observer
  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGraphSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [viewMode]);

  // Load stats on mount
  useEffect(() => {
    fetchTermsStats(organizationId)
      .then((res) => {
        if (res.success) setStats(res.data);
      })
      .catch(() => {
        /* silent */
      });
  }, [organizationId]);

  // Load list data
  useEffect(() => {
    if (viewMode !== "list") return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    fetchTerms(organizationId, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          const converted = termsToNodes(res.data.terms);
          setNodes(converted);
          const firstNode = converted[0];
          if (firstNode && !selectedNode) {
            setSelectedNode(firstNode);
            setExpandedNodes(new Set([firstNode.id]));
          }
        } else {
          setListError(res.error.message);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Failed to fetch terms", e);
        setListError("용어 목록을 불러올 수 없습니다");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, organizationId]);

  // Load graph data
  const loadGraph = useCallback(
    (term?: string) => {
      setGraphLoading(true);
      setGraphError(null);

      fetchGraphVisualization(organizationId, {
        limit: 80,
        ...(term !== undefined ? { term } : {}),
      })
        .then((res) => {
          if (res.success) {
            setGraphNodes(res.data.nodes);
            setGraphLinks(res.data.links);
          } else {
            setGraphError(res.error.message);
          }
        })
        .catch((e: unknown) => {
          console.error("Failed to fetch graph", e);
          setGraphError("그래프 데이터를 불러올 수 없습니다");
        })
        .finally(() => {
          setGraphLoading(false);
        });
    },
    [organizationId],
  );

  useEffect(() => {
    if (viewMode !== "graph") return;
    loadGraph();
  }, [viewMode, loadGraph]);

  const handleGraphNodeClick = useCallback(
    (label: string) => {
      setSelectedGraphTerm(label);
      loadGraph(label);
    },
    [loadGraph],
  );

  const handleResetGraph = useCallback(() => {
    setSelectedGraphTerm(null);
    setGraphSearchQuery("");
    loadGraph();
  }, [loadGraph]);

  const handleGraphSearch = useCallback(
    (term: string) => {
      setGraphSearchQuery(term);
      setGraphSearchOpen(false);
      setSelectedGraphTerm(term);
      loadGraph(term);
    },
    [loadGraph],
  );

  const graphSearchSuggestions = graphSearchQuery.trim()
    ? allTermLabels
        .concat(
          graphNodes
            .map((n) => n.label)
            .filter((l) => !allTermLabels.includes(l)),
        )
        .filter((label) =>
          label.toLowerCase().includes(graphSearchQuery.toLowerCase()),
        )
        .slice(0, 12)
    : [];

  // List view helpers
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const filteredNodes = searchQuery
    ? nodes.filter((n) =>
        n.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : nodes;

  const domainNodes = filteredNodes.filter((n) => n.type === "domain");

  const renderNodeTree = (
    nodeId: string,
    depth: number = 0,
  ): React.ReactNode => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const isExpanded = expandedNodes.has(nodeId);
    const hasChildren = node.children !== undefined && node.children.length > 0;

    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
            selectedNode?.id === nodeId ? "shadow-sm" : ""
          }`}
          style={{
            marginLeft: `${depth * 20}px`,
            backgroundColor:
              selectedNode?.id === nodeId
                ? "rgba(26, 54, 93, 0.1)"
                : "transparent",
          }}
          onClick={() => setSelectedNode(node)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(nodeId);
              }}
              className="hover:bg-gray-200 rounded p-0.5"
            >
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
            </button>
          ) : (
            <span className="w-4" />
          )}
          {getNodeIcon(node.type)}
          <span
            className="text-sm font-medium flex-1"
            style={{ color: "var(--text-primary)" }}
          >
            {node.name}
          </span>
          {getTypeBadge(node.type)}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children?.map((childId) => renderNodeTree(childId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Selected graph node detail
  const selectedGraphNode = graphNodes.find(
    (n) => n.label === selectedGraphTerm,
  );
  const connectedTerms = selectedGraphTerm
    ? graphLinks
        .filter(
          (l) => l.source === selectedGraphTerm || l.target === selectedGraphTerm,
        )
        .map((l) =>
          l.source === selectedGraphTerm ? l.target : l.source,
        )
    : [];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              온톨로지 탐색기 Ontology Explorer
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              도메인 지식 구조화 및 관계 매핑
            </p>
          </div>
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <div
              className="flex rounded-lg border overflow-hidden"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                onClick={() => setViewMode("graph")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all ${
                  viewMode === "graph" ? "font-semibold" : ""
                }`}
                style={{
                  backgroundColor:
                    viewMode === "graph" ? "#1A365D" : "transparent",
                  color: viewMode === "graph" ? "#fff" : "var(--text-secondary)",
                }}
              >
                <Share2 className="w-4 h-4" />
                그래프
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all ${
                  viewMode === "list" ? "font-semibold" : ""
                }`}
                style={{
                  backgroundColor:
                    viewMode === "list" ? "#1A365D" : "transparent",
                  color: viewMode === "list" ? "#fff" : "var(--text-secondary)",
                }}
              >
                <List className="w-4 h-4" />
                목록
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3.5 h-3.5" style={{ color: "#3B82F6" }} />
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                총 용어
              </div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#3B82F6" }}>
              {stats ? stats.totalTerms.toLocaleString() : "..."}
            </div>
          </div>
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: "rgba(246, 173, 85, 0.1)" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Box className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                고유 개념
              </div>
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: "var(--accent)" }}
            >
              {stats ? stats.distinctLabels.toLocaleString() : "..."}
            </div>
          </div>
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: "rgba(16, 185, 129, 0.1)" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Database
                className="w-3.5 h-3.5"
                style={{ color: "#10B981" }}
              />
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                온톨로지
              </div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#10B981" }}>
              {stats ? stats.ontologyCount.toLocaleString() : "..."}
            </div>
          </div>
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: "rgba(147, 51, 234, 0.1)" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <GitBranch
                className="w-3.5 h-3.5"
                style={{ color: "#9333EA" }}
              />
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Neo4j 노드
              </div>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#9333EA" }}>
              {stats?.neo4j
                ? (
                    stats.neo4j.termNodes +
                    stats.neo4j.ontologyNodes +
                    stats.neo4j.policyNodes
                  ).toLocaleString()
                : "..."}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-hidden border-t"
        style={{ borderColor: "var(--border)" }}
      >
        {viewMode === "graph" ? (
          /* ── Graph View ─────────────────────────────────── */
          <div className="flex h-full">
            {/* Graph Canvas */}
            <div ref={graphContainerRef} className="flex-1 relative">
              {/* Search Bar Overlay */}
              <div
                ref={graphSearchRef}
                className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2"
                style={{ maxWidth: "400px" }}
              >
                <div className="relative flex-1">
                  <Search
                    className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <input
                    type="text"
                    placeholder="용어 검색으로 관계 탐색..."
                    value={graphSearchQuery}
                    onChange={(e) => {
                      setGraphSearchQuery(e.target.value);
                      setGraphSearchOpen(e.target.value.trim().length > 0);
                    }}
                    onFocus={() => {
                      if (graphSearchQuery.trim().length > 0) {
                        setGraphSearchOpen(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        graphSearchQuery.trim().length > 0
                      ) {
                        const firstMatch = graphSearchSuggestions[0];
                        if (firstMatch) {
                          handleGraphSearch(firstMatch);
                        } else {
                          handleGraphSearch(graphSearchQuery.trim());
                        }
                      }
                      if (e.key === "Escape") {
                        setGraphSearchOpen(false);
                      }
                    }}
                    className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border outline-none"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  />
                  {graphSearchQuery && (
                    <button
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 rounded hover:bg-gray-200"
                      onClick={() => {
                        setGraphSearchQuery("");
                        setGraphSearchOpen(false);
                        if (selectedGraphTerm) {
                          handleResetGraph();
                        }
                      }}
                    >
                      <X
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    </button>
                  )}
                  {/* Autocomplete Dropdown */}
                  {graphSearchOpen && graphSearchSuggestions.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden"
                      style={{
                        backgroundColor: "var(--bg-primary)",
                        borderColor: "var(--border)",
                        maxHeight: "240px",
                        overflowY: "auto",
                      }}
                    >
                      {graphSearchSuggestions.map((label) => {
                        const node = graphNodes.find(
                          (n) => n.label === label,
                        );
                        return (
                          <button
                            key={label}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                            style={{
                              color: "var(--text-primary)",
                            }}
                            onMouseEnter={(e) => {
                              (
                                e.currentTarget as HTMLElement
                              ).style.backgroundColor =
                                "rgba(26, 54, 93, 0.08)";
                            }}
                            onMouseLeave={(e) => {
                              (
                                e.currentTarget as HTMLElement
                              ).style.backgroundColor = "transparent";
                            }}
                            onClick={() => handleGraphSearch(label)}
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: node
                                  ? node.group === "core"
                                    ? "#3B82F6"
                                    : node.group === "important"
                                      ? "#F6AD55"
                                      : "#10B981"
                                  : "var(--text-secondary)",
                              }}
                            />
                            <span className="truncate">{label}</span>
                            {node && (
                              <span
                                className="text-xs ml-auto flex-shrink-0"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {node.frequency}회
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedGraphTerm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetGraph}
                    className="flex-shrink-0"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <Network className="w-4 h-4 mr-1" />
                    전체
                  </Button>
                )}
              </div>
              {/* Legend */}
              <div
                className="absolute bottom-3 left-3 z-10 flex gap-3 px-3 py-2 rounded-lg text-xs"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: "#3B82F6" }}
                  />
                  핵심 (Top 10)
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: "#F6AD55" }}
                  />
                  주요 (11-30)
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: "#10B981" }}
                  />
                  일반
                </span>
              </div>
              <OntologyGraph
                nodes={graphNodes}
                links={graphLinks}
                loading={graphLoading}
                error={graphError}
                onNodeClick={handleGraphNodeClick}
                selectedNode={selectedGraphTerm}
                width={graphSize.width}
                height={graphSize.height}
              />
            </div>

            {/* Graph Detail Panel */}
            <div
              className="w-80 border-l overflow-auto"
              style={{ borderColor: "var(--border)" }}
            >
              {selectedGraphNode ? (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Network
                        className="w-5 h-5"
                        style={{
                          color:
                            selectedGraphNode.group === "core"
                              ? "#3B82F6"
                              : selectedGraphNode.group === "important"
                                ? "#F6AD55"
                                : "#10B981",
                        }}
                      />
                      <h2
                        className="text-lg font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {selectedGraphNode.label}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        style={{
                          backgroundColor: "rgba(59, 130, 246, 0.1)",
                          color: "#3B82F6",
                          border: "none",
                        }}
                        className="text-xs"
                      >
                        빈도 {selectedGraphNode.frequency}회
                      </Badge>
                      <Badge
                        style={{
                          backgroundColor: "rgba(147, 51, 234, 0.1)",
                          color: "#9333EA",
                          border: "none",
                        }}
                        className="text-xs"
                      >
                        {selectedGraphNode.group === "core"
                          ? "핵심"
                          : selectedGraphNode.group === "important"
                            ? "주요"
                            : "일반"}
                      </Badge>
                    </div>
                  </div>

                  {selectedGraphNode.definition && (
                    <Card className="shadow-sm">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">설명</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {selectedGraphNode.definition}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {connectedTerms.length > 0 && (
                    <Card className="shadow-sm">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">
                          연관 용어 ({connectedTerms.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1.5">
                          {connectedTerms.map((term) => {
                            const node = graphNodes.find(
                              (n) => n.label === term,
                            );
                            const link = graphLinks.find(
                              (l) =>
                                (l.source === selectedGraphTerm &&
                                  l.target === term) ||
                                (l.target === selectedGraphTerm &&
                                  l.source === term),
                            );
                            return (
                              <div
                                key={term}
                                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all hover:shadow-sm"
                                style={{
                                  backgroundColor: "rgba(26, 54, 93, 0.05)",
                                }}
                                onClick={() => handleGraphNodeClick(term)}
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      node?.group === "core"
                                        ? "#3B82F6"
                                        : node?.group === "important"
                                          ? "#F6AD55"
                                          : "#10B981",
                                  }}
                                />
                                <span
                                  className="text-sm flex-1 truncate"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {term}
                                </span>
                                {link && (
                                  <span
                                    className="text-xs"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {link.weight}회
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full px-4 text-center"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Share2 className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">
                    노드를 클릭하면 상세 정보와
                    <br />
                    연관 용어를 볼 수 있습니다
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── List View ──────────────────────────────────── */
          <div className="grid grid-cols-[40%_60%] overflow-hidden h-full">
            {/* Left Panel -- Node Tree */}
            <div
              className="border-r overflow-hidden flex flex-col"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="p-4 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--text-secondary)" }}
                  />
                  <Input
                    placeholder="노드 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {listLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2
                      className="w-6 h-6 animate-spin"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </div>
                )}
                {listError && (
                  <div
                    className="text-sm text-center py-8"
                    style={{ color: "var(--danger)" }}
                  >
                    {listError}
                  </div>
                )}
                {!listLoading && !listError && nodes.length === 0 && (
                  <div
                    className="text-sm text-center py-8"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    등록된 용어가 없습니다
                  </div>
                )}
                {!listLoading &&
                  !listError &&
                  domainNodes.map((node) => renderNodeTree(node.id))}
              </div>
            </div>

            {/* Right Panel -- Node Detail */}
            <div className="flex flex-col overflow-hidden">
              {selectedNode ? (
                <>
                  <div
                    className="p-6 border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {getNodeIcon(selectedNode.type)}
                        <div>
                          <h2
                            className="text-xl font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {selectedNode.name}
                          </h2>
                          <p
                            className="text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {selectedNode.nameEn}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getTypeBadge(selectedNode.type)}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-6 space-y-6">
                    <Card className="shadow-sm">
                      <CardHeader>
                        <CardTitle>설명 Description</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p style={{ color: "var(--text-primary)" }}>
                          {selectedNode.description || "(설명 없음)"}
                        </p>
                      </CardContent>
                    </Card>

                    {selectedNode.parent &&
                      (() => {
                        const parentNode = nodes.find(
                          (n) => n.id === selectedNode.parent,
                        );
                        return parentNode ? (
                          <Card className="shadow-sm">
                            <CardHeader>
                              <CardTitle>상위 노드 Parent Node</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div
                                className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                                style={{ borderColor: "var(--border)" }}
                                onClick={() => setSelectedNode(parentNode)}
                              >
                                <div className="flex items-center gap-3">
                                  {getNodeIcon(parentNode.type)}
                                  <div className="flex-1">
                                    <div
                                      className="font-semibold"
                                      style={{
                                        color: "var(--text-primary)",
                                      }}
                                    >
                                      {parentNode.name}
                                    </div>
                                    <div
                                      className="text-xs"
                                      style={{
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      {parentNode.nameEn}
                                    </div>
                                  </div>
                                  {getTypeBadge(parentNode.type)}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ) : null;
                      })()}

                    {selectedNode.children !== undefined &&
                      selectedNode.children.length > 0 && (
                        <Card className="shadow-sm">
                          <CardHeader>
                            <CardTitle>
                              하위 노드 Child Nodes (
                              {selectedNode.children.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {selectedNode.children.map((childId) => {
                                const childNode = nodes.find(
                                  (n) => n.id === childId,
                                );
                                return childNode ? (
                                  <div
                                    key={childId}
                                    className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                                    style={{ borderColor: "var(--border)" }}
                                    onClick={() => setSelectedNode(childNode)}
                                  >
                                    <div className="flex items-center gap-3">
                                      {getNodeIcon(childNode.type)}
                                      <div className="flex-1">
                                        <div
                                          className="font-semibold text-sm"
                                          style={{
                                            color: "var(--text-primary)",
                                          }}
                                        >
                                          {childNode.name}
                                        </div>
                                        <div
                                          className="text-xs"
                                          style={{
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          {childNode.nameEn}
                                        </div>
                                      </div>
                                      {getTypeBadge(childNode.type)}
                                    </div>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                  </div>
                </>
              ) : (
                <div
                  className="flex items-center justify-center h-full"
                  style={{ color: "var(--text-secondary)" }}
                >
                  노드를 선택하세요
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
