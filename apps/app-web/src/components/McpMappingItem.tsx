import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export type MappingStatus = 'active' | 'inactive' | 'error';

interface McpMappingItemProps {
  skillId: string;
  skillName: string;
  mcpToolName: string;
  status: MappingStatus;
  lastSynced: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onClick: () => void;
  isSelected: boolean;
}

const statusConfig = {
  active: {
    label: '활성',
    color: 'var(--success)',
    bg: 'var(--success-light)',
    icon: CheckCircle,
  },
  inactive: {
    label: '비활성',
    color: '#9CA3AF',
    bg: 'rgba(156, 163, 175, 0.1)',
    icon: XCircle,
  },
  error: {
    label: '오류',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
    icon: AlertCircle,
  },
};

export const McpMappingItem: React.FC<McpMappingItemProps> = ({
  skillId,
  skillName,
  mcpToolName,
  status,
  lastSynced,
  enabled,
  onToggle,
  onClick,
  isSelected,
}) => {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2' : ''
      }`}
      style={{
        borderRadius: 'var(--radius-lg)',
        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
        backgroundColor: isSelected ? 'rgba(26, 54, 93, 0.05)' : 'var(--surface)',
      }}
      onClick={onClick}
    >
      <div className="space-y-3">
        {/* Top row: Status and Toggle */}
        <div className="flex items-center justify-between">
          <Badge
            className="text-xs"
            style={{
              backgroundColor: config.bg,
              color: config.color,
              border: 'none',
            }}
          >
            <StatusIcon className="w-3 h-3 mr-1" />
            {config.label}
          </Badge>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              onToggle(checked);
              // Prevent card click event
              event?.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Mapping visualization */}
        <div className="space-y-2">
          {/* Skill */}
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              Skill
            </div>
            <div className="space-y-1">
              <code
                className="text-xs px-2 py-1 rounded font-mono block"
                style={{ backgroundColor: 'rgba(26, 54, 93, 0.1)', color: 'var(--primary)' }}
              >
                {skillId}
              </code>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {skillName}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center gap-2 pl-2">
            <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
          </div>

          {/* MCP Tool */}
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              MCP Tool
            </div>
            <code
              className="text-sm px-2 py-1 rounded font-mono block font-semibold"
              style={{ backgroundColor: 'rgba(56, 161, 105, 0.1)', color: 'var(--success)' }}
            >
              {mcpToolName}
            </code>
          </div>
        </div>

        {/* Last synced */}
        <div className="text-xs pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Last synced: {lastSynced}
        </div>
      </div>
    </Card>
  );
};
