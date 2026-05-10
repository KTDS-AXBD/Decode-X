---
id: AIF-RPRT-118-smoke
title: "F487 — Production Smoke Probe 결과 (Master 위임)"
sprint: 321
created: "2026-05-11"
author: "autopilot (stub) → Master 실행 후 업데이트"
---

# Sprint 321 F487 — Production Smoke Probe 매트릭스

> **⚠️ 이 파일은 스텁입니다.**  
> Production smoke probe는 Master pane에서 실행 필요.  
> 실행 명령: `INTERNAL_API_SECRET=xxx bash scripts/smoke/phase4-smoke-probes.sh [SKILL_ID]`  
> 실행 후 이 파일을 결과로 덮어쓰기 필요.

---

## 실행 가이드

### Step 1: production svc-skill 상태 확인

```bash
# Health check
curl -s https://svc-skill.ktds-axbd.workers.dev/health | jq .
```

### Step 2: smoke probe 9건 실행

```bash
INTERNAL_API_SECRET=xxx bash scripts/smoke/phase4-smoke-probes.sh
```

### Step 3: wrangler tail 30s 관찰

```bash
wrangler tail svc-skill --env production 2>&1 | head -50 &
TAIL_PID=$!
sleep 30
kill $TAIL_PID
```

### Step 4: R2 LPON skill-packages 현황

```bash
wrangler r2 object list skill-packages --prefix=lpon --env production
```

### Step 5: D1 policies LPON row count

```bash
wrangler d1 execute db-skill --env production \
  --command="SELECT count(*) as cnt FROM policies WHERE organization_id='LPON'"
```

---

## 결과 (TODO: Master 실행 후 업데이트)

| Probe | Method | Endpoint | HTTP | 판정 |
|-------|--------|----------|------|------|
| eval-no-body | POST | /skills/{id}/ai-ready/evaluate | [TODO] | [TODO] |
| eval-empty-json | POST | /skills/{id}/ai-ready/evaluate | [TODO] | [TODO] |
| eval-partial-body | POST | /skills/{id}/ai-ready/evaluate | [TODO] | [TODO] |
| batch-no-body | POST | /skills/ai-ready/batch | [TODO] | [TODO] |
| batch-empty-json | POST | /skills/ai-ready/batch | [TODO] | [TODO] |
| batch-partial-body | POST | /skills/ai-ready/batch | [TODO] | [TODO] |
| skills-list-lpon | GET | /skills?org=lpon | [TODO] | [TODO] |
| skills-list-raw | GET | /skills | [TODO] | [TODO] |
| skills-health | GET | /health | [TODO] | [TODO] |

**판정**: [TODO — Master 실행 후 업데이트]

---

## wrangler tail 결과 (TODO)

```
[TODO: Master 실행 후 30s tail 출력 붙여넣기]
```

## R2 LPON skill-packages 현황 (TODO)

```
[TODO: wrangler r2 object list 출력 붙여넣기]
```

## D1 LPON policies row count (TODO)

```
[TODO: D1 query 결과 붙여넣기]
```

---

> **post-merge fixup**: Master 검증 완료 후 이 파일을 `reports/sprint-321-master-validation-2026-05-11.md`로 보강 커밋.
