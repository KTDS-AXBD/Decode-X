import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Network, Box, Link as LinkIcon, Plus, Edit } from 'lucide-react';

interface OntologyNode {
  id: string;
  name: string;
  nameEn: string;
  type: 'domain' | 'concept' | 'attribute' | 'relation';
  description: string;
  parent?: string;
  children?: string[];
  relatedConcepts?: string[];
}

const mockNodes: OntologyNode[] = [
  {
    id: 'node-1',
    name: '퇴직연금',
    nameEn: 'Retirement Pension',
    type: 'domain',
    description: '퇴직연금 제도 전반에 대한 도메인',
    children: ['node-2', 'node-3', 'node-4'],
  },
  {
    id: 'node-2',
    name: '중도인출',
    nameEn: 'Mid-term Withdrawal',
    type: 'concept',
    description: '퇴직 전 연금 적립금 인출',
    parent: 'node-1',
    children: ['node-5', 'node-6'],
    relatedConcepts: ['node-3'],
  },
  {
    id: 'node-3',
    name: '가입 자격',
    nameEn: 'Eligibility',
    type: 'concept',
    description: '연금 가입 및 혜택 수령 자격 요건',
    parent: 'node-1',
    relatedConcepts: ['node-2'],
  },
  {
    id: 'node-4',
    name: '적립금 운용',
    nameEn: 'Fund Management',
    type: 'concept',
    description: '연금 적립금의 운용 및 관리',
    parent: 'node-1',
  },
  {
    id: 'node-5',
    name: '인출 사유',
    nameEn: 'Withdrawal Reason',
    type: 'attribute',
    description: '중도인출이 가능한 사유 (무주택자, 요양, 천재지변 등)',
    parent: 'node-2',
  },
  {
    id: 'node-6',
    name: '인출 한도',
    nameEn: 'Withdrawal Limit',
    type: 'attribute',
    description: '중도인출 가능 금액의 상한',
    parent: 'node-2',
  },
];

const getNodeIcon = (type: OntologyNode['type']) => {
  switch (type) {
    case 'domain':
      return <Network className="w-5 h-5" style={{ color: '#3B82F6' }} />;
    case 'concept':
      return <Box className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
    case 'attribute':
      return <LinkIcon className="w-5 h-5" style={{ color: '#10B981' }} />;
    case 'relation':
      return <LinkIcon className="w-5 h-5" style={{ color: '#9333EA' }} />;
  }
};

const getTypeBadge = (type: OntologyNode['type']) => {
  const config = {
    domain: { label: '도메인', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
    concept: { label: '개념', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
    attribute: { label: '속성', color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    relation: { label: '관계', color: '#9333EA', bg: 'rgba(147, 51, 234, 0.1)' },
  };
  const { label, color, bg } = config[type];
  return (
    <Badge style={{ backgroundColor: bg, color, border: 'none' }} className="text-xs">
      {label}
    </Badge>
  );
};

export default function OntologyPage() {
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(mockNodes[0] ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['node-1']));

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNodeTree = (nodeId: string, depth: number = 0): React.ReactNode => {
    const node = mockNodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const isExpanded = expandedNodes.has(nodeId);
    const hasChildren = node.children !== undefined && node.children.length > 0;

    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
            selectedNode?.id === nodeId ? 'shadow-sm' : ''
          }`}
          style={{
            marginLeft: `${depth * 20}px`,
            backgroundColor: selectedNode?.id === nodeId ? 'rgba(26, 54, 93, 0.1)' : 'transparent',
          }}
          onClick={() => setSelectedNode(node)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleNode(nodeId); }}
              className="hover:bg-gray-200 rounded p-0.5"
            >
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isExpanded ? '\u25BC' : '\u25B6'}
              </span>
            </button>
          ) : (
            <span className="w-4" />
          )}
          {getNodeIcon(node.type)}
          <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
            {node.name}
          </span>
          {getTypeBadge(node.type)}
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children?.map((childId) => renderNodeTree(childId, depth + 1))}</div>
        )}
      </div>
    );
  };

  const domainNodes = mockNodes.filter((n) => n.type === 'domain');
  const totalConcepts = mockNodes.filter((n) => n.type === 'concept').length;
  const totalAttributes = mockNodes.filter((n) => n.type === 'attribute').length;

  return (
    <div className="space-y-0 h-[calc(100vh-4rem)] flex flex-col">
      <div className="pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              온톨로지 탐색기 Ontology Explorer
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              도메인 지식 구조화 및 관계 매핑
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            노드 추가
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>도메인</div>
            <div className="text-2xl font-bold" style={{ color: '#3B82F6' }}>{domainNodes.length}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(246, 173, 85, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>개념</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{totalConcepts}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>속성</div>
            <div className="text-2xl font-bold" style={{ color: '#10B981' }}>{totalAttributes}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[40%_60%] overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
        {/* Left Panel — Node Tree */}
        <div className="border-r overflow-hidden flex flex-col" style={{ borderColor: 'var(--border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <Input placeholder="노드 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {domainNodes.map((node) => renderNodeTree(node.id))}
          </div>
        </div>

        {/* Right Panel — Node Detail */}
        <div className="flex flex-col overflow-hidden">
          {selectedNode ? (
            <>
              <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getNodeIcon(selectedNode.type)}
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedNode.name}</h2>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedNode.nameEn}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTypeBadge(selectedNode.type)}
                    <Button variant="outline" size="sm">
                      <Edit className="w-4 h-4 mr-2" />
                      편집
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-6">
                <Card className="shadow-sm">
                  <CardHeader><CardTitle>설명 Description</CardTitle></CardHeader>
                  <CardContent>
                    <p style={{ color: 'var(--text-primary)' }}>{selectedNode.description}</p>
                  </CardContent>
                </Card>

                {selectedNode.parent && (() => {
                  const parentNode = mockNodes.find((n) => n.id === selectedNode.parent);
                  return parentNode ? (
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle>상위 노드 Parent Node</CardTitle></CardHeader>
                      <CardContent>
                        <div
                          className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                          style={{ borderColor: 'var(--border)' }}
                          onClick={() => setSelectedNode(parentNode)}
                        >
                          <div className="flex items-center gap-3">
                            {getNodeIcon(parentNode.type)}
                            <div className="flex-1">
                              <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{parentNode.name}</div>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{parentNode.nameEn}</div>
                            </div>
                            {getTypeBadge(parentNode.type)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null;
                })()}

                {selectedNode.children !== undefined && selectedNode.children.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader><CardTitle>하위 노드 Child Nodes ({selectedNode.children.length})</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedNode.children.map((childId) => {
                          const childNode = mockNodes.find((n) => n.id === childId);
                          return childNode ? (
                            <div
                              key={childId}
                              className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => setSelectedNode(childNode)}
                            >
                              <div className="flex items-center gap-3">
                                {getNodeIcon(childNode.type)}
                                <div className="flex-1">
                                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{childNode.name}</div>
                                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{childNode.nameEn}</div>
                                </div>
                                {getTypeBadge(childNode.type)}
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedNode.relatedConcepts !== undefined && selectedNode.relatedConcepts.length > 0 && (
                  <Card className="shadow-sm">
                    <CardHeader><CardTitle>관련 개념 Related Concepts</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedNode.relatedConcepts.map((relatedId) => {
                          const relatedNode = mockNodes.find((n) => n.id === relatedId);
                          return relatedNode ? (
                            <div
                              key={relatedId}
                              className="p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md"
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => setSelectedNode(relatedNode)}
                            >
                              <div className="flex items-center gap-3">
                                {getNodeIcon(relatedNode.type)}
                                <div className="flex-1">
                                  <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{relatedNode.name}</div>
                                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{relatedNode.nameEn}</div>
                                </div>
                                {getTypeBadge(relatedNode.type)}
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
              노드를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
