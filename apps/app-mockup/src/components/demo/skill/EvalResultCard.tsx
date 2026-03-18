import type { SkillEvaluation } from "@/lib/api/skill";
import { cn } from "@/lib/cn";

function confidenceColor(c: number): string {
  if (c >= 0.8) return "bg-green-500";
  if (c >= 0.6) return "bg-yellow-500";
  return "bg-red-500";
}

function resultLabel(result: string): { text: string; cls: string } {
  switch (result) {
    case "APPROVE":
    case "PASS":
      return { text: "승인", cls: "text-green-600 dark:text-green-400" };
    case "DENY":
    case "FAIL":
      return { text: "거부", cls: "text-red-600 dark:text-red-400" };
    case "REVIEW":
      return { text: "검토 필요", cls: "text-yellow-600 dark:text-yellow-400" };
    default:
      return { text: result, cls: "text-gray-600 dark:text-gray-400" };
  }
}

export function EvalResultCard({ evaluation }: { evaluation: SkillEvaluation }) {
  const rl = resultLabel(evaluation.result);
  const pct = Math.round(evaluation.confidence * 100);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
      {/* Left accent border */}
      <div className="flex">
        <div className={cn("w-1 shrink-0", confidenceColor(evaluation.confidence))} />
        <div className="p-4 space-y-3 flex-1 min-w-0">
          {/* Policy code + result */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {evaluation.policyCode && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                {evaluation.policyCode}
              </span>
            )}
            <span className={cn("text-sm font-semibold", rl.cls)}>{rl.text}</span>
          </div>

          {/* Confidence bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>신뢰도</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", confidenceColor(evaluation.confidence))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Reasoning */}
          <div className="rounded bg-gray-50 dark:bg-gray-900 p-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {evaluation.reasoning}
          </div>

          {/* Provider info */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {evaluation.provider}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {evaluation.model}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {evaluation.latencyMs}ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
