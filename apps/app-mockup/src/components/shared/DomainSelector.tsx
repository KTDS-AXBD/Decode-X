import { useDomain } from "@/contexts/DomainContext";
import { DOMAINS } from "@/types/demo";
import { cn } from "@/lib/cn";

export function DomainSelector() {
  const { domain, setDomainById } = useDomain();

  return (
    <div className="flex gap-3">
      {DOMAINS.map((d) => (
        <button
          key={d.id}
          onClick={() => setDomainById(d.id)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-left transition-all",
            domain.id === d.id
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm"
              : "border-gray-200 dark:border-gray-700 hover:border-gray-300",
          )}
        >
          <span className="text-2xl">{d.emoji}</span>
          <div>
            <div className="font-semibold text-sm">{d.name}</div>
            <div className="text-xs text-gray-500">{d.organizationId}</div>
          </div>
          <div className="ml-3 flex gap-1.5">
            <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs">
              {d.stats.policies.toLocaleString()} policies
            </span>
            <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs">
              {d.stats.skills.toLocaleString()} skills
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
