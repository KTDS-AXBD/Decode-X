# FAQ — Decode-X v1.3 Phase 3 UX

---

## 인증 관련

**Q: 로그인 페이지가 사라졌어요**  
A: Cloudflare Access SSO로 전환됐습니다. `/welcome` 페이지에서 Google 로그인 버튼을 클릭하세요. 보호된 페이지 접근 시 자동으로 Google IdP로 리다이렉트됩니다.

**Q: "Account suspended" 오류가 표시돼요**  
A: Admin이 계정을 정지한 상태입니다. 관리자(Admin 역할 보유자)에게 문의하세요.

**Q: 기존 로컬 로그인 정보가 사라졌어요**  
A: 의도적 변경입니다. DEMO_USERS 기반 로컬 인증이 CF Access SSO로 교체됐습니다. localStorage에 남아있던 데모 사용자 정보는 자동으로 무시됩니다.

---

## Fallback 상태

**Q: `원본 페이지 앵커 없음` 배지가 뭔가요?**  
A: Provenance 데이터에 `pageRef`(원본 문서 페이지 번호)가 없어 section heading만 표시되는 상태입니다. F365에서 해소 예정입니다.

**Q: `원본 근거 미존재` 배지가 뭔가요?**  
A: spec-container의 `provenance.yaml` 파일이 없어 역추적 경로를 찾을 수 없는 상태입니다. `Issue Raise` 버튼으로 신고하면 F364 Backlog에 추가됩니다.

---

## 레거시 접근

**Q: 기존 5 페르소나 화면을 보고 싶어요**  
A: URL에 `?legacy=1` 파라미터를 추가하세요. 예: `https://decode-x.ktds-axbd.workers.dev/?legacy=1`  
레거시 모드는 Sprint 221 완료 + 스모크 PASS 후 Sprint 222에서 삭제 예정입니다.

---

## 기능 출시 일정

| 기능 | 출시 Sprint |
|------|:-----------:|
| Google OAuth + `/welcome` 페이지 | S219 (현재) |
| Executive Overview + Foundry-X 타임라인 | S220 |
| Engineer Workbench Split View + Provenance Inspector | S221 |
| AXIS DS Tier 3 기여 + Guest/Demo 모드 | S222 |
