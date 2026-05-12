// F-NEW-B (S300 F510): RoleBasedGate — RBAC 권한 기반 조건부 렌더링 컴포넌트
//
// `@ai-foundry/types/rbac` SSOT 매핑(F-NEW-A) + AuthContext `usePermission` hook을 사용하여
// 현 사용자가 resource/action 권한이 있을 때만 children을 렌더링한다.
// 권한 없으면 fallback prop을 렌더 (기본 null).
//
// **사용처 예**:
// ```tsx
// <RoleBasedGate resource="document" action="delete">
//   <DeleteButton />
// </RoleBasedGate>
//
// <RoleBasedGate resource="policy" action="approve" fallback={<ReadOnlyBadge />}>
//   <ApprovePolicyForm />
// </RoleBasedGate>
// ```
//
// 참조: `docs/03-analysis/features/sprint-324-rbac-domain-decision.analysis.md` (AIF-ANLS-119)

import type { ReactNode } from "react";
import type { Resource, Action } from "@ai-foundry/types";
import { usePermission } from "@/contexts/AuthContext";

export interface RoleBasedGateProps {
  resource: Resource;
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleBasedGate({
  resource,
  action,
  children,
  fallback = null,
}: RoleBasedGateProps): ReactNode {
  const allowed = usePermission(resource, action);
  if (!allowed) return fallback;
  return children;
}
