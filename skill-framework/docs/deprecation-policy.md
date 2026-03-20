# Skill Deprecation Policy

> 스킬 폐기(deprecation), 아카이브(archive), 복구, 완전 삭제에 관한 정책.

---

## 1. Deprecation Criteria

스킬이 아래 **3가지 조건을 모두** 충족하면 폐기 후보로 등록:

| 조건 | 기준 |
|------|------|
| **미사용** | `usageCount = 0` (최근 3개월간 호출 기록 없음) |
| **장기 방치** | 마지막 수정일로부터 3개월 이상 경과 |
| **대체 존재** | 동일 기능을 수행하는 활성 스킬이 존재 |

- 3가지 중 일부만 충족하면 폐기 대신 **개선 검토** 대상으로 분류한다.
- 대체 스킬이 없는 경우, 사용량이 0이어도 폐기하지 않는다.

---

## 2. Deprecation Process

```
Active ──→ Deprecated ──(1개월 유예)──→ Archived
```

### Step 1: deprecated 마킹

메타데이터에 `deprecated: true`, `deprecatedReason`, `deprecatedDate` 기록.
카탈로그에서 `[DEPRECATED]` 라벨로 표시. 대체 스킬을 안내한다.

### Step 2: 1개월 유예 기간

유예 중 스킬은 동작하지만 호출 시 경고 출력. 사용량 발생 시 폐기 재검토.

### Step 3: Archived 전환

유예 종료 후 `archived: true`, `archivedDate` 추가.
```

---

## 3. Archive Rules

- **메타데이터 유지**: 카탈로그 JSON에 기록은 남긴다 (이력 추적용).
- **파일 이동**: 스킬 디렉토리를 `archive/` 하위로 이동.
- **카탈로그 표시**: `[ARCHIVED]` 라벨. 기본 검색에서 제외, `--include-archived` 옵션으로 조회 가능.

```
archive/
└── old-skill/
    ├── SKILL.md
    └── references/
```

---

## 4. Recovery

아카이브된 스킬을 재활성화하려면:

1. `deprecated: false`, `archived: false`로 변경
2. `archive/`에서 원래 위치로 파일 복원
3. 카탈로그 재등록 (`bun run skill-catalog`)
4. 린트 재검증 (`bun run skill-lint`)

- 복구 시 `recoveredDate`와 사유를 메타데이터에 기록한다.

---

## 5. Permanent Deletion

- `archived: true` 상태에서 **6개월 경과** 후 완전 삭제 가능.
- 삭제 전 최종 확인: 참조하는 다른 스킬이 없는지 의존성 검사.
- 삭제 후 카탈로그 메타데이터에서도 제거한다.
- 타임라인: Active → Deprecated(즉시) → Archived(+1개월) → Deleted(+6개월) = 총 최소 7개월.
