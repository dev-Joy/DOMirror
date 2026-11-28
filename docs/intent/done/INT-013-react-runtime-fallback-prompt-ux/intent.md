---
id: INT-013
title: CRA·UI 라이브러리 환경 React 런타임 위치 폴백 및 AI 프롬프트 복사 개선
status: done
priority: P2
created: 2026-11-28
updated: 2026-11-28
updated_at: 2026-11-28T15:49:19+09:00
---

# Intent: CRA·UI 라이브러리 환경 React 런타임 위치 폴백 및 AI 프롬프트 복사 개선

## 문제 (Problem)
- Vite 전용 빌드 플러그인(`data-domirror`)을 적용할 수 없는 CRA/Webpack 기반 React dev 앱에서 MUI 등 외부 UI 라이브러리 컴포넌트(`MuiTypographyRoot` 등 `node_modules`)를 선택하면, 최인접 fiber의 경로가 `node_modules` 필터에 걸려 `소스 위치 없음`·`라인 미확인`이 표시되고 코멘트 작성이 차단된다.
- CSS 변경 기록(`#edit`)은 `source`를 오직 `data-domirror`(`locate(el)`)로만 채워, React 런타임 위치(`_debugSource`/`_debugStack`)가 있어도 모든 CSS 변경이 `전송 제외`되어 MCP 서버 전송(`POST /changes`)이 불가능하다.
- 페이지 여백 클릭 등으로 `<html>`/`<body>`가 선택·편집되면 `chrome.storage.local`에 잔류하고, 변경 내역(`#log`)이 1건이라도 남아 있으면 "AI 프롬프트 복사"가 현재 선택한 React 요소를 무시하고 잔류 변경 내역(`html`)만 복사해 AI가 수정 대상 컴포넌트 위치를 찾지 못한다.
- 영향: CRA/Webpack + UI 라이브러리(MUI 등) 조합의 React dev 앱에서 DOMirror로 코멘트·CSS 변경·AI 프롬프트 복사를 사용하는 프론트엔드 개발자.

## 제안 결과 (Proposed outcome)
- `node_modules` 소속 라이브러리 컴포넌트를 선택해도 `owners` 체인을 거슬러 올라가 가장 가까운 프로젝트 사용자 컴포넌트(예: `MainMenuView`)의 런타임 위치(`_debugSource`/`_debugStack`)로 자동 폴백해 패널 위치 표시와 코멘트 작성이 동작한다.
- 빌드 플러그인(`data-domirror`)이 없는 React dev 앱에서도 CSS 변경 내역의 `source`에 React 런타임 위치 폴백을 허용해 MCP 서버 전송 및 프롬프트 위치 출력이 가능해진다.
- `<html>`/`<body>` 실수 선택·편집이 방지되고, 변경 내역 잔류 시에도 현재 선택 요소와 변경 내역 간 AI 프롬프트 복사 혼동이 해소되어 AI가 컴포넌트·계층·props를 기반으로 정확한 소스 위치를 찾을 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: 빌드 플러그인 미적용 React dev 앱(CRA/Webpack + MUI 등) 개발자, DOMirror MCP 변경·코멘트를 소비하는 AI 에이전트.
- 시스템: `packages/extension`(`react-runtime.ts`, `content.ts`, `picker.ts`, `panel.ts`, `prompt.ts`, `change-log.ts`), 필요 시 `packages/shared`·`packages/server`(런타임 위치 정확도·스키마 호환 확인).

## 제약 (Constraints)
- 기존 Vite 빌드 플러그인(`data-domirror`)이 주입된 요소의 동작과 우선순위(플러그인 우선, 런타임 폴백)를 깨뜨리지 않는다(회귀 금지).
- React dev 빌드만 대상으로 하며 production 빌드와 Vue 런타임 탐색은 범위 밖이다.
- `packages/shared`·`packages/server` 공개 MCP 계약 변경이 필요할 경우 하위 호환 선택 필드 추가 방식을 우선한다(§A 3호② `필수(하드)` 대상).
- 일정·보안: (제약 없음 또는 미확정)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: CRA+MUI React 앱(`빅스_프론트`)에서 `매출 대시보드`(`MainMenuView` > `MuiTypographyRoot`)를 선택해 AI 프롬프트 복사 시 `소스 위치 없음`/`라인 미확인`·잔류 `html` 변경 1건만 복사되어 AI가 컴포넌트 위치를 못 찾는 문제를 DOMirror에서 해결 (출처: 대화 요청)
- D-01: 3개 개선안(①라이브러리 상위 사용자 컴포넌트 폴백 ②CSS 변경 런타임 위치 폴백 ③`html`/`body` 가드·프롬프트 복사 혼동 해소)을 1개 intent로 병합 — 근거: 모두 `packages/extension/src/{content,panel}.ts`를 공유(기준 ③ 미충족)하고 ②의 MUI 실측 검증이 ①에 의존(기준 ④ 미충족) / 폐기 대안: 3개 intent 분리
- D-02: 우선순위 P2(미지정 기본), `빅스_프론트` CRA에 `craco`+Webpack 플러그인을 도입하는 대신 DOMirror 익스텐션 런타임 폴백 개선 선택 — 근거: 대상 앱 무수정으로 모든 CRA/Webpack+UI 라이브러리 React 앱에 범용 적용 / 폐기 대안: CRA `craco` 도입 + Webpack/Babel 어댑터 신규 개발
- 참조: `packages/extension/src/react-runtime.ts:205-233` `normalizeFile`이 `node_modules` 제외, `packages/extension/src/content.ts:704` `#edit`이 `locate(el)`만 사용, `packages/extension/src/content.ts:598-607` `#log.length > 0` 시 `#selected` 무시, `packages/extension/src/picker.ts:110-141` `html`/`body` 미차단, `packages/extension/src/change-log.ts:52-60` `source === null` 전송 제외
- 범위 밖·전제: Webpack/CRA/Babel용 빌드 플러그인 어댑터 신규 개발, `빅스_프론트` 저장소 수정, Vue 런타임 탐색, React production 빌드 지원
- 환경·재현: macOS, Chrome, CRA(`react-scripts` 5.0.1)+React 18.2.0+MUI(`빅스_프론트`, `http://localhost:3000/home`)에서 `MainMenuView > Tooltip > Typography > MuiTypographyRoot` 선택 시 `라인 미확인`/`소스 위치 없음` 및 잔류 `html` `line-height: 1.5 → 26px`만 프롬프트 복사 재현
- 인계 지시: `z_skill_grill_me -i INT-013`으로 미해결 질문 확정 후 `z_skill_intent_to_specplan`으로 `spec.md`·`plan.md` 산출

## 미해결 질문 (Open questions)
- [x] `<html>`/`<body>` 가드 방식: 피커에서 `<html>`·`<body>` 선택 자체를 차단할지, 아니면 선택은 허용하되 CSS 편집/변경 기록만 차단할지? → 답변: 피커에서 `<html>`·`<body>` 선택 자체를 차단 (2026-11-28)
- [x] 변경 내역(`#log`)이 남아 있을 때 "AI 프롬프트 복사" 동작: ① `선택 요소 복사`와 `변경 내역 복사` 버튼을 분리할지, ② 기존 버튼 1개를 유지하되 변경 내역과 별개로 현재 선택 요소 컨텍스트를 함께 포함할지? → 답변: `선택 요소 복사`와 `변경 내역 복사` 버튼을 분리해 제공 (2026-11-28)
- [x] CSS 변경 내역에 React 런타임 위치 폴백을 허용할 때, 줄 번호가 확정되지 않은 `line-unverified`(예: React 19 `_debugStack`) 변경도 MCP 서버(`POST /changes`) 전송을 허용할지, 아니면 `exact`(React 18 `_debugSource` 등)만 전송할지? → 답변: `line-unverified`도 정확도 표시를 포함해 MCP 서버 전송 허용 (2026-11-28)
- [x] 분해 후보: ①라이브러리 상위 사용자 컴포넌트 폴백 ②CSS 변경 런타임 위치 폴백 ③`html`/`body` 가드·프롬프트 복사 UX — 1개 intent 유지(plan 단계 분할)로 진행할지, 별도 intent로 분리할지? → 답변: 1개 intent 유지, plan에서 ①→②→③ 순서 태스크로 분할해 단계별 검증 (자동승인: 권장안 — 근거: D-01 분해 기준 ③·④ 미충족 및 INT-011 선례와 동일) (2026-11-28)

## 작업 (Tasks)
- [x] T-01 [P2] plan.md Step 1~9 구현·검증 — ① 라이브러리 상위 사용자 컴포넌트 위치 폴백 ② CSS 변경 런타임 위치 폴백·`precision` 서버 계약 ③ `html`/`body` 선택 차단·복사 버튼 2개 분리·README (Tier 3, plan §3 매핑) (2026-11-28)

## 결과 (Result)
- 라이브러리 컴포넌트 선택 시 상위 사용자 컴포넌트 런타임 위치로 폴백하고, 플러그인 없는 앱에서도 CSS 변경 source에 런타임 위치를 써서 선택 필드 `StyleChange.source.precision`과 함께 MCP로 전송한다(하위 호환). 피커 `html`/`body` 선택 차단, 복사 버튼 `선택 요소 복사`/`변경 내역 복사` 분리.
- `lint`·`typecheck`·`test`(36 files/488 passed)·`build` exit 0, Playwright AC-7~AC-10 Pass, 정합성 `필수(하드)` 2-pass `PASS_WITH_NOTES`. 완료일 2026-11-28.
- 상세: [result.md](result.md)
