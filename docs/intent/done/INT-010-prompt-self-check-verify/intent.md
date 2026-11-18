---
id: INT-010
title: AI 프롬프트에 자가 점검 목록·반영 결과 확인 단계 추가
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-18
updated_at: 2026-11-18T19:47:06+09:00
---

# Intent: AI 프롬프트에 자가 점검 목록·반영 결과 확인 단계 추가

## 문제 (Problem)
- 익스텐션 `AI 프롬프트 복사`가 만드는 프롬프트(`buildPrompt`, INT-006 done)는 위치·변경값만 전달한다.
- 구현 에이전트가 스스로 점검할 기준(선택 요소만 수정했는지, 무관 diff가 없는지, 변경값이 `after`와 일치하는지)이 없어 과잉 수정·누락을 에이전트가 자체 검출하지 못한다.
- 영향 대상: 프롬프트를 에이전트에 붙여넣는 DOMirror 사용자(개발자)와 그 프롬프트를 받는 구현 에이전트.

## 제안 결과 (Proposed outcome)
- 생성 프롬프트 말미에 수치·검증 가능한 자가 점검 목록 섹션이 추가된다.
- 반영 확인 단계가 추가된다: chrome-devtools-mcp 등 브라우저 도구가 있으면 별도 브라우저에서 `pageUrl`을 재로드해 계산값을 `after`와 비교하고, 없으면 새로고침 후 수동 확인 안내로 폴백한다.
- 기존 `buildPrompt` 단위 테스트가 갱신·추가되어 새 섹션을 검증한다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자(프롬프트를 에이전트에 붙여넣는 개발자), 구현 에이전트.
- 익스텐션 프롬프트 생성 `packages/extension/src/prompt.ts:143`(`buildPrompt`, 작성 시점 `:108`), 단위 테스트 `packages/extension/test/prompt.test.ts`.
- 문서 근거 `README.md:162-178`(chrome-devtools-mcp 반영 결과 자동 확인 흐름, INT-002 / 작성 시점 `:161-177`).

## 제약 (Constraints)
- 최소 변경. 기존 프롬프트 구조와 한국어 마크다운 형식을 유지한다.
- 신규 의존성 0건.
- MCP 서버 도구 계약 변경 없음.

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: google-gemini/demolab(Apache-2.0, 스킬 1개 `skills/gemini-frontend-design/SKILL.md`)에서 DOMirror에 쓸 만한 것을 물은 뒤, "생성 프롬프트 끝에 사전 점검 체크리스트 + 브라우저 도구 존재 시 재캡처 시각 확인, 없으면 폴백" 기법을 채택(선택 A). (출처: 대화 요청)
- D-01: demolab 3안 중 이 안만 채택 — 근거: 사용자 선택 A / 폐기 대안: 스킬 패키징·멀티 호스트 매니페스트(INT-003 설계 시 참고로만), 디자인 안티패턴 기반 CSS 편집 경고(범위 초과로 기각)
- D-02: demolab 스킬 원문은 복사하지 않고 기법만 차용 — 근거: 라이선스 고지 불필요 수준 유지
- 참조: `README.md:177` 편집 탭에는 보낸 값이 인라인 `!important`로 남아 같은 탭 비교는 오판 → 확인 단계는 별도 브라우저 비교 필수
- 범위 밖·전제: 디자인 생성 규칙 도입, 서버/플러그인 변경, INT-008 인라인 값 해제 구현은 범위 밖
- 환경·재현: 익스텐션 패널 `AI 프롬프트 복사` → 출력 프롬프트에 점검/확인 섹션 부재
- 인계 지시: 다음 단계는 `z_skill_intent_to_specplan`(미해결 질문은 spec 단계 전 확정 필요)
- 관련 intent: INT-006(프롬프트 생성), INT-002(자동 확인 워크플로), INT-008(인라인 값 해제, 플래닝 중)

## 미해결 질문 (Open questions)
- [x] 점검 목록을 '내역 전체'/'선택 요소' 두 모드 모두에 넣을지, 확인 단계 문구를 chrome-devtools-mcp 고유 도구명으로 쓸지 일반 표현으로 쓸지 → 답변: 두 모드 모두 적용, 확인 단계는 일반 표현("브라우저 확인 도구가 있으면")으로 쓰고 예시로 chrome-devtools-mcp 병기 (2026-11-17)

## 작업 (Tasks)
- [x] T-01 [P2] `prompt.ts`에 `changesFooter(count)`·`selectionFooter()` 헬퍼 추가 후 `changesPrompt`(빈 내역 제외)·`selectionPrompt` 말미에 `## 자가 점검`·`## 반영 확인` 섹션 부착 (2026-11-18)
- [x] T-02 [P2] `prompt.test.ts`에 AC-1~AC-4 신규 4케이스 추가, `pnpm test`·`lint`·`typecheck` 전체 검증 (2026-11-18)

## 결과 (Result)
- `buildPrompt` 두 모드 말미에 `## 자가 점검`·`## 반영 확인` 섹션 추가, 순수 헬퍼 2개로 분리(시그니처·호출처 변경 0건, 신규 의존성 0건).
- 신규 4케이스 포함 23 passed, `pnpm test` 348 passed(29 files)·`lint`·`typecheck` Exit 0. 정합성 게이트 `조건부-실행` 1-pass `PASS_WITH_NOTES`(요구 28/28).
- 상세: [result.md](result.md)
