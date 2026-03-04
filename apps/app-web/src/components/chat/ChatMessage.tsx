import { useNavigate } from 'react-router-dom';
import { User, Bot, ArrowRight, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/markdown-content';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[] | undefined;
}

const TOOL_LABELS: Record<string, string> = {
  get_document_stats: '문서 현황',
  get_pipeline_kpi: '파이프라인 KPI',
  get_policy_stats: '정책 통계',
  get_skill_stats: 'Skill 통계',
  search_skills: 'Skill 검색',
  search_terms: '용어 검색',
  get_analysis_summary: '분석 요약',
};

/**
 * Parse [ACTION:navigate:/path] markers in assistant messages
 * and render them as clickable navigation buttons.
 */
function parseContent(content: string): { text: string; actions: { label: string; path: string }[] } {
  const actions: { label: string; path: string }[] = [];
  const text = content.replace(
    /\[ACTION:navigate:([^\]]+)\]/g,
    (_match, path: string) => {
      // Derive a label from the path
      const PAGE_LABELS: Record<string, string> = {
        '/': '대시보드',
        '/guide': '이용 가이드',
        '/upload': '문서 업로드',
        '/analysis': '분석 결과',
        '/analysis-report': '분석 리포트',
        '/hitl': 'HITL 검토',
        '/ontology': '온톨로지',
        '/skills': 'Skill 카탈로그',
        '/api-console': 'API 연결',
        '/trust': '신뢰도 대시보드',
        '/audit': '감사 로그',
        '/settings': '설정',
      };
      const label = PAGE_LABELS[path] ?? path;
      actions.push({ label, path });
      return '';
    },
  );
  return { text: text.trim(), actions };
}

export function ChatMessage({ role, content, toolsUsed }: ChatMessageProps) {
  const navigate = useNavigate();
  const isUser = role === 'user';
  const { text, actions } = isUser ? { text: content, actions: [] } : parseContent(content);

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
        >
          <Bot className="w-4 h-4" style={{ color: '#3B82F6' }} />
        </div>
      )}

      <div className="max-w-[85%] space-y-2">
        <div
          className="px-3 py-2 rounded-xl text-sm leading-relaxed"
          style={{
            backgroundColor: isUser ? 'var(--accent)' : 'var(--surface)',
            color: isUser ? 'var(--accent-foreground)' : 'var(--text-primary)',
            borderBottomRightRadius: isUser ? '4px' : undefined,
            borderBottomLeftRadius: !isUser ? '4px' : undefined,
          }}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{text}</span>
          ) : text ? (
            <MarkdownContent content={text} />
          ) : (
            '...'
          )}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <Button
                key={action.path}
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => navigate(action.path)}
              >
                {action.label}
                <ArrowRight className="w-3 h-3" />
              </Button>
            ))}
          </div>
        )}

        {toolsUsed && toolsUsed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Wrench className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
            {[...new Set(toolsUsed)].map((tool) => (
              <span
                key={tool}
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  color: 'var(--text-secondary)',
                }}
              >
                {TOOL_LABELS[tool] ?? tool}
              </span>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
          style={{ backgroundColor: 'rgba(246, 173, 85, 0.1)' }}
        >
          <User className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
      )}
    </div>
  );
}
