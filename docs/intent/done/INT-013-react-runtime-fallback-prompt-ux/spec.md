# Spec: CRA·UI 라이브러리 환경 React 런타임 위치 폴백 및 AI 프롬프트 복사 개선
- Intent: [INT-013](intent.md) | Status: active | 작성일: 2026-11-28
- Intent updated_at: 2026-11-28T15:49:19+09:00

## 1. 개요
- 원 요구: CRA+MUI React 앱(`빅스_프론트`)에서 `매출 대시보드`(`MainMenuView` > `MuiTypographyRoot`)를 선택해 AI 프롬프트를 복사하면 `소스 위치 없음`/`라인 미확인`이 뜬다. 게다가 잔류한 `html` 변경 1건만 복사돼 AI가 컴포넌트 위치를 찾지 못한다. 이 문제를 DOMirror 익스텐션에서 해결한다. (출처: 대화 요청, intent.md 35행)
- 문제(intent `## 문제`)
  - 라이브러리 컴포넌트를 선택했을 때의 문제다.
    - 호스트 fiber 위치가 `node_modules` 필터(`packages/extension/src/react-runtime.ts:156`)에 걸려 `null`이 된다.
    - 그래서 패널이 `소스 위치 없음`(`packages/extension/src/panel.ts:156`)을 표시한다.
    - 코멘트 작성도 막힌다(`packages/extension/src/content.ts:916-922`).
  - CSS 변경 기록의 `source`는 `locate(el)`만 쓴다(`content.ts:699`·`:704`).
    - 플러그인이 없는 앱에서는 모든 변경이 `source: null`이 된다.
    - `source: null`인 변경은 전송에서 빠진다(`packages/extension/src/change-log.ts:55`).
  - `#log.length > 0`이면 프롬프트 복사가 현재 선택 요소를 무시한다(`content.ts:599`).
    - 피커는 `<html>`/`<body>`를 막지 않는다(`packages/extension/src/picker.ts:133-141`).
    - 그래서 페이지 여백 클릭으로 생긴 `html` 변경이 남아 있으면 그것만 복사된다.
- 이 spec은 다음 세 가지를 정의한다. 순서는 intent Q4 답변(intent.md 47행)을 따른다.
  - ① 라이브러리 컴포넌트 선택 시 owner/return 체인을 거슬러 올라가, 가장 가까운 프로젝트 파일 위치로 폴백한다.
  - ② 플러그인 위치가 없을 때 CSS 변경 `source`에 React 런타임 위치를 채운다. 정확도(`precision`)를 함께 기록하고 `line-unverified`도 전송한다(intent Q3).
  - ③ 피커에서 `<html>`·`<body>` 선택을 차단하고(intent Q1), 복사 버튼을 `선택 요소 복사`·`변경 내역 복사`로 분리한다(intent Q2).
- 인계 지시(intent.md 41행): grill_me로 미해결 질문을 확정했다(intent 44~47행 4/4 `[x]`). 이어서 본 spec/plan을 작성했다.
- intent 인용 정정
  - `react-runtime.ts:205-233`은 `normalizeFile`이 아니다. `normalizeFile`의 실제 위치는 `react-runtime.ts:140-168`이고, 205-233은 `debugSourceRef`·`sourceRefFrom`이다.
  - "AI 프롬프트 복사" 버튼은 `panel.ts`가 아니라 `content.ts:215-217`에 있다.
  - 그 밖의 인용(`content.ts:704`, `content.ts:598-607`, `picker.ts:110-141`, `change-log.ts:52-60`)은 ±0행으로 일치한다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `packages/extension`
    - 런타임 위치 상위 폴백(`react-runtime.ts`)
    - `#edit` source 런타임 폴백(`content.ts`)
    - 변경 내역 전송 시 정확도 유지(`change-log.ts`)
    - 프롬프트의 정확도 표기(`prompt.ts`)
    - 패널의 폴백 표기(`panel.ts`)
    - 피커 `html`/`body` 차단(`picker.ts`)
    - 복사 버튼 2개 분리(`content.ts`)
  - `packages/shared`: `StyleChange.source`에 선택 필드 `precision?: LocationPrecision`를 추가한다.
  - `packages/server`
    - `StyleChangeInputSchema.source`에 `precision` optional을 추가한다.
    - `list_pending_changes`(MCP) 설명에 정확도 의미를 추가한다.
  - 단위 테스트를 추가하고, `README.md`의 해당 사용법·한계 절을 갱신한다.
- Out-of-scope(intent.md 39행)
  - Webpack/CRA/Babel용 빌드 플러그인 어댑터 신규 개발
  - `빅스_프론트` 저장소 수정
  - Vue 런타임 탐색
  - React production 빌드 지원
  - 소스맵 역매핑을 통한 라인 정확도 개선(INT-011 result.md:55 후속 후보, 본 intent 범위 밖)
  - 이미 `chrome.storage.local`에 남은 `html`/`body` 변경 항목의 자동 정리. 기존 삭제 수단으로 정리한다(D-S5).
  - 코멘트(`ScreenComment`) 계약 변경. 코멘트는 이미 런타임 위치로 source를 채운다(`content.ts:830-836`).

## 3. 영향 시스템 · 모듈 · 데이터
- ① 라이브러리 상위 폴백
  - `packages/extension/src/react-runtime.ts:140-168`: `normalizeFile`. `:156`에서 `/node_modules/` 경로면 `null`을 돌려준다. `:166`은 확장자 검사이고 패턴은 `SOURCE_EXTENSION`(`:50`)이다.
  - `react-runtime.ts:53`: `NOISE_FRAME`. `node_modules|@react-refresh|\.vite\/deps|react-dom|react-jsx`를 거른다.
  - `react-runtime.ts:171-179`: `toSourceRef`. 노이즈가 아닌 첫 프레임을 쓰고 항상 `line-unverified`(`:176`)로 둔다.
  - `react-runtime.ts:80-89`: `nearestComponent`. 가장 가까운 함수·클래스 컴포넌트를 찾고, HostRoot(3)이면 `null`이다.
  - `react-runtime.ts:205-221`: `debugSourceRef`. `_debugSource`를 처리하고, line·column이 모두 있을 때만 `exact`다(`:216-219`).
  - `react-runtime.ts:228-233`: `sourceRefFrom`. `_debugSource`를 먼저 보고, 없으면 `_debugStack`(`:232`, 필드 `:15`, 파서 `parseStackFrames` `:123`)을 쓴다.
  - `react-runtime.ts:182-196`: `ownerChain`. `_debugOwner ?? return`(`:193`)으로 이름만 모은다. 순환은 `seen`으로 방지하고 HostRoot에서 중단한다. 위치를 다시 탐색하는 로직은 없다.
  - `react-runtime.ts:241-259`: `describeRuntime`. `hostSource = sourceRefFrom(fiber)`, `info.definition = hostSource`, `callSite = sourceRefFrom(nearest)`, `owners = ownerChain(fiber)`를 만든다.
  - `react-runtime.ts:26-31`: `RuntimeDescription { info; hostSource? }`.
  - `packages/extension/src/runtime-inspect.ts:13-39`: `inspectFiber`. props와 인스턴스 수를 다루며(INT-012), 변경하지 않는다.
- ② CSS 변경 런타임 폴백
  - `content.ts:677-724`: `#edit`. `:699`에서 `locate(el)`을 호출하고, `:704`에서 `source: located ? {...} : null`로 채운다. 런타임 정보는 `component`(`:700`·`:706`)에만 붙는다.
  - `content.ts:565-570`: `#runtimeInfo`. `:568`에서 `locate(el) !== null`이면 `null`을 돌려준다. 플러그인 우선이다.
  - `content.ts:539-544`: `#ensureRuntime`. `:540`도 같은 가드다.
  - `content.ts:583-585`: `#runtimeHasSource`. 판단에 `runtimeSourceRefOf`를 쓴다.
  - `content.ts:826-845`: `#submitCommentOnce`. `:830-836`에서 `runtimeSourceLocation`으로 source를 채운다(재사용 대상). `:841`은 '소스 위치 없음' 오류다.
  - `packages/extension/src/source-locator.ts:44`: `locate`.
  - `change-log.ts:6-13`: `LocalChange`. `source`의 타입은 `StyleChangeInput['source'] | null`이다(`:8`).
  - `change-log.ts:52-60`: `sendable`. `:55`에서 `source === null`이면 건너뛰고, `:56`에서 `stale`·`component`를 뺀다.
  - `packages/shared/src/types.ts`: 관련 타입은 다음과 같다.
    - `StyleChange.source`(`:28`)는 `{file; line; column; inherited; protected?}`이다. 정확도 필드는 없다.
    - `StyleChangeInput`은 `:48`이다.
    - `LocationPrecision`(`:89`), `RuntimeSourceRef`(`:91-98`, `line?`·`column?`·`precision`), `ComponentRuntimeInfo`(`:100-110`)가 있다.
  - `packages/server/src/schema.ts`: zod는 `zod/v4`다(`:12`). 관련 스키마는 다음과 같다.
    - `StyleChangeInputSchema`(`:24-43`). 그 안의 source는 `:26-32`이다.
    - `PostChangesRequestSchema`(`:59-61`).
    - `RuntimeSourceRefSchema`(`:64-69`)는 `precision: z.enum(['exact','line-unverified'])`이다.
  - `packages/server/src/http.ts:90-99`: `handlePostChanges`. `:91`에서 `safeParse`하고, 실패하면 400을 돌려준다(`:92-93`). 라우팅은 `:147-148`이다.
  - `packages/extension/src/prompt.ts`: 관련 함수는 다음과 같다.
    - `where`(`:48-52`). source가 `null`이면 `'위치 미확인'`이다.
    - `changesPrompt`(`:122-162`). 위치 줄은 `:148`, 위치 미확인 안내는 `:135-137`이다.
  - `packages/extension/src/runtime-format.ts:19-27`: 정확도 표기 함수다. 상수 ` (라인 미확인)`은 `:13`이다.
  - `panel.ts:323-326`: `renderChanges`. `:325`가 '소스 위치 없음 — 전송 제외' 문구다.
- ③ `html`/`body` 가드·복사 버튼
  - `picker.ts`: 관련 코드는 다음과 같다.
    - `onPointerMove`(`:110-115`). `isOwn`만 검사한다.
    - `onClick`(`:133-141`). `isOwn`은 `:134`, `blockedReason`은 `:138`, `onPick`은 `:140`이다.
    - `blockedReason`(`:63-67`, `'shadow-dom'`), `frameBlockedReason`(`:58-61`, `'iframe'`), `BlockedReason` 타입(`:7`)이 있다.
    - HTML·BODY·documentElement 처리는 0건이다.
  - `content.ts:953`: `isOwn`. `content.ts:956`: 피커를 만든다.
  - `content.ts:215-217`: 복사 버튼(`'AI 프롬프트 복사'`). `onCopy`는 `:328-347`이고, `:339-340`에서 위치 미확인 N건을 센다. 등록은 `:382`, 해제는 `:401`이다.
  - `content.ts:598-620`: `promptInput`. `:599`가 `#log.length > 0` 분기로, 이때 changes를 반환한다(`:600-606`). selection 모드는 `:608-619`이다.
  - `prompt.ts:184-187`: `buildPrompt`. `selectionPrompt`는 `:164-181`이고 source는 `located`에서만 만든다(`:166`). 입력 타입은 `PromptSelection`(`:10-20`)·`PromptInput`(`:27-29`)이다.
  - `packages/extension/src/storage.ts:22-28`: `saveList`. `:27`에서 `chrome.storage.local.set`을 호출한다. 호출 경로는 `content.ts:459`와 `#setLog`(`:755`)다.
- 패널·코멘트 표시
  - `panel.ts:91-116`: `runtimeLines`. `라인 미확인` 배지는 `:106-108`, 정의 줄은 `:111`, 호출부 줄은 `:112`, 계층 줄은 `:113-114`다.
  - `panel.ts:129-168`: `renderLocation`. 경고는 `:156`(런타임 정보는 있으나 위치 없음)과 `:163`(정보 없음)에 있다.
  - `content.ts:916-922`: 코멘트 폼의 `canSubmit` 판정이다. `comment-ui.ts:97-98`·`:136-137`·`:149`가 관련 코드다.
  - `content.ts:888-890`: 코멘트 목록의 `(라인 미확인)` 표기다.
- 테스트·도구
  - vitest를 쓴다(`vitest.config.ts:11-13` `packages/*/test/**/*.test.ts`).
  - 루트 스크립트는 `pnpm build`(`pnpm -r build`)·`pnpm test`(`vitest run`)·`pnpm lint`(`oxlint .`)·`pnpm typecheck`다.
  - 관련 테스트 파일은 `packages/extension/test/react-runtime.test.ts`(normalizeFile `:133`, toSourceRef `:152`, ownerChain `:176`, describeRuntime `:198`)다.
  - 그 밖에 `picker.test.ts`(`:4`, `frameBlockedReason`만 검사), `prompt.test.ts`(런타임 블록 `:248`), `change-log.test.ts`(sendable `:138`)가 있다.
  - `content.ts`·`panel.ts`는 단위 테스트가 없다. 브라우저로 검증해야 한다.

## 4. 기능 요구사항 (FR-n)
- FR-1 (① 상위 폴백)
  - 호스트 fiber의 `sourceRefFrom` 결과가 `null`이면 체인을 거슬러 올라간다. 체인은 `_debugOwner ?? return`이고 `ownerChain`과 같은 순서다.
  - 올라가면서 각 fiber의 `sourceRefFrom`이 처음으로 `null`이 아닌 프로젝트 위치를 `hostSource`·`info.definition`으로 쓴다.
  - 순환은 `seen`으로 방지한다. HostRoot에서 중단하고, 방문 상한은 `BRIDGE_OWNER_MAX`를 재사용한다.
- FR-2 (① 상위 폴백): 호스트 위치를 FR-1 상위 폴백으로 얻은 경우에만, `callSite`(`sourceRefFrom(nearest)`)가 `null`일 때도 FR-1과 같은 상위 탐색으로 폴백한다(D-S7).
  - 근거: 무조건 폴백하면 기존 단언 `react-runtime.test.ts:273-280`(스택 첫 프레임이 JSX 런타임이면 `callSite` 생략)이 깨진다. NFR-2·AC-1(기존 단언 수정 없이 통과)을 지킨다.
- FR-3 (① 폴백 표기)
  - 폴백으로 위치를 얻으면, 처음 위치를 얻지 못한 컴포넌트 이름(예: `MuiTypographyRoot`)과 폴백 사실을 익스텐션 내부 결과에 담는다. 담는 필드는 `RuntimeDescription`의 확장 필드이며 공유 계약에는 넣지 않는다(D-S2).
  - 패널 정의 줄(`panel.ts:111`)과 AI 프롬프트 `componentLines`(`prompt.ts:55-64`)에 `라이브러리 컴포넌트 <이름> → 사용처` 형태의 1줄 표기를 추가한다.
- FR-4 (① 코멘트): FR-1로 위치를 얻은 요소는 `#runtimeHasSource()`가 `true`가 되어 코멘트 폼이 열려야 한다(`content.ts:916-922`). 제출 시 `runtimeSourceLocation` 경로(`content.ts:830-836`)로 source를 채운다.
- FR-5 (② 변경 source 폴백)
  - `#edit`에서 `locate(el)`이 `null`이고 런타임 위치가 있으면 `source`를 다음으로 채운다.
    - 위치: 코멘트와 같은 `runtimeSourceLocation` 변환을 거친 `{file, line, column}`
    - 나머지: `inherited`, 그리고 `precision`(런타임 `precision` 그대로)
  - 런타임 위치의 line을 얻지 못하면 변환 규칙을 코멘트 경로와 똑같이 적용한다. 변환이 실패하면 `null`로 둔다.
  - `protected`는 런타임 폴백에서 생략한다(D-S4).
- FR-6 (② 플러그인 우선): `locate(el)`이 `null`이 아니면 FR-5를 적용하지 않는다. source는 기존과 바이트 단위로 같아야 하고 `precision` 필드도 없다.
- FR-7 (② 전송)
  - `sendable`은 FR-5 source를 가진 변경을 전송 대상에 넣는다. `precision`은 요청 본문의 `source.precision`으로 보존된다.
  - `line-unverified`도 전송한다(intent Q3).
- FR-8 (② 서버 계약)
  - `StyleChangeInputSchema.source`에 `precision: z.enum(['exact','line-unverified']).optional()`을 추가한다.
  - `list_pending_changes` 출력에서 값이 유지되도록 한다.
  - MCP 도구 설명에는 "`precision` 미기재 = 빌드 플러그인 위치(정확), `line-unverified` = React 런타임 추정 라인(±수십 행 가능, 파일·컴포넌트명 기준으로 확인)"을 명시한다.
- FR-9 (② 프롬프트·패널 표기)
  - `changesPrompt` 위치 줄(`prompt.ts:148`)에 표기를 붙인다. `source.precision === 'line-unverified'`면 `runtime-format.ts:13` 상수 ` (라인 미확인)`이다.
  - `precision`이 `exact`면 ` (React 런타임 위치)` 표기를 붙인다. 다만 이 줄의 문구는 code-planner가 확정한다.
  - 패널 변경 항목(`panel.ts:323-326`)도 같은 표기를 쓴다.
- FR-10 (③ 피커 가드)
  - 피커는 `document.documentElement`(`<html>`)·`document.body`(`<body>`)를 선택하지 않는다.
  - `onClick`에서는 `onBlocked`로 새 사유 `'root-element'`(`BlockedReason` 확장)를 알린다.
  - `onPointerMove`에서는 두 요소의 hover 하이라이트를 표시하지 않는다.
  - 차단 판정은 순수 함수로 분리해 단위 테스트한다.
- FR-11 (③ 차단 안내): `'root-element'` 차단 시 기존 `onBlocked` 안내 경로로 "`<html>`/`<body>`는 선택할 수 없습니다. 안쪽 요소를 선택하세요." 메시지를 표시한다.
- FR-12 (③ 복사 버튼 분리)
  - 단일 버튼 `'AI 프롬프트 복사'`(`content.ts:215-217`)를 버튼 2개로 바꾼다.
    - `선택 요소 복사`: selection 모드. `#selected`가 있을 때만 활성화한다.
    - `변경 내역 복사`: changes 모드. `#log.length > 0`일 때만 활성화한다.
  - `promptInput`(`content.ts:598-620`)을 모드별 입력 생성 2개로 나눈다. `#log` 유무가 선택 요소 복사 결과에 영향을 주지 않아야 한다.
- FR-13 (③ 복사 안내): 위치 미확인 N건 안내(`content.ts:339-340`)는 `변경 내역 복사`에만 적용한다. 버튼 등록·해제(`:382`·`:401`)는 두 버튼 모두에 적용한다.
- FR-14 (문서): `README.md`의 사용법·한계 절에 다음 세 가지를 반영한다.
  - 라이브러리 컴포넌트 상위 폴백
  - 플러그인 미적용 앱의 변경 전송(`line-unverified` 포함)
  - `html`/`body` 선택 차단과 복사 버튼 2개

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (회귀 금지, intent 제약 29행): `data-domirror` 플러그인 위치가 있는 요소의 기존 동작은 바뀌지 않아야 한다.
  - 대상은 패널 출력, 변경 source, 프롬프트 출력, 코멘트 source다.
  - INT-011 D-S4(플러그인 위치 시 브리지 위치·이름 미사용)와 `#runtimeInfo`·`#ensureRuntime` 가드(`content.ts:540`·`:568`)는 유지한다.
- NFR-2 (하위 호환, intent 제약 31행): `precision`은 선택 필드다.
  - 기존 클라이언트가 `precision` 없이 보낸 요청은 200을 받아야 한다.
  - 기존 서버·테스트 단언은 수정하지 않는다.
- NFR-3 (대상 런타임, intent 제약 30행): React dev 빌드(`_debugSource`·`_debugStack`이 있을 때)만 대상으로 한다. production·Vue에서는 기존 동작(위치 없음)을 유지한다.
- NFR-4 (성능): 상위 탐색은 `BRIDGE_OWNER_MAX` 이내로 한다. 신규 순회는 선택·편집 시점 1회로 제한하고 hover마다 실행하지 않는다.
- NFR-5 (의존성): 신규 패키지는 0건이다.
- NFR-6 (인코딩): 변경 파일은 UTF-8 No BOM·LF를 유지한다. 저장소에 `.editorconfig`·`.gitattributes`가 없어 기존 파일 LF를 기준으로 한다.

## 6. 인터페이스 · 데이터 스키마
- 확정
  - `packages/shared/src/types.ts:28` `StyleChange.source`: 기존 필드를 유지하고 `precision?: LocationPrecision`(`:89` 재사용)를 추가한다.
    - 의미: 미기재는 `data-domirror` 플러그인 위치다.
    - `exact`는 React 18 `_debugSource`처럼 line·column이 모두 확정된 런타임 위치다.
    - `line-unverified`는 줄 번호가 미확정인 런타임 위치다(React 19 `_debugStack` 등).
  - `packages/server/src/schema.ts:26-32` source에 `precision: z.enum(['exact','line-unverified']).optional()`을 추가한다. `RuntimeSourceRefSchema`(`:64-69`)의 enum과 값을 맞춘다.
  - `picker.ts:7` `BlockedReason`에 `'root-element'`를 추가한다.
  - 코멘트 계약(`ScreenComment` `types.ts:76-86`, 코멘트 zod 스키마)은 바꾸지 않는다.
- 초안(code-planner 확정)
  - `RuntimeDescription`(`react-runtime.ts:26-31`)에 익스텐션 내부 필드로 폴백 출처(예: `fallbackFrom?: string`, 원래 컴포넌트 이름)를 추가한다. 전달 경로(`runtime-bridge.ts` 응답 → `content.ts` → 패널·프롬프트)와 브리지 응답 형식 검증 방식은 code-planner가 정한다.
  - 버튼 2개의 DOM 배치와 비활성 표현은 기존 패널 버튼 스타일을 재사용한다.

## 7. 예외 · 엣지 케이스
- E-1: 체인 전체가 `node_modules`이거나, 위치 없이 HostRoot에 도달하면 기존처럼 `소스 위치 없음`으로 두고 코멘트를 막는다.
- E-2: `_debugOwner`와 `return`이 순환하면 `seen`으로 중단한다.
- E-3: React 19 + Webpack(CRA)에서 `_debugStack` 프레임 URL이 번들(`/static/js/bundle.js` 등)이면 `normalizeFile`이 프로젝트 파일로 오인할 수 있다. 이 경우는 추가 필터로 걸러 위치 없음으로 처리할지 code-planner가 실측해 확정한다. 대상 앱은 React 18.2라 `_debugSource`를 쓰므로 영향이 없다(R-2).
- E-4: 플러그인 위치와 런타임 위치가 모두 있으면 플러그인 위치를 쓴다(FR-6).
- E-5: 런타임 위치에서 line을 얻지 못하면 코멘트 경로의 변환 결과를 따른다. 변환이 실패하면 `source: null`로 두어 기존처럼 전송에서 뺀다.
- E-6: 이미 저장된 `html`/`body` 변경 항목은 그대로 남는다. `변경 내역 복사`에만 포함되고 `선택 요소 복사`에는 영향이 없다(D-S5).
- E-7: 선택 요소가 없으면 `선택 요소 복사`를, 변경 내역이 0건이면 `변경 내역 복사`를 비활성화한다.
- E-8: 피커가 `<html>`/`<body>`를 차단하므로 여백을 클릭하면 선택이 바뀌지 않는다. 기존 선택은 유지한다.
- E-9: `iframe`·`shadow-dom` 차단 순서와 사유는 기존과 같다. `'root-element'`는 별도 사유다.
- E-10: `precision` 없는 구 버전 변경 항목(`chrome.storage.local` 잔류)은 기존과 같게 표시·전송한다.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-1·FR-2·E-1·E-2): `react-runtime.test.ts`에 가짜 fiber 단위 테스트를 추가한다. 다음을 단언한다.
  - 호스트 `_debugSource.fileName`이 `/node_modules/@mui/...`이고 상위 owner의 `_debugSource`가 프로젝트 파일이면, `describeRuntime` 결과의 `hostSource`·`info.definition`이 상위 위치다(`precision: 'exact'`).
  - 체인 전체가 `node_modules`이면 `null`이다.
  - 순환 체인이 종료된다.
  - 기존 단언은 수정 없이 통과한다.
- AC-2 (FR-3): 폴백 시 내부 결과에 원래 컴포넌트 이름이 담긴다. `prompt.test.ts`에서 프롬프트에 폴백 표기 1줄이 나오고, 폴백이 없으면 기존 출력과 같음을 단언한다.
- AC-3 (FR-5·FR-6·FR-7): `change-log.test.ts`에서 다음을 단언한다.
  - `precision: 'line-unverified'` source를 가진 변경이 `sendable` 결과에 포함되고 `precision`이 유지된다.
  - `source: null`은 기존처럼 제외된다.
- AC-4 (FR-8·NFR-2): `packages/server/test/http.integration.test.ts`에서 다음을 단언한다.
  - `POST /changes`가 `precision` 있음·없음 모두 200이다.
  - 잘못된 값이면 400이다.
  - `list_pending_changes`에 값이 유지된다.
- AC-5 (FR-9): `prompt.test.ts`에서 `line-unverified` source의 위치 줄에 ` (라인 미확인)`이 붙고, `precision`이 없으면 기존 출력과 바이트 단위로 같음을 단언한다.
- AC-6 (FR-10): `picker.test.ts`에서 차단 판정 순수 함수가 다음을 반환함을 단언한다.
  - `<html>`·`<body>`면 `'root-element'`
  - 일반 요소면 `null`
  - iframe이면 기존 사유
- AC-7 (FR-12·FR-13·E-6·E-7, 브라우저): 변경 내역이 1건 이상 남은 상태에서 다른 요소를 선택하고 확인한다.
  - `선택 요소 복사` 결과가 현재 선택 요소의 컴포넌트·계층·props·위치를 담는다.
  - 결과에 변경 내역 항목이 없다.
  - `변경 내역 복사`는 변경 내역만 담는다.
- AC-8 (FR-1·FR-4·FR-5, 브라우저)
  - `examples/react-vite`를 플러그인 끔(`DOMIRROR` 미설정)으로 실행한다.
  - 요소를 선택하면 패널에 런타임 위치가 표시되고 코멘트를 작성할 수 있다.
  - CSS를 변경하면 변경 항목이 `전송 제외`가 아니다.
  - 서버 `list_pending_changes`에 `precision`이 함께 나타난다.
- AC-9 (FR-10·FR-11, 브라우저): 페이지 여백(`<body>`)을 클릭하면 선택이 바뀌지 않고 차단 안내가 표시된다.
- AC-10 (NFR-1, 브라우저): `DOMIRROR=1`(플러그인 켬)에서 같은 요소의 패널 위치 줄, 변경 source(`precision` 없음), 프롬프트 출력이 변경 전과 같다.
- AC-11 (공통): `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build`가 모두 Exit 0이고 브라우저 콘솔 에러는 0건이다.
- AC-12 (FR-14): README에 폴백·`precision`·`html`/`body` 차단·버튼 2개 설명이 있다.

## 9. 가정과 리스크
- 결정(intent)
  - D-01: 3개 개선안을 1개 intent로 병합했다. 폐기 대안은 3개 intent 분리다.
  - D-02: P2로 정했다. CRA `craco` 도입과 Webpack/Babel 어댑터를 쓰지 않고 익스텐션 런타임 폴백을 택했다.
  - Q1: 피커에서 `html`/`body` 선택 자체를 차단한다.
  - Q2: 버튼 2개로 분리한다.
  - Q3: `line-unverified`도 정확도 표시와 함께 전송한다.
  - Q4: 1개 intent를 유지하고 ①→②→③ 순서로 단계별 검증한다.
- 결정(spec)
  - D-S1: 상위 탐색은 `ownerChain`과 같은 `_debugOwner ?? return` 순서를 쓴다.
    - 근거: owner는 JSX를 작성한 사용자 컴포넌트 쪽으로 올라간다. React 18 owner fiber의 `_debugSource`는 사용처 JSX 위치다(예: `MainMenuView` 파일의 `<Typography>`).
    - 폐기 대안: `return`만 따라가는 방식. 라이브러리 내부 래퍼를 더 많이 거친다.
  - D-S2: 폴백 출처 표기를 공유 계약 `ComponentRuntimeInfo`에 넣지 않는다.
    - 근거: 코멘트 계약·서버 스키마 변경이 최소가 된다.
    - 폐기 대안: `ComponentRuntimeInfo.fallbackFrom` 추가.
  - D-S3: 정확도는 `StyleChange.source.precision` 선택 필드로 표현한다.
    - 근거: 서버·AI가 source만 보고 신뢰도를 판단할 수 있다. 미기재 = 플러그인이라 하위 호환이 된다.
    - 폐기 대안: `component.definition.precision`만으로 추론. `sendable`이 `component`를 제거하므로(`change-log.ts:56`) 전송되지 않는다.
  - D-S4: 런타임 폴백 source에는 `protected`를 생략한다.
    - 근거: 보호 영역 판정은 플러그인 위치 기반 기능(INT-007)이다.
  - D-S5: 잔류 `html`/`body` 항목은 자동 정리하지 않는다.
    - 근거: 버튼을 분리하면 혼동이 해소되고, 사용자가 만든 변경을 임의로 삭제하는 것을 피한다.
  - D-S6: FR-5의 위치 변환은 코멘트 경로의 `runtimeSourceLocation`을 재사용한다(중복 구현 금지).
  - D-S7: FR-2의 `callSite` 상위 탐색은 호스트 위치를 FR-1 상위 폴백으로 얻은 경우에만 수행한다.
    - 근거: 기존 단언 `react-runtime.test.ts:273-280`(JSX 런타임 첫 프레임이면 `callSite` 생략)을 보존한다(NFR-2·AC-1).
- 가정
  - CRA(`react-scripts` 5.0.1) + React 18.2.0 dev 빌드는 `_debugSource`와 `_debugOwner`를 채운다. 다만 이번에 대상 앱에서 실측하지는 않았다.
  - MUI 요소의 상위 owner 중 하나가 프로젝트 JSX 위치를 가진다.
- 리스크
  - R-1: 대상 환경(CRA+MUI)이 저장소에 없다. 예제는 Vite+React 19(INT-011 result.md:53)다.
    - 완화: AC-1 가짜 fiber 테스트로 React 18 형태를 재현하고, AC-8은 플러그인 끔 예제로 확인한다.
    - 사용자가 `http://localhost:3000/home`을 띄울 수 있으면 관찰 전용 실측을 선택적으로 한다(대상 저장소 수정 금지).
  - R-2: React 19 + Webpack에서 `_debugStack` 번들 URL을 오인할 수 있다(E-3). 완화: code-planner가 실측해 필터 여부를 확정하고 단위 테스트를 추가한다.
  - R-3: `line-unverified` 변경을 전송하면 AI가 잘못된 라인을 수정할 수 있다. INT-011 실측 오차는 −7~+27행이었다(INT-011 result.md:53).
    - 완화: FR-8 MCP 설명과 FR-9 프롬프트 표기로 "파일·컴포넌트명 기준 확인"을 안내한다.
  - R-4: 공개 계약이 바뀐다(`StyleChange.source.precision`). zod `z.object`는 정의 밖 키를 제거하므로, 스키마에 추가하지 않으면 값이 사라질 수 있다.
    - 완화: AC-4 통합 테스트.
  - R-5: `content.ts`·`panel.ts`는 단위 테스트가 없어 버튼 분리 회귀를 테스트로 잡을 수 없다. 완화: 판정·입력 생성을 순수 함수로 최대한 분리하고 AC-7·AC-10 브라우저 검증을 한다.
  - R-6: 플러그인 우선 가드(`content.ts:540`·`:568`)를 잘못 고치면 INT-011 D-S4 회귀가 난다. 완화: AC-10.
- 11범주 대조표

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `## 배경` `- 원 요구:`(35행) | §1 | §3 | 반영 |
| ② 문제·영향 | `## 문제`(14~17행) | §1·§2 | §5 | 반영 |
| ③ 제안 결과 | `## 제안 결과`(20~22행) | §4 FR-1~14·§8 AC-1~12 | §2 Step 1~9·§3 | 반영 |
| ④ 영향 시스템·`경로:라인` | `## 영향`(26행)·`- 참조:`(38행) | §3(재실존 확인, 정정 2건 §1) | §2 | 반영 |
| ⑤ 제약·불변 계약 | `## 제약`(29~32행) | §5 NFR-1~3·§6 | §5 | 반영 |
| ⑥ 결정 D-n·폐기 대안 | D-01·D-02(36~37행)·Q1~Q4(44~47행) | §9 결정·D-S1~D-S7 | §5 | 반영 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:`(39행) | §2 Out-of-scope | §5 | 반영 |
| ⑧ 용어·기각 접근 | D-01·D-02 폐기 대안 | §9 D-S1~D-S5 폐기 대안 | §5 | 반영 |
| ⑨ 환경·재현 | `- 환경·재현:`(40행) | §1·§9 가정·R-1 | §4 | 반영 |
| ⑩ 미확정·가정 | `## 미해결 질문`(4/4 `[x]`)·제약 32행(일정·보안 미확정) | §9 가정·R-1·R-2·§10 | §5 | 반영 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:`(41행) | §1·모의 독해 | §3·§6 | 반영 |

- 재실존: §3 `경로:라인`은 researcher가 실제 파일에서 ±0행으로 확인한 값이다. intent 인용 불일치 2건은 §1에 정정을 기록했다.
- 원문 보존: `react-scripts` 5.0.1, React 18.2.0, `http://localhost:3000/home`, `line-height: 1.5 → 26px`, `MainMenuView > Tooltip > Typography > MuiTypographyRoot`를 intent 원문 그대로 옮겼다(§1·§9).
- 모의 독해: 통과. 새 세션은 §3·§4·§6·§8과 plan §2만으로 Step 1부터 착수할 수 있다. 남은 구현 판단(E-3 번들 URL 필터, `fallbackFrom` 전달 경로, FR-9 `exact` 문구)은 code-planner 확정 항목으로 명시했다.

## 10. 미해결 질문 (Open questions)
- [x] `<html>`/`<body>` 가드 방식 → 피커에서 선택 자체를 차단한다(intent.md 44행, 2026-11-28). FR-10·FR-11에 반영했다.
- [x] 변경 내역 잔류 시 복사 동작 → `선택 요소 복사`·`변경 내역 복사` 버튼으로 분리한다(intent.md 45행, 2026-11-28). FR-12·FR-13에 반영했다.
- [x] `line-unverified` 전송 허용 여부 → 정확도 표시와 함께 전송을 허용한다(intent.md 46행, 2026-11-28). FR-7~FR-9에 반영했다.
- [x] 분해 여부 → 1개 intent를 유지하고 plan에서 ①→②→③으로 분할한다(intent.md 47행, 2026-11-28). plan §2에 반영했다.
