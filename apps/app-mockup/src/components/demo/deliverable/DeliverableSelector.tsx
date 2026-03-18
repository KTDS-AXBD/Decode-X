import { cn } from "@/lib/cn";
import { DELIVERABLE_INFO, type DeliverableType } from "@/lib/api/deliverable";

interface DeliverableSelectorProps {
  selected: DeliverableType;
  onSelect: (type: DeliverableType) => void;
}

const TYPES = Object.keys(DELIVERABLE_INFO) as DeliverableType[];

export function DeliverableSelector({ selected, onSelect }: DeliverableSelectorProps) {
  return (
    <div className="grid grid-cols-5 gap-3">
      {TYPES.map((type) => {
        const info = DELIVERABLE_INFO[type];
        const active = selected === type;
        return (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={cn(
              "rounded-lg border p-3 text-left transition-all hover:shadow-sm",
              active
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950 ring-1 ring-blue-500"
                : "border-gray-200 dark:border-gray-700 hover:border-gray-300",
            )}
          >
            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">
              {info.code}
            </div>
            <div className="text-sm font-semibold mb-0.5">{info.title}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
              {info.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
