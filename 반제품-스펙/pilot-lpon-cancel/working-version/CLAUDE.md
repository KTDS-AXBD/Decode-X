# LPON 온누리상품권 결제/취소 PoC

## 도메인
온누리상품권 전자상품권 서비스. 충전, 결제, 환불/취소, 가맹점 관리, 정산.

## 아키텍처
- 레이어: Domain / Application / Infrastructure
- DB: SQLite (better-sqlite3)
- API: REST (Hono framework)
- 인증: JWT (USER/MERCHANT/ADMIN)
- 응답 포맷: { success: true, data: {...} } / { success: false, error: { code, message } }

## 비즈니스 룰
`rules/business-logic.md` 참조. 모든 BL-NNN을 코드에 반영해야 함.

## 데이터 모델
`migrations/0001_init.sql` 참조. 그대로 사용.

## 기능 목록
`docs/functions.md` 참조. FN-001부터 순서대로 구현.

## API 명세
`docs/api.md` 참조. 엔드포인트/요청/응답 스키마 준수.

## 구현 스택
- Runtime: Node.js (Bun)
- Framework: Hono
- DB: better-sqlite3
- Auth: jose (JWT)
- Test: Vitest
- TypeScript strict mode

## 구현 순서
1. DB 스키마 적용 (migrations/)
2. Domain 레이어: 비즈니스 룰 구현
3. Application 레이어: FN-001~FN-010 서비스
4. API 레이어: 엔드포인트 핸들러
5. 테스트: 핵심 BL 시나리오
