import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  FileSearch,
  CheckSquare,
  Code2,
  Eye,
  BarChart3,
} from 'lucide-react';

interface RoleInfo {
  role: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  description: string;
  permissions: string[];
  workflow: string[];
}

const ROLES: RoleInfo[] = [
  {
    role: 'Analyst',
    title: '분석가',
    icon: <FileSearch className="w-6 h-6" />,
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.1)',
    description: '문서를 업로드하고 분석 파이프라인을 실행하는 역할입니다. 분석 결과를 조회하고 리포트를 생성합니다.',
    permissions: ['문서 업로드/조회', '분석 실행/조회', '정책 조회(읽기 전용)', 'Skill 조회', '감사 로그 조회'],
    workflow: [
      '문서 업로드 → 분석 대기 → 결과 확인',
      '분석 리포트에서 Triage 관리',
      '정책 후보 생성 확인 (검토는 Reviewer)',
    ],
  },
  {
    role: 'Reviewer',
    title: '검토자',
    icon: <CheckSquare className="w-6 h-6" />,
    color: 'var(--accent)',
    bg: 'rgba(246, 173, 85, 0.1)',
    description: 'AI가 추론한 정책 후보를 검토(승인/거부/수정)하는 도메인 전문가입니다. HITL 워크플로우의 핵심 역할입니다.',
    permissions: ['정책 승인/거부/수정', 'HITL 세션 관리', '문서/분석 조회', 'Skill 조회', '신뢰도 대시보드'],
    workflow: [
      'HITL 검토 페이지에서 후보 정책 확인',
      '조건-기준-결과(CCO) 검증 후 승인/거부/수정',
      '검토 완료된 정책이 자동으로 Skill에 반영',
    ],
  },
  {
    role: 'Developer',
    title: '개발자',
    icon: <Code2 className="w-6 h-6" />,
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.1)',
    description: '생성된 Skill을 외부 시스템과 통합하는 개발자입니다. MCP/API를 통해 AI Skill을 활용합니다.',
    permissions: ['Skill 카탈로그 전체 접근', 'API 콘솔 사용', 'MCP 연동 설정', '문서/분석 조회'],
    workflow: [
      'Skill 카탈로그에서 필요한 Skill 검색',
      'API 콘솔에서 엔드포인트 테스트',
      'MCP 어댑터로 Claude Desktop 연동',
    ],
  },
  {
    role: 'Client',
    title: '고객',
    icon: <Eye className="w-6 h-6" />,
    color: '#8B5CF6',
    bg: 'rgba(139, 92, 246, 0.1)',
    description: '분석 결과와 Skill을 읽기 전용으로 조회하는 역할입니다. 데이터 변경 권한은 없습니다.',
    permissions: ['대시보드 조회', '분석 결과 조회', 'Skill 조회', '신뢰도 대시보드 조회'],
    workflow: [
      '대시보드에서 전체 현황 확인',
      'Skill 카탈로그에서 결과물 조회',
      '신뢰도 대시보드에서 품질 확인',
    ],
  },
  {
    role: 'Executive',
    title: '경영진',
    icon: <BarChart3 className="w-6 h-6" />,
    color: '#EC4899',
    bg: 'rgba(236, 72, 153, 0.1)',
    description: '비즈니스 KPI와 대시보드를 통해 플랫폼 성과를 모니터링하는 역할입니다.',
    permissions: ['대시보드 조회', '분석 리포트 조회', '비용 모니터링', '신뢰도 대시보드'],
    workflow: [
      '대시보드에서 핵심 지표 확인',
      '분석 리포트에서 진행 현황 모니터링',
      '신뢰도/비용 대시보드로 ROI 파악',
    ],
  },
];

export function RoleGuide() {
  const { user } = useAuth();
  const currentRole = user?.role;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        AI Foundry는 5개 역할(RBAC)로 접근 권한을 관리합니다.
        {currentRole && (
          <span>
            {' '}현재 로그인된 역할: <Badge style={{ backgroundColor: 'rgba(246, 173, 85, 0.2)', color: 'var(--accent)' }}>{currentRole}</Badge>
          </span>
        )}
      </p>

      <div className="space-y-4">
        {ROLES.map((role) => {
          const isCurrentRole = currentRole === role.role;
          return (
            <Card
              key={role.role}
              style={{
                borderRadius: 'var(--radius-lg)',
                borderLeft: isCurrentRole ? `4px solid ${role.color}` : undefined,
                boxShadow: isCurrentRole ? `0 0 12px ${role.bg}` : undefined,
              }}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: role.bg, color: role.color }}
                  >
                    {role.icon}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        {role.title}
                      </h3>
                      <Badge style={{ backgroundColor: role.bg, color: role.color, border: 'none' }}>
                        {role.role}
                      </Badge>
                      {isCurrentRole && (
                        <Badge style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                          현재 역할
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {role.description}
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          권한
                        </div>
                        <ul className="space-y-1">
                          {role.permissions.map((p, i) => (
                            <li key={i} className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                              <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                          주요 업무 흐름
                        </div>
                        <ol className="space-y-1">
                          {role.workflow.map((w, i) => (
                            <li key={i} className="text-sm flex items-start gap-1.5" style={{ color: 'var(--text-primary)' }}>
                              <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: role.color }}>
                                {i + 1}.
                              </span>
                              {w}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
