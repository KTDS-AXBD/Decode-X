import { cn } from "@/lib/cn";
import type { Term } from "@/lib/api/ontology";

interface TermCardProps {
  term: Term;
  selected: boolean;
  onClick: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  concept: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  entity: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  attribute: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export function TermCard({ term, selected, onClick }: TermCardProps) {
  const def = term.definition ?? "";
  const truncated = def.length > 100 ? def.slice(0, 100) + "..." : def;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm",
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">{term.label}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            TYPE_COLORS[term.termType] ??
              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
          )}
        >
          {term.termType}
        </span>
      </div>
      {truncated && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {truncated}
        </p>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
        {term.skosUri}
      </p>
    </button>
  );
}
