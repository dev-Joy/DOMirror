---
id: INT-008
title: 소스 반영 확인 시 익스텐션 인라인 !important 값 해제·원복
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-18
updated_at: 2026-11-17T16:03:47+09:00
---

# Intent: 소스 반영 확인 시 익스텐션 인라인 !important 값 해제·원복

## 문제 (Problem)
- 익스텐션은 편집값을 요소의 인라인 `!important`로 적용하고(`packages/extension/src/applier.ts:40`), 전송이 성공해도 요소 추적만 끝낼 뿐 페이지 표시는 보낸 값 그대로 둔다(`packages/extension/src/edit-tracker.ts:50`~`:53`, `packages/extension/src/applier.ts:117`).
- 그래서 에이전트가 소스 반영에 실패해도, 익스텐션이 켜진 탭에서는 보낸 값이 계속 보여 실패가 가려진다. 반영 여부를 보려면 익스텐션을 끄거나(`restoreAll`, `packages/extension/src/applier.ts:139`) 별도 브라우저로 확인해야 한다.
- 영향 대상: DOMirror로 편집·전송 후 같은 탭에서 결과를 확인하는 프런트엔드 개발자(요청자 본인).

## 제안 결과 (Proposed outcome)
- 소스 반영을 확인하는 시점에 익스텐션이 남긴 인라인 값을 해제·원복해, 화면에 보이는 값이 소스(스타일시트)에서 온 값이 된다.
- 반영에 실패한 항목은 인라인 값이 풀린 뒤 원래 값으로 보여, 같은 탭에서도 실패를 알아볼 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자.
- 익스텐션: 적용·원복 `packages/extension/src/applier.ts:35`(`applyStyle`)·`:44`(`restoreStyle`)·`:66`(`AppliedStyles`), 편집 상태 조정 `packages/extension/src/edit-tracker.ts:11`(`EditTracker`).
- 로컬 서버: 익스텐션이 쓰는 HTTP 경로는 `GET /health`(대기 건수만, `packages/server/src/http.ts:111`)와 `POST /changes`(`packages/server/src/http.ts:115`)뿐이며 항목별 반영(applied) 상태를 익스텐션이 조회하는 경로는 없다. 반영 표시는 MCP `mark_changes_applied`(`packages/server/src/mcp.ts:37`).
- 문서: `README.md:278`(인라인 `!important` 적용), `README.md:279`(전송 성공 후 페이지에는 보낸 값이 그대로 보임).

## 제약 (Constraints)
- 전송 중 편집·되돌리기 잠금(`packages/extension/src/edit-tracker.ts:43`~`:59`)과 끌 때 원복(NFR-3, `restoreAll`) 동작을 깨지 않는다.
- 대상 요소에는 인라인 style 외에 아무것도 쓰지 않는다는 기존 원칙을 유지한다(`packages/extension/src/applier.ts:1`).
- INT-002의 회피책(별도 브라우저에서 비교, `README.md:154` 이하)은 유지하며, 이 intent는 같은 탭 확인을 보완한다.

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261117-01 "전송 성공 후에도 익스텐션이 보낸 값을 인라인 !important로 페이지에 남겨(packages/extension/src/applier.ts:40, edit-tracker.ts:50) 소스 반영 실패를 가림 → 반영 확인 시 인라인 값 해제·원복 방법 검토" (출처: _ideas IDEA-20261117-01, INT-002 spec 조사 중 발견, 대화 2026-11-17)
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- 참조: `packages/extension/src/applier.ts:40` `el.style.setProperty(property, value, 'important')`, `packages/extension/src/edit-tracker.ts:50` 주석 "전송 성공 정산: 보낸 key의 요소 추적을 끝내고(페이지 표시는 보낸 값 그대로)"(실행부 `:52` `this.#applied.forget(key)`)
- 참조(INT-002): `docs/intent/done/INT-002-devtools-mcp-apply-verify/spec.md:39` 익스텐션이 켜진 탭은 거짓 일치가 나므로 별도 브라우저에서 비교하도록 회피(`spec.md:102` D-S1 `--isolated`)
- D-02: 편집 즉시 반영용 인라인 `!important` 적용은 유지하고 반영 확인 시점에만 해제·원복 — 근거: 아이디어 원문의 해결 방향, 인라인 적용 목적은 페이지 `!important`보다 우선해 즉시 보이게 하는 것(`packages/extension/src/applier.ts:32`) / 폐기 대안: 인라인 적용 자체 제거
- 범위 밖·전제: chrome-devtools-mcp 검증 워크플로(INT-002) 변경은 범위 밖
- 환경·재현: macOS(Darwin 25.6.0). 재현은 README 예제에서 편집·전송 후 소스를 반영하지 않은 채 같은 탭을 보면 보낸 값이 그대로 보임(`README.md:279` 기술 동작, 이 intent 작성 중 실측 수치 없음)
- 인계 지시: 미해결 질문(반영 확인 시점·트리거) 확정 후 `z_skill_intent_to_specplan`

## 미해결 질문 (Open questions)
- [x] "반영 확인" 시점은 무엇으로 정하는가? (사용자가 패널에서 확인 버튼 클릭 / 서버가 `mark_changes_applied`로 applied 처리된 것을 익스텐션이 감지 / HMR·새로고침 감지) → 답변: 사용자가 패널의 반영 확인 버튼을 클릭할 때(서버 계약 변경 없음) (2026-11-17)
- [x] 서버 applied 상태를 트리거로 쓴다면, 익스텐션이 항목별 상태를 조회할 HTTP 경로를 서버에 추가하는가? (현재 `GET /health`·`POST /changes`만 존재) → 답변: 추가하지 않음 (자동승인: 권장안 — 근거: 반영 확인 시점을 패널 버튼으로 확정해 전제(서버 applied 트리거)가 성립하지 않음) (2026-11-17)
- [x] 해제 후 결과를 사용자에게 어떻게 알리는가? (해제만 / 해제 후 computed 값을 보낸 값과 비교해 일치·불일치 표시) → 답변: 해제 후 computed 값을 보낸 값과 비교해 항목별 일치·불일치 표시 (2026-11-17)
- [x] 해제 대상은 전송한 항목에 한정하는가, 반영 확인 시 미전송 편집 값도 함께 원복하는가? → 답변: 전송한 항목만 해제, 미전송 편집 값은 유지 (2026-11-17)

## 작업 (Tasks)
- [x] T-01 [P2] 전송 기록·해제·비교 — `applier.ts` `markSent`/`sentCount`/`releaseSent`·신규 `verify.ts`·`edit-tracker.ts` `markSent`/`verifySent` (plan Step 2~5, AC-1~AC-6) (2026-11-18)
- [x] T-02 [P2] 패널 UI — `content.ts` `반영 확인` 버튼·상태 요약, `panel.ts` 결과 목록 (plan Step 6, FR-2·FR-5; AC-7 브라우저 실측은 미수행 — 익스텐션 자동 로드 불가, 사유는 result.md) (2026-11-18)
- [x] T-03 [P2] README 갱신 — `:178`·`:256`·`:293`~`:294`·`:313` (plan Step 7, AC-8) (2026-11-18)

## 결과
- 완료일: 2026-11-18. 패널 `반영 확인` 버튼으로 전송한 항목의 인라인 `!important`만 해제·원복하고, 같은 동기 구간에서 computed를 보낸 값과 비교해 항목별 `일치`·`불일치`·`확인 불가`를 표시한다. 미전송 편집값·전송 잠금·`restoreAll` 동작은 유지, 서버·shared·MCP 계약 변경 0.
- 신규 테스트 18건(A-1~A-8 applier, V-1~V-7 verify, T-1~T-3 edit-tracker) 포함 `pnpm typecheck`·`lint`·`test`(29 files/344 tests)·`build` Exit 0, 정합성 게이트 조건부-실행 1-pass `PASS_WITH_NOTES`(비차단 NOTE 3건). AC-7 브라우저 실측만 미수행(수동 확인 절차 `README.md:313`).
상세: [result.md](result.md)
