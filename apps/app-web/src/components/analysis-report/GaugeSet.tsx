import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

export interface GaugeConfig {
  key: string;
  label: string;
  value: number;   // 0–100
  color?: string;  // overrides threshold color when provided
}

export interface GaugeSetProps {
  gauges: GaugeConfig[];
  size?: number;   // px per gauge, default 100
}

function thresholdColor(value: number): string {
  if (value >= 80) return "#10b981";
  if (value >= 50) return "#f59e0b";
  return "#ef4444";
}

function statusLabel(value: number): string {
  if (value >= 80) return "양호";
  if (value >= 50) return "보통";
  return "미흡";
}

function SingleGauge({ config, size }: { config: GaugeConfig; size: number }) {
  const fill = config.color ?? thresholdColor(config.value);
  const data = [{ value: config.value, fill }];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <RadialBarChart
          width={size}
          height={size}
          cx={size / 2}
          cy={size / 2}
          innerRadius={size * 0.3}
          outerRadius={size * 0.46}
          startAngle={90}
          endAngle={-270}
          data={data}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            dataKey="value"
            cornerRadius={3}
            background={{ fill: "var(--border, #e5e7eb)" }}
            angleAxisId={0}
          />
        </RadialBarChart>
        {/* Center overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-bold leading-none" style={{ color: fill }}>
            {config.value}
          </span>
          <span className="text-[0.55rem] leading-none mt-0.5" style={{ color: "var(--text-secondary, #6b7280)" }}>
            /100
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-center" style={{ color: "var(--text-primary, #111827)" }}>
        {config.label}
      </span>
      <span
        className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${fill} 15%, transparent)`,
          color: fill,
        }}
      >
        {statusLabel(config.value)}
      </span>
    </div>
  );
}

export function GaugeSet({ gauges, size = 100 }: GaugeSetProps) {
  return (
    <div className="flex items-start gap-4 flex-wrap">
      {gauges.map((g) => (
        <SingleGauge key={g.key} config={g} size={size} />
      ))}
    </div>
  );
}
