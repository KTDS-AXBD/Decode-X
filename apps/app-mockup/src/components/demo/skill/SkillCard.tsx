import type { SkillSummary } from "@/lib/api/skill";
import { cn } from "@/lib/cn";

function trustColor(score: number): string {
  if (score > 0.8) return "text-green-600 dark:text-green-400";
  if (score > 0.6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function SkillCard({
  skill,
  selected,
  onClick,
}: {
  skill: SkillSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const { metadata, trust } = skill;
  const tags = metadata.tags ?? [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 space-y-2 transition-all",
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-400"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 hover:border-gray-400 dark:hover:border-gray-500",
      )}
    >
      {/* Top row: domain + trust */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-medium">
          {metadata.domain}
        </span>
        <span className={cn("text-xs font-medium", trustColor(trust.score))}>
          {Math.round(trust.score * 100)}%
        </span>
      </div>

      {/* Subdomain + version */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {metadata.subdomain && <span>{metadata.subdomain}</span>}
        <span className="font-mono">v{metadata.version}</span>
        <span className="ml-auto bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {skill.policyCount} policies
        </span>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="text-[10px] text-gray-400">+{tags.length - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}
