import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useDomain } from "@/contexts/DomainContext";
import {
  fetchTerms,
  fetchGraphVisualization,
  type Term,
  type GraphNode,
  type GraphLink,
} from "@/lib/api/ontology";
import { TermCard } from "./TermCard";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select, type Selection } from "d3-selection";

// d3-drag is part of d3-selection via .call(drag())
// We need to import it separately
type D3DragEvent = {
  active: number;
  x: number;
  y: number;
  subject: SimNode;
};

const GROUP_COLORS: Record<string, string> = {
  core: "#3b82f6",
  important: "#f59e0b",
  standard: "#9ca3af",
};

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  definition?: string;
  frequency: number;
  group: "core" | "important" | "standard";
  type: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
}

export function OntologyExplorerDemo() {
  const { domain } = useDomain();
  const [terms, setTerms] = useState<Term[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // d3 simulation state
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  const hasTermData = domain.stats.terms > 0;

  // Fetch data on domain change
  useEffect(() => {
    if (!hasTermData) {
      setLoading(false);
      setTerms([]);
      setGraphNodes([]);
      setGraphLinks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchTerms(domain.organizationId, { limit: 50 }),
      fetchGraphVisualization(domain.organizationId, { limit: 60 }),
    ])
      .then(([termData, graphData]) => {
        if (cancelled) return;
        setTerms(termData.terms);
        setGraphNodes(graphData.nodes);
        setGraphLinks(graphData.links);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain.organizationId, hasTermData]);

  // Set up d3-force simulation when graph data changes
  useEffect(() => {
    if (graphNodes.length === 0) {
      setSimNodes([]);
      setSimLinks([]);
      return;
    }

    // Stop previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Create simulation nodes with initial positions
    const nodes: SimNode[] = graphNodes.map((n, i) => ({
      ...n,
      x: 300 + 120 * Math.cos((2 * Math.PI * i) / graphNodes.length),
      y: 200 + 120 * Math.sin((2 * Math.PI * i) / graphNodes.length),
    }));

    // Create node map for link resolution
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = graphLinks
      .filter((l) => nodeById.has(l.source) && nodeById.has(l.target))
      .map((l) => ({
        source: nodeById.get(l.source)!,
        target: nodeById.get(l.target)!,
        weight: l.weight,
      }));

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(80),
      )
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(300, 200))
      .force("collide", forceCollide<SimNode>().radius((d) => (d.group === "core" ? 20 : 14)))
      .alphaDecay(0.02);

    simulation.on("tick", () => {
      setSimNodes([...nodes]);
      setSimLinks([...links]);
    });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [graphNodes, graphLinks]);

  // Set up drag behavior
  useEffect(() => {
    if (!svgRef.current || simNodes.length === 0 || !simulationRef.current) return;

    const svg = select(svgRef.current) as Selection<SVGSVGElement, unknown, null, undefined>;
    const simulation = simulationRef.current;

    // Simple drag via mousedown/mousemove/mouseup on circles
    let dragging: SimNode | null = null;

    function onMouseDown(this: SVGCircleElement, event: MouseEvent) {
      const nodeId = this.getAttribute("data-node-id");
      const node = simNodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragging = node;
      simulation.alphaTarget(0.3).restart();
      event.preventDefault();
    }

    function onMouseMove(event: MouseEvent) {
      if (!dragging || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = 600 / rect.width;
      const scaleY = 400 / rect.height;
      dragging.fx = (event.clientX - rect.left) * scaleX;
      dragging.fy = (event.clientY - rect.top) * scaleY;
    }

    function onMouseUp() {
      if (!dragging) return;
      simulation.alphaTarget(0);
      dragging.fx = null;
      dragging.fy = null;
      dragging = null;
    }

    const circles = svg.selectAll<SVGCircleElement, unknown>("circle[data-node-id]");
    circles.on("mousedown", onMouseDown);
    svg.on("mousemove", onMouseMove);
    svg.on("mouseup", onMouseUp);
    svg.on("mouseleave", onMouseUp);

    return () => {
      circles.on("mousedown", null);
      svg.on("mousemove", null);
      svg.on("mouseup", null);
      svg.on("mouseleave", null);
    };
  }, [simNodes]);

  const filtered = useMemo(() => {
    if (!search) return terms;
    const q = search.toLowerCase();
    return terms.filter((t) => t.label.toLowerCase().includes(q));
  }, [terms, search]);

  const selectedNode = selectedTermId
    ? simNodes.find((n) => n.id === selectedTermId)
    : null;

  /* Domain has no term data */
  if (!hasTermData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-4xl">{domain.emoji}</div>
        <div className="text-center space-y-2">
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            이 도메인에는 아직 온톨로지 데이터가 없어요.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            온누리상품권(LPON) 도메인을 선택하면 7,332건의 용어를 탐색할 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full mr-3" />
        {domain.name} 온톨로지 데이터 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-6 text-center text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left: Term search + list */}
      <div className="w-1/3 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {domain.emoji} {domain.name} 용어 사전
          <span className="ml-2 text-xs text-gray-400 font-normal">
            ({domain.stats.terms.toLocaleString()}건)
          </span>
        </h3>
        <input
          type="text"
          placeholder="용어 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">
              {search ? "검색 결과 없음" : "용어 없음"}
            </p>
          ) : (
            filtered.map((t) => (
              <TermCard
                key={t.termId}
                term={t}
                selected={selectedTermId === t.termId}
                onClick={() => setSelectedTermId(t.termId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Graph + detail */}
      <div className="w-2/3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            노드를 드래그하여 이동할 수 있어요
          </span>
          <span className="text-xs text-gray-400">
            {simNodes.length} nodes · {simLinks.length} links
          </span>
        </div>
        <div className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {simNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              그래프 데이터가 없어요
            </div>
          ) : (
            <svg ref={svgRef} viewBox="0 0 600 400" className="w-full h-full select-none">
              {/* Links */}
              {simLinks.map((link, i) => {
                const src = link.source as SimNode;
                const tgt = link.target as SimNode;
                return (
                  <line
                    key={i}
                    x1={src.x ?? 0}
                    y1={src.y ?? 0}
                    x2={tgt.x ?? 0}
                    y2={tgt.y ?? 0}
                    stroke="#d1d5db"
                    strokeWidth={Math.max(0.5, link.weight)}
                    opacity={0.4}
                  />
                );
              })}
              {/* Nodes */}
              {simNodes.map((n) => {
                const isSelected = selectedTermId === n.id;
                const fill = GROUP_COLORS[n.group] ?? "#9ca3af";
                const radius = n.group === "core" ? 12 : n.group === "important" ? 9 : 6;
                return (
                  <g
                    key={n.id}
                    onClick={() => setSelectedTermId(n.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <circle
                      data-node-id={n.id}
                      cx={n.x ?? 0}
                      cy={n.y ?? 0}
                      r={radius}
                      fill={fill}
                      stroke={isSelected ? "#1d4ed8" : "none"}
                      strokeWidth={isSelected ? 3 : 0}
                      opacity={0.85}
                    />
                    <text
                      x={n.x ?? 0}
                      y={(n.y ?? 0) + radius + 12}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#6b7280"
                      className="pointer-events-none select-none"
                    >
                      {n.label.length > 10 ? n.label.slice(0, 10) + "\u2026" : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: GROUP_COLORS[selectedNode.group] ?? "#9ca3af" }}
              />
              <span className="font-semibold text-sm">{selectedNode.label}</span>
              <span className="text-xs text-gray-500">({selectedNode.type})</span>
            </div>
            {selectedNode.definition && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {selectedNode.definition}
              </p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              Frequency: {selectedNode.frequency} | Group: {selectedNode.group}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
