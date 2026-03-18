/**
 * Agent Console — Generative UI 통합 페이지.
 * AIF-REQ-024 Phase 4: app-web Integration
 *
 * AgentRunPanel + WidgetRenderer + HITL 컴포넌트를 통합하여
 * 에이전트 실행 → 시각화 생성 → HITL 상호작용을 단일 화면에서 수행.
 */

import { useMemo } from "react";
import { AgentRunPanel } from "@/components/generative-ui/AgentRunPanel";
import { extractThemeVariables } from "@/lib/generative-ui/widget-theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function AgentConsolePage() {
  const { organizationId } = useOrganization();
  const { darkMode } = useTheme();

  const themeVariables = useMemo(() => extractThemeVariables(darkMode), [darkMode]);

  return (
    <div className="space-y-6 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Agent Console
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--text-secondary)" }}
        >
          AI 에이전트에게 작업을 요청하고, 생성된 시각화와 HITL 상호작용을 수행하세요.
        </p>
      </div>

      {/* Agent Run Panel */}
      <div className="flex-1 overflow-auto">
        <AgentRunPanel
          organizationId={organizationId}
          themeVariables={themeVariables}
          isDark={darkMode}
        />
      </div>
    </div>
  );
}
