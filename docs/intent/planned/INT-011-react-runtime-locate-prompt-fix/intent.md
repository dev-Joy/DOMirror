---
id: INT-011
title: React 런타임·DevTools 연동 컴포넌트 위치 찾기와 프롬프트 기반 소스 수정
status: planned
priority: P2
created: 2026-11-19
updated: 2026-11-19
updated_at: 2026-11-19T23:32:59+09:00
---

# Intent: React 런타임·DevTools 연동 컴포넌트 위치 찾기와 프롬프트 기반 소스 수정

## 문제 (Problem)
- 소스 위치는 빌드 플러그인이 주입한 `data-domirror`에서만 얻는다. 플러그인을 등록하지 않은 React 앱에서는 위치를 못 찾고, 코멘트 작성이 막히며, 프롬프트에는 `위치 미확인`만 들어간다.
- 위치는 컴포넌트 정의 파일 안의 호스트 태그만 가리킨다. `<Card/>`처럼 컴포넌트를 쓰는 JSX 호출부 위치와 컴포넌트 계층은 제공하지 않는다.
- 코멘트 페이로드와 AI 프롬프트에 컴포넌트명이 없다. 그래서 에이전트가 고칠 대상을 정확히 짚기 어렵다.
- 영향: DOMirror로 화면 요소를 지정해 AI 에이전트에게 수정을 맡기는 프론트엔드 개발자.

## 제안 결과 (Proposed outcome)
- React 앱에서 요소를 클릭하면, 플러그인이 없어도 React DevTools와 연동해 컴포넌트명·정의 파일·소스 위치를 찾는다.
- 선택 결과에 정의 위치와 함께 JSX 호출부 위치와 컴포넌트 계층(owner chain)이 표시되고 전송된다.
- 사용자가 자유 텍스트 프롬프트(코멘트)를 보내면 페이로드와 프롬프트에 컴포넌트명·정의/호출부 위치가 들어간다.
- 에이전트가 `list_comments` → 해당 소스 수정 → `mark_comments_resolved` 흐름으로 코멘트를 반영할 수 있도록 도구 설명이나 문서가 정리된다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 익스텐션으로 React 앱을 다루는 개발자, MCP로 코멘트를 소비하는 에이전트(Claude Code 등).
- 시스템: `packages/extension`(위치 탐색·패널·프롬프트·코멘트 UI), `packages/server`(코멘트 스키마·MCP 도구), `packages/shared`(타입·상수), README.

## 제약 (Constraints)
- React만 대상으로 한다. Vue는 기존 플러그인 경로를 유지한다.
- 플러그인 주입 위치가 있으면 기존 동작을 그대로 쓴다(회귀 금지). 런타임·DevTools 경로는 보강이나 폴백으로만 쓴다.
- React 19(예제 `react` 19.3.1)에서는 fiber `_debugSource`가 없다. 소스 위치를 얻는 수단(owner stack·`_debugStack`·DevTools 백엔드 API 등)이 설계의 핵심 리스크다.
- DevTools hook(`__REACT_DEVTOOLS_GLOBAL_HOOK__`)은 페이지 main world에 있다. content script(isolated world)에서 직접 읽을 수 없으므로 main world 주입과 메시지 브리지가 필요하다.
- 코멘트 스키마·MCP 출력에 필드를 추가하면 공개 계약이 바뀐다(§A 3호② 필수(하드) 후보). 하위 호환을 위해 선택 필드 추가 방식을 우선한다.
- 위치 정보는 dev 빌드에서만 보장된다. production 빌드는 범위 밖이다.

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: "React DevTools 익스텐션이나 순수 javascript로 해당 컴포넌트 클릭해서 내가 프롬프트 보내면 정확하게 그 컴포넌트가 DOM을 파일 위치를 찾아서 해당부분을 고치게 하는거야" (출처: 대화 요청)
- D-01: 공백 4종(플러그인 없는 위치 탐색·호출부 위치·컴포넌트명 포함·코멘트 반영 흐름)을 1개 intent로 병합 — 근거: 모두 `packages/extension` 위치 탐색·패널 경로를 공유(분해 기준 ③ 경로 교집합 0 미충족) / 폐기 대안: 4개 분해
- D-02: React DevTools와 연동(사용자 선택), React만 지원(사용자 선택), 우선순위 P2(사용자 선택) — 폐기 대안: DevTools 없이 fiber만 읽는 방식, React+Vue 동시 지원
- 참조: `packages/extension/src/source-locator.ts:44-57` `locate()`는 `data-domirror`만 읽고 없으면 null / `packages/extension/src/content.ts:711-716` 위치 없으면 코멘트 차단 / `packages/server/src/schema.ts:53-69` 코멘트 필드에 컴포넌트명 없음 / `packages/plugin/src/injectors/react.ts:132-167` 사용처 주입은 DS 태그만(import 경로) / `packages/server/src/mcp.ts:25-64` MCP 도구 4개 / `packages/*/src`에서 fiber·DevTools hook 사용 0건
- 범위 밖·전제: Vue 런타임 탐색, production 빌드, 에이전트 측 스킬 작성(INT-003 소관), 에이전트의 소스 수정 로직 자체(DOMirror는 위치와 요청만 전달)
- 환경·재현: macOS, Chrome, Vite 8 + React 19.3.1 예제(`examples/`), 플러그인 미등록 상태에서 요소 선택 시 `위치 미확인`으로 재현
- 인계 지시: `z_skill_grill_me -i INT-011`로 미해결 질문 확정 → `z_skill_intent_to_specplan`으로 spec·plan 산출. 설계 첫 단계에서 React 19 소스 위치 취득 수단을 PoC로 검증

## 미해결 질문 (Open questions)
- [x] React DevTools 미설치 시 동작: 기능 비활성 + 안내만 할지, DOMirror가 fiber를 직접 읽는 폴백을 둘지 → 답변: DevTools가 있으면 연동하고 없으면 DOM 노드의 fiber(`__reactFiber$`)를 직접 읽는 폴백을 둔다 (2026-11-19)
- [x] React 19에서 정확한 `파일:라인`을 못 얻으면(owner stack만 있는 경우) 컴포넌트명·파일만으로 전송을 허용할지 → 답변: 허용하고 페이로드·프롬프트에 정확도 표시(예: 라인 미확인)를 붙인다 (2026-11-19)
- [x] 코멘트 반영 자동화(`list_comments`→수정→`mark_comments_resolved`)를 이번 범위(MCP 도구 설명·README)로 둘지, INT-003(에이전트 스킬)으로 넘길지 → 답변: 이번 범위는 MCP 도구 설명·README 안내까지, 에이전트 스킬 자동화는 INT-003 소관 (2026-11-19)
- [x] 분해 후보: ①플러그인 없는 위치 탐색 ②호출부 위치·계층 ③컴포넌트명 포함(계약 변경) ④반영 흐름 — 구현 단계 분할 여부 → 답변: 1개 intent 유지, plan에서 ①→②→③→④ 순서 태스크로 분할해 단계별 검증 (2026-11-19)

## 작업 (Tasks)
- [ ] T-01 [P2] (착수 시 분해 예정)
