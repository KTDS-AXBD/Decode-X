import { useEffect, useState } from "react";
import { useDomain } from "@/contexts/DomainContext";
import {
  fetchDeliverableMarkdown,
  type DeliverableType,
  DELIVERABLE_INFO,
} from "@/lib/api/deliverable";
import { DeliverableSelector } from "./DeliverableSelector";
import { MarkdownPreview } from "./MarkdownPreview";

export function DeliverablePreviewDemo() {
  const { domain } = useDomain();
  const [type, setType] = useState<DeliverableType>("interface-spec");
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDeliverableMarkdown(domain.organizationId, type)
      .then((md) => {
        if (!cancelled) setMarkdown(md);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain.organizationId, type]);

  function handleDownload() {
    const info = DELIVERABLE_INFO[type];
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${info.code}_${domain.organizationId}_${type}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <DeliverableSelector selected={type} onSelect={setType} />

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="text-sm font-medium">
            {DELIVERABLE_INFO[type].code} — {DELIVERABLE_INFO[type].title}
          </div>
          <button
            onClick={handleDownload}
            disabled={!markdown || loading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            다운로드 .md
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px] max-h-[600px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-48 text-gray-400">
              Loading deliverable...
            </div>
          )}
          {error && (
            <div className="text-center text-red-500 py-8">{error}</div>
          )}
          {!loading && !error && <MarkdownPreview content={markdown} />}
        </div>
      </div>
    </div>
  );
}
