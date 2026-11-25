---
id: INT-012
title: 선택 컴포넌트의 props 표시와 화면 렌더 인스턴스 수(수정 영향 범위) 안내
status: planned
priority: P2
created: 2026-11-25
updated: 2026-11-25
updated_at: 2026-11-25T15:07:52+09:00
---

# Intent: 선택 컴포넌트의 props 표시와 화면 렌더 인스턴스 수(수정 영향 범위) 안내

## 문제 (Problem)
- 요소를 선택해도 그 컴포넌트가 어떤 props로 렌더됐는지 알 수 없다. 그래서 AI 프롬프트에 "왜 이렇게 보이는가"에 대한 맥락이 빠진다.
- 공통 컴포넌트의 CSS를 고치면 화면에 렌더된 N개 인스턴스가 함께 바뀐다. 하지만 지금은 그 영향 범위를 알려 주지 않는다. 패널의 "같은 소스에서 나온 요소 N개"는 선택 요소의 소스 위치 기준이라 컴포넌트 인스턴스 수와 다르다.
- 영향: DOMirror로 요소를 골라 수정하는 개발자, 프롬프트·코멘트·변경 내역을 받아 소스를 고치는 MCP 에이전트.

## 제안 결과 (Proposed outcome)
- 패널에 선택 컴포넌트의 props 요약이 표시된다.
- AI 프롬프트(changes·selection 모드)에 props 요약이 포함된다(코멘트에는 포함하지 않음 — 서버 저장 경로, 2026-11-25 결정).
- props 요약이 포함된 AI 프롬프트의 자가 점검(INT-010 `changesFooter`·`selectionFooter`)에 "변경 스타일이 props(variant·size·className 등) 조건부인지 확인하고 해당 분기만 수정할지 판단" 항목이 추가된다(계약 변경 0, IDEA-20261125-03 ① 채택).
- 같은 컴포넌트가 현재 화면에 렌더된 인스턴스 수가 패널에 영향 범위로 표시된다. `list_pending_changes`에도 선택적으로 표시해 INT-007 보호 영역 경고를 보완한다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 익스텐션 사용 개발자, MCP로 변경·코멘트를 소비하는 에이전트(Claude Code 등).
- 시스템(경로는 `packages/` 기준): `extension`(page-bridge·react-runtime·devtools-hook·runtime-bridge·runtime-format·panel·content·prompt·change-log), `shared`(types), `server`(schema·protection·mcp), `plugin`(injectors/react의 인스턴스 계수 영향), 예제 `examples/react-vite`.

## 제약 (Constraints)
- NFR-3: 브리지 응답에 함수·DOM 노드를 넣지 않는다(`extension/src/page-bridge.ts:53`). postMessage는 구조화 복제를 쓰므로 props 직렬화 필터와 깊이·길이 상한이 필요하다.
- props에 토큰·개인정보가 들어 있을 수 있다. 프롬프트·클립보드·서버로 내보낼 때 redaction이 필요하다.
- INT-011 D-S4(플러그인 위치가 있으면 출력 불변, `extension/src/content.ts:563` 주석)와 충돌할 수 있다. 플러그인 앱에서 props를 얻으려면 이 결정을 바꿔야 한다.
- 서버까지 보내면 `shared` 타입·zod 스키마(`server/src/schema.ts`)·`change-log.ts` `sendable` 3곳을 바꿔야 한다. 공개 계약 변경이므로 선택(optional) 필드 추가로 하위 호환을 지킨다.
- 서버 텍스트 필드 상한은 `TEXT_MAX=2048`(`server/src/schema.ts:15`)이다. props 요약 길이도 이 범위 안에서 정한다.
- 신규 의존성 도입 금지. 필요성이 생기면 미확정으로 기록하고 사용자 승인을 받는다.
- React만 확정 대상이다. React 외(Vue) 지원 여부는 미확정이다.

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: react-anatomy(https://github.com/charpeni/react-anatomy, https://react-anatomy.com/ — 렌더된 컴포넌트 트리·props를 보여 주는 DevTools 확장)를 참고해 DOMirror 개선 후보를 도출했다.
- 원 요구: 사용자가 후보 중 "props 표시·AI 프롬프트 포함 + 동일 컴포넌트 인스턴스 수 표시"를 1개 intent로 묶는 안과 우선순위 P2를 승인했다. (출처: 대화 요청)
- D-01: props 표시와 인스턴스 수를 1개 intent로 병합 — 근거: 둘 다 `panel.ts`·`content.ts`·브리지 경로를 공유(분해 기준 ③ 경로 교집합 0 미충족) / 폐기 대안: 2개 분해
- D-02: 3D 레이어 뷰 기각, 트리 양방향 선택·라벨 스크린샷은 INBOX 아이디어로 분리 — 근거: 3D 뷰는 목적 불일치·비용 과다, 나머지는 결과·경로가 독립
- 참조: `extension/src/page-bridge.ts:37-60` respond(DevTools hook 우선→`fiberFromNode` 폴백, describeRuntime :47) / `extension/src/react-runtime.ts:7-16` FiberLike에 `memoizedProps` 없음, nearestComponent :78, describeRuntime :239-257 / `extension/src/devtools-hook.ts:20` findFiberByStateNode, `FIBER_VISIT_LIMIT=20_000` :17 / `extension/src/runtime-bridge.ts:10-26` 메시지 타입·isBridgeResult :37, `runtime-format.ts` isComponentRuntimeInfo / `shared/src/types.ts:92` ComponentRuntimeInfo, ScreenComment.component :68·:77, StyleChange :20, PendingChange :38 / `extension/src/panel.ts:14-27` LocationView(sameSource), componentLines :60-71, runtimeLines :81-, renderLocation :115-145, "같은 소스에서 나온 요소 N개" :127·:136 / `extension/src/content.ts` 브리지는 플러그인 위치 없을 때만 호출 :507·:537·:562-567, #renderSelection :544-558(countSameSource :550), promptInput :584-598, 코멘트 component :821-829 / `extension/src/prompt.ts` PromptSelection :10-17, componentLines :47, changesPrompt :101, selectionPrompt :141, buildPrompt :160 / `extension/src/change-log.ts` LocalChange.component :12, sendable :51-58(component 제거 후 전송) / `server/src/schema.ts` ComponentRuntimeInfoSchema :64-70, StyleChangeInputSchema :17-35(component 없음), PendingChangeSchema :47-49 / `server/src/protection.ts:7` withProtectionWarning / `server/src/mcp.ts:25-37` / `plugin/src/injectors/react.ts:128-170` 컴포넌트 파일 내 모든 호스트 요소에 `data-domirror`·`data-domirror-component` 부착(:138-142) → 속성 개수 = 인스턴스 × 내부 요소 수(부풀려짐) / `source-locator.ts:75-83` countSameSource는 선택 요소 위치 기준
- 범위 밖·전제: 3D 레이어 뷰, 컴포넌트 트리 양방향 선택, 라벨 스크린샷 내보내기(INBOX 분리), production 빌드. 전제: props·인스턴스 정보는 dev 빌드 React 런타임(fiber·DevTools hook)에서만 얻는다.
- 환경·재현: `examples/react-vite`(React 19.3.1, `_debugStack` 경로, `DOMIRROR=1 vite`). `App.tsx`는 Card 1개·DS Button 1개만 렌더하므로 인스턴스 수 검증용 반복 렌더 예제가 필요하다. 명령: `pnpm test`(vitest run)·`pnpm lint`(oxlint .)·`pnpm typecheck`·`pnpm build`.
- 인계 지시: 미해결 질문 4건 확정(`z_skill_grill_me -i INT-012`) → `z_skill_intent_to_specplan`. 예상 Tier 3(브리지·shared 계약·서버 스키마 변경 가능), 확정은 code-planner.

## 미해결 질문 (Open questions)
- [x] 플러그인 적용 앱에서도 props를 보여 주기 위해 위치가 있어도 브리지를 호출할지(INT-011 D-S4 변경 여부) → 답변: props 전용으로 호출 — 플러그인 위치가 있어도 브리지를 호출하되 props·인스턴스 수만 덧붙이고 위치·이름 표시는 플러그인 값 유지(D-S4 취지 유지) (2026-11-25)
- [x] props 직렬화 규칙(함수·React 요소·순환 참조 처리, 깊이·길이 상한)과 민감값 redaction 정책 → 답변: 요약+키 마스킹 — 원시값 길이 상한, 함수 `ƒ name`, React 요소 `<Tag>`, 객체 깊이 2·키 개수 상한, 순환 `[Circular]`, 키 이름에 token·password·secret·key·auth 포함 시 `•••` 마스킹(세부 수치는 spec 확정) (2026-11-25)
- [x] 인스턴스 수 정의: fiber 기준(같은 type fiber 수) vs DOM 기준(루트 위치 countSameSource) → 답변: fiber 기준 — 현재 커밋 트리에서 같은 type 컴포넌트 fiber 수, 상한(FIBER_VISIT_LIMIT 20,000) 도달 시 `N+` 표시 (2026-11-25)
- [x] props·인스턴스 수를 서버(`POST /changes`·`list_pending_changes`)까지 보낼지, 프롬프트·패널 로컬 전용으로 둘지 → 답변: 인스턴스 수만 서버로 — 변경 내역 선택 필드 instanceCount를 shared 타입·zod·sendable에 추가해 list_pending_changes에 노출, props는 패널·프롬프트·코멘트 로컬 전용 (2026-11-25) [정정 2026-11-25: 코멘트는 로컬 전용 범위에서 제외 — props는 패널·AI 프롬프트에만 포함, 20행·spec D-S5]

## 작업 (Tasks)
- [ ] T-01 [P2] (착수 시 분해 예정)
