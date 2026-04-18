# ES-CHARGE-006: 대량 충전 Rate Limiting — 운영 가이드

**Empty Slot ID**: ES-CHARGE-006
**대상**: 운영팀 / 백엔드 개발자

---

## Rate Limit 임계치 조정 (운영 중)

### 조정 방법 (KV 직접 수정)

```bash
# 회사별 임계치 조회
wrangler kv:key get "rate_limit_config:ORG-001" --namespace-id <KV_ID>

# 임계치 변경 (예: 명절 기간 2배 상향)
wrangler kv:key put "rate_limit_config:ORG-001" \
  '{"perSecond": 20, "perMinute": 200}' \
  --namespace-id <KV_ID>
```

### 명절/이벤트 기간 사전 상향 절차

1. 이벤트 D-3: 대상 회사 목록 + 상향 배율 확정
2. D-1: KV 임계치 상향 적용 (`perSecond × 2`, `perMinute × 2`)
3. 이벤트 종료 후: 원복 (`wrangler kv:key delete`)

---

## Circuit Breaker 수동 조작

### 상태 확인

```bash
wrangler kv:key get "circuit_breaker:charge:status" --namespace-id <KV_ID>
# 결과: "OPEN" | "HALF_OPEN" | "CLOSED"
```

### Circuit Breaker Open 시 처리

1. 원인 파악: Cloudflare Workers 대시보드 → 에러율 확인
2. 즉각 조치: 외부 머니플랫폼 API 상태 확인
3. 복구 확인: 30초 후 HALF_OPEN 자동 전환 → 소량 요청 통과 → 정상이면 CLOSED 자동 전환
4. 수동 강제 복구 (긴급):
   ```bash
   wrangler kv:key put "circuit_breaker:charge:status" '"CLOSED"' --namespace-id <KV_ID>
   ```
5. 인시던트 기록:
   ```
   incident_id: INC-{YYYYMMDD}-RL-{SEQ}
   type: CIRCUIT_BREAKER_OPEN
   duration: <분>
   affectedOrgs: [...]
   resolution: <원인>
   ```

---

## SLA

- Rate Limit 초과 알림 → 운영팀 확인: 5분 이내
- Circuit Breaker Open → 복구 조치: 10분 이내
- 임계치 조정 적용 확인: 1분 이내 (KV TTL 없음)
