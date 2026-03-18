/**
 * Generative UI — app-web 통합 모듈 인덱스.
 * AIF-REQ-024 Phase 4: app-web Integration
 */

// Components
export { WidgetRenderer } from "./WidgetRenderer";
export type { WidgetRendererProps } from "./WidgetRenderer";

export { AgentRunPanel } from "./AgentRunPanel";

// HITL Components
export { PolicyApprovalCard } from "./hitl/PolicyApprovalCard";
export type { PolicyApprovalCardProps } from "./hitl/PolicyApprovalCard";

export { EntityConfirmation, sortCandidatesBySimilarity } from "./hitl/EntityConfirmation";
export type { EntityConfirmationProps, EntityCandidate } from "./hitl/EntityConfirmation";

export { ParameterInput, validateRequiredFields } from "./hitl/ParameterInput";
export type { ParameterInputProps, ParameterField } from "./hitl/ParameterInput";

// Lib re-exports for convenience
export type { WidgetType, BridgeAction } from "@/lib/generative-ui/widget-bridge";
export type { ThemeVariables } from "@/lib/generative-ui/widget-theme";
export { extractThemeVariables } from "@/lib/generative-ui/widget-theme";
export { selectVisualizationType, analyzeDataCharacteristics } from "@/lib/generative-ui/decision-matrix";
export type { DataCharacteristics, VizSelection } from "@/lib/generative-ui/decision-matrix";
