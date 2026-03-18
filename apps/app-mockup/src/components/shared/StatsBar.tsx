import { useDomain } from "@/contexts/DomainContext";

export function StatsBar() {
  const { domain } = useDomain();

  const items = [
    { label: "Policies", value: domain.stats.policies, color: "blue" },
    { label: "Skills", value: domain.stats.skills, color: "green" },
    { label: "Terms", value: domain.stats.terms, color: "purple" },
  ] as const;

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <span
          key={item.label}
          className={
            item.color === "blue"
              ? "inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
              : item.color === "green"
                ? "inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
                : "inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/30 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300"
          }
        >
          {item.label}
          <span className="font-semibold">
            {item.value.toLocaleString()}
          </span>
        </span>
      ))}
    </div>
  );
}
