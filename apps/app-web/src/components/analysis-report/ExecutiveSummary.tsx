import { Target } from "lucide-react";
import { ScoreGauge } from "./ScoreGauge";

interface ExecutiveSummaryProps {
  score: number;
  headline: string;
  detail: string;
}

export function ExecutiveSummary({ score, headline, detail }: ExecutiveSummaryProps) {
  return (
    <section
      className="p-6 rounded-xl border-2"
      style={{
        borderColor: "var(--accent, #3b82f6)",
        backgroundColor: "color-mix(in srgb, var(--accent, #3b82f6) 3%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-5 h-5" style={{ color: "var(--accent, #3b82f6)" }} />
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary, #111827)" }}>
          {headline}
        </h2>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--text-secondary, #6b7280)" }}>
        {detail}
      </p>
      <div className="flex justify-center">
        <ScoreGauge score={score} label="활용 준비도" />
      </div>
    </section>
  );
}
