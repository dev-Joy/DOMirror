# Spec: 선택 컴포넌트의 props 표시와 화면 렌더 인스턴스 수(수정 영향 범위) 안내
- Intent: [INT-012](intent.md) | Status: planned | 작성일: 2026-11-25
- Intent updated_at: 2026-11-25T15:07:52+09:00

## 1. 개요
- 원 요구: react-anatomy(https://github.com/charpeni/react-anatomy, https://react-anatomy.com/ — 렌더된 컴포넌트 트리·props를 보여 주는 DevTools 확장)를 참고해 DOMirror 개선 후보를 도출했다. 사용자가 그중 "props 표시·AI 프롬프트 포함 + 동일 컴포넌트 인스턴스 수 표시"를 1개 intent·P2로 승인했다. (출처: 대화 요청)
- 문제
  - 요소를 선택해도 컴포넌트가 어떤 props로 렌더됐는지 알 수 없어 AI 프롬프트에 "왜 이렇게 보이는가" 맥락이 빠진다.
  - 공통 컴포넌트의 CSS를 고치면 화면의 N개 인스턴스가 함께 바뀌지만 영향 범위를 알려 주지 않는다. 패널의 "같은 소스에서 나온 요소 N개"(`packages/extension/src/panel.ts:127`·`:136`)는 선택 요소의 소스 위치 기준이라 컴포넌트 인스턴스 수와 다르다.
- 이 spec은 다음을 정의한다.
  - ① 브리지(main world)가 가장 가까운 컴포넌트 fiber의 `memoizedProps`를 요약·마스킹한 문자열을 돌려준다.
  - ② 같은 컴포넌트 type의 현재 커밋 트리 fiber 수(인스턴스 수)를 돌려준다(상한 20,000, 도달 시 `N+`).
  - ③ 패널·AI 프롬프트에 ①②를 표시하고, ②만 변경 내역 선택 필드 `instanceCount`로 서버·`list_pending_changes`까지 보낸다. 코멘트(`ScreenComment`)에는 ①②를 넣지 않는다(intent.md 20행, 2026-11-25 결정 — D-S5).
  - ④ 플러그인 위치가 있어도 브리지를 호출하되 위치·이름은 플러그인 값을 유지한다(INT-011 D-S4 취지 유지).
  - ⑤ props 요약 줄이 들어간 AI 프롬프트에 한해 `## 자가 점검`(INT-010 `changesFooter`·`selectionFooter`)에 props 조건부 스타일 확인 항목 1줄을 붙인다(intent.md 21행, IDEA-20261125-03 ①만 채택 — D-S6). 계약 변경은 0건이다.
- 인계 지시(intent): 미해결 질문 4건 확정 완료(intent 48~51행 `[x]`) → 본 spec/plan 작성. 예상 Tier 3, 확정은 code-planner.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `packages/extension`: 브리지 응답에 `props`·`instanceCount` 추가, props 요약·마스킹 순수 함수, 인스턴스 계수 순수 함수, 플러그인 위치가 있을 때도 브리지 호출, 패널 표시, AI 프롬프트(changes·selection) 포함과 props 조건부 자가 점검 항목(FR-12), 변경 내역 로컬 로그에 `instanceCount` 저장·전송.
  - `packages/shared`: `InstanceCount` 타입, `StyleChange.instanceCount?`.
  - `packages/server`: `StyleChangeInputSchema`(및 이를 쓰는 `PendingChangeSchema`)에 `instanceCount` optional 추가, `list_pending_changes` 설명 갱신.
  - `examples/react-vite`: 반복 렌더 Card와 민감 키 props 예제 추가.
  - `README.md`: 패널·프롬프트·MCP 출력 설명, 알려진 한계, 수동 체크리스트(INT-011 회귀 항목 `:329` 문구 포함) 갱신.
- Out-of-scope (intent `범위 밖·전제` + 확정 답변)
  - 3D 레이어 뷰(D-02 기각), 컴포넌트 트리 양방향 선택·라벨 스크린샷 내보내기(INBOX 분리)
  - production 빌드(전제: props·인스턴스 정보는 dev 빌드 React 런타임에서만 얻는다)
  - Vue 등 React 외 프레임워크(React만 확정 대상)
  - props의 서버 전송(Q4: props는 로컬 전용)
  - 코멘트(`ScreenComment`)에 props·인스턴스 수 포함(D-S5). `ScreenComment`·`POST /comments`·`ComponentRuntimeInfoSchema`(`packages/server/src/schema.ts:64-70`) 계약은 바꾸지 않는다.
  - 플러그인 위치가 있을 때의 컴포넌트명·위치 런타임 보강(INT-011 D-S4 유지)
  - IDEA-20261125-03 ②(스타일 관련 prop 화이트리스트 서버 전송)·③(props 값별 인스턴스 수 분리 표시): INBOX 유지(D-S6)

## 3. 영향 시스템 · 모듈 · 데이터
(HEAD `b637b16` 기준, researcher ±0행 재실존 확인. intent 인용과 다른 값은 "정정"으로 표기)
- 브리지(MAIN world)·런타임 탐색
  - `packages/extension/src/page-bridge.ts:37-60`: `respond`. DevTools hook 우선, `fiberFromNode` 폴백(`:44-45`), `describeRuntime` 호출 `:47`, NFR-3 주석(함수·DOM 노드 미포함) `:53`.
  - `packages/extension/src/react-runtime.ts:7-16`: `FiberLike`. `memoizedProps`·`alternate` 필드가 없다. HostRoot `tag 3` `:34`, `nearestComponent` `:78`, `describeRuntime` `:239-257`.
  - `packages/extension/src/devtools-hook.ts:17`: `FIBER_VISIT_LIMIT = 20_000`. `:20-39`: `findFiberByStateNode`(상한 도달 시 `null`).
  - `packages/extension/src/runtime-bridge.ts:10-27`(정정: intent `:10-26`): `RuntimeBridgeResult {info, hostSource?}`·`BridgeResultMessage`·`BridgeRequestMessage`. `isBridgeResult` `:37`.
  - `packages/extension/src/runtime-format.ts`: `VIA_VALUES` `:14`, `formatRuntimeRef` 예 `:17`, `ownerChainText` `:43-46`, `isRuntimeSourceRef` `:52-60`, `isComponentRuntimeInfo` `:63-80`(모르는 키는 통과).
- 선택·패널 (content script, ISOLATED world)
  - `packages/extension/src/content.ts:506`: 주석 `// 플러그인 위치가 있으면 기존 경로만 쓴다(FR-6·NFR-1). 없을 때만 런타임에 묻는다(FR-2).` `:507`: `if (locate(el) === null) void this.#loadRuntime(...)`.
  - `packages/extension/src/content.ts:538`: `#ensureRuntime` 가드(`if (locate(el) !== null) return null;`). `:544-559`(정정: intent `:544-558`): `#renderSelection`, `countSameSource` 호출 `:550`.
  - `packages/extension/src/content.ts:562-567`: `#runtimeInfo`, 가드 `:565`. `:564`(정정: intent `:563`): 주석 `// 선택 후 data-domirror가 붙은 경우에도 플러그인 경로 출력을 바꾸지 않는다(D-S4).`
  - `packages/extension/src/content.ts:581-598`(정정: intent `:584-598`): `promptInput`. `:821-829`: 코멘트 `component` 조립(변경 대상 아님 — D-S5).
  - `packages/extension/src/panel.ts:14-26`(정정: intent `:14-27`): `LocationView`. `:24` 문구 `플러그인 위치가 있으면 항상 null이다(FR-6)`. `componentLines` `:60-71`(표시 `:63` `컴포넌트: ${name}`), `runtimeLines` `:81-106`(`:95`, `:101` `정의:`, `:102` `호출부:`, `:104` `계층:`), `renderLocation` `:109-146`(정정: intent `:115-145`), "같은 소스에서 나온 요소 N개" `:127`·`:136`.
  - `packages/extension/src/source-locator.ts:75-78`: `sameSourceSelector`. `:81-83`: `countSameSource`(선택 요소 위치 기준).
- 프롬프트
  - `packages/extension/src/prompt.ts:10-17`: `PromptSelection`. `componentLines` `:47-56`(`- 컴포넌트: Name (정의: ... / 호출부: ...)`, `- 계층: A › B`). `changesPrompt` `:101`(삽입 지점 `:128`), `selectionPrompt` `:141`(삽입 지점 `:152`), `buildPrompt` `:160`.
  - `packages/extension/src/prompt.ts:70`: `function changesFooter(count: number): string[]`(INT-010, 주석 `:69`, `## 자가 점검` `:73`, 호출 `:137` `if (changes.length > 0) lines.push(...changesFooter(changes.length));`). `:86`: `function selectionFooter(): string[]`(`## 자가 점검` `:89`, 호출 `:155`). 두 함수 모두 `## 자가 점검` 3항목 뒤 빈 줄과 `## 반영 확인`이 온다.
  - `packages/extension/test/prompt.test.ts:202`: `describe('buildPrompt — 자가 점검·반영 확인 (AC-1~AC-4)'`(INT-010 기존 단언, 무수정 대상).
- 변경 내역 로컬 로그·전송
  - `packages/extension/src/change-log.ts:6-13`: `LocalChange`(`component` `:12`). `:51-60`(정정: intent `:51-58`): `sendable`. 제거 구문 `:56` `const { stale: _stale, component: _component, source, ...rest } = c;` → `rest`에 남는 필드는 그대로 전송된다.
- 공유 타입·상수
  - `packages/shared/src/types.ts`: `StyleChange` `:20-30`, `ProtectedAreaWarning` `:32-36`, `PendingChange` `:38`, `StyleChangeInput` `:40`(`Omit<StyleChange,'status'>`), `ScreenComment` `:68`(`component` `:77`, 변경 없음), `LocationPrecision` `:81`, `RuntimeSourceRef` `:83-90`, `ComponentRuntimeInfo` `:92-102`(`name, definition?, callSite?, owners?, via`, 변경 없음).
  - `packages/shared/src/constants.ts`: `BRIDGE_CHANNEL` `:11`, `BRIDGE_MARKER_ATTR` `:13`, `BRIDGE_TIMEOUT_MS = 300` `:15`, `BRIDGE_OWNER_MAX = 8` `:17`.
- 서버 계약
  - `packages/server/src/schema.ts:11`: zod 4.6.7 `zod/v4`. `TEXT_MAX = 2048` `:15`. `StyleChangeInputSchema` `:17-35`(`component` 없음, `satisfies` `:35`). `PendingChangeSchema` `:47-49`(`satisfies` 없음). `ComponentRuntimeInfoSchema` `:64-70`(변경 없음 — D-S5).
  - 세 스키마 모두 strip(strict 0건)이다. `instanceCount`를 스키마에 넣지 않으면 조용히 버려지고, optional 필드라 `satisfies`로도 누락이 검출되지 않는다.
  - `packages/server/src/http.ts:91`: `safeParse`. `packages/server/src/protection.ts:7`: `withProtectionWarning(change: StyleChange): PendingChange`(스프레드라 필드 보존). `packages/server/src/mcp.ts:25-37`: `list_pending_changes`(outputSchema `:33`, 핸들러 `:36`).
- 플러그인(변경 없음, 참조만)
  - `packages/plugin/src/injectors/react.ts:128-172`(정정: intent `:128-170`): `JSXOpeningElement`. 속성 부착 `:139-143`(정정: intent `:138-142`). 컴포넌트 파일 안 모든 호스트 요소에 `data-domirror`·`data-domirror-component`를 붙이므로 DOM 속성 개수 = 인스턴스 × 내부 요소 수(부풀려짐) → DOM 기준 계수는 쓰지 않는다(Q3).
- 예제
  - `examples/react-vite/src/App.tsx:13-19`: `items.map` `li` 4개(호스트 요소). `:20-22`: `Card` 1개(`className="무시되는-속성"`). `:23`: DS `Button`.
  - `examples/react-vite/src/components/Card.tsx:3-8`: `CardProps`. `:15-23`: `Card`. 반복 Card 렌더·민감 키 props 예제가 없다. React 19.3.1(`_debugStack`).
- README: `:151` `ScreenComment`, `:257` 사용법, `:273` 런타임, `:275` AI 프롬프트, `:294`·`:297` 알려진 한계, `:315` 수동 체크리스트, `:327-329` INT-011 회귀 항목(`:329` "런타임 줄이 붙지 않는다").
- 데이터: 변경 내역은 서버 메모리와 extension 로컬 storage(`change-log.ts`)에 있다. 새 필드는 optional이라 마이그레이션 대상 영속 데이터가 없다.

## 4. 기능 요구사항 (FR-n)
- FR-1 (브리지 호출 조건 변경, Q1)
  - 플러그인 위치(`data-domirror`)가 있어도 선택 시 브리지를 1회 호출한다. 대상 분기는 `content.ts:507`·`:538`·`:565` 3곳이다.
  - 플러그인 위치가 있으면 브리지 응답 중 `props`·`instanceCount`만 쓴다. `info`(컴포넌트명·정의·호출부·계층)와 `hostSource`는 버리고 위치·이름 표시는 플러그인 값을 유지한다.
  - 플러그인 위치가 없으면 INT-011 동작(`info` 사용)에 `props`·`instanceCount`를 더한다.
- FR-2 (props 수집): 브리지는 `nearestComponent`(`react-runtime.ts:78`)가 고른 컴포넌트 fiber의 `memoizedProps`를 읽는다. 컴포넌트 fiber가 없으면 `props`를 생략한다.
- FR-3 (props 요약 직렬화, Q2): MAIN world에서 순수 함수로 문자열 1개로 요약한다. 규칙은 §6 「props 요약 규칙」(확정)을 따른다. 응답에는 이 문자열만 담는다(원본 객체·함수·노드 미포함, NFR-3).
- FR-4 (민감 키 마스킹, Q2): 키 이름에 `token`·`password`·`secret`·`key`·`auth` 중 하나라도 포함되면(대소문자 무시 부분일치) 값을 `•••`로 바꾼다. 모든 깊이의 객체 키에 적용한다.
- FR-5 (인스턴스 수, Q3)
  - 선택 컴포넌트 fiber의 `type`과 같은 `type`을 가진 fiber 수를, 선택 요소가 속한 루트의 현재 커밋 트리(`root.current`)에서 센다.
  - 순회 방문 상한은 `FIBER_VISIT_LIMIT`(20,000, `devtools-hook.ts:17`)이다. 상한에 도달하면 `capped: true`로 돌려주고 `N+`로 표시한다.
  - 루트 접근: DevTools 경로는 hook의 fiber root 목록을 재사용하고, `fiberFromNode` 경로는 `return`을 따라 HostRoot(`tag 3`, `react-runtime.ts:34`)까지 올라가 `stateNode.current`에서 순회한다.
- FR-6 (패널 표시)
  - 기존 컴포넌트 줄 아래에 `props:` 줄과 `인스턴스: 화면에 N개(같은 컴포넌트, 수정 시 함께 바뀜)` 줄을 추가한다. 상한 도달 시 `N+개`.
  - 기존 "같은 소스에서 나온 요소 N개"(`panel.ts:127`·`:136`)는 그대로 두고 의미가 다른 별도 줄로 표시한다.
  - 값이 없으면 줄을 출력하지 않는다.
- FR-7 (AI 프롬프트): changes·selection 프롬프트의 컴포넌트 줄 뒤(`prompt.ts:128`·`:152` 삽입 지점)에 `- props: <요약>`과 `- 인스턴스: N개(같은 컴포넌트, 수정 시 함께 바뀜)` 줄을 넣는다. `PromptSelection`(`:10-17`)과 `promptInput`(`content.ts:581-598`)이 값을 넘긴다. 값이 없으면 기존 문자열과 같다.
- FR-8 (서버 계약, Q4)
  - `StyleChange`에 선택 필드 `instanceCount?: InstanceCount`를 추가하고 `StyleChangeInputSchema`에 optional로 넣는다. `PendingChangeSchema`·`list_pending_changes` 출력에 그대로 실린다.
  - 변경 내역 로컬 로그(`LocalChange`)는 변경 기록 시점의 `instanceCount`를 저장하고, `sendable`(`change-log.ts:51-60`)은 이를 전송한다(`rest`로 유지).
  - props는 `LocalChange`·전송 페이로드·서버 어디에도 넣지 않는다.
  - `list_pending_changes` 설명에 "`instanceCount`는 같은 컴포넌트가 화면에 렌더된 수이며 수정 시 함께 바뀌는 범위"를 적는다(INT-007 보호 영역 경고 보완).
- FR-9 (코멘트 제외, D-S5 확정): props와 `instanceCount`는 패널·AI 프롬프트(및 `instanceCount`만 변경 내역)에만 넣고 코멘트에는 넣지 않는다. 코멘트 페이로드 조립(`content.ts:821-829`의 `component`)은 바꾸지 않으며, `ScreenComment`(`types.ts:68`)·`POST /comments`·`ComponentRuntimeInfoSchema`(`schema.ts:64-70`) 계약도 바꾸지 않는다.
- FR-10 (예제): `examples/react-vite`에 `Card`를 3개 이상 반복 렌더하는 목록과 민감 키 props(예: `apiToken`)를 받는 사용처를 추가한다. 기존 `Card`(`App.tsx:20-22`)는 유지한다.
- FR-11 (README): 패널의 props·인스턴스 줄, 프롬프트 줄, `list_pending_changes`의 `instanceCount`, 마스킹 규칙, 코멘트에는 props·인스턴스 수가 실리지 않는다는 점, 한계(dev 빌드·React 한정·상한 `N+`·props 스냅샷)를 기술한다. INT-011 회귀 항목 `:329`는 "위치·이름 줄은 같고 props·인스턴스 줄만 추가된다"로 갱신한다.
- FR-12 (props 조건부 자가 점검 항목, intent.md 21행·D-S6)
  - FR-7에 따라 프롬프트에 `- props:` 줄이 1개 이상 출력될 때만 `changesFooter`(`prompt.ts:70`)·`selectionFooter`(`prompt.ts:86`)의 `## 자가 점검` 마지막 항목 뒤(빈 줄·`## 반영 확인` 앞)에 다음 1줄을 붙인다(문구 확정).
    - `- [ ] 변경 스타일이 props(variant·size·className 등) 조건부인지 확인하고 해당 분기만 수정할지 판단했다.`
  - changes 모드는 항목 수와 관계없이 1번만 붙인다. `- props:` 줄이 0개면 두 footer 출력은 기존과 바이트 단위로 같다.
  - 서버·shared·MCP 계약 변경은 0건이다(프롬프트 문자열만 바뀐다).

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (회귀 금지)
  - 브리지 응답에 `props`·`instanceCount`가 없으면 패널·프롬프트·변경 페이로드·코멘트 페이로드 출력이 바이트 단위로 기존과 같다.
  - 플러그인 위치가 있을 때 위치·컴포넌트명 줄과 코멘트 `component`는 기존과 같다(INT-011 D-S4 취지).
  - 코멘트 페이로드는 브리지 응답에 `props`·`instanceCount`가 있어도 기존과 같다(D-S5).
  - 프롬프트에 `- props:` 줄이 없으면 `## 자가 점검`·`## 반영 확인` 섹션도 기존과 바이트 단위로 같다(FR-12).
  - 기존 단위 테스트는 단언 수정 없이 통과한다.
- NFR-2 (하위 호환 계약): 새 필드는 optional이다. `instanceCount`가 없는 기존 `POST /changes` 페이로드는 지금처럼 통과한다. `POST /comments` 계약은 바뀌지 않는다.
- NFR-3 (페이지 격리·직렬화): 브리지 응답에는 문자열·숫자·불리언만 담는다(`page-bridge.ts:53`). 페이지 전역을 바꾸지 않고 props 객체를 읽기만 한다. getter·Proxy 예외는 삼킨다.
- NFR-4 (민감값 보호)
  - props는 로컬(패널·클립보드 프롬프트)에만 나간다. 서버(변경 내역·코멘트)·`chrome.storage` 로그에 저장하지 않는다.
  - 마스킹은 MAIN world 직렬화 단계에서 적용해 ISOLATED world에도 원값이 넘어오지 않게 한다.
- NFR-5 (성능)
  - 선택 1회당 브리지 왕복은 1회다(INT-011 D-S6 재요청 규칙 유지). hover(picker)에서는 호출하지 않는다.
  - 계수 순회는 방문 20,000회 이하다. 응답 타임아웃 `BRIDGE_TIMEOUT_MS = 300`(`constants.ts:15`)은 바꾸지 않는다.
- NFR-6 (테스트 가능성): props 요약·마스킹·인스턴스 계수는 구조적 fiber 인터페이스를 받는 순수 함수로 두고 node 환경 vitest와 가짜 fiber로 검증한다.
- NFR-7 (도구): 신규 의존성을 도입하지 않는다.
- NFR-8 (인코딩): 신규·수정 파일은 UTF-8(BOM 없음)·LF다.
- NFR-9 (환경): macOS·Chrome·`examples/react-vite`(React 19.3.1, `_debugStack` 경로). 플러그인 켬 `DOMIRROR=1 vite`, 끔 `DOMIRROR` 미설정. 명령: `pnpm test`(vitest run, 루트 `package.json:12`)·`pnpm lint`(oxlint ., `:13`)·`pnpm typecheck`(`:14`)·`pnpm build`(`pnpm -r build`).

## 6. 인터페이스 · 데이터 스키마
- 확정: 새 필드는 모두 optional이다. props는 `ComponentRuntimeInfo`에 넣지 않는다. `ComponentRuntimeInfo`는 코멘트로 `POST /comments`에 실려 나가므로(`types.ts:77`) 넣으면 props가 로컬을 벗어난다.
- 확정(변경 없음): `ScreenComment`(`types.ts:68`)·`ComponentRuntimeInfo`(`types.ts:92-102`)·`ComponentRuntimeInfoSchema`(`schema.ts:64-70`)·`POST /comments` 페이로드 형식은 그대로다(D-S5).

```ts
// packages/shared/src/types.ts (확정)
export interface InstanceCount {
  count: number;    // 1 이상 정수
  capped: boolean;  // FIBER_VISIT_LIMIT 도달 시 true → `N+` 표시
}
// StyleChange 에 추가
instanceCount?: InstanceCount;

// packages/extension/src/runtime-bridge.ts RuntimeBridgeResult 에 추가 (확정)
props?: string;               // §6 규칙으로 요약·마스킹된 문자열(최대 1024자)
instanceCount?: InstanceCount;
```

- 서버 스키마(확정): `StyleChangeInputSchema`에 `instanceCount: z.object({ count: z.number().int().min(1), capped: z.boolean() }).optional()`을 추가한다. `PendingChangeSchema`는 이를 확장하므로 별도 수정은 구현 시 확인한다.
- 응답 검증(확정): ISOLATED 측 `isBridgeResult`(`runtime-bridge.ts:37`)는 `props`가 문자열이 아니거나 1024자를 넘으면, `instanceCount`가 형식에 맞지 않으면 해당 필드만 버린다.
- props 요약 규칙(확정, Q2 제안값)

| 대상 | 출력 | 근거 |
| :--- | :--- | :--- |
| 문자열 | `"…"` 최대 80자, 초과 시 80자 + `…` | 한 줄 가독성, 패널 폭 |
| 숫자·불리언·null·undefined | 그대로(`12`, `true`, `null`, `undefined`) | 원시값 |
| bigint·symbol | `12n`, `Symbol(desc)` | 구조화 복제 불가 값 문자열화 |
| 함수 | `ƒ name`(이름 없으면 `ƒ anonymous`) | Q2 확정 |
| React 요소(`$$typeof`) | `<Tag>`(문자열 type이면 태그, 컴포넌트면 표시 이름, 없으면 `<Anonymous>`) | Q2 확정 |
| DOM 노드 | `[Node tag]` | NFR-3(노드 미포함) |
| 배열 | 앞 5개 + `…(+n)` | 길이 상한 |
| 객체 | `{ k: v, … }` 키 최대 20개/레벨 + `…(+n)` | 키 개수 상한 |
| 깊이 | 최상위 props 객체 = 깊이 1, 깊이 2까지 펼치고 그보다 깊은 객체·배열은 `{…}`·`[…]` | Q2 확정 |
| 순환 참조 | `[Circular]` | Q2 확정 |
| 민감 키 | 키에 `token`·`password`·`secret`·`key`·`auth` 포함(대소문자 무시) → `•••` | Q2 확정, FR-4 |
| 읽기 예외 | `[Error]` | NFR-3 |
| 전체 길이 | 최대 1024자, 초과 시 1023자 + `…` | `TEXT_MAX = 2048`(`schema.ts:15`) 이내 |

- 표시 예(초안)

```text
- 컴포넌트: Card (정의: `src/components/Card.tsx:…` / 호출부: `src/App.tsx:…`)
- props: { title: "카드", className: "무시되는-속성", apiToken: •••, children: <p> }
- 인스턴스: 4개(같은 컴포넌트, 수정 시 함께 바뀜)
```

## 7. 예외 · 엣지 케이스
- E-1 React가 아니거나 production 빌드다: 브리지가 `props`·`instanceCount`를 생략하고 기존 출력과 같다(NFR-1).
- E-2 브리지 미응답·타임아웃(300ms)·주입 실패: 플러그인 위치가 있으면 플러그인 줄만 표시하고 오류를 띄우지 않는다.
- E-3 컴포넌트 fiber가 없다(호스트만 있는 루트 등): `props`·`instanceCount`를 생략한다.
- E-4 memo·forwardRef: `nearestComponent`가 고른 fiber의 `type` 객체 동일성으로 센다. 래퍼와 내부 함수는 서로 다른 type이므로 혼합하지 않는다.
- E-5 방문 상한 20,000 도달: `capped: true`, 표시 `N+개`. 부분 계수 값 `N`은 상한까지 센 값이다.
- E-6 DOM에서 얻은 fiber가 alternate(작업 트리)다: HostRoot의 `stateNode.current`에서 순회하므로 현재 커밋 트리 기준이 된다.
- E-7 여러 React 루트: 선택 요소가 속한 루트만 센다. 다른 루트의 같은 컴포넌트는 세지 않는다(README 한계에 명시).
- E-8 props getter·Proxy가 예외를 던진다: 해당 값은 `[Error]`, 나머지는 계속 요약한다.
- E-9 민감 키가 중첩 객체 안에 있다: 깊이와 관계없이 마스킹한다. 깊이 2를 넘어 `{…}`로 접힌 값은 내용을 출력하지 않는다.
- E-10 `key`를 포함한 무해한 키(`keyboard`, `monkey` 등)도 마스킹된다: 의도된 보수적 동작이다(과마스킹 허용, README 명시).
- E-11 선택 이후 재렌더로 props·인스턴스 수가 바뀐다: 선택 시점 스냅샷이다. 변경 내역 `instanceCount`는 변경 기록 시점 값이다.
- E-12 구버전 서버가 `instanceCount`를 받는다: zod strip으로 조용히 버려진다(하위 호환). 신버전 서버에서 스키마 누락 시에도 같은 증상이므로 통합 테스트로 막는다(AC-7).
- E-13 페이지 스크립트의 위조 응답: 기존 id 검증(INT-011 E-11)을 유지하고, `props`는 텍스트로만 렌더한다(innerHTML 금지).
- E-14 플러그인 위치가 있고 브리지 `info`의 이름이 플러그인 값과 다르다: 이름·위치는 플러그인 값, `props`·`instanceCount`는 브리지 값을 쓰며 경고하지 않는다.
- E-15 props·인스턴스 수가 표시된 상태에서 코멘트를 남긴다: 코멘트 페이로드에는 두 값이 실리지 않고 기존 `component`만 전송된다(D-S5, FR-9).
- E-16 changes 모드에서 일부 항목에만 `- props:` 줄이 있다: 자가 점검 항목은 1번만 붙는다. 모든 항목에 props가 없으면 붙지 않는다(FR-12).
- E-17 `instanceCount`만 있고 props가 없다(props 요약 실패·생략): `- 인스턴스:` 줄은 나오지만 자가 점검 항목은 붙지 않는다. 조건은 `- props:` 줄 출력 여부뿐이다.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-3): props 요약 순수 함수 단위 테스트가 §6 표의 각 행(문자열 80자, 함수, React 요소, DOM 노드, 배열 5개, 키 20개, 깊이 2, 순환, 읽기 예외, 전체 1024자)을 통과한다.
- AC-2 (FR-4·NFR-4): `token`·`Password`·`API_SECRET`·`apiKey`·`authHeader` 키가 모든 깊이에서 `•••`가 되는 단위 테스트가 통과한다.
- AC-3 (FR-5): 가짜 fiber 트리 단위 테스트로 같은 type 수를 센다. memo 래퍼 분리, alternate 입력 시 current 기준, 상한 도달 시 `capped: true`를 확인한다.
- AC-4 (NFR-3): 브리지 응답이 `structuredClone`으로 복제 가능하고 `props`가 문자열인지 단위 테스트로 확인한다. `isBridgeResult`가 형식 위반 `props`·`instanceCount`만 버리는 케이스를 포함한다.
- AC-5 (FR-1·FR-6·FR-10, 브라우저): 예제를 플러그인 켬·끔으로 띄우고 반복 렌더 Card 내부 요소를 선택하면 패널에 `props:` 줄(민감 키 `•••`)과 `인스턴스: N개` 줄이 보인다. N은 예제의 실제 Card 렌더 수와 같다. 플러그인 켬에서 위치·컴포넌트명 줄은 변경 전과 같다.
- AC-6 (FR-7·NFR-1): `buildPrompt` 단위 테스트로 changes·selection 모드에 `- props:`·`- 인스턴스:` 줄이 들어가는지, 값이 없으면 기존 문자열과 같은지 확인한다.
- AC-7 (FR-8·NFR-2): 통합 테스트에서 `instanceCount`가 있는 `POST /changes`가 200이고 `list_pending_changes` 결과에 값이 남는다(strip으로 사라지지 않음). 없는 기존 페이로드도 200이다. `sendable` 단위 테스트에서 `instanceCount`는 남고 props 관련 필드는 없다.
- AC-8 (FR-9·NFR-4·D-S5): 브리지 응답에 `props`·`instanceCount`가 있는 상태에서 조립한 코멘트 전송 페이로드(`content.ts:821-829` 경로)에 props·instanceCount 키가 없고 `component`가 기존과 같음을 단위 테스트 또는 페이로드 조립 테스트로 확인한다. 또한 `ScreenComment`(`types.ts:68`)·`ComponentRuntimeInfoSchema`(`schema.ts:64-70`)의 `git diff`가 0줄이다.
- AC-9 (FR-11): README의 사용법·AI 프롬프트·MCP·한계·수동 체크리스트에 props·인스턴스 수·마스킹·코멘트 미포함이 기술되고 `:329` 회귀 문구가 갱신된다.
- AC-10: `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build`가 Exit 0이고, 브라우저 검증에서 콘솔 에러가 0건이다.
- AC-11 (FR-12·NFR-1): `prompt.test.ts` 단위 테스트로 확인한다. ① changes·selection 모드에서 `- props:` 줄이 있으면 `## 자가 점검` 안에 FR-12 문구가 정확히 1번 있고 `## 반영 확인`보다 앞에 있다. ② `- props:` 줄이 없으면 출력이 변경 전 `buildPrompt` 결과와 바이트 단위로 같다. ③ changes 모드 다건 중 일부만 props가 있어도 1번만 있다(E-16). INT-010 기존 단언(`prompt.test.ts:202` describe)은 수정하지 않는다.

## 9. 가정과 리스크
- 결정
  - D-01 (intent): props 표시와 인스턴스 수를 1개 intent로 병합. 근거: `panel.ts`·`content.ts`·브리지 경로 공유(분해 기준 ③ 미충족). 폐기 대안: 2개 분해.
  - D-02 (intent): 3D 레이어 뷰 기각, 트리 양방향 선택·라벨 스크린샷은 INBOX 분리.
  - D-03 (intent Q1, 2026-11-25): 플러그인 위치가 있어도 브리지를 호출하되 props·인스턴스 수만 덧붙이고 위치·이름은 플러그인 값을 유지한다.
  - D-04 (intent Q2, 2026-11-25): 요약 + 키 마스킹. 세부 수치는 §6 표로 확정.
  - D-05 (intent Q3, 2026-11-25): fiber 기준 같은 type 수, 상한 20,000 도달 시 `N+`. 폐기 대안: DOM 기준 `countSameSource` — 플러그인 속성 부착(`react.ts:139-143`) 때문에 부풀려진다.
  - D-06 (intent Q4, 2026-11-25): `instanceCount`만 서버(shared 타입·zod·sendable), props는 로컬 전용.
  - D-S1: props는 `ComponentRuntimeInfo`가 아니라 `RuntimeBridgeResult`의 별도 필드로 둔다. 근거: `ComponentRuntimeInfo`는 코멘트로 서버에 전송된다(D-06 위반 방지). 폐기 대안: `ComponentRuntimeInfo.props?`.
  - D-S2: 마스킹·요약은 MAIN world에서 수행한다. 근거: 원값이 ISOLATED world·로그로 넘어가지 않게 한다(NFR-4).
  - D-S3: `instanceCount`는 `{count, capped}` 객체 1필드로 둔다. 근거: `N+`를 숫자 하나로 표현할 수 없고, 필드 1개로 계약 면적을 줄인다. 폐기 대안: 숫자 + 별도 불리언 2필드.
  - D-S4: 마스킹 판정은 대소문자 무시 부분일치다. 과마스킹(E-10)을 허용하고 누락을 막는 쪽을 택한다.
  - D-S5 (spec §10 답변, 2026-11-25; intent.md 20행 반영): props는 패널과 AI 프롬프트에만 넣고 코멘트에는 넣지 않는다(`instanceCount`도 코멘트에는 넣지 않는다). `ScreenComment`·`POST /comments`·`ComponentRuntimeInfoSchema` 계약은 바꾸지 않는다. 근거: ① Q4(D-06) "props는 로컬 전용"과의 일관성 ② 코멘트는 `POST /comments`로 서버에 저장되는 경로라(`types.ts:77`, `schema.ts:64-70`) 포함하면 민감값이 서버에 저장된다. 폐기 대안: 코멘트에 props 포함(서버 계약·`ComponentRuntimeInfoSchema` 확장 필요). 근거 ③ intent.md 51행(Q4 답변, 21행 삽입 전 50행) 정정 각주 `[정정 2026-11-25: 코멘트는 로컬 전용 범위에서 제외 — props는 패널·AI 프롬프트에만 포함, 20행·spec D-S5]`로 Q4 답변과 20행이 일치한다.
  - D-S6 (intent.md 21행, 2026-11-25 사용자 승인 선택 A): IDEA-20261125-03 중 ①(AI 프롬프트 자가 점검에 props 조건부 확인 항목 추가, 계약 변경 0)만 채택해 FR-12로 반영한다. ②(스타일 관련 prop 화이트리스트 서버 전송 — Q4·D-06 일부 변경 필요)·③(props 값별 인스턴스 수 분리 표시 — 비용 대비 효과 낮음)은 INBOX에 유지한다. 근거: ①은 프롬프트 문자열만 바꿔 D-06·D-S5와 충돌하지 않는다. 폐기 대안: ②·③ 동시 반영.
- 가정
  - React 19 dev 빌드 fiber에 `memoizedProps`가 있다(추측: React 내부 구현, `FiberLike`에 필드 추가 필요).
  - HostRoot(`tag 3`)의 `stateNode`는 FiberRoot이고 `.current`가 현재 커밋 트리다(추측, 구현 시 예제로 확인).
  - DevTools hook의 fiber root 목록 접근은 INT-011과 같은 비공개 API다. fiber 경로를 1급으로 취급한다.
- 리스크
  - R-1: `fiberFromNode` 경로에는 루트 접근이 없다. `return` 체인 상승 + `stateNode.current` 순회는 추론이다. 완화: AC-3 가짜 fiber + AC-5 브라우저 실측.
  - R-2: 계수 순회는 기존 `findFiberByStateNode`(`devtools-hook.ts:20-39`, 상한 시 `null`)와 달리 상한 도달 여부를 별도로 반환해야 한다.
  - R-3: 브리지 호출 분기 3곳(`content.ts:507`·`:538`·`:565`) 변경. INT-011 D-S4·NFR-1 회귀 위험과 README `:329` 체크리스트 충돌. 완화: 플러그인 켬 경로는 기존 줄 불변 + 새 줄만 추가, 기존 단언 무수정.
  - R-4: 서버 스키마 strip + `satisfies` 미검출로 `instanceCount`가 조용히 사라질 수 있다. 완화: AC-7 통합 테스트.
  - R-5: 민감값 노출. 마스킹 키 목록 밖의 민감값(예: `email`, `ssn`)은 노출된다. 완화: README 한계 명시, 로컬 전용(NFR-4), 코멘트 미포함(D-S5).
  - R-6: props가 클수록 MAIN world 직렬화 비용이 커진다. 완화: 깊이·키·배열·길이 상한.
  - R-7: 코멘트 조립 경로가 브리지 결과를 공유하므로 구현 중 props가 코멘트 페이로드로 새어 들어갈 수 있다. 완화: `content.ts:821-829` 무수정 + AC-8 페이로드 테스트.
  - R-8: `LocalChange`(`change-log.ts:6-13`)에는 props가 없다(FR-8·NFR-4). changes 모드의 `- props:` 줄(FR-7)과 자가 점검 항목(FR-12)은 메모리상 값이 있을 때만 나온다. 값이 없으면 두 줄 모두 생략되고 출력은 기존과 같다(NFR-1). 완화: AC-6·AC-11에서 props 있음·없음을 모두 검증한다.
- 11범주 대조표

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `## 배경` `- 원 요구:` 2줄 | §1 | §3 | 반영 |
| ② 문제·영향 | `## 문제` | §1·§2 | §5 | 반영 |
| ③ 제안 결과 | `## 제안 결과`(20행 코멘트 미포함 결정, 21행 자가 점검 항목 포함) | §4 FR-1~12(FR-9 코멘트 제외 확정, FR-12 자가 점검 항목)·§8 AC-1~11(AC-8 코멘트 페이로드, AC-11 자가 점검 항목) | §2 Step 6·§3 | 반영 |
| ④ 영향 시스템·`경로:라인` | `## 영향` + `- 참조:` + 21행(`changesFooter`·`selectionFooter`) | §3(정정 9건 표기, `prompt.ts:70`·`:86` ±0 확인) | §2 | 반영 |
| ⑤ 제약·불변 계약 | `## 제약` | §5 NFR-1~4·NFR-7·§6(코멘트 계약 불변 포함) | §5 | 반영 |
| ⑥ 결정 D-n·폐기 대안 | `- D-01`·`- D-02` + Q1~Q4 답변(Q4 정정 각주 51행) + 20행 코멘트 결정 + 21행 IDEA-20261125-03 ① 채택 | §9 D-01~D-06·D-S1~D-S6 | §5 | 반영 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` + 21행(① 한정) | §2 Out-of-scope(코멘트 포함 제외, IDEA-20261125-03 ②·③ INBOX 유지) | §5 | 반영 |
| ⑧ 용어·기각 접근 | D-02 기각, Q3 DOM 기준 기각 | §9 D-02·D-05·D-S1·D-S3·D-S5·D-S6 폐기 대안 | §5 | 반영 |
| ⑨ 환경·재현 | `- 환경·재현:` | §5 NFR-9·§3 예제 | §2 Step 8·§4 | 반영 |
| ⑩ 미확정·가정 | `## 미해결 질문`(4/4 `[x]`, Q4 정정 각주)·`## 제약`(React 외 미확정) | §9 가정·R-8·§10 1건 `[x]`(미완료 0건) | §5 | 반영 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:` | §1·아래 모의 독해 | §3·§6 | 반영 |

- 모의 독해: 통과. 새 세션은 §3·§4·§6·§7·§8과 plan §2만으로 Step 1부터 착수할 수 있다. 코멘트 처리는 FR-9·D-S5(intent 51행 정정 각주)로, 자가 점검 항목은 FR-12 확정 문구·삽입 위치(`prompt.ts:70`·`:86`)·조건(`- props:` 줄 출력 시)으로 확정돼 남은 판단 사항이 없다.

## 10. 미해결 질문 (Open questions)
- [x] 코멘트(`ScreenComment`)는 `POST /comments`로 서버에 저장되므로 Q4 "props 로컬 전용"과 intent 제안 결과 "코멘트에 props 포함"(intent.md 20행)이 충돌한다. 코멘트에 props를 포함할지(포함 시 서버 계약·`ComponentRuntimeInfoSchema`(`packages/server/src/schema.ts:64-70`) 확장 필요, 민감값 서버 저장 리스크) 제외할지(현재 FR-9 기본값: 패널·AI 프롬프트에만 포함, 코멘트 미포함). → 답변: 코멘트에는 넣지 않음 — props는 패널·AI 프롬프트에만 포함, ScreenComment·POST /comments·ComponentRuntimeInfoSchema 계약 불변 (2026-11-25)
