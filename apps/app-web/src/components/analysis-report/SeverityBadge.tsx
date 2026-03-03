import { Badge } from "@/components/ui/badge";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "rgba(239, 68, 68, 0.15)", text: "#EF4444", label: "Critical" },
  warning:  { bg: "rgba(245, 158, 11, 0.15)", text: "#F59E0B", label: "Warning" },
  info:     { bg: "rgba(59, 130, 246, 0.15)", text: "#3B82F6", label: "Info" },
};

interface SeverityBadgeProps {
  severity: string;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES["info"];
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
