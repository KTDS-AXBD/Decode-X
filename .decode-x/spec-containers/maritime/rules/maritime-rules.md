# Spec Container — MARITIME-001 (해운 산업 합성 도메인)

**Skill ID**: MARITIME-001
**Domain**: Maritime (해운 산업 — 화물한도/운임한도/통관atomic/선적상태전환/항구처리배치/손상신고atomic)
**Source**: SYNTHETIC — Sprint 302 F468, withRuleId 재사용 32번째 도메인 PoC (Construction 다음 산업, 21번째 신규)
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MR-001 ~ MR-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MR-001 | 화물 선적 시 | `cargoTons < MAX_CARGO_CAPACITY_TONS` (UPPERCASE 상수, 200,000 tons) AND 선박 status='available' 또는 'loading' | 선적 허용 + shipments INSERT | `E422-CARGO-LIMIT` (화물 한도 초과) |
| MR-002 | 운임 계산 시 | `quotedRate <= freightRateLimit` (var-vs-var, `limit` keyword 매칭) | 운임 허용 + freight_rates INSERT | `E422-FREIGHT-RATE-EXCEEDED` (운임 한도 초과) |
| MR-003 | 통관 처리 시 | `shipment.status = 'arrived'` | atomic: `customs_declarations` INSERT + `customs_approvals` INSERT + `shipments.customs_cleared` 갱신 | `E404-SHIPMENT`, `E409-SHIPMENT` |
| MR-004 | 선적 상태 전환 (booked → loaded → at_sea → arrived → delivered) | 허용 매트릭스 충족 | `shipments.status` UPDATE + 타임스탬프 기록 | `E404-SHIPMENT`, `E409-SHIPMENT` |
| MR-005 | 항구 처리 일괄 갱신 (배치) | `shipments.status = 'arrived'` AND `arrived_at <= arrivalCutoff` AND `port_handled = 0` | `port_handled=1, status='port_cleared'` 일괄 UPDATE | 대상 없으면 handledCount=0 |
| MR-006 | 손상 신고 처리 시 | `shipment.status = 'delivered'` 또는 `'arrived'` | atomic: `damage_claims` INSERT + `compensation_records` INSERT + `shipments.damage_claim_filed` UPDATE | `E404-SHIPMENT`, `E409-SHIPMENT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `shipments` | status 전환 / loaded_at / departed_at / arrived_at / delivered_at / customs_cleared / port_handled / damage_claim_filed (MR-001/MR-003/MR-004/MR-005/MR-006) | loadCargo / processCustoms / transitionShipmentStatus / markPortHandled / processDamageClaim |
| `vessels` | current_load_tons 갱신 (MR-001) | loadCargo |
| `freight_rates` | INSERT (MR-002) | computeFreightRate |
| `customs_declarations` | INSERT (MR-003) | processCustoms |
| `customs_approvals` | INSERT (MR-003) | processCustoms |
| `damage_claims` | INSERT (MR-006) | processDamageClaim |
| `compensation_records` | INSERT (MR-006) | processDamageClaim |

---

## 임계값 / 상수

- `MAX_CARGO_CAPACITY_TONS = 200_000` (MR-001 최대 화물 적재 한도, tons)
- `freightRateLimit = 15/35/40/45` (MR-002 항로 유형별 최대 운임 한도, USD/ton — intra_asia/asia_europe/transpacific/transatlantic)

---

## 상태 머신

```
shipments: booked → loaded (MR-004 transition)
shipments: loaded → at_sea (MR-004 transition)
shipments: at_sea → arrived (MR-004 transition)
shipments: arrived → delivered (MR-004 transition)

shipments: arrived → port_cleared (MR-005 batch, port_handled=0 → port_handled=1)

customs_declarations: [created] — MR-003 atomic 생성 (status='cleared')
customs_approvals: [created] — MR-003 atomic 생성 (불변)

damage_claims: [created] — MR-006 atomic 생성 (status='compensated')
compensation_records: [created] — MR-006 atomic 생성 (불변)
```

---

## 권한

- **loadCargo**: 화주 / 화물관리 SYSTEM
- **computeFreightRate**: 운임팀 / 운임계산 SYSTEM
- **processCustoms**: 세관직원 / 통관 SYSTEM
- **transitionShipmentStatus**: 선사 / 선적관리 SYSTEM
- **markPortHandled**: 항구관리 SYSTEM (배치)
- **processDamageClaim**: 손해사정인 / 손상관리 SYSTEM

---

## 관련 문서

- `rules/MR-001.md` ~ `rules/MR-006.md` — 개별 BL detail
- `runbooks/MR-001.md` ~ `runbooks/MR-006.md` — operational runbooks
- `tests/MR-001.yaml` — 대표 test scenarios
- `반제품-스펙/.../src/domain/maritime.ts` — 합성 source
