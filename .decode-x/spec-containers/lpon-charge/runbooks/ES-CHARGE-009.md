# ES-CHARGE-009: 잔액 조회 캐시 무효화 — 운영 가이드

**Empty Slot ID**: ES-CHARGE-009
**대상**: 운영팀 / 백엔드 개발자

---

## 캐시 stale 인한 충전 실패 시 처리

### 감지 조건

- 충전 시도 → 외부 출금 API에서 "잔액 부족" 오류 반환, 그러나 사용자는 충분한 잔액 확인
- 로그에 `stale: true` 응답 후 충전 실패 기록

### 처리 절차

1. 해당 계좌 캐시 수동 삭제:
   ```bash
   wrangler kv:key delete "balance:<accountId>" --namespace-id <KV_ID>
   ```
2. 충전 재시도 안내 (고객센터):
   - 1분 후 재시도 요청 (캐시 갱신 대기)
3. 잔액 재확인:
   ```bash
   wrangler kv:key get "balance:<accountId>" --namespace-id <KV_ID>
   # null이면 정상 (다음 조회 시 실시간 갱신됨)
   ```

---

## 외부 API 장애 중 stale 캐시 운영

외부 잔액 API 장애 시 최대 5분간 stale 캐시로 서비스 유지됨.

### 장애 시 운영 원칙

1. 응답에 `stale: true` 포함된 건은 **최종 출금 API에서 재검증** (2단계 검증 자동 수행)
2. 5분 초과 장애 시 → 잔액 조회 기반 사전 검증 비활성화 + 출금 API 단일 검증으로 전환
   ```bash
   wrangler kv:key put "feature_flag:balance_precheck" '"disabled"' --namespace-id <KV_ID>
   ```
3. API 복구 후 → feature_flag 원복 + 캐시 전체 초기화
   ```bash
   wrangler kv:key delete "feature_flag:balance_precheck" --namespace-id <KV_ID>
   # 개별 캐시는 TTL 만료 후 자동 갱신
   ```

---

## 무효화 이벤트 누락 시 강제 무효화

특정 계좌의 캐시 일관성이 의심될 때:

```bash
# 계좌별 강제 무효화
wrangler kv:key delete "balance:<accountId>" --namespace-id <KV_ID>

# 계좌 목록 조회 (prefix 기반)
wrangler kv:key list --prefix "balance:" --namespace-id <KV_ID>
```

---

## SLA

- stale 캐시 인한 충전 실패 → 캐시 수동 삭제: 10분 이내
- 외부 API 장애 감지 → feature_flag 비활성화: 5분 이내
- API 복구 후 feature_flag 원복: 10분 이내
