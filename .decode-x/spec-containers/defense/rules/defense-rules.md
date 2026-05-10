# Spec Container — DEFENSE-001 (국방 산업 합성 도메인)

**Skill ID**: DEFENSE-001
**Domain**: Defense (국방 산업 — 무기고한도/보안등급한도/임무파견atomic/임무상태전환/훈련교체/기밀문서atomic)
**Source**: SYNTHETIC — Sprint 306 F472, withRuleId 재사용 36번째 도메인 PoC (Mining 다음 산업, 25번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (DF-001 ~ DF-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| DF-001 | 무기 보유 기록 요청 시 | `totalQuantity < MAX_WEAPON_INVENTORY_LIMIT` (UPPERCASE 상수, 500) | 보유 허용 + weapon_inventory INSERT | `E422-INVENTORY-EXCEEDED` (단위부대 무기 보유 한도 초과) |
| DF-002 | 보안 레벨 검증 시 | `clearanceLevel <= clearanceLevelLimit` (var-vs-var, `limit` keyword 매칭) | 보안 레벨 승인 | `E422-CLEARANCE-EXCEEDED` (보안 레벨 한도 초과) |
| DF-003 | 임무 파견 요청 시 | `mission.status = 'planned'` | atomic: `missions` INSERT + `mission_assignments` INSERT + `mission_equipment` INSERT + `mission_communications` INSERT | `E404-MISSION`, `E409-MISSION` |
| DF-004 | 임무 상태 전환 (planned → briefed → executing → completed → debriefed) | 허용 매트릭스 충족 | `missions.status` UPDATE + 타임스탬프 기록 | `E404-MISSION`, `E409-MISSION` |
| DF-005 | 훈련 교체 일괄 처리 | `training_schedules.scheduled_at <= scheduledBefore` AND `status = 'scheduled'` | `status='completed', completed_at=NOW()` 일괄 UPDATE | 대상 없으면 completedCount=0 |
| DF-006 | 기밀 문서 처리 시 | 문서 처리 필수 | atomic: `classified_documents` INSERT + `document_validations` INSERT + `document_issuances` INSERT + `document_audit_logs` INSERT + `classified_documents.status` UPDATE | 조회 실패 시 DefenseError |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `weapon_inventory` | INSERT (DF-001) | recordWeaponInventory |
| `clearance_assignments` | SELECT (DF-002) | checkClearanceLevel |
| `missions` | INSERT + status 갱신 (DF-003/DF-004) | dispatchMission / transitionMissionStatus |
| `mission_assignments` | INSERT (DF-003) | dispatchMission |
| `mission_equipment` | INSERT (DF-003) | dispatchMission |
| `mission_communications` | INSERT (DF-003) | dispatchMission |
| `training_schedules` | status='completed' 일괄 갱신 (DF-005) | markTrainingRotation |
| `classified_documents` | INSERT + status=issued (DF-006) | processClassifiedDocument |
| `document_validations` | INSERT (DF-006) | processClassifiedDocument |
| `document_issuances` | INSERT (DF-006) | processClassifiedDocument |
| `document_audit_logs` | INSERT (DF-006) | processClassifiedDocument |

---

## 임계값 / 상수

- `MAX_WEAPON_INVENTORY_LIMIT = 500` (DF-001 단위부대 무기 보유 한도, 수량)
- `clearanceLevelLimit = clearance_tiers.clearance_level_limit` (DF-002 단계별 보안 레벨 한도)

---

## 상태 머신

```
missions: planned → briefed (DF-004 transition)
missions: briefed → executing (DF-004 transition)
missions: executing → completed (DF-004 transition)
missions: completed → debriefed (DF-004 transition)

training_schedules: scheduled → completed (DF-005 batch)

classified_documents: [created] → classified → issued (DF-006 atomic)
```

---

## 권한

- **recordWeaponInventory**: 무기관리 SYSTEM / 군수담당
- **checkClearanceLevel**: 보안관리 SYSTEM
- **dispatchMission**: 작전관리 SYSTEM (지휘관 필수)
- **transitionMissionStatus**: 작전관리 SYSTEM / 임무관리자
- **markTrainingRotation**: 훈련관리 SYSTEM (배치)
- **processClassifiedDocument**: 보안문서관리 SYSTEM / 보안담당관

---

## 관련 문서

- `rules/DF-001.md` ~ `rules/DF-006.md` — 개별 BL detail
- `runbooks/DF-001.md` ~ `runbooks/DF-006.md` — operational runbooks
- `tests/DF-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/defense.ts` — 합성 source
