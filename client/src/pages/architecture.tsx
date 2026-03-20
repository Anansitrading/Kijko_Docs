import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Plus, Minus, Maximize } from "lucide-react";
import { format } from "date-fns";

interface DiagramNode {
  id: string;
  label: string;
  type: "gateway" | "service" | "module" | "repo" | "infrastructure" | "tool" | "group";
  url: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label: string;
}

interface DiagramData {
  id: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  lastGenerated: string;
  linkedRepos: string[];
}

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  gateway: { bg: "#0d9488", border: "#14b8a6", text: "#ffffff" },
  service: { bg: "#2563eb", border: "#3b82f6", text: "#ffffff" },
  module: { bg: "#475569", border: "#64748b", text: "#e2e8f0" },
  repo: { bg: "#16a34a", border: "#22c55e", text: "#ffffff" },
  infrastructure: { bg: "#d97706", border: "#f59e0b", text: "#ffffff" },
  tool: { bg: "#7c3aed", border: "#8b5cf6", text: "#ffffff" },
  group: { bg: "transparent", border: "#64748b", text: "#94a3b8" },
};

const NODE_WIDTH = 170;
const NODE_HEIGHT = 48;

function layoutNodes(nodes: DiagramNode[]) {
  const tiers: Record<string, number> = {
    gateway: 0,
    service: 1,
    module: 2,
    repo: 3,
    infrastructure: 3,
    tool: 3,
    group: 1,
  };

  const grouped: Record<number, DiagramNode[]> = {};
  for (const node of nodes) {
    const tier = tiers[node.type] ?? 3;
    if (!grouped[tier]) grouped[tier] = [];
    grouped[tier].push(node);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const tierKeys = Object.keys(grouped).map(Number).sort();
  const ySpacing = 120;
  const xSpacing = 200;

  for (const tier of tierKeys) {
    const tierNodes = grouped[tier];
    const totalWidth = tierNodes.length * xSpacing;
    const startX = -totalWidth / 2 + xSpacing / 2;

    tierNodes.forEach((node, i) => {
      positions[node.id] = {
        x: startX + i * xSpacing,
        y: tier * ySpacing,
      };
    });
  }

  return positions;
}

function resolveNodeHash(node: DiagramNode) {
  if (node.url.startsWith("/wiki/")) {
    return `#/pages?search=${encodeURIComponent(node.label)}`;
  }
  if (node.url === "/") {
    return "#/";
  }
  return `#${node.url}`;
}

function ArchitectureSVG({
  data,
  zoom,
  pan,
  onPanStart,
}: {
  data: DiagramData;
  zoom: number;
  pan: { x: number; y: number };
  onPanStart: (e: React.MouseEvent) => void;
}) {
  const positions = layoutNodes(data.nodes);

  const xs = Object.values(positions).map((p) => p.x);
  const ys = Object.values(positions).map((p) => p.y);
  const minX = Math.min(...xs) - NODE_WIDTH;
  const maxX = Math.max(...xs) + NODE_WIDTH * 2;
  const minY = Math.min(...ys) - NODE_HEIGHT * 2;
  const maxY = Math.max(...ys) + NODE_HEIGHT * 3;

  const svgWidth = maxX - minX;
  const svgHeight = maxY - minY;

  return (
    <svg
      className="w-full h-full cursor-grab active:cursor-grabbing"
      viewBox={`${minX} ${minY} ${svgWidth} ${svgHeight}`}
      onMouseDown={onPanStart}
      data-testid="architecture-svg"
      style={{
        transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
        transformOrigin: "center center",
      }}
    >
      {data.edges.map((edge, i) => {
        const fromPos = positions[edge.from];
        const toPos = positions[edge.to];
        if (!fromPos || !toPos) return null;

        const x1 = fromPos.x + NODE_WIDTH / 2;
        const y1 = fromPos.y + NODE_HEIGHT;
        const x2 = toPos.x + NODE_WIDTH / 2;
        const y2 = toPos.y;
        const midY = (y1 + y2) / 2;

        return (
          <g key={`edge-${i}`}>
            <path
              d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              fill="none"
              stroke="#475569"
              strokeWidth="1.5"
              strokeOpacity="0.5"
            />
            {edge.label && (
              <text
                x={(x1 + x2) / 2}
                y={midY - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#94a3b8"
                fontFamily="JetBrains Mono, monospace"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {data.nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        const colors = NODE_COLORS[node.type] || NODE_COLORS.module;
        const isGroup = node.type === "group";

        return (
          <g
            key={node.id}
            className="cursor-pointer"
            data-testid={`node-${node.id}`}
            onClick={() => {
              window.location.hash = resolveNodeHash(node);
            }}
          >
            <rect
              x={pos.x}
              y={pos.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={6}
              fill={colors.bg}
              stroke={colors.border}
              strokeWidth={isGroup ? 1 : 1.5}
              strokeDasharray={isGroup ? "4 3" : "none"}
              opacity={0.9}
            />
            <text
              x={pos.x + NODE_WIDTH / 2}
              y={pos.y + NODE_HEIGHT / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fontWeight="500"
              fill={colors.text}
              fontFamily="General Sans, sans-serif"
            >
              {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Architecture() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });

  const { data, isLoading } = useQuery<DiagramData>({
    queryKey: ["/api/architecture/diagram?format=json"],
  });

  const handleRefresh = async () => {
    await apiRequest("POST", "/api/architecture/refresh");
  };

  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...pan };
    },
    [pan],
  );

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      const dx = (e.clientX - panStart.current.x) / zoom;
      const dy = (e.clientY - panStart.current.y) / zoom;
      setPan({
        x: panOffset.current.x + dx,
        y: panOffset.current.y + dy,
      });
    };
    const handleUp = () => {
      isPanning.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [zoom]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold" data-testid="text-architecture-title">
            Kijko Ecosystem Architecture
          </h2>
          {data?.lastGenerated && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5" data-testid="text-last-generated">
              Generated {format(new Date(data.lastGenerated), "MMM d, yyyy HH:mm")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-architecture">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom((prev) => Math.max(0.6, prev - 0.1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom(1)}>
            <Maximize className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom((prev) => Math.min(1.8, prev + 0.1))}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-6 flex-1 min-h-0">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Interactive Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-56px)]">
            {isLoading || !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ArchitectureSVG data={data} zoom={zoom} pan={pan} onPanStart={handlePanStart} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
