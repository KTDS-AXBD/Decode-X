import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical';
export type EventType =
  | '마스킹'
  | '정책 검토'
  | 'Skill 변경'
  | '프롬프트 변경'
  | '인증'
  | '설정 변경'
  | '마스킹 복원';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: EventType;
  severity: SeverityLevel;
  actor: string;
  target: string;
  details: string;
  ip: string;
  fullDetail?: Record<string, unknown> | null;
}

interface AuditLogTableProps {
  entries: AuditLogEntry[];
}

const severityConfig = {
  info: {
    label: '정보',
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  warning: {
    label: '경고',
    color: 'var(--accent)',
    bg: 'rgba(246, 173, 85, 0.15)',
  },
  error: {
    label: '오류',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.1)',
  },
  critical: {
    label: '위험',
    color: '#991B1B',
    bg: 'rgba(153, 27, 27, 0.1)',
  },
};

const eventTypeConfig: Record<EventType, { color: string; bg: string }> = {
  마스킹: { color: '#9333EA', bg: 'rgba(147, 51, 234, 0.1)' },
  '정책 검토': { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
  'Skill 변경': { color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
  '프롬프트 변경': { color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
  인증: { color: '#6B7280', bg: 'rgba(107, 114, 128, 0.1)' },
  '설정 변경': { color: '#EC4899', bg: 'rgba(236, 72, 153, 0.1)' },
  '마스킹 복원': { color: '#991B1B', bg: 'rgba(153, 27, 27, 0.1)' },
};

export const AuditLogTable: React.FC<AuditLogTableProps> = ({ entries }) => {
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderRow = (entry: AuditLogEntry) => {
    const isExpanded = expandedRows.has(entry.id);
    const severityConf = severityConfig[entry.severity];
    const eventConf = eventTypeConfig[entry.eventType];

    const rows = [
      <tr
        key={entry.id}
        className="border-b hover:bg-gray-50 transition-colors cursor-pointer"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => entry.fullDetail && toggleRow(entry.id)}
      >
        <td className="py-3 px-4">
          {entry.fullDetail && (
            <button className="hover:bg-gray-200 rounded p-1">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              ) : (
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              )}
            </button>
          )}
        </td>
        <td className="py-3 px-4">
          <code className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
            {entry.timestamp}
          </code>
        </td>
        <td className="py-3 px-4">
          <Badge
            className="text-xs"
            style={{
              backgroundColor: eventConf.bg,
              color: eventConf.color,
              border: 'none',
            }}
          >
            {entry.eventType}
          </Badge>
        </td>
        <td className="py-3 px-4">
          <Badge
            className="text-xs font-semibold"
            style={{
              backgroundColor: severityConf.bg,
              color: severityConf.color,
              border: `1px solid ${severityConf.color}`,
            }}
          >
            {severityConf.label}
          </Badge>
        </td>
        <td className="py-3 px-4">
          <span
            className="font-medium"
            style={{
              color: entry.actor === '시스템' ? 'var(--text-secondary)' : 'var(--text-primary)',
            }}
          >
            {entry.actor}
          </span>
        </td>
        <td className="py-3 px-4">
          {entry.target !== '-' ? (
            <code
              className="text-xs px-2 py-1 rounded font-mono"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--primary)' }}
            >
              {entry.target}
            </code>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>-</span>
          )}
        </td>
        <td className="py-3 px-4">
          <span style={{ color: 'var(--text-primary)' }}>{entry.details}</span>
        </td>
        <td className="py-3 px-4">
          <code className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {entry.ip}
          </code>
        </td>
      </tr>
    ];

    if (isExpanded && entry.fullDetail) {
      rows.push(
        <tr key={`${entry.id}-detail`} style={{ backgroundColor: 'var(--surface)' }}>
          <td colSpan={8} className="py-4 px-4">
            <div className="ml-12">
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                Full Event Details (JSON)
              </div>
              <pre
                className="p-4 rounded-lg overflow-auto font-mono text-xs"
                style={{
                  backgroundColor: '#1e293b',
                  color: '#e2e8f0',
                  maxHeight: '300px',
                }}
              >
                {JSON.stringify(entry.fullDetail, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      );
    }

    return rows;
  };

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }} className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--surface)',
                }}
              >
                <th className="text-left py-3 px-4 w-8"></th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  시간
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  이벤트 유형
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  심각도
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  행위자
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  대상
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  상세
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => renderRow(entry))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};