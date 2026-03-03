import { Badge } from "@/components/ui/badge";

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  mega:       { bg: "rgba(147, 51, 234, 0.15)", text: "#9333EA", label: "Mega" },
  core:       { bg: "rgba(59, 130, 246, 0.15)", text: "#3B82F6", label: "Core" },
  supporting: { bg: "rgba(34, 197, 94, 0.15)",  text: "#22C55E", label: "Supporting" },
  peripheral: { bg: "rgba(156, 163, 175, 0.2)", text: "#9CA3AF", label: "Peripheral" },
};

interface CategoryBadgeProps {
  category: string;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES["peripheral"];
  if (!style) return null;

  return (
    <Badge
      variant="outline"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.text,
      }}
    >
      {style.label}
    </Badge>
  );
}
