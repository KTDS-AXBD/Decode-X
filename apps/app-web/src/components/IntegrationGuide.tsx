import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './CodeBlock';
import { Key, Link, Code } from 'lucide-react';

const claudeMcpCode = `// Claude Desktop MCP Configuration
// Add to claude_desktop_config.json

{
  "mcpServers": {
    "ai-foundry-skills": {
      "url": "mcp://ai-foundry.ktds.co.kr/skills",
      "apiKey": "YOUR_API_KEY_HERE",
      "timeout": 30000
    }
  }
}`;

const langchainCode = `# LangChain Integration
from langchain.tools import MCPTool

# Initialize MCP Tool
mcp_tool = MCPTool(
    name="pension_withdrawal_eligibility",
    server_url="mcp://ai-foundry.ktds.co.kr/skills",
    api_key="YOUR_API_KEY_HERE"
)

# Use in agent
agent = create_agent(
    tools=[mcp_tool],
    llm=ChatOpenAI()
)

result = agent.invoke({
    "contractId": "CT-2025-001234",
    "enrollmentYears": 12,
    "withdrawalType": "무주택자"
})`;

const customCode = `// Custom Integration (REST API)
const response = await fetch(
  'https://api.ai-foundry.ktds.co.kr/v1/skills/execute',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY_HERE',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      skillId: 'SKILL-PENSION-WD-001',
      input: {
        contractId: 'CT-2025-001234',
        enrollmentYears: 12,
        withdrawalType: '무주택자',
        accumulatedAmount: 50000000,
        previousWithdrawals: 1
      }
    })
  }
);

const result = await response.json();
console.log(result);`;

export const IntegrationGuide: React.FC = () => {
  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">빠른 연동 가이드 Quick Integration Guide</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 3-Step Guide */}
        <div className="grid grid-cols-3 gap-4">
          {/* Step 1 */}
          <div
            className="p-4 rounded-lg border-l-4"
            style={{
              borderColor: 'var(--primary)',
              backgroundColor: 'rgba(26, 54, 93, 0.05)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                1
              </div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                API Key 발급
              </h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Key className="w-4 h-4 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  API Keys 탭에서 새 키 생성
                </div>
              </div>
              <code
                className="text-xs px-2 py-1 rounded font-mono block"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
              >
                sk_live_abc123...
              </code>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className="p-4 rounded-lg border-l-4"
            style={{
              borderColor: 'var(--accent)',
              backgroundColor: 'rgba(246, 173, 85, 0.05)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                2
              </div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                MCP 서버 연결
              </h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Link className="w-4 h-4 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  MCP 클라이언트에 서버 추가
                </div>
              </div>
              <code
                className="text-xs px-2 py-1 rounded font-mono block truncate"
                style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
              >
                mcp://ai-foundry.ktds.co.kr
              </code>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className="p-4 rounded-lg border-l-4"
            style={{
              borderColor: 'var(--success)',
              backgroundColor: 'var(--success-light)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                style={{ backgroundColor: 'var(--success)', color: '#FFFFFF' }}
              >
                3
              </div>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Agent에서 호출
              </h4>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Code className="w-4 h-4 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  LLM Agent에서 Skill 사용
                </div>
              </div>
              <Badge
                style={{
                  backgroundColor: 'var(--success)',
                  color: '#FFFFFF',
                  border: 'none',
                }}
              >
                Ready to use
              </Badge>
            </div>
          </div>
        </div>

        {/* Code Examples */}
        <div>
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            코드 예제 Code Examples
          </h4>
          <Tabs defaultValue="claude">
            <TabsList>
              <TabsTrigger value="claude">Claude MCP</TabsTrigger>
              <TabsTrigger value="langchain">LangChain</TabsTrigger>
              <TabsTrigger value="custom">Custom Integration</TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="mt-3">
              <CodeBlock code={claudeMcpCode} language="json" showActions={true} />
            </TabsContent>

            <TabsContent value="langchain" className="mt-3">
              <CodeBlock code={langchainCode} language="python" showActions={true} />
            </TabsContent>

            <TabsContent value="custom" className="mt-3">
              <CodeBlock code={customCode} language="javascript" showActions={true} />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
};
