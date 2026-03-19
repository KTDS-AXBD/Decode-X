import { useEffect, useState } from "react";
import { useDomain } from "@/contexts/DomainContext";
import { fetchSkills, type SkillSummary } from "@/lib/api/skill";
import { downloadSkillZip } from "@/lib/api/export";
import { SkillExportCard } from "./SkillExportCard";
import { SkillMdPreview } from "./SkillMdPreview";
import { AutoEvalPanel } from "../skill/AutoEvalPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/cn";

export function SkillExportDemo() {
  const { domain } = useDomain();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);

    fetchSkills(domain.organizationId, { status: "bundled", limit: 50 })
      .then((data) => {
        if (!cancelled) setSkills(data.skills ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "로딩 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [domain.organizationId]);

  async function handleDownload(skillId: string) {
    setDownloading(true);
    try {
      await downloadSkillZip(domain.organizationId, skillId);
      show("ZIP 다운로드 완료", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "다운로드 실패", "error");
    } finally {
      setDownloading(false);
    }
  }

  const selected = skills.find((s) => s.skillId === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <ToastContainer />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Skill Export
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            번들링된 Skill을 미리보기하고 Claude Code용 ZIP으로 내보내요
          </p>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => handleDownload(selected.skillId)}
            disabled={downloading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              downloading
                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {downloading ? (
              <>
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                내보내는 중...
              </>
            ) : (
              <>
                <span>📦</span>
                ZIP 다운로드
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Skill grid */}
        <div className="col-span-4 space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {error && (
            <EmptyState
              icon={<span>⚠️</span>}
              title="로딩 실패"
              description={error}
              action={{ label: "다시 시도", onClick: () => window.location.reload() }}
            />
          )}

          {!loading && !error && skills.length === 0 && (
            <EmptyState
              icon={<span>📦</span>}
              title="번들링된 Skill이 없어요"
              description="Skill Packaging을 먼저 실행해주세요"
            />
          )}

          {skills.map((skill) => (
            <SkillExportCard
              key={skill.skillId}
              skill={skill}
              organizationId={domain.organizationId}
              selected={skill.skillId === selectedId}
              onClick={() => setSelectedId(skill.skillId)}
            />
          ))}

          {!loading && skills.length > 0 && (
            <p className="text-xs text-gray-400 text-center py-1">
              {skills.length} bundled skills
            </p>
          )}
        </div>

        {/* Right: Preview + Auto-Eval */}
        <div className="col-span-8 space-y-4">
          {!selected ? (
            <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
              <p className="text-gray-400 text-sm">좌측에서 Skill을 선택하세요</p>
            </div>
          ) : (
            <>
              <SkillMdPreview
                skillId={selected.skillId}
                organizationId={domain.organizationId}
              />
              <AutoEvalPanel
                skillId={selected.skillId}
                organizationId={domain.organizationId}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
