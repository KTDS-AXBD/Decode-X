# Spec Container — MUSEUM-001 (박물관/미술관 합성 도메인)

**Skill ID**: MUSEUM-001
**Domain**: Museum (박물관/미술관 산업 — 박물관입장한도/회원일일갤러리한도/입장batchatomic/관람상태전환/만료closedvisit일괄/관람환불atomic)
**Source**: SYNTHETIC — 세션 307 후속 F543, withRuleId 재사용 75번째 도메인 PoC (Zoo 다음 산업, 64번째 신규) 🏛️ 단일 클러스터 6 도메인 첫 사례 마일스톤
**Version**: 1.0.0
**Status**: active

---

## 비즈니스 룰 (MS-001 ~ MS-006)

| ID | condition (When) | criteria (If) | outcome (Then) | exception (Else) |
|----|-----------------|---------------|----------------|-----------------|
| MS-001 | 신규 입장 예약 요청 시 | `museum.active_visits < total_capacity` (UPPERCASE fallback MAX_CONCURRENT_VISITORS_PER_MUSEUM) | 입장 예약 허용 + museum.active_visits 증가 | `E422-MUSEUM-CAPACITY-EXCEEDED` |
| MS-002 | 회원 갤러리 관람 요청 시 | `card.gallery_used + galleries < galleryLimit` (var-vs-var, `limit` keyword) | 갤러리 적용 + gallery_used 증가 | `E422-DAILY-GALLERY-LIMIT-EXCEEDED` |
| MS-003 | 갤러리 입장 atomic 요청 시 | `gallery_schedules.status = 'reserved'` | atomic: museum_visits INSERT + gallery_schedules UPDATE + visit_payments INSERT | `E404-SCHEDULE` |
| MS-004 | 관람 상태 전환 (reserved → visited → updated → ended / closed / cancelled) | 허용 매트릭스 충족 | `gallery_schedules.status` UPDATE | `E404-SCHEDULE`, `E409-SCHEDULE` |
| MS-005 | closed 관람 일괄 만료 처리 | `museum_visits.status = 'closed'` AND `started_at <= now` | `status='expired'` 일괄 UPDATE | 대상 없으면 expiredCount=0 |
| MS-006 | 관람 환불 (closed) atomic 요청 시 | `museum_visits.status = 'closed'` | atomic: visit_refund_records INSERT + visit_refunds INSERT + visit_refund_records UPDATE | `E404-CLOSED-VISIT` |

---

## 데이터 영향

| 테이블 | 변경 | 트리거 |
|--------|------|--------|
| `museums` | active_visits 증가 (MS-001) | bookAdmission |
| `gallery_schedules` | INSERT (MS-001), status 갱신 (MS-003/MS-004) | bookAdmission / processGalleryEntry / transitionGalleryStatus |
| `member_cards` | gallery_used 증가 (MS-002) | applyGalleryLimit |
| `museum_visits` | INSERT (MS-003), batch expire (MS-005) | processGalleryEntry / expireClosedGalleryBatch |
| `visit_payments` | INSERT (MS-003) | processGalleryEntry |
| `visit_refund_records` | INSERT + status='refunded' (MS-006) | processAdmissionRefund |
| `visit_refunds` | INSERT (MS-006) | processAdmissionRefund |

---

## 임계값 / 상수

- `MAX_CONCURRENT_VISITORS_PER_MUSEUM = 5000` (MS-001 박물관별 동시 active 입장 기본 한도, 국립박물관/대형 미술관급)
- `galleryLimit = member_cards.gallery_limit` (MS-002 회원 등급별 일일 갤러리 관람 한도, 연간회원권 정책 연계)

---

## 상태 머신

```
gallery_schedules: reserved → visited (MS-003 atomic)
gallery_schedules: visited ↔ updated (MS-004 transition, 전시관 루트 변경)
gallery_schedules: visited|updated → ended (MS-004 transition, 정상 관람 종료)
gallery_schedules: reserved|visited → closed (MS-004 transition, 박물관 긴급 폐관/전시 중단)
gallery_schedules: reserved|visited → cancelled (MS-004 transition)

museum_visits: visited → updated → ended (정상 종료)
museum_visits: closed → expired (MS-005 batch — 데이터 보관 기간 만료)
museum_visits: visited → closed (박물관 긴급 폐관, MS-006 관람 환불 대상)

visit_refund_records: pending → calculated → refunded (MS-006 atomic)
```

---

## 의존 함수 (museum.ts)

| BL | 함수 | detector |
|----|------|----------|
| MS-001 | `bookAdmission` | ThresholdCheck (Path A var-vs-UPPERCASE) |
| MS-002 | `applyGalleryLimit` | ThresholdCheck (Path B var-vs-var, `limit` keyword) |
| MS-003 | `processGalleryEntry` | AtomicTransaction (`db.transaction(...)`) |
| MS-004 | `transitionGalleryStatus` | StatusTransition (matrix) |
| MS-005 | `expireClosedGalleryBatch` | StatusTransition (batch) |
| MS-006 | `processAdmissionRefund` | AtomicTransaction (`db.transaction(...)`) |
