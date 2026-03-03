import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string; // hex or CSS color
}

export function MetricCard({ icon: Icon, label, count, color }: MetricCardProps) {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        borderColor: "var(--border)",
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color }}>
            {count.toLocaleString()}
          </div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
