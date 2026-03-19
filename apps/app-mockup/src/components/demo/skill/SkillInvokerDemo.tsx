import { useEffect, useState } from "react";
import { useDomain } from "@/contexts/DomainContext";
import { fetchSkills, type SkillSummary } from "@/lib/api/skill";
import { SkillCard } from "./SkillCard";
import { EvaluationPanel } from "./EvaluationPanel";
import { AutoEvalPanel } from "./AutoEvalPanel";

export function SkillInvokerDemo() {
  const { domain } = useDomain();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);

    fetchSkills(domain.organizationId, { status: "bundled", limit: 20 })
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

  const filtered = search.trim()
    ? skills.filter(
        (s) =>
          s.metadata.domain.toLowerCase().includes(search.toLowerCase()) ||
          (s.metadata.subdomain?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
          (s.metadata.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : skills;

  const selected = skills.find((s) => s.skillId === selectedId) ?? null;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left panel: Skill list */}
      <div className="col-span-4 space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Skill 검색..."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />

        <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
          {loading && (
            <div className="py-8 text-center text-sm text-gray-400">
              <span className="inline-block h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
              로딩 중...
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-red-500">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              {search ? "검색 결과가 없어요" : "등록된 Skill이 없어요"}
            </div>
          )}

          {filtered.map((skill) => (
            <SkillCard
              key={skill.skillId}
              skill={skill}
              selected={skill.skillId === selectedId}
              onClick={() => setSelectedId(skill.skillId)}
            />
          ))}
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            {filtered.length} / {skills.length} skills
          </p>
        )}
      </div>

      {/* Right panel: Evaluation */}
      <div className="col-span-8 space-y-4">
        <EvaluationPanel skill={selected} />
        {selected && (
          <AutoEvalPanel
            skillId={selected.skillId}
            organizationId={domain.organizationId}
          />
        )}
      </div>
    </div>
  );
}
