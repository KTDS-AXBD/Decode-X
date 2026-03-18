import { useState } from "react";
import type { SkillSummary, SkillEvaluation } from "@/lib/api/skill";
import { evaluateSkill } from "@/lib/api/skill";
import { useDomain } from "@/contexts/DomainContext";
import { cn } from "@/lib/cn";
import { EvalResultCard } from "./EvalResultCard";

const EXAMPLE_CONTEXTS: Record<string, string> = {
  giftvoucher: "고객이 월 50만원 한도 초과 충전을 시도합니다",
  pension: "만 55세 이상 근로자가 중도인출을 신청합니다",
};

export function EvaluationPanel({ skill }: { skill: SkillSummary | null }) {
  const { domain } = useDomain();
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SkillEvaluation[]>([]);

  if (!skill) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
        <p className="text-gray-400 text-sm">좌측에서 Skill을 선택하세요</p>
      </div>
    );
  }

  async function handleEvaluate() {
    if (!skill || !context.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await evaluateSkill(domain.organizationId, skill.skill_id, {
        context: context.trim(),
      });
      setHistory((prev) => [result, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "평가 실패");
    } finally {
      setLoading(false);
    }
  }

  const placeholder = EXAMPLE_CONTEXTS[domain.id] ?? "평가할 상황을 입력하세요";

  return (
    <div className="space-y-4">
      {/* Selected skill info */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-medium">
            {skill.domain}
          </span>
          {skill.subdomain && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{skill.subdomain}</span>
          )}
          <span className="font-mono text-xs text-gray-400">v{skill.version}</span>
        </div>

        <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{skill.policy_count} policies</span>
          <span>신뢰도 {Math.round(skill.trust_score * 100)}%</span>
          <span className="capitalize">{skill.trust_level}</span>
        </div>

        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Context input + execute */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          평가 컨텍스트
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleEvaluate}
            disabled={loading || !context.trim()}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              loading || !context.trim()
                ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                실행 중...
              </span>
            ) : (
              "실행"
            )}
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>

      {/* Evaluation history */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            평가 결과 ({history.length})
          </h3>
          {history.map((ev, i) => (
            <EvalResultCard key={`${ev.evaluationId}-${i}`} evaluation={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
