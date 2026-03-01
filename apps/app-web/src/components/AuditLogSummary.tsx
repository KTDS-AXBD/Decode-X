import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditLogSummaryProps {
  totalEvents: number;
  warningCount: number;
  errorCount: number;
  criticalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const AuditLogSummary: React.FC<AuditLogSummaryProps> = ({
  totalEvents,
  warningCount,
  errorCount,
  criticalCount,
  currentPage,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.ceil(totalEvents / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalEvents);

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          {/* Left: Stats */}
          <div className="flex items-center gap-4">
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              오늘의 이벤트 요약 Today's Summary
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                총 이벤트:
              </span>
              <Badge
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  color: '#3B82F6',
                  border: 'none',
                }}
              >
                {totalEvents}건
              </Badge>
            </div>
            <div className="w-px h-5" style={{ backgroundColor: 'var(--border)' }} />
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                경고:
              </span>
              <Badge
                style={{
                  backgroundColor: 'rgba(246, 173, 85, 0.15)',
                  color: 'var(--accent)',
                  border: 'none',
                }}
              >
                {warningCount}건
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                오류:
              </span>
              <Badge
                style={{
                  backgroundColor: errorCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                  color: errorCount > 0 ? '#EF4444' : '#6B7280',
                  border: 'none',
                }}
              >
                {errorCount}건
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                위험:
              </span>
              <Badge
                style={{
                  backgroundColor: 'rgba(153, 27, 27, 0.1)',
                  color: '#991B1B',
                  border: '1px solid #991B1B',
                }}
              >
                {criticalCount}건 (마스킹 복원)
              </Badge>
            </div>
          </div>

          {/* Right: Pagination */}
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Showing {startItem}-{endItem} of {totalEvents}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center px-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
