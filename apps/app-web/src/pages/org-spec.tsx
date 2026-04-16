import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, FileText, Database, Shield, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchOrgSpec, type OrgSpecDocument } from "@/api/org-spec";
import { MarkdownContent } from "@/components/markdown-content";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export default function OrgSpecPage() {
  const { organizationId } = useOrganization();
  const [specs, setSpecs] = useState<Record<string, OrgSpecDocument>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const loadSpec = useCallback(
    async (type: "business" | "technical" | "quality") => {
      setLoading(type);
      try {
        const doc = await fetchOrgSpec(organizationId, type, { llm: false });
        setSpecs((prev) => ({ ...prev, [type]: doc }));
      } catch (err) {
        toast.error(`${type} Spec 조회 실패: ${String(err)}`);
      } finally {
        setLoading(null);
      }
    },
    [organizationId],
  );

  const currentSpec = (type: string) => specs[type];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Org 종합 Spec</h1>
          <p className="text-sm text-muted-foreground mt-1">
            조직 전체 Skills를 집계한 B/T/Q 종합 Spec 문서
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Org: {organizationId}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="business">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="business" onClick={() => { if (!specs["business"]) void loadSpec("business"); }}>
            <FileText className="w-4 h-4 mr-2" /> Business
          </TabsTrigger>
          <TabsTrigger value="technical" onClick={() => { if (!specs["technical"]) void loadSpec("technical"); }}>
            <Database className="w-4 h-4 mr-2" /> Technical
          </TabsTrigger>
          <TabsTrigger value="quality" onClick={() => { if (!specs["quality"]) void loadSpec("quality"); }}>
            <Shield className="w-4 h-4 mr-2" /> Quality
          </TabsTrigger>
        </TabsList>

        {(["business", "technical", "quality"] as const).map((type) => (
          <TabsContent key={type} value={type} className="space-y-4 mt-4">
            <SpecTabContent
              type={type}
              doc={currentSpec(type)}
              loading={loading === type}
              onRefresh={() => void loadSpec(type)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ── Sub-component ───────────────────────────────

function SpecTabContent({
  type,
  doc,
  loading,
  onRefresh,
}: {
  type: string;
  doc: OrgSpecDocument | undefined;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-16 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">
            {type} Spec 생성 중...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!doc) {
    return (
      <Card>
        <CardContent className="p-16 text-center space-y-4">
          <p className="text-muted-foreground">
            {type} Spec이 아직 생성되지 않았어요.
          </p>
          <Button onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" /> 생성하기
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { metadata, sections, skillCount } = doc;
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const score = metadata.aiReadyScore[type as keyof typeof metadata.aiReadyScore] ?? 0;

  return (
    <>
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {type.charAt(0).toUpperCase() + type.slice(1)} Spec 요약
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 rounded bg-muted/30 text-center">
              <div className="text-xs text-muted-foreground">Skills</div>
              <div className="text-lg font-bold">{skillCount}</div>
            </div>
            <div className="p-3 rounded bg-muted/30 text-center">
              <div className="text-xs text-muted-foreground">정책</div>
              <div className="text-lg font-bold">{metadata.totalPolicies}</div>
            </div>
            <div className="p-3 rounded bg-muted/30 text-center">
              <div className="text-xs text-muted-foreground">평균 신뢰도</div>
              <div className="text-lg font-bold">{pct(metadata.avgTrustScore)}</div>
            </div>
            <div className="p-3 rounded bg-muted/30 text-center">
              <div className="text-xs text-muted-foreground">{type} Score</div>
              <div className={`text-lg font-bold ${score >= 0.5 ? "text-emerald-600" : "text-red-600"}`}>
                {pct(score)}
              </div>
            </div>
          </div>
          <Progress value={score * 100} className="h-2" />
        </CardContent>
      </Card>

      {/* Sections — 마크다운 렌더링 (접기/펼치기) */}
      {sorted.map((section) => (
        <SpecSection key={section.id} title={section.title} content={section.content} />
      ))}
    </>
  );
}

function SpecSection({ title, content }: { title: string; content: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setCollapsed((v) => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            {title}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {content.split("\n").length} lines
          </Badge>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <div className="rounded border bg-card p-4 overflow-y-auto max-h-[32rem]">
            <MarkdownContent content={content} className="text-sm leading-relaxed" />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
