import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Package, Star, Download, TrendingUp, CheckCircle, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSkills, downloadSkill } from '@/api/skill';
import type { SkillRow } from '@/api/skill';

const TRUST_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  unreviewed: { label: '미검토', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.1)' },
  reviewed: { label: '검토됨', color: 'var(--accent)', bg: 'rgba(246, 173, 85, 0.15)' },
  validated: { label: '검증됨', color: 'var(--success)', bg: 'rgba(56, 161, 105, 0.1)' },
};

export default function SkillCatalogPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trustFilter, setTrustFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    void fetchSkills(trustFilter ? { limit: 100, trustLevel: trustFilter } : { limit: 100 })
      .then((res) => { if (res.success) setSkills(res.data.skills); })
      .catch(() => toast.error('Skill 목록을 불러올 수 없습니다'))
      .finally(() => setLoading(false));
  }, [trustFilter]);

  const handleDownload = async (skillId: string) => {
    try {
      const blob = await downloadSkill(skillId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${skillId}.skill.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('다운로드 완료');
    } catch {
      toast.error('다운로드 실패');
    }
  };

  const filteredSkills = searchQuery
    ? skills.filter((s) =>
        s.metadata.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.skillId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.metadata.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : skills;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Skill 카탈로그 Skill Catalog
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          AI Foundry Skill 패키지 탐색 및 다운로드
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <Input placeholder="Skill 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2">
          {['', 'unreviewed', 'reviewed', 'validated'].map((filter) => (
            <Button
              key={filter}
              variant={trustFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrustFilter(filter)}
            >
              {filter === '' ? '전체' : TRUST_CONFIG[filter]?.label ?? filter}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 Skill</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{skills.length}</div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>검증됨</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--success)' }}>
            {skills.filter((s) => s.trust.level === 'validated').length}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>검토 중</div>
          <div className="text-2xl font-bold mt-1" style={{ color: 'var(--accent)' }}>
            {skills.filter((s) => s.trust.level === 'reviewed').length}
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4">
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 정책</div>
          <div className="text-2xl font-bold mt-1" style={{ color: '#9333EA' }}>
            {skills.reduce((sum, s) => sum + s.policyCount, 0)}
          </div>
        </CardContent></Card>
      </div>

      {/* Skill Grid */}
      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</div>
      ) : filteredSkills.length === 0 ? (
        <Card><CardContent className="p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-secondary)' }}>Skill 패키지가 없습니다</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredSkills.map((skill) => {
            const trust = TRUST_CONFIG[skill.trust.level] ?? TRUST_CONFIG['unreviewed']!;
            return (
              <Card key={skill.skillId} className="shadow-sm hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <code className="text-xs px-2 py-1 rounded font-mono" style={{ backgroundColor: 'var(--surface)', color: 'var(--primary)' }}>
                      {skill.skillId.slice(0, 12)}
                    </code>
                    <Badge style={{ backgroundColor: trust.bg, color: trust.color, border: 'none' }} className="text-xs">
                      {trust.label}
                    </Badge>
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {skill.metadata.domain}
                    {skill.metadata.subdomain ? ` / ${skill.metadata.subdomain}` : ''}
                  </h3>
                  <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    <span>v{skill.metadata.version}</span>
                    <span>|</span>
                    <span>정책 {skill.policyCount}건</span>
                    <span>|</span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3" /> {(skill.trust.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  {skill.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {skill.metadata.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>{skill.metadata.author} | {new Date(skill.metadata.createdAt).toLocaleDateString('ko-KR')}</span>
                    <Button variant="outline" size="sm" onClick={() => void handleDownload(skill.skillId)}>
                      <Download className="w-3 h-3 mr-1" /> 다운로드
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
