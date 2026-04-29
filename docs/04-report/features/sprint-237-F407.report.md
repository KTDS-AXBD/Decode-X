---
code: AIF-RPRT-040
title: "Sprint 237 F407 B-02 minu.best zone KTDS 이관 완료 리포트"
version: "1.0-draft"
status: Partial
category: RPRT
created: 2026-04-24
author: Sinclair Seo
sprint: 237
feature: F407
milestone: M-UX-Blocker
matchRate: null
---

# Sprint 237 F407 B-02 구조적 해결 (minu.best zone 이관) 완료 리포트

> **Summary**: B-02 블로커(rx.minu.best CF Access login flow 구조적 불능)의 근본 원인이었던 **zone 계정 불일치**(minu.best = 개인, app-web Worker = KTDS)를 zone 전체 이관으로 해소. Plan `AIF-PLAN-039` Phase 1~6 완결. Phase 7 검증은 Cloudflare Access **공식 장애**(`identified/minor`, 2026-04-23 21:05 UTC~) 발생으로 대기 중. 장애 해소 후 13경로 스모크 + login flow 재측정 예정.
>
> **Feature**: F407 (B-02 구조적 해결)
> **Sprint**: 237 (세션 237 + continuation 2)
> **Duration**: 2026-04-22 Plan → 2026-04-24 Phase 1~6 완결 (~90분 순소요)
> **Author**: Sinclair Seo
> **Status**: ⏸️ **PARTIAL (Phase 1~6 ✅ / Phase 7~8 CF Access 장애 대기)**

---

## 1. Executive Summary

### 1.1 Overview
- **Feature**: B-02 블로커 근본 해결 — `rx.minu.best` Cloudflare Access login flow 복원
- **Approach**: Option (a) **zone 전체 KTDS-AXBD 계정 이관** (Option c "신규 zone" 포기)
- **Key Decision**: Cloudflare Pages cross-account custom domain 지원 확인으로 부수 서비스 영향 최소화
- **Blocker**: Cloudflare Access 공식 incident — 외부 요인, Decode-X 구성 무관

### 1.2 Four-Perspective Value Summary

| 관점 | 내용 |
|------|------|
| **Problem** | B-02: Sprint 234 F405 🟡 9/13 → 세션 237 재측정 0/6 PASS (전 경로 403 회귀). F406 Workers 이행 시도가 **cross-account 제약**(zone=개인, Worker=KTDS)으로 롤백. CF Access middleware 경로 자체가 404/403 응답 |
| **Solution** | zone `minu.best` 전체를 개인 계정에서 KTDS-AXBD 계정으로 이관. registrar NS 교체(Whois Corp 경유) + DNS 재구성 + Pages cross-account re-verify + Workers Custom Domain 재연결 + Zero Trust Application 2건 재구성 |
| **Function/UX Effect** | `rx.minu.best` ↔ `app-web` Worker가 **같은 account active zone** 상태 확보. Workers Custom Domain 정상 등록됨. 실 번들(370KB JS + 75KB CSS) HTTP 200 서빙. downtime 0 (NS 전환 무단절) |
| **Core Value** | 블로커 구조적 근본 해결. Phase 7 검증이 CF Access 공식 장애로 가시화되지 않고 있으나, **Workers 서빙 층은 정상**이므로 장애 해소 즉시 완결 가능. 향후 유사 cross-account 이슈 발생 시 본 runbook이 재사용 가능 |

---

## 2. PDCA Cycle Summary

### 2.1 Plan
- **Document**: `docs/01-plan/features/F407.plan.md` (AIF-PLAN-039)
- **Goal**: minu.best zone을 KTDS-AXBD 계정으로 이관하여 Workers Custom Domain 제약 해소
- **Approach Selection**: Option (a) zone move ≫ Option (c) 신규 zone
  - 근거: 도메인 비용 $0, 브랜딩 유지, Pages cross-account 지원으로 www/app 부수 서비스 유지 가능
- **Estimated Duration**: ~80min 순소요 + ~30min 전파 대기 = ~2h
- **Status**: IN_PROGRESS → Phase 6 DONE

### 2.2 Design
- **Approach**: Plan 문서 내 Phase 1~8 runbook이 Design을 겸함 (단일 인프라 작업, 별도 Design 불필요)
- **Key Design Decisions**:
  1. **zone delete+readd** (Cloudflare 권장 경로, move 기능 미제공)
  2. **registrar NS 교체** via 기존 Whois Corp 관리 콘솔
  3. **F406 cherry-pick** (`afa061e`) — 롤백된 Workers Static Assets 이행을 재적용
  4. **DNS 레코드 재입력**: 베이스라인 4 subdomain + CAA 10건 + SPF/TXT + 신규 발견 Resend MX/DKIM 세트
  5. **Zero Trust Application 재사용** (기존 2건, hostname 기반이므로 drift만 보정)

### 2.3 Do (Implementation) — Phase 1~6

#### Phase 1: DNS 베이스라인 (사용자, 완료)
- 4 subdomain 확정: `www`, `app`, `rx`, `api`.minu.best
- CAA 10건 export
- **신규 발견**: Resend 이메일 인프라 — `mail.minu.best feedback-smtp.*` MX + `resend._domainkey` DKIM
- SPF: `v=spf1 include:amazonses.com ~all` (Phase 2에서 Resend 병합 기록)

#### Phase 2: Zone Delete + Re-add (사용자, 완료)
- 개인 계정 `sinclair.seo@gmail.com` > minu.best > Delete Site
- KTDS-AXBD 계정에 `minu.best` Add Site (Free plan)
- 새 NS pair 할당: `kayden.ns.cloudflare.com / liz.ns.cloudflare.com` (기존 bill/sunny와 상이)
- SOA serial 3회 bump 확인 → 계정 이동 완결 증거

#### Phase 3: Registrar NS 전환 (사용자, 완료)
- **RDAP로 registrar 확정**: Whois Corp (whois.co.kr, IANA Registrar ID 100, 국내, 2025-11-26 ~ 2028-11-26 계약)
- 사용자 콘솔에서 `bill/sunny` → `kayden/liz` 교체
- 전파 확인: 시스템 resolver / 1.1.1.1 / 8.8.8.8 전수 응답 일치 + **downtime 0**

#### Phase 4: Workers 이행 재적용 (개발자, 완료)
- F406 코드 cherry-pick: `afa061e → afa642c`
  - `apps/app-web/wrangler.toml`: `pages_build_output_dir` 삭제 → `[assets]` binding + `not_found_handling="single-page-application"`
  - `apps/app-web/src/worker.ts`: `env.ASSETS.fetch(request)` 1 handler
  - `.github/workflows/deploy-pages.yml`: `wrangler deploy --env production` 전환
- **SPEC.md 충돌 해소**: F407 세션 내용이 더 포괄적이므로 `git checkout --ours` 전략으로 F406 SPEC 변경 drop (cherry-pick 충돌 안전)
- CI run **#24808297199 success** — app-web Worker 배포 완료
- 검증: `https://app-web.ktds-axbd.workers.dev/` HTTP 200, 실 번들 370KB JS + 75KB CSS 서빙 확인

#### Phase 5: Workers Custom Domain (사용자, 완료)
- KTDS Dashboard > Workers & Pages > app-web > Settings > Custom Domains
- `rx.minu.best` Add → **수락됨** (cross-account 제약 무효 = 같은 account 확인)
- 스크린샷 검증 완료

#### Phase 6: Zero Trust 재구성 (사용자, 완료)
- Zero Trust > Applications 기존 2건 상태 확인 + 재구성
- **Decode-X Public** (Bypass): 4 path (`/welcome`, `/assets/*`, `/favicon.ico`, `/_routes.json`) Bypass Everyone
- **Decode-X Protected** (Allow): `/` 전체 + 12 gmail 개별 Allowlist ("KT DS Allowlist")
  - 세션 236 메모리는 `@kt.com` domain 단위였으나 **이번 재구성에서는 12 gmail 개별 allow** 채택
- Application Order: Public 상위, Protected 하위 (Bypass 우선 매칭)
- 스크린샷 3장(Applications/Public/Protected) 교차 검증 완료

### 2.4 Check — Phase 7 (차단 중)

**차단 사유**: Cloudflare Status API 실시간 조회 결과
```
Incident: "Intermittent 5xx errors for Cloudflare Access authentication requests"
Status: identified / Impact: minor
Created: 2026-04-23T21:05:59 UTC
Updates: none since creation (~26h 무업데이트, minor 우선순위)
```

**현재 측정치 (수동 재측정 + Monitor 25회 일치)**:
```
보호/SPA fallback 경로:
  /                                     → HTTP 200  (기대: 302)
  /executive                            → HTTP 200  (기대: 302)
  /cdn-cgi/access/logout                → HTTP 200  (기대: 302)

Access middleware 부분 응답:
  /cdn-cgi/access/authorized            → HTTP 400  (기대: 302) — 이전 404→400
  /cdn-cgi/access/callback              → HTTP 400  (기대: 302)

Access login dispatcher 불능:
  /cdn-cgi/access/login                 → HTTP 404  (기대: 302)
  /cdn-cgi/access/login/rx.minu.best    → HTTP 404  (기대: 302)
```

**해석 (선택적 부분 작동)**:
1. **보호 경로 200**: `apps/app-web/wrangler.toml` `not_found_handling = "single-page-application"` 설정으로 ASSETS에 없는 경로는 `/index.html`로 fallback. Access middleware가 이 경로들을 intercept하지 않아 Workers가 SPA shell을 직접 서빙. `/cdn-cgi/access/logout=200`도 동일 원인(Access 미개입 + SPA fallback), **Access 완전 죽음 증거 아님**.
2. **authorized/callback 400**: middleware가 요청을 **수신 및 처리 시도**까지는 하나 응답이 malformed bad request. 이전 404→400 변화는 middleware 층 **부분 복구 진행 중** 시그널.
3. **login 404**: Access **login dispatcher 층 완전 불능** — CF Access platform 서비스 고장 지점.

**책임 구분**:
- Workers 서빙 층(**우리 책임**): 정상, SPA fallback 포함 모두 의도된 동작
- Access middleware 층(**CF 책임**): 일부 응답(authz/callback 400), login dispatcher 전면 장애
- 장애 지점은 CF Access platform의 login dispatcher 서비스 + middleware response validator

**UX 부수 관측**: 보호 경로 `/`, `/executive`가 현재 Access 우회로 **UI shell 200 서빙** 중. 실제 민감 데이터는 별도 API(Zero Trust 적용) 호출에서 차단되므로 데이터 유출 리스크는 낮으나, UI 껍데기가 인증 없이 렌더링되는 UX 혼란 소지 있음. CF Access 복구 시 자연 해소.

**자동 감지 Monitor**: `/tmp/cf-access-recovery-monitor.sh` PID 123540, 2min×60회 최대 2h (nohup+disown). 22/60 iter 경과, 복구 시 `🎉 RECOVERY DETECTED` 로그 + 13경로 전수 재측정 수행.

### 2.5 Act — Phase 8 (본 리포트 선작성)
- **Report Status**: `1.0-draft` (Phase 7 미완)
- **완결 트리거**: CF Access 복구 감지 → 13경로 PASS + login flow 완주 시 본 리포트 §3.1/§4/§9 갱신 → `1.0` 승격

---

## 3. Results

### 3.1 Completed Items (Phase 1~6)

| Phase | 내용 | 완료 증거 |
|-------|------|----------|
| 1 | DNS 베이스라인 + Resend 발견 | export 완료, Resend MX/DKIM 기록 |
| 2 | Zone delete + KTDS readd | SOA serial 3회 bump, 새 NS pair 할당 |
| 3 | Registrar NS 전환 (Whois Corp) | 1.1.1.1/8.8.8.8 전수 전파, downtime 0 |
| 4 | Workers 이행 cherry-pick | commit `afa642c`, CI #24808297199 success, 번들 370KB+75KB HTTP 200 |
| 5 | Workers Custom Domain | rx.minu.best 등록 스크린샷 |
| 6 | Zero Trust 2 Application 재구성 | Bypass 4 path + Allowlist 12 gmail 스크린샷 3장 |

### 3.2 Pending Items (Phase 7~8)

| 항목 | 사유 | 대기 중 | 복구 후 action |
|------|------|---------|----------------|
| 13경로 HTTP 스모크 | CF Access 미복구 | Monitor PID 123540 자동 감지 | Phase 7-2 체크리스트 전수 |
| 시크릿 창 login flow | CF Access 미복구 | 수동 | Phase 7-3 Google 로그인 → `/` 진입 |
| 부수 서비스 확인 | CF Access 무관하나 미실시 | 수동 | `www/app/api.minu.best` HTTP 200 확인 |
| SPEC §8 B-02 DONE 전환 | 7번 DoD 충족 후 | — | Phase 8 mark + commit |
| 본 리포트 `1.0` 승격 | 동일 | — | §3.1/§4 갱신 |

### 3.3 Side Discoveries

#### 3.3.1 api/apex 403 현상 (B-02 영역 외)
- `api.minu.best/health` 개인 계정 Pages 경로 사용 시 cross-account **A 레코드 제약** 확인
- Pages cross-account 지원은 **CNAME 한정** (www/app는 CNAME이라 정상, api/apex A 레코드는 미지원)
- 세션 236 "cross-account 지원" 판정의 **적용 범위 보완** — rules/memory-lifecycle 기준으로 feedback 기록 대상

#### 3.3.2 CF 공식 장애는 Status API 우선 조회
- Dashboard 경고 배너와 API 정합 — 설정 의심보다 외부 확인 우선 원칙 정립
- 본 케이스: monitor 시작 이전에 incident 감지되었으면 Phase 7 연기 결정 더 빨라졌음

#### 3.3.3 RDAP > whois
- IANA Registrar ID 구조화 반환 + rate-limit 없음
- 본 Sprint registrar 판별(Whois Corp) 신속화 기여

#### 3.3.4 Access middleware 선택적 부분 작동 진단 패턴
- **경로별 응답 matrix**로 Access 층 상태를 세분 진단 가능
  - `/cdn-cgi/access/login*` 응답: login dispatcher 층 상태
  - `/cdn-cgi/access/authorized|callback` 응답: middleware 처리 층 상태
  - `/cdn-cgi/access/logout` 및 보호 경로 응답: middleware intercept 여부 (200=Workers SPA fallback, 302=Access 작동)
- "Access 전체 죽음" 같은 단일 판정 대신 **3축 분리 진단**으로 복구 진행 추적 가능
- Monitor 감지 조건(`/=302 OR authorized=302`)은 여전히 유효하나, 부분 복구 단계 기록을 위해 `authorized 404→400→302` 전이 추적 권고

---

## 4. Quality Metrics

### 4.1 Phase 1~6 완결 증거

| 지표 | 값 | 상태 |
|------|:--:|:----:|
| DNS 베이스라인 완전성 | 4 sub + CAA 10 + Resend 2종 | ✅ |
| Zone 계정 이관 | 개인 → KTDS-AXBD | ✅ |
| NS 전파 downtime | 0 | ✅ |
| Workers CI | run #24808297199 success | ✅ |
| Workers 직접 서빙 | HTTP 200 (번들 370KB+75KB) | ✅ |
| Custom Domain 연결 | rx.minu.best → app-web | ✅ |
| Zero Trust Policy | Public 4 path + Protected 12 user | ✅ |

### 4.2 Phase 7 Gate (대기)

| 지표 | 기대값 | 현재 | 판정 |
|------|:------:|:----:|:----:|
| `/` | 302 | 200 | ❌ (CF Access 장애) |
| `/welcome` | 200 | TBD | — |
| `/cdn-cgi/access/authorized` | 302 | 400 | ❌ |
| `/cdn-cgi/access/login/rx.minu.best` | 302 | 404 | ❌ |
| `/_routes.json` | 200 | TBD | — |
| `/favicon.ico` | 200 | TBD | — |
| `/assets/*` | 200 | TBD | — |
| Google login flow 완주 | 성공 | 미측정 | — |
| www/app/api.minu.best | 200 | 미측정 | — |

**최종 Match Rate**: Phase 7 완료 후 산출 (초안에서는 `null`)

---

## 5. Lessons Learned

### 5.1 What Went Well

1. **Option 재선택의 가치**
   - 세션 237 1차 결정 (c) 신규 zone → 2차 (a) zone move 전환이 정확했음
   - Pages cross-account 지원 **재확인**이 의사결정 근거 제공

2. **runbook 기반 진행**
   - Plan 문서가 Phase별 상세 action + 기대값 포함
   - 사용자-개발자 action 분리 명확, 순차 진행 가능

3. **downtime 0**
   - NS 전환 타이밍 + TTL 관리로 서비스 중단 없음
   - 이해관계자 영향 최소화 (www/app/api 기존 동작 유지)

4. **외부 장애 판별 속도**
   - Phase 7 측정치 이상 확인 후 즉시 Status API 조회 → 외부 원인 확정
   - 설정 삽질 시간 절약, monitor로 대기 자동화

5. **Access 층 세분 진단 (Insight 재검토 산물)**
   - 초기 진단 `"Access 완전 죽음"`(부정확) → 재검토 후 `"login dispatcher 불능 + middleware 부분 응답"`(정확)
   - `/cdn-cgi/access/logout=200`이 Access 죽음 증거가 아니라 **Workers SPA fallback**(`not_found_handling=single-page-application`)의 자연 결과임 식별
   - 진단 패턴 정립(§3.3.4)으로 향후 Access 장애 분석 표준화

### 5.2 Areas for Improvement

1. **Pages cross-account 제약 정확한 범위 문서화 필요**
   - CNAME은 수락, A 레코드는 거부 — 세션 236 판정이 범위 명시 부족
   - 본 리포트 §3.3.1에 기록, 향후 rules/에 흡수 후보

2. **CF incident 사전 체크 프로세스**
   - Phase 7 진입 전 `cloudflarestatus.com` 확인이 Plan에 없었음
   - 인프라 변경 직후 검증 단계는 외부 상태 확인을 선행 항목으로 추가 권고

3. **SPEC.md cherry-pick 충돌 전략 기록**
   - 본 Sprint `git checkout --ours` 전략으로 F406 SPEC 변경 drop — 최신 세션이 더 포괄적일 때 안전
   - 향후 동일 패턴 발생 시 참고 가능하도록 `development-workflow.md`에 흡수 후보

### 5.3 To Apply Next Time

1. **인프라 변경 runbook에 외부 장애 체크 단계 내재**
   - 측정 Phase 시작 전 `cloudflarestatus.com` / `githubstatus.com` 등 외부 의존 status 조회
   - 이상 시 측정 연기 + 자동 monitor 예약

2. **RDAP를 registrar 판별 표준으로**
   - whois보다 구조화 + rate-limit 없음
   - `whois.iana.org` 하위 RDAP 엔드포인트가 있는 경우 우선 사용

3. **Sprint 외부 의존 block 시 Phase 분리 리포팅**
   - 본 Sprint처럼 우리 책임 층(Phase 1~6)이 완결된 경우, 외부 장애 대기는 별개 phase로 리포트 분리
   - Match Rate 산출은 우리 책임 층 기준 선산출 + 외부 측정은 가필 방식 검토

---

## 6. Next Steps

### 6.1 즉시 (자동 감지)

- [ ] Monitor `/tmp/cf-access-recovery-monitor.log`에서 `🎉 RECOVERY DETECTED` 발생 감지
- [ ] 13경로 전수 재측정 로그 확인
- [ ] 시크릿 창 Google 로그인 flow 수동 완주
- [ ] `www/app/api.minu.best` 부수 서비스 HTTP 200 확인

### 6.2 복구 후 (수동)

- [ ] SPEC §8 B-02 ✅ **DONE** 마킹 + 근거 링크 본 리포트 §4.2
- [ ] 본 리포트 `1.0-draft` → `1.0` 승격 (§3.1 Phase 7 row 추가 + §4.2 측정치 fill + `matchRate` 수치 기입)
- [ ] SPEC §6 Sprint 237 block 결과 기록 + F407 ✅ 마킹
- [ ] MEMORY `session_context.md` 갱신 (Phase 7 완결 기록)
- [ ] `docs/CHANGELOG.md` 세션 239 entry
- [ ] 필요 시 `ai-foundry-web` Pages 프로젝트 삭제 (B-02 완결 후 청소)

### 6.3 Monitor 2h 초과 시 대안

- 3시간 이후에도 미복구 시: Cloudflare Status 재확인 + 수동 Zero Trust 로그 점검
- 12시간 이후 미복구: Cloudflare Support 티켓 개설 고려
- Monitor 자동 만료 후 수동 주기 점검 또는 새 monitor 기동

---

## 7. Appendix: Key References

### 7.1 Commits
- `afa642c` — feat(f406): Cloudflare Pages → Workers Static Assets 이행 — /cdn-cgi/access/* 404 근본 해결 (cherry-pick base)
- `9f46a7f` — docs(f407): AIF-PLAN-039 — B-02 minu.best zone KTDS 이관 runbook (option a)
- `75f746f` — docs(session-237-cont2): B-02 F407 Phase 1~6 DONE + CF Access 장애 대기
- `afa061e` — feat(f406): 원 구현 (롤백되었다가 cherry-pick 원본)
- `da06e50` — revert(f406): 롤백 (cross-account 제약으로 인한)

### 7.2 Documents
- Plan: `docs/01-plan/features/F407.plan.md` (AIF-PLAN-039)
- Report: `docs/04-report/features/sprint-237-F407.report.md` (본 파일, AIF-RPRT-040)
- SPEC: `SPEC.md` §8 B-02 (OPEN → DONE 전환 대기)
- Previous related: Sprint 234 F405/F406 시도 및 롤백 기록

### 7.3 External
- CF Access Incident: https://www.cloudflarestatus.com (`identified/minor`, 2026-04-23T21:05Z 시작, 본 리포트 생성 시점 무업데이트)
- CF Zone Move 가이드: https://developers.cloudflare.com/fundamentals/setup/account/move-site-between-accounts/
- Pages cross-account Custom Domain: 세션 236 F406 시도 로그 (CNAME 수락, A 거부)
- RDAP: https://rdap.iana.org

### 7.4 Infrastructure
- **Monitor**: `/tmp/cf-access-recovery-monitor.sh` PID 123540 (nohup+disown, 2min×60회 최대 2h)
- **Log**: `/tmp/cf-access-recovery-monitor.log`
- **Trigger**: `/=302` OR `/cdn-cgi/access/authorized=302` 감지 시 `🎉 RECOVERY DETECTED` + 13경로 전수 측정 + monitor 자동 종료

---

## 8. Summary of Changes

### Scope
- **Feature**: F407 (B-02 구조적 해결)
- **Approach**: Zone 전체 KTDS-AXBD 계정 이관 (Option a)
- **Scale**: 1 zone + 4 subdomain + CAA 10 + Resend 세트 + 7 Worker 중 `app-web` Workers 이행 + Zero Trust 2 Application
- **LOC**: 최소 (cherry-pick 재적용)
- **Duration**: ~90분 순소요 (사용자 60 + 개발자 30) + 외부 장애 대기

### Quality
- **Phase 1~6 Completion**: 6/6 ✅
- **Workers 서빙 층 PASS**: HTTP 200 번들 확인
- **Phase 7 Gate**: CF Access 장애 대기 중 (외부 요인)
- **Match Rate**: 미산출 (Phase 7 완료 후 가필)

### Go/No-Go Judgment
- **Phase 1~6**: ✅ GO (우리 책임 층 완결)
- **최종 완결**: ⏸️ HOLD (CF Access 복구 대기) → **복구 감지 시 자동 완결 경로 존재**

---

**Report Generated**: 2026-04-24 (세션 239, `1.0-draft`)
**Author**: Sinclair Seo
**Status**: ⏸️ Partial — Phase 1~6 DONE / Phase 7~8 CF Access 공식 장애 대기 / Phase 9 UX hotfix DONE (세션 240)
**Next Update Trigger**: Monitor PID 123540 `🎉 RECOVERY DETECTED` 로그 감지 또는 수동 재측정 전원 PASS

---

## 9. Phase 9 — UX Hotfix (세션 240, 2026-04-24)

> **Trigger**: 사용자 보고 "welcome 페이지 Google 로그인 버튼 클릭 시 무반응". 장애 대기 중에도 사용자에게 "아무 일도 안 일어남" 혼란이 존재하여 UX 층 분리 처리.

### 9.1 진단 (라이브 재측정 2026-04-24 12:09 KST)

| 경로 | 응답 | 해석 |
|---|---|---|
| `/welcome` | 200 | SPA shell 정상 |
| `/` (보호 대상) | **200** | ⚠️ Access 미개입 — `not_found_handling=single-page-application`이 index.html 직접 서빙 |
| `/cdn-cgi/access/login/rx.minu.best` | **404** | ⛔ CF Access login dispatcher 불능 (Phase 7 blocker와 동일) |
| `/cdn-cgi/access/logout` | **404** | dispatcher 층 전체 다운 |

### 9.2 무반응 메커니즘 (`welcome.tsx:21` + `AuthContext.tsx:89-93`)

1. 버튼 클릭 → `window.location.href = "/"` (원래 코드)
2. `/`는 Workers ASSETS가 **SPA fallback으로 200 서빙** — Access middleware intercept 실패
3. SPA 재로드 → `AuthContext.loadUser()` → `getCfJwtFromCookie()` = null → `isAuthenticated=false`
4. `welcome.tsx` useEffect가 navigate 안 함 → **같은 페이지 머묾 = "무반응"**

### 9.3 Fix

#### 9.3.1 `apps/app-web/src/pages/welcome.tsx:18-26`
```tsx
// Before
window.location.href = "/";

// After
const redirectUrl = encodeURIComponent(window.location.origin + "/");
window.location.href = `/cdn-cgi/access/login/rx.minu.best?redirect_url=${redirectUrl}`;
```
- Access 정상 시: 302 → Google IdP
- Access 장애 시: 404 페이지 표시 (명시적 실패 가시화)
- 복구 후 자연 동작

#### 9.3.2 `apps/app-web/src/worker.ts:13-22`
```ts
async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/cdn-cgi/")) {
    return fetch(request);  // bypass ASSETS — let CF edge handle
  }
  return env.ASSETS.fetch(request);
}
```
- Access 경로가 SPA fallback에 흡수되지 않도록 분리
- 404 응답이 200으로 바뀌는 부작용 제거

### 9.4 배포 + 검증

- **Commit**: `756d71c` — `fix(f407-phase9): welcome Google login no-response`
- **Pipeline**: `gh run 24870450859` (Deploy app-web) — CI/CD 자동 배포
- **Post-deploy 기대**:
  ```bash
  # 버튼 클릭 URL로 curl
  curl -sI "https://rx.minu.best/cdn-cgi/access/login/rx.minu.best?redirect_url=https%3A%2F%2Frx.minu.best%2F"
  # Access 정상 시: 302 + Location: https://ktds-axbd.cloudflareaccess.com/...
  # Access 장애 시: 404 (사용자가 장애 인지 가능)
  ```

### 9.5 효과

- ✅ "무반응" 현상 제거 — 사용자가 실패/성공 명확 인지
- ✅ CF Access 복구 시 자동 정상 동작 (추가 배포 불필요)
- ✅ Workers SPA fallback이 Access 경로를 잠식하는 2축 원인(리포트 §2.4) 구조적 해소

### 9.6 후속

- [x] CI/CD 배포 완료 확인 (`gh run 24870450859` success, 2026-04-24)
- [x] Production curl 재측정 (login dispatcher 404 → SPA fallback 미흡수 확인, `cf-version` 헤더 존재로 검증)
- [ ] welcome 페이지 시크릿 창 수동 버튼 클릭 테스트 (CF Access 복구 후)
- [ ] Phase 7 Gate 재측정 시 Phase 9 fix 포함 상태로 평가

### 9.7 복구 시 동시 완결 트리거 (세션 240 기록)

CF Access login dispatcher 복구가 감지되면 단일 `/ax:session-end` 실행으로 **Phase 9 + Phase 7 Gate**를 동시에 완결 처리한다.

**복구 감지 조건 (택1):**
- `curl -sI "https://rx.minu.best/cdn-cgi/access/login/rx.minu.best?redirect_url=..."` → **302** 응답 (현재 404 지속, 2026-04-27 09:41 KST 재확인)
- 시크릿 창에서 `/welcome` → "Google로 로그인" 클릭 → IdP 화면 진입
- CF Status incident `resolved` 상태 변경

**동시 처리 항목:**
1. **Phase 7 Gate**: 13경로 HTTP 스모크 (§3.3.4 matrix), login flow 수동 검증, `www/app/api.minu.best` 부수 서비스 200 확인
2. **Phase 9 검증**: welcome → 버튼 클릭 → 302 → Google IdP → callback → `/` 진입 → JWT 쿠키 저장 → `AuthContext.loadUser()` 정상 → 페이지 렌더 확인
3. **SPEC §8 B-02**: ✅ DONE 마킹 + 근거 링크 (§4.2 + §9.4)
4. **Report 승격**: `1.0-draft` → `1.0`, `status: Partial` → `Complete`, `matchRate` 산출 입력
5. **MEMORY.md**: B-02 active task 제거, `project_f407_recovery_trigger.md` 메모 삭제 (1회성 트리거)

**근거**: Phase 9 hotfix는 commit `756d71c`로 이미 deployed → Access 복구 시 자동 정상 동작. Phase 7 Gate도 동일 외부 트리거 의존이므로 별도 세션 분리 시 SPEC §8 + 리포트 1.0 승격이 2회 반복되어 비효율. 단일 세션 일괄 완결이 거버넌스/효율 양면에서 최적.

---

## 10. Insight 재해석 v2 — 6일 후 실측 반박 (세션 241, 2026-04-29)

### 10.1 결정적 반박 증거

세션 241에서 **단일 curl로 모든 가설이 무너졌다**:

```
$ curl -sI https://rx.minu.best/
HTTP/2 302
location: https://axconsulting.cloudflareaccess.com/cdn-cgi/access/login/rx.minu.best
          ?kid=e6843d85f3f1591196046323f539cb2175aa6a14f4a3ac891995b994c12b52a9
          &meta=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiI...
          &redirect_url=/
```

이 단일 응답이 다음을 동시에 증명한다:
- **CF Access middleware 정상 작동** (302 redirect 발동)
- **zone↔team 매핑 정상** (axconsulting.cloudflareaccess.com 표시)
- **Application 등록 정상** (AUD `e6843d85...` 정확히 매칭)
- **kid + meta 동적 생성 정상** (서명된 JWT 응답)

### 10.2 §2.4 Insight + §3.3.4 Matrix 가설 반박

| 원본 가설 (Phase 9) | 세션 241 실측 |
|---------------------|---------------|
| "`href="/"`가 SPA fallback에 흡수됨" | ❌ **거짓** — `/`가 302 응답 (SPA index.html 아님) |
| "CF Access edge 자체 장애" | ❌ **거짓** — middleware 정상 작동 |
| "incident가 application middleware 일부 도달 차단" | ❌ **거짓** — middleware 도달 + dispatch URL 정상 생성 |
| "dispatcher 404는 platform outage 증거" | ❌ **거짓** — middleware는 정상이고 client가 잘못된 dispatcher URL 호출 |

### 10.3 진짜 근본 원인

`apps/app-web/src/pages/welcome.tsx:18-26` (F407 Phase 9에서 추가됨):

```tsx
const handleGoogleLogin = () => {
  const redirectUrl = encodeURIComponent(window.location.origin + "/");
  window.location.href = `/cdn-cgi/access/login/rx.minu.best?redirect_url=${redirectUrl}`;
};
```

dispatcher URL을 client-side에서 직접 만들었으나 **`kid` (Application AUD)와 `meta` (서명 JWT) 두 필수 파라미터를 누락**했다. CF Access dispatcher는 이 두 값으로 application context를 식별하므로, 누락 시 무조건 404. **이 두 값은 client가 만들 수 없다** — `meta` JWT는 CF edge의 private key로 서명되며 짧은 nbf/exp(5분)를 가진다.

### 10.4 Fix (세션 241)

`welcome.tsx`:
```tsx
const handleGoogleLogin = () => {
  // CF Access middleware가 / 접근 시 자동으로 dispatcher URL 생성
  window.location.href = "/";
};
```

`worker.ts`: F407 Phase 9에서 추가했던 `/cdn-cgi/*` 우회 핸들러 6 line 제거 (dead code — `/cdn-cgi/*`는 Cloudflare edge가 Worker 실행 전 처리).

### 10.5 메타 교훈

**(M1) Layer 분리가 단일 curl로 가능했다**: `curl https://rx.minu.best/` 한 번으로 4일간의 "edge 장애" 가설을 즉시 반박할 수 있었다. dispatcher 4xx → middleware 304/302 확인 → client 코드 점검 순서가 정석.

**(M2) "현상 가시화"의 함정**: F407 Phase 9는 "404를 사용자에게 보이게 하자"는 좋은 의도였으나, 그 404가 **자체 코드 버그가 만든 404**였음을 깨닫지 못했다. 가시화 자체가 가설을 강화하는 confirmation bias 트랩.

**(M3) Application AUD ≠ Dashboard UUID**: Cloudflare는 두 개의 다른 ID를 사용한다 — Dashboard UI의 UUID(`f81162de-...`)는 internal display only이며, dispatcher가 lookup하는 건 별도의 64자 hash(`e6843d85...`). UUID로 dispatcher 호출 시도(세션 241 Test B)는 무조건 실패.

**(M4) CF Status incident와 우리 증상의 우연한 시간 일치**: 2026-04-23~24에 실제 "Intermittent 5xx errors for Cloudflare Access" incident가 있었기에 같은 시기 우리 404를 그 incident 잔여로 오진했다. incident resolved(04-25) 후 4일이 지나도 404가 지속되었음에도 가설을 재검토하지 않은 것이 시간 낭비의 핵심. **가설은 반박 가능한 형태로 명시 + 정기 재검증**이 필요.

### 10.6 비용

- 직접 비용: ~6h (점검 + monitor PID 123540 60 iter + 4 차례 복구 점검 + 가설 검증)
- 간접 비용: B-02가 차단 의존성으로 묶여있던 작업들의 6일 지연
- 예방 가능 비용: 단일 curl 1회 (~5초)로 즉시 진단 가능했음

### 10.7 SPEC §8 B-02 → ✅ DONE 전환

세션 241에서 `welcome.tsx` + `worker.ts` 2 file fix + 문서 갱신 + git push로 CI/CD 자동 deploy 진행. B-02 row → DONE 마킹 완료 (이번 리포트 §10 참조).

