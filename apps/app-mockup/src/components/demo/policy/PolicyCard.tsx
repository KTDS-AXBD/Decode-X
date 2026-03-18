import type { Policy } from "@/lib/api/policy";
import { cn } from "@/lib/cn";

function trustColor(score: number): string {
  if (score > 0.8) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (score > 0.6) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function statusColor(status: string): string {
  if (status === "approved") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
}

export function PolicyCard({ policy }: { policy: Policy }) {
  const tags = policy.tags ?? [];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 shadow-sm p-4 space-y-3">
      {/* Header: code + trust + status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
          {policy.policyCode}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs px-2 py-0.5 rounded font-medium", trustColor(policy.trustScore))}>
            신뢰도 {Math.round(policy.trustScore * 100)}%
          </span>
          <span className={cn("text-xs px-2 py-0.5 rounded", statusColor(policy.status))}>
            {policy.status}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{policy.title}</h3>

      {/* Condition / Criteria / Outcome */}
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-blue-600 dark:text-blue-400 mr-1.5">IF</span>
          <span className="text-gray-700 dark:text-gray-300">{policy.condition}</span>
        </div>
        <div>
          <span className="font-medium text-amber-600 dark:text-amber-400 mr-1.5">CRITERIA</span>
          <span className="text-gray-700 dark:text-gray-300">{policy.criteria}</span>
        </div>
        <div>
          <span className="font-medium text-green-600 dark:text-green-400 mr-1.5">THEN</span>
          <span className="text-gray-700 dark:text-gray-300">{policy.outcome}</span>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
