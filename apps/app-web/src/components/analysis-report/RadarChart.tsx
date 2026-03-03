import { useMemo } from "react";

interface RadarChartProps {
  factors: {
    frequencyScore: number;
    dependencyScore: number;
    domainRelevanceScore: number;
    dataFlowCentrality: number;
  };
}

const LABELS = ["빈도", "의존성", "도메인 중요도", "데이터 흐름"];
const CX = 140;
const CY = 125;
const MAX_R = 90;
const LEVELS = [0.25, 0.5, 0.75, 1.0];

function polarToXY(angle: number, radius: number): [number, number] {
  // Start from top (-PI/2) and go clockwise
  const rad = angle - Math.PI / 2;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

export function RadarChart({ factors }: RadarChartProps) {
  const axes = useMemo(() => {
    const keys = [
      factors.frequencyScore,
      factors.dependencyScore,
      factors.domainRelevanceScore,
      factors.dataFlowCentrality,
    ] as const;
    const step = (Math.PI * 2) / 4;
    return keys.map((val, i) => {
      const angle = step * i;
      const [endX, endY] = polarToXY(angle, MAX_R);
      const [dataX, dataY] = polarToXY(angle, Math.min(val, 1) * MAX_R);
      const [labelX, labelY] = polarToXY(angle, MAX_R + 18);
      return { angle, endX, endY, dataX, dataY, labelX, labelY, value: val };
    });
  }, [factors]);

  const dataPath = axes.map((a, i) => `${i === 0 ? "M" : "L"} ${String(a.dataX)} ${String(a.dataY)}`).join(" ") + " Z";

  return (
    <svg viewBox="0 0 280 260" className="w-full max-w-[280px]">
      {/* Background levels */}
      {LEVELS.map((level) => {
        const r = MAX_R * level;
        const points = Array.from({ length: 4 }, (_, i) => {
          const [x, y] = polarToXY((Math.PI * 2 / 4) * i, r);
          return `${String(x)},${String(y)}`;
        }).join(" ");
        return (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.5"
          />
        );
      })}

      {/* Axis lines */}
      {axes.map((a, i) => (
        <line
          key={i}
          x1={String(CX)}
          y1={String(CY)}
          x2={String(a.endX)}
          y2={String(a.endY)}
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.5"
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={axes.map((a) => `${String(a.dataX)},${String(a.dataY)}`).join(" ")}
        fill="var(--chart-1, #3B82F6)"
        fillOpacity="0.2"
        stroke="var(--chart-1, #3B82F6)"
        strokeWidth="2"
      />

      {/* Data path for smooth outline */}
      <path
        d={dataPath}
        fill="none"
        stroke="var(--chart-1, #3B82F6)"
        strokeWidth="2"
      />

      {/* Data points */}
      {axes.map((a, i) => (
        <circle
          key={i}
          cx={String(a.dataX)}
          cy={String(a.dataY)}
          r="4"
          fill="var(--chart-1, #3B82F6)"
        />
      ))}

      {/* Labels */}
      {axes.map((a, i) => {
        const label = LABELS[i];
        if (!label) return null;
        return (
          <text
            key={i}
            x={String(a.labelX)}
            y={String(a.labelY)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fill="var(--text-secondary, #6B7280)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
