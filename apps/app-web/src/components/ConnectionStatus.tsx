import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Activity, Users } from 'lucide-react';

interface ConnectionStatusProps {
  serverUrl: string;
  status: 'connected' | 'disconnected' | 'connecting';
  lastHeartbeat: string;
  connectedAgents: number;
}

const statusConfig = {
  connected: {
    label: '연결됨',
    icon: '🟢',
    color: 'var(--success)',
    bg: 'var(--success-light)',
  },
  disconnected: {
    label: '연결 끊김',
    icon: '🔴',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
  },
  connecting: {
    label: '연결 중...',
    icon: '🟡',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
};

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  serverUrl,
  status,
  lastHeartbeat,
  connectedAgents,
}) => {
  const config = statusConfig[status];

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="w-4 h-4" />
          MCP 서버 연결 상태
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server URL */}
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            MCP Server URL
          </div>
          <code
            className="text-sm px-3 py-2 rounded font-mono block"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            {serverUrl}
          </code>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Status
          </div>
          <Badge
            style={{
              backgroundColor: config.bg,
              color: config.color,
              border: 'none',
            }}
          >
            {config.icon} {config.label}
          </Badge>
        </div>

        {/* Last Heartbeat */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Activity className="w-3 h-3" />
            Last heartbeat
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {lastHeartbeat}
          </span>
        </div>

        {/* Connected Agents */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Users className="w-3 h-3" />
            Connected agents
          </div>
          <Badge
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3B82F6',
              border: 'none',
            }}
          >
            {connectedAgents}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
