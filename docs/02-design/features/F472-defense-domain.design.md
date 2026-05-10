---
id: AIF-DSGN-104
sprint: 306
feature: F472
title: Defense 36번째 도메인 설계 — 국방 산업 합성 도메인 (25번째 신규 산업)
status: active
created: 2026-05-10
related: AIF-PLAN-104
---

# F472 Design — AIF-DSGN-104

## §1 목표

36번째 도메인 국방(Defense) 신규 — **25번째 신규 산업** (CC+DV+SB+IN+HC+ED+RE+LG+HO+TR+MF+RT+EN+GV+TC+BK+MD+PH+AG+CN+MR+TS+AV+MN+DF). Mining(MN) 패턴 복제 + 국방 특화 Schema.

## §2 BL 설계

| ID | 함수 | Detector | Threshold 변수 |
|----|------|----------|---------------|
| DF-001 | `recordWeaponInventory()` | ThresholdCheck (Path A, UPPERCASE) | `MAX_WEAPON_INVENTORY_LIMIT` |
| DF-002 | `checkClearanceLevel()` | ThresholdCheck (Path B, var-vs-var) | `clearanceLevelLimit` keyword |
| DF-003 | `dispatchMission()` | AtomicTransaction | db.transaction() 4-table |
| DF-004 | `transitionMissionStatus()` | StatusTransition | planned→briefed→executing→completed→debriefed |
| DF-005 | `markTrainingRotation()` | StatusTransition (batch) | CC-005 25번째 재사용 |
| DF-006 | `processClassifiedDocument()` | AtomicTransaction | db.transaction() 4-table |

## §3 Schema 설계

```sql
-- DF-001: 무기 보유고
weapon_inventory(id, unit_id, weapon_type, quantity, max_capacity, recorded_at, status)
weapon_limits(id, weapon_type, unit_tier, max_inventory_limit)

-- DF-002: 보안 레벨
clearance_assignments(id, personnel_id, clearance_tier, clearance_level, assigned_at, status)
clearance_tiers(id, tier, clearance_level_limit, description)

-- DF-003: 임무 파견 (atomic)
missions(id, unit_id, mission_code, status, planned_at, dispatched_at, completed_at)
mission_assignments(id, mission_id, personnel_id, role, assigned_at)
mission_equipment(id, mission_id, equipment_id, quantity, assigned_at)
mission_communications(id, mission_id, channel, protocol, activated_at)

-- DF-004: 임무 상태 전환
-- missions.status: planned → briefed → executing → completed → debriefed

-- DF-005: 훈련 교체 (batch)
training_schedules(id, unit_id, personnel_id, training_type, scheduled_at, status, completed_at)

-- DF-006: 기밀 문서 처리 (atomic)
classified_documents(id, unit_id, document_code, classification_level, status, processed_at, issued_at)
document_validations(id, document_id, validated_by, validated_at, result)
document_issuances(id, document_id, issued_to, issued_at, receipt_confirmed)
document_audit_logs(id, document_id, action, performed_by, performed_at)
```

## §4 파일 목록

### 신규 생성

| 파일 | 용도 |
|------|------|
| `반제품-스펙/.../src/domain/defense.ts` | DF-001~DF-006 합성 source (~280 lines) |
| `.decode-x/spec-containers/defense/provenance.yaml` | Detection 결과 + 출처 |
| `.decode-x/spec-containers/defense/rules/defense-rules.md` | BL 테이블 (파서 입력) |
| `.decode-x/spec-containers/defense/rules/DF-001.md` ~ `DF-006.md` | BL 개별 상세 |
| `.decode-x/spec-containers/defense/runbooks/DF-001.md` ~ `DF-006.md` | 운영 절차 |
| `.decode-x/spec-containers/defense/tests/DF-001.yaml` | 대표 시나리오 |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `packages/utils/src/divergence/rules-parser.ts` | `BL_ID_PATTERN`에 `DF` prefix 추가 |
| `packages/utils/src/divergence/bl-detector.ts` | `DF-001~DF-006` REGISTRY 추가 |
| `scripts/divergence/domain-source-map.ts` | defense 36번째 entry 추가 |
| `packages/utils/test/bl-detector.test.ts` | 195→201 카운트 + DF 목록 + describe 블록 |

## §5 검증

- `pnpm test` (turbo --force): 297 PASS (291 + 6 DF 신규)
- `pnpm typecheck --force`: 0 errors
- detect-bl: 36 containers, defense 6 BLs, 0 ABSENCE
- write-provenance --apply: 0/36 changes (PRESENCE 자동 입증)
