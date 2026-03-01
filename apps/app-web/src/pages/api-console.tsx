import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpMappingItem, type MappingStatus } from '@/components/McpMappingItem';
import { CodeBlock } from '@/components/CodeBlock';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { IntegrationGuide } from '@/components/IntegrationGuide';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

interface McpMapping {
  id: string;
  skillId: string;
  skillName: string;
  mcpToolName: string;
  status: MappingStatus;
  lastSynced: string;
  enabled: boolean;
  definition: string;
}

const mockMappings: McpMapping[] = [
  {
    id: '1',
    skillId: 'SKILL-PENSION-WD-001',
    skillName: '퇴직연금 중도인출 자격 판단',
    mcpToolName: 'pension_withdrawal_eligibility',
    status: 'active',
    lastSynced: '2분 전',
    enabled: true,
    definition: JSON.stringify(
      {
        name: 'pension_withdrawal_eligibility',
        description: '퇴직연금 중도인출 자격 판단 - Pension withdrawal eligibility check',
        inputSchema: {
          type: 'object',
          properties: {
            contractId: { type: 'string', description: '계약 ID' },
            enrollmentYears: { type: 'number', description: '가입 연수' },
            withdrawalType: {
              type: 'string',
              enum: ['무주택자', '요양', '천재지변', '파산', '일반'],
              description: '인출 사유',
            },
          },
          required: ['contractId', 'enrollmentYears', 'withdrawalType'],
        },
      },
      null,
      2
    ),
  },
  {
    id: '2',
    skillId: 'SKILL-PENSION-WD-002',
    skillName: '중도인출 한도 계산',
    mcpToolName: 'pension_withdrawal_limit',
    status: 'active',
    lastSynced: '5분 전',
    enabled: true,
    definition: JSON.stringify(
      {
        name: 'pension_withdrawal_limit',
        description: '퇴직연금 중도인출 한도 계산',
        inputSchema: {
          type: 'object',
          properties: {
            contractId: { type: 'string' },
            accumulatedAmount: { type: 'number' },
            withdrawalType: { type: 'string' },
          },
          required: ['contractId', 'accumulatedAmount', 'withdrawalType'],
        },
      },
      null,
      2
    ),
  },
];

export default function ApiConsolePage() {
  const [selectedMappingId, setSelectedMappingId] = useState('1');
  const [mappings, setMappings] = useState(mockMappings);
  const [activeTab, setActiveTab] = useState('mcp-adapter');

  const selectedMapping = mappings.find((m) => m.id === selectedMappingId);

  const handleToggleMapping = (id: string, enabled: boolean) => {
    setMappings((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const newStatus: MappingStatus = enabled ? 'active' : 'inactive';
          toast.success(enabled ? 'Mapping이 활성화되었습니다' : 'Mapping이 비활성화되었습니다');
          return { ...m, enabled, status: newStatus };
        }
        return m;
      })
    );
  };

  const handleTestCall = () => {
    toast.info('MCP Tool 테스트 호출 중...');
    setTimeout(() => toast.success('테스트 호출 성공!'), 1000);
  };

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      <div className="pb-4">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          API & MCP 연결 콘솔
        </h1>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="mcp-adapter">MCP Adapter</TabsTrigger>
            <TabsTrigger value="openapi">OpenAPI 3.1</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="usage">사용량</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'mcp-adapter' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 grid grid-cols-[40%_60%] gap-6 overflow-hidden">
              <div className="flex flex-col space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Skill → MCP Tool 변환 목록
                  </h2>
                </div>
                <div className="flex-1 overflow-auto space-y-3 pr-2">
                  {mappings.map((mapping) => (
                    <McpMappingItem
                      key={mapping.id}
                      skillId={mapping.skillId}
                      skillName={mapping.skillName}
                      mcpToolName={mapping.mcpToolName}
                      status={mapping.status}
                      lastSynced={mapping.lastSynced}
                      enabled={mapping.enabled}
                      onToggle={(enabled) => handleToggleMapping(mapping.id, enabled)}
                      onClick={() => setSelectedMappingId(mapping.id)}
                      isSelected={selectedMappingId === mapping.id}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col space-y-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    MCP Tool Definition
                  </h2>
                  <Button variant="outline" size="sm" onClick={handleTestCall}>
                    <FlaskConical className="w-4 h-4 mr-2" />
                    테스트 호출
                  </Button>
                </div>

                <div className="flex-1 overflow-hidden">
                  {selectedMapping && (
                    <CodeBlock
                      code={selectedMapping.definition}
                      language="json"
                      title={`${selectedMapping.mcpToolName}.json`}
                      showActions={true}
                    />
                  )}
                </div>

                <ConnectionStatus
                  serverUrl="mcp://ai-foundry.ktds.co.kr/skills"
                  status="connected"
                  lastHeartbeat="3초 전"
                  connectedAgents={2}
                />
              </div>
            </div>

            <div className="pt-6">
              <IntegrationGuide />
            </div>
          </div>
        )}

        {activeTab === 'openapi' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            OpenAPI 3.1 탭 (개발 예정)
          </div>
        )}

        {activeTab === 'api-keys' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            API Keys 탭 (개발 예정)
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
            사용량 탭 (개발 예정)
          </div>
        )}
      </div>
    </div>
  );
}
