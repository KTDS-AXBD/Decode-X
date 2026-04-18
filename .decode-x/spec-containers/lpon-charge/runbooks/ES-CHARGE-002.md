# ES-CHARGE-002: 출금 타임아웃 에스컬레이션 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-002
**대상**: 운영팀 온콜 담당자

---

## 에스컬레이션 수신 시 조치 절차

### P1 (고액 ≥50만원, SLA 1시간)

1. **즉시 상황 파악**
   - 티켓의 `withdrawalRequestId`로 출금 기관 API 직접 조회
   - 출금 기관 고객센터 즉시 연락 (24시간 콜센터)

2. **상태 확정**
   - 출금 기관 확인 → SUCCESS: 충전 완료 처리
   - 출금 기관 확인 → FAILED: 충전 실패 + 이용자 안내
   - 확인 불가: 보류 처리 + 에스컬레이션 P0 상향

3. **이용자 안내**
   - 처리 지연 SMS 발송 (템플릿: MSG-TMPL-CHARGE-DELAY)
   - 해결 후 결과 SMS 발송

### P2 (소액 <50만원, SLA 4시간)

1. 티켓 수신 후 1시간 이내 출금 기관 API 재조회
2. 상태 확정 후 처리 (P1 절차와 동일)
3. 이용자 안내 (자동 처리 완료 시 생략 가능)

---

## 에스컬레이션 티켓 필수 정보

| 필드 | 설명 |
|------|------|
| `incident_type` | `WITHDRAWAL_TIMEOUT_UNRESOLVED` |
| `chargeId` | 충전 트랜잭션 ID |
| `withdrawalRequestId` | 출금 요청 ID |
| `amount` | 충전 금액 (원) |
| `timeoutAt` | 타임아웃 발생 시각 (ISO8601) |
| `retryCount` | 재시도 횟수 |
| `assignee` | 온콜 담당자 |

---

## 예방 조치 (개발팀)

- 타임아웃 임계값 30초 조정 시 이 규칙도 함께 업데이트
- 출금 기관별 평균 응답시간 모니터링 → 임계값 최적화
- 자동 에스컬레이션 알림: PagerDuty/Slack `#ops-oncall`
