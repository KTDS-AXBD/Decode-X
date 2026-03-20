# Skill Framework — 인터뷰 기록

**일시:** 2026-03-20
**인터뷰어:** Claude (ax-req-interview)
**응답자:** Sinclair Seo (AX BD팀)

---

## 프로젝트명: Skill Framework

## Part 1: 왜 (목적/문제)

**핵심 문제:**
- 스킬을 그때그때 단편적으로 만들다 보니 뒤죽박죽이 되는 느낌
- 무엇을 만들었는지도 잘 모르고 관리가 안 됨
- 팀에 공유되길 원하지만 현재 구조로는 어려움

**문제 유형:** 복합적 — 발견성 + 중복/비일관성 + 팀 공유 불가가 동시에 발생

**참고자료:**
- Anthropic 내부 스킬 운용 노하우 (GeekNews/X 공유)
- 9가지 카테고리 분류 체계
- Gotchas, Progressive Disclosure, 파일 시스템 활용 등 실전 팁
- 플러그인 마켓플레이스를 통한 조직 확장 사례

---

## Part 2: 누구를 위해 (사용자/이해관계자)

**주 사용자:** 본인(Sinclair) 우선 정리 → 검증 후 BD팀 전체로 확장
**접근 방식:** 단계적 확장 (개인 → 팀)

---

## Part 3: 무엇을 (범위/기능)

**범위:** 전체 포함 + 커스텀
1. 카테고리 분류 체계 (Anthropic 9가지 기반 + 커스텀)
2. 인벤토리/카탈로그 자동 생성
3. 품질 가이드라인 (gotchas, progressive disclosure, description 최적화 등)
4. 팀 배포 파이프라인 (플러그인 마켓플레이스 구조)
5. 프로젝트별 맞춤 요소

**적용 범위:** 전체 통합 정리
- user scope (~/.claude/commands, ~/.claude/skills)
- project scope (.claude/skills/)
- 플러그인 (bkit 등 외부 플러그인)
→ 통합 카탈로그로 관리

**현재 스킬 현황:**
- user scope commands: 15개 (ax-* 시리즈)
- user scope skills: 1개 (ax-req-interview)
- project scope skills: 6개 (ralph, deploy, sync, secrets-check, e2e-pipeline, db-migrate)
- bkit plugin skills: 188개 SKILL.md
- 총 약 210+ 스킬 자산

---

## Part 4: 어떻게 판단할 것인가 (성공 기준)

**성공 기준:** 전체 달성
1. 기존 스킬 카테고리별 정리 완료 (인벤토리)
2. 신규 스킬 작성 표준/템플릿 확립
3. 팀원이 카탈로그에서 찾아 설치·활용 가능

---

## Part 5: 제약과 리소스 (현실 조건)

**우선순위:** AI Foundry 다음 스프린트에 정식 항목으로 배치
**작업 방식:** 스프린트 단위 집중 작업
**추가 요청:** 이번 기회에 ax-req-manage 스킬의 인터뷰 절차도 보강

---

*인터뷰 완료: 2026-03-20*
