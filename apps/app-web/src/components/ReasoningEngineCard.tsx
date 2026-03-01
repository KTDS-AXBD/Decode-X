import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, GitMerge } from 'lucide-react';

export const ReasoningEngineCard: React.FC = () => {
  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Reasoning Engine 분석 결과</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conflict Detection */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: 'var(--accent)',
            backgroundColor: 'rgba(246, 173, 85, 0.05)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: 'var(--accent)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  충돌 탐지 Conflict Detection
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'rgba(246, 173, 85, 0.2)',
                    color: 'var(--accent)',
                    border: 'none',
                  }}
                >
                  2건 발견
                </Badge>
              </div>
              <div className="space-y-2">
                <div
                  className="p-3 rounded text-sm font-mono"
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <code style={{ color: '#3B82F6' }}>POLICY-WD-003</code>
                    <span style={{ color: 'var(--text-secondary)' }}>↔</span>
                    <code style={{ color: '#3B82F6' }}>POLICY-WD-012</code>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    조건 유사 / 결과 상반
                  </div>
                </div>
                <div
                  className="p-3 rounded text-sm font-mono"
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <code style={{ color: '#3B82F6' }}>POLICY-INS-008</code>
                    <span style={{ color: 'var(--text-secondary)' }}>↔</span>
                    <code style={{ color: '#3B82F6' }}>POLICY-INS-015</code>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    적용 범위 중복
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gap Analysis */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: '#3B82F6' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Gap Analysis
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3B82F6',
                    border: 'none',
                  }}
                >
                  3건
                </Badge>
              </div>
              <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span>미정의 예외 사유: "천재지변 &gt; 지진" 세부 케이스</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span>가입 기간 9년 6개월 ~ 10년 미만 처리 규칙 누락</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span>외화 적립금 환산 기준 미명시</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Similar Policies */}
        <div
          className="p-4 rounded-lg border-l-4"
          style={{
            borderColor: 'var(--success)',
            backgroundColor: 'var(--success-light)',
          }}
        >
          <div className="flex items-start gap-3">
            <GitMerge className="w-5 h-5 mt-0.5" style={{ color: 'var(--success)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  유사 정책 매핑 Similar Policies
                </h4>
                <Badge
                  style={{
                    backgroundColor: 'var(--success)',
                    color: '#FFFFFF',
                    border: 'none',
                  }}
                >
                  5건 신규 발견
                </Badge>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                금융사 간 중도인출 정책 유사도 분석 완료
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {['A금융사 ↔ B금융사', 'B금융사 ↔ C금융사', 'A금융사 ↔ D금융사', '+2 more'].map(
                  (mapping) => (
                    <Badge
                      key={mapping}
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: 'var(--success)',
                        color: 'var(--success)',
                      }}
                    >
                      {mapping}
                    </Badge>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};