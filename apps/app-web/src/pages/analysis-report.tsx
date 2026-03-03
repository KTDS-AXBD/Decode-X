import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchDocuments } from "@/api/ingestion";
import type { DocumentRow } from "@/api/ingestion";
import {
  fetchAnalysisSummary,
  fetchCoreProcesses,
  fetchFindings,
} from "@/api/analysis";
import type {
  ExtractionSummary,
  CoreIdentification,
  DiagnosisResult,
} from "@ai-foundry/types";
import { ExtractionSummaryTab } from "@/components/analysis-report/ExtractionSummaryTab";
import { CoreProcessesTab } from "@/components/analysis-report/CoreProcessesTab";
import { DiagnosticFindingsTab } from "@/components/analysis-report/DiagnosticFindingsTab";
import { CrossOrgComparisonTab } from "@/components/analysis-report/CrossOrgComparisonTab";

export default function AnalysisReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    searchParams.get("doc") ?? "",
  );
  const [activeTab, setActiveTab] = useState("summary");
  const [targetProcess, setTargetProcess] = useState<string | null>(null);

  // API data
  const [summary, setSummary] = useState<ExtractionSummary | null>(null);
  const [coreData, setCoreData] = useState<CoreIdentification | null>(null);
  const [diagnosisData, setDiagnosisData] = useState<DiagnosisResult | null>(null);
  const [llmInfo, setLlmInfo] = useState<{ provider: string; model: string } | null>(null);

  // Loading states
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingCore, setLoadingCore] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);

  // Load document list
  useEffect(() => {
    void fetchDocuments()
      .then((res) => {
        if (res.success) {
          setDocuments(res.data.documents);
          if (!selectedDocId) {
            const first = res.data.documents[0];
            if (first) setSelectedDocId(first.document_id);
          }
        } else {
          toast.error("문서 목록 로드 실패: " + res.error.message);
        }
      })
      .catch(() => toast.error("문서 목록 API 호출 실패"))
      .finally(() => setLoadingDocs(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load analysis data when document changes
  useEffect(() => {
    if (!selectedDocId) return;

    // Update URL query param
    setSearchParams({ doc: selectedDocId }, { replace: true });

    // Reset data
    setSummary(null);
    setCoreData(null);
    setDiagnosisData(null);

    // Fetch all 3 layers in parallel
    setLoadingSummary(true);
    setLoadingCore(true);
    setLoadingFindings(true);

    void fetchAnalysisSummary(selectedDocId)
      .then((res) => {
        if (res.success) {
          setSummary(res.data);
          const d = res.data as ExtractionSummary & { llmProvider?: string; llmModel?: string };
          if (d.llmProvider) setLlmInfo({ provider: d.llmProvider, model: d.llmModel ?? "unknown" });
          else setLlmInfo(null);
        }
      })
      .catch(() => {/* silently handle — data just won't show */})
      .finally(() => setLoadingSummary(false));

    void fetchCoreProcesses(selectedDocId)
      .then((res) => {
        if (res.success) setCoreData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoadingCore(false));

    void fetchFindings(selectedDocId)
      .then((res) => {
        if (res.success) setDiagnosisData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoadingFindings(false));
  }, [selectedDocId, setSearchParams]);

  const handleProcessClick = useCallback((processName: string) => {
    setTargetProcess(processName);
    setActiveTab("core");
  }, []);

  const handleRefreshFindings = useCallback(() => {
    if (!selectedDocId) return;
    setLoadingFindings(true);
    void fetchFindings(selectedDocId)
      .then((res) => {
        if (res.success) setDiagnosisData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoadingFindings(false));
  }, [selectedDocId]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            분석 리포트 Analysis Report
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              문서별 3-Layer 분석 + 조직 간 비교
            </p>
            {llmInfo && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: llmInfo.provider === "anthropic" ? "rgba(147, 51, 234, 0.1)" : "rgba(16, 163, 127, 0.1)",
                  color: llmInfo.provider === "anthropic" ? "#9333EA" : "#10A37F",
                  border: `1px solid ${llmInfo.provider === "anthropic" ? "rgba(147, 51, 234, 0.3)" : "rgba(16, 163, 127, 0.3)"}`,
                }}
              >
                {llmInfo.model}
              </span>
            )}
          </div>
        </div>
        {activeTab !== "comparison" && (
          <div className="w-72">
            <Select
              value={selectedDocId}
              onValueChange={setSelectedDocId}
              disabled={loadingDocs}
            >
              <SelectTrigger>
                <SelectValue placeholder="문서 선택..." />
              </SelectTrigger>
              <SelectContent>
                {documents.map((doc) => (
                  <SelectItem key={doc.document_id} value={doc.document_id}>
                    {doc.original_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">추출 요약</TabsTrigger>
          <TabsTrigger value="core">핵심 프로세스</TabsTrigger>
          <TabsTrigger value="findings">진단 소견</TabsTrigger>
          <TabsTrigger value="comparison">조직 비교</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <ExtractionSummaryTab
            data={summary}
            loading={loadingSummary}
            onProcessClick={handleProcessClick}
          />
        </TabsContent>

        <TabsContent value="core" className="mt-4">
          <CoreProcessesTab
            data={coreData}
            loading={loadingCore}
            initialProcess={targetProcess}
          />
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          <DiagnosticFindingsTab
            data={diagnosisData}
            loading={loadingFindings}
            documentId={selectedDocId}
            onRefresh={handleRefreshFindings}
          />
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          <CrossOrgComparisonTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
