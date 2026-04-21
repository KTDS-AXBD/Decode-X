import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OrganizationProvider } from "./contexts/OrganizationContext";
import { Toaster } from "./components/ui/sonner";
import { Layout } from "./components/Layout";
// F374: Feature Flag skeleton — ?legacy=1 듀얼 화면 롤아웃 (Executive/Engineer View는 S220+)
import { isLegacyMode } from "./lib/feature-flag";

// Pages
const DashboardPage = lazy(() => import("./pages/dashboard"));
const LoginPage = lazy(() => import("./pages/login"));
const WelcomePage = lazy(() => import("./pages/welcome")); // F372
const UploadPage = lazy(() => import("./pages/upload"));
const AnalysisPage = lazy(() => import("./pages/analysis"));
const HITLReviewPage = lazy(() => import("./pages/hitl"));
const OntologyPage = lazy(() => import("./pages/ontology"));
const SkillCatalogPage = lazy(() => import("./pages/skill-catalog"));
const SkillDetailPage = lazy(() => import("./pages/skill-detail"));
const ApiConsolePage = lazy(() => import("./pages/api-console"));
const AnalysisReportPage = lazy(() => import("./pages/analysis-report"));
const GuidePage = lazy(() => import("./pages/guide"));
const SettingsPage = lazy(() => import("./pages/settings"));
const SourceUploadPage = lazy(() => import("./pages/source-upload"));
const FactCheckPage = lazy(() => import("./pages/fact-check"));
const SpecCatalogPage = lazy(() => import("./pages/spec-catalog"));
const SpecDetailPage = lazy(() => import("./pages/spec-detail"));
const ExportCenterPage = lazy(() => import("./pages/export-center"));
const GapAnalysisPage = lazy(() => import("./pages/gap-analysis"));
const BenchmarkPage = lazy(() => import("./pages/benchmark"));
const MockupPage = lazy(() => import("./pages/mockup"));
const PocReportPage = lazy(() => import("./pages/poc-report"));
const PocAiReadyPage = lazy(() => import("./pages/poc-ai-ready"));
const PocAiReadyDetailPage = lazy(() => import("./pages/poc-ai-ready-detail"));
const PocPhase2ReportPage = lazy(() => import("./pages/poc-phase-2-report"));
const OrgSpecPage = lazy(() => import("./pages/org-spec"));
const NotFoundPage = lazy(() => import("./pages/not-found"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    </div>
  );
}

// F370 + F389: CF Access 인증 기반 ProtectedRoute
// isLoading 중에는 스피너 표시 — CF JWT 확인 완료 전에 /welcome 리다이렉트 방지
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingFallback />;
  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

// F374: Feature Flag 적용 — S219는 기존 페이지 구조 유지 (Executive/Engineer View는 S220+)
// ?legacy=1 시 기존 레이아웃, 미적용 시 동일 레이아웃 (S220+ 전환 예정)
function AppRoutes() {
  const _legacy = isLegacyMode(); // S220부터 분기 활성화
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><Layout><UploadPage /></Layout></ProtectedRoute>} />
      <Route path="/analysis" element={<ProtectedRoute><Layout><AnalysisPage /></Layout></ProtectedRoute>} />
      <Route path="/analysis-report" element={<ProtectedRoute><Layout><AnalysisReportPage /></Layout></ProtectedRoute>} />
      <Route path="/hitl" element={<ProtectedRoute><Layout><HITLReviewPage /></Layout></ProtectedRoute>} />
      <Route path="/ontology" element={<ProtectedRoute><Layout><OntologyPage /></Layout></ProtectedRoute>} />
      <Route path="/skills" element={<ProtectedRoute><Layout><SkillCatalogPage /></Layout></ProtectedRoute>} />
      <Route path="/skills/:id" element={<ProtectedRoute><Layout><SkillDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/api-console" element={<ProtectedRoute><Layout><ApiConsolePage /></Layout></ProtectedRoute>} />
      <Route path="/guide" element={<ProtectedRoute><Layout><GuidePage /></Layout></ProtectedRoute>} />
      <Route path="/source-upload" element={<ProtectedRoute><Layout><SourceUploadPage /></Layout></ProtectedRoute>} />
      <Route path="/fact-check" element={<ProtectedRoute><Layout><FactCheckPage /></Layout></ProtectedRoute>} />
      <Route path="/gap-analysis" element={<ProtectedRoute><Layout><GapAnalysisPage /></Layout></ProtectedRoute>} />
      <Route path="/specs" element={<ProtectedRoute><Layout><SpecCatalogPage /></Layout></ProtectedRoute>} />
      <Route path="/specs/:id" element={<ProtectedRoute><Layout><SpecDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/export" element={<ProtectedRoute><Layout><ExportCenterPage /></Layout></ProtectedRoute>} />
      <Route path="/benchmark" element={<ProtectedRoute><Layout><BenchmarkPage /></Layout></ProtectedRoute>} />
      <Route path="/mockup" element={<ProtectedRoute><Layout><MockupPage /></Layout></ProtectedRoute>} />
      <Route path="/poc-report" element={<ProtectedRoute><Layout><PocReportPage /></Layout></ProtectedRoute>} />
      <Route path="/poc/ai-ready" element={<ProtectedRoute><Layout><PocAiReadyPage /></Layout></ProtectedRoute>} />
      <Route path="/poc-phase-2" element={<ProtectedRoute><Layout><PocPhase2ReportPage /></Layout></ProtectedRoute>} />
      <Route path="/poc/ai-ready/:skillId" element={<ProtectedRoute><Layout><PocAiReadyDetailPage /></Layout></ProtectedRoute>} />
      <Route path="/org-spec" element={<ProtectedRoute><Layout><OrgSpecPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><Layout><NotFoundPage /></Layout></ProtectedRoute>} />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrganizationProvider>
          <Toaster />
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <AppRoutes />
            </Suspense>
          </BrowserRouter>
        </OrganizationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
