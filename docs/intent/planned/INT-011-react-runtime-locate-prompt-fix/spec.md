# Spec: React 런타임·DevTools 연동 컴포넌트 위치 찾기와 프롬프트 기반 소스 수정
- Intent: [INT-011](intent.md) | Status: planned | 작성일: 2026-11-19
- Intent updated_at: 2026-11-19T23:32:59+09:00

## 1. 개요
- 원 요구: "React DevTools 익스텐션이나 순수 javascript로 해당 컴포넌트 클릭해서 내가 프롬프트 보내면 정확하게 그 컴포넌트가 DOM을 파일 위치를 찾아서 해당부분을 고치게 하는거야" (출처: 대화 요청)
- 지금은 빌드 플러그인이 주입한 `data-domirror`만 위치 근거다. 플러그인이 없는 React 앱에서는 선택·코멘트·프롬프트가 모두 `위치 미확인`이나 차단으로 끝난다.
- 이 spec은 다음 네 가지를 정의한다.
  - ① 페이지 main world 브리지로 React DevTools hook 또는 DOM 노드의 fiber(`__reactFiber$*`)를 읽어 컴포넌트명·정의 파일·소스 위치를 얻는 런타임 폴백
  - ② JSX 호출부 위치와 owner chain(컴포넌트 계층)
  - ③ 코멘트 페이로드·MCP 출력·AI 프롬프트에 컴포넌트 정보와 정확도 표시를 넣는 선택 필드 추가
  - ④ `list_comments` → 소스 수정 → `mark_comments_resolved` 흐름을 MCP 도구 설명과 README로 안내
- 인계 지시(intent): 설계 첫 단계에서 React 19 소스 위치 취득 수단을 PoC로 검증한다. plan은 ①→②→③→④ 순서 태스크로 나눈다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `packages/extension`: main-world 브리지 스크립트 추가(빌드 엔트리·주입), 런타임 위치 탐색(DevTools hook 우선, fiber 폴백), 선택 패널의 호출부·계층 표시, 코멘트 작성 허용 조건 확장, 코멘트 페이로드·로컬 로그에 컴포넌트 정보 추가, AI 프롬프트에 컴포넌트명·정의/호출부 위치·정확도 표시.
  - `packages/shared`: 컴포넌트 런타임 정보 타입(선택 필드)과 브리지 메시지 상수.
  - `packages/server`: `ScreenCommentInputSchema`에 선택 필드 추가, `list_comments`·`mark_comments_resolved` 도구 설명에 반영 흐름 명시.
  - `README.md`: 플러그인 없는 React 사용법, 정확도 표시, 코멘트 반영 흐름, 알려진 한계 갱신.
- Out-of-scope (intent `범위 밖·전제`)
  - Vue 런타임 탐색(Vue는 기존 플러그인 경로 유지)
  - production 빌드(dev 빌드에서만 보장)
  - 에이전트 측 스킬 작성(INT-003 소관)
  - 에이전트의 소스 수정 로직 자체(DOMirror는 위치와 요청만 전달)
  - 스타일 편집(`StyleChange`) 경로의 런타임 위치 확장. 변경 내역 전송은 지금처럼 `source`가 있는 항목만 보낸다(`packages/extension/src/change-log.ts:53`).

## 3. 영향 시스템 · 모듈 · 데이터
(HEAD `178639c` 기준, ±0행 재실존 확인)
- 위치 탐색
  - `packages/extension/src/source-locator.ts:44-58`: `locate()`. `closest('[data-domirror]')` 조상 탐색, 없으면 57행 `return null`. intent 인용 `:44-57`은 닫는 `}`(58행)를 빠뜨려 1행 짧다.
  - `packages/extension/src/source-locator.ts:23-29`: `Located {location, inherited, protected}`. `:31-34`: `LocatedComponent extends ComponentInfo {designSystem}`. `:64-72`: `locateComponent()`(`data-domirror-component` 조상 탐색).
  - `packages/shared/src/location.ts:2-6`: `SourceLocation {file, line, column}`(1-based). `:16-28`: `파일:라인:컬럼` 파싱.
  - `packages/shared/src/component.ts:2-5`: `ComponentInfo {name, source}`. `:13-22`: `이름|정의파일` 파싱.
- 선택·패널·코멘트 (content script, ISOLATED world)
  - `packages/extension/src/content.ts:489-498`: `select(el)`(locate·locateComponent·renderLocation). `:500-506`: `blocked()`.
  - `packages/extension/src/content.ts:519-524`: `promptInput()`. `:326-345`: onCopy, `:332`에서 `buildPrompt` 호출.
  - `packages/extension/src/content.ts:692-733`: `#submitComment`. `:711-716`은 위치가 없으면 작성을 막고, `:718-726`에서 `LocalComment`를 조립한다(컴포넌트 정보 없음).
  - `packages/extension/src/content.ts:783-789`: `#renderCommentForm` 비활성 힌트. `:755-768`: 코멘트 목록 렌더(`:760`, `:765`가 `source` 사용).
  - `packages/extension/src/panel.ts:12-22`: `LocationView`. `:56-67`: `componentLines`(`컴포넌트:`·`정의:`·`컴포넌트 정보 없음`). `:70-95`: `renderLocation`. `:91-93`: 위치 없음 경고.
  - `packages/extension/src/comment-log.ts:20-23`: `toSendable`. `:95-109`: `normalizeLoaded`(source 4필드 필수). `:81-83`: `commentWhere`.
  - `packages/extension/src/comment-ui.ts:259`: 핀 앵커. `document.querySelector(sameSourceSelector(formatSourceLocation(c.source)))`이므로 `data-domirror` 속성 셀렉터에 의존한다.
  - `packages/extension/src/picker.ts:5`·`:140`: hover 라벨(locateComponent)과 click 처리.
- 프롬프트
  - `packages/extension/src/prompt.ts:9-14`: `PromptSelection`. `:16-18`: `PromptInput`(changes·selection 2종).
  - `packages/extension/src/prompt.ts:37-41`: `where()`(`위치 미확인`). `:55-84`: INT-010 자가 점검 footer.
  - `packages/extension/src/prompt.ts:112`: changes 위치 줄. `:129`, `:135`: selection 위치 줄. `:143-146`: `buildPrompt`.
- 주입·빌드
  - `packages/extension/manifest.json:1-9`: permissions `["activeTab","scripting","storage"]`. content_scripts·web_accessible_resources·world 선언이 없다.
  - `packages/extension/src/service-worker.ts:16`: `chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })`. world를 지정하지 않아 ISOLATED world로 들어간다.
  - `packages/extension/build.mjs:9-12`: 엔트리는 `content.ts`·`service-worker.ts` 2개(IIFE).
  - `packages/extension/src/service-worker.ts:33-38`, `packages/extension/src/relay.ts:85-91`: 코멘트를 `POST /comments`로 중계한다.
- 공유 타입·서버 계약
  - `packages/shared/src/types.ts:68-76`: `ScreenComment`(`source` 필수, 컴포넌트 필드 없음). `:78`: `ScreenCommentInput`.
  - `packages/shared/src/constants.ts:1-9`: 속성·경로 상수.
  - `packages/server/src/schema.ts:53-65`: `ScreenCommentInputSchema`. `:67-69`: `ScreenCommentSchema`.
  - `packages/server/src/http.ts:101-104`: `handlePostComments`(safeParse, 실패 시 400).
  - `packages/server/src/mcp.ts:25-74`: 도구 4개. intent 인용 `:25-64`는 드리프트가 있다. `list_comments`는 `:52-62`, `mark_comments_resolved`는 `:65-`다.
  - `packages/server/test/http.integration.test.ts:101-106`: 도구 이름 단언. `:241-266`: 코멘트 흐름 테스트.
- 플러그인(변경 없음, 참조만)
  - `packages/plugin/src/injectors/react.ts:132-154`: 정의 측 호스트 태그. `:156-171`: 사용처 측 DS 태그만 주입. intent 인용 `:132-167`의 실제 블록 끝은 171행이다.
- 내부 심볼 사용 현황: `__REACT_DEVTOOLS_GLOBAL_HOOK__`·`__reactFiber`·`_debugSource`·`_debugStack`·`_debugOwner`를 `packages/*/src`·`packages/*/test`·`examples/*/src`에서 grep한 결과 0건.
- 예제
  - `examples/react-vite/package.json:13-14`: `"react": "19.3.1"`, `"react-dom": "19.3.1"`. `:20-21`: `"@vitejs/plugin-react": "6.3.0"`, `"vite": "8.3.8"`.
  - `examples/react-vite/vite.config.ts:6`: `domirror({ enabled: process.env.DOMIRROR === '1', ... })`.
- README: `README.md:140-148` MCP 도구 표, `:151` `ScreenComment` 필드, `:262` 코멘트 흐름, `:264` 프롬프트 복사, `:286` 컴포넌트 정보 한계, `:315` 수동 체크리스트.
- 데이터: 코멘트는 서버 메모리(`packages/server/src/comment-store.ts:25` `listOpen`, `:30` `markResolved`)와 extension 로컬 storage(`comment-log.ts`)에 저장된다. 마이그레이션 대상 영속 데이터는 없다.

## 4. 기능 요구사항 (FR-n)
- FR-1 (①, main-world 브리지)
  - extension은 content script와 함께 main world에 브리지 스크립트를 주입한다. 수단은 `chrome.scripting.executeScript({ world: 'MAIN', files: [...] })`이다.
  - content script는 대상 요소에 일회용 마커 속성을 붙이고 `window.postMessage`로 요청한다. 브리지는 마커로 요소를 찾아 결과를 응답한다.
  - 메시지는 채널 태그와 요청 id로 식별한다. 응답이 타임아웃(초안: 300ms)을 넘기면 런타임 정보 없음으로 처리한다.
- FR-2 (①, 탐색 순서)
  - 브리지는 `__REACT_DEVTOOLS_GLOBAL_HOOK__`가 있고 renderer가 등록돼 있으면 그 경로로 fiber를 얻는다.
  - 없으면 DOM 노드의 `__reactFiber$*` 키에서 fiber를 직접 읽는다(intent 답변 1).
  - 둘 다 실패하면 `null`을 돌려준다. 결과에 획득 경로(`devtools`|`fiber`)를 담는다.
- FR-3 (①, 정의 위치)
  - 호스트 fiber에서 가장 가까운 함수/클래스 컴포넌트 fiber의 이름과 정의 위치를 구한다.
  - 이름은 `displayName` > `name` 순이다. memo·forwardRef는 래핑 대상의 이름을 쓴다.
  - 위치는 `_debugSource`(React ≤18) 또는 `_debugStack`(React 19) 스택 프레임에서 얻는다.
- FR-4 (②, 호출부·계층)
  - 선택 요소 기준으로 JSX 호출부 위치(해당 컴포넌트 element가 생성된 위치, owner의 `_debugStack`/`_debugSource`)를 구한다.
  - owner chain(가까운 순, 상한 초안 8단계)을 구한다.
- FR-5 (①③, 정확도 표시)
  - 런타임 위치마다 정확도를 단다: `exact`(파일·라인·컬럼 신뢰) / `line-unverified`(파일 신뢰, 라인은 변환 코드 기준이거나 없음) / `none`.
  - 라인이 없거나 미검증이면 패널·프롬프트·페이로드에 `라인 미확인`을 표시한다(intent 답변 2).
- FR-6 (회귀 금지)
  - `data-domirror`가 있으면 `locate()` 결과를 `source`로 그대로 쓴다. 런타임 결과는 `component` 보강에만 쓴다(intent 제약).
  - 플러그인 위치가 없을 때만 런타임 위치를 `source`로 대신 쓴다.
  - 보강(후단)은 §9 D-S4에 따라 미구현으로 확정한다(AC-5·NFR-1의 바이트 동일 출력이 우선).
- FR-7 (선택 패널)
  - 위치 패널에 기존 `컴포넌트:`·`정의:` 줄에 더해 `호출부:` 줄과 `계층:` 줄(`A › B › C`)을 표시한다.
  - 런타임 출처이면 정확도 배지를 함께 표시한다.
- FR-8 (코멘트 작성)
  - 플러그인 위치가 없어도 런타임 정보(최소 컴포넌트명 + 정의 파일)가 있으면 코멘트 작성을 허용한다.
  - 둘 다 없으면 지금처럼 막되, 안내 문구에 "React dev 빌드에서는 DevTools/fiber로도 찾을 수 없음"을 반영한다.
- FR-9 (코멘트 페이로드·계약)
  - `ScreenCommentInput`에 선택 필드 `component`를 추가한다(§6). 서버 스키마도 선택 필드로 받는다.
  - `list_comments` 출력에 그대로 실린다. `component`가 없는 기존 페이로드는 지금처럼 통과한다.
- FR-10 (AI 프롬프트): selection 프롬프트와 changes 프롬프트의 위치 줄에 컴포넌트명·정의 위치·호출부 위치와 정확도 표시를 포함한다. 런타임 정보가 없으면 지금 출력과 같다.
- FR-11 (반영 흐름 안내, ④)
  - `list_comments` 설명에 `component`(이름·정의·호출부·정확도)와 "source/정의/호출부 위치를 열어 body 요청대로 고친 뒤 `mark_comments_resolved`로 닫는다"는 흐름을 적는다.
  - `mark_comments_resolved` 설명에 "수정을 반영한 뒤 호출"을 적는다.
  - README에도 같은 흐름을 쓴다. 에이전트 스킬 자동화는 쓰지 않는다(INT-003).
- FR-12 (PoC 선행): 구현 첫 단계에서 예제(`react` 19.3.1, 플러그인 꺼짐)로 FR-2~FR-4 취득 수단을 실측한다. 결과(얻은 필드·라인 정확도)를 plan Step 1 산출로 기록하고, FR-5 정확도 판정 규칙을 확정한다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (회귀 금지): 플러그인 경로의 출력이 바이트 단위로 같아야 한다. 대상은 `locate()` 결과, 기존 패널 줄, 기존 프롬프트 문자열, 기존 코멘트 페이로드다. 기존 단위 테스트는 단언 수정 없이 통과해야 한다.
- NFR-2 (하위 호환 계약): 새 필드는 모두 선택(optional)이다. 기존 필드의 타입·필수 여부는 바꾸지 않는다(`source` 필수 유지, §10 Q2 결과에 따름). 구버전 서버는 zod 기본 strip으로 새 필드를 버린다(추측: zod v4 기본 동작, 검증 대상).
- NFR-3 (페이지 격리)
  - 브리지는 페이지 전역을 변경하지 않는다. DevTools hook을 만들거나 덮어쓰지 않고 읽기만 한다.
  - 중복 주입으로 리스너가 쌓이지 않도록 비열거·configurable 전역 마커 1개를 두는 것은 허용한다(D-S9).
  - 메시지는 `event.source === window`와 채널 태그를 검사한다. 응답에는 DOM 노드·함수를 담지 않고 직렬화 가능한 값만 담는다.
- NFR-4 (성능): 선택 1회당 브리지 왕복은 1회다. owner chain 상한(초안 8)을 지키고, hover(picker)에서는 브리지를 호출하지 않는다.
- NFR-5 (환경): macOS, Chrome, Vite 8 + React 19.3.1 예제(`examples/react-vite`)에서 dev 빌드로 검증한다. 재현은 플러그인 미등록 상태(`pnpm --filter example-react-vite exec vite`, `DOMIRROR` 미설정)에서 요소를 선택했을 때 `위치 미확인`이 나오는 것이다. production 빌드는 보장하지 않는다.
- NFR-6 (테스트 가능성): fiber·스택 파싱 로직은 구조적 인터페이스를 받는 순수 함수로 분리한다. 그래야 node 환경 vitest(`vitest.config.ts`, jsdom 미사용)와 가짜 객체로 검증할 수 있다.
- NFR-7 (도구): 새 의존성(소스맵 파서 등)은 사용자 승인 없이 추가하지 않는다(§10 Q1).
- NFR-8 (인코딩): 신규·수정 파일은 UTF-8(BOM 없음)·LF다(`.editorconfig` 없음, 기존 소스 LF 실측).

## 6. 인터페이스 · 데이터 스키마
- 확정: 새 필드는 모두 선택이고, 기존 `source` 구조는 그대로 둔다.
- 초안(PoC 후 확정): `packages/shared`

```ts
export type LocationPrecision = 'exact' | 'line-unverified';

export interface RuntimeSourceRef {
  file: string;            // 프로젝트 상대 경로 우선, 못 줄이면 URL 경로
  line?: number;           // 1-based, 미확인이면 생략
  column?: number;
  precision: LocationPrecision;
}

export interface ComponentRuntimeInfo {
  name: string;                    // displayName > name
  definition?: RuntimeSourceRef;   // 컴포넌트 정의 위치
  callSite?: RuntimeSourceRef;     // <Card/>를 쓴 JSX 위치
  owners?: string[];               // 가까운 순 owner chain, 최대 8
  via: 'plugin' | 'devtools' | 'fiber';
}

// ScreenComment / ScreenCommentInput 에 추가
component?: ComponentRuntimeInfo;
```

- 서버 스키마 초안: `ScreenCommentInputSchema`에 `component: ComponentRuntimeInfoSchema.optional()`을 추가한다. 문자열 길이 상한은 `TEXT_MAX`, `owners`는 `.max(8)`이다.
- 브리지 메시지 초안(`packages/shared/src/constants.ts`에 채널 상수)
  - 요청: `{ channel: 'domirror:bridge', type: 'inspect', id, marker }`
  - 응답: `{ channel: 'domirror:bridge', type: 'inspect:result', id, info: ComponentRuntimeInfo | null, hostSource?: RuntimeSourceRef }`
- 프롬프트 출력 예(초안)

```text
- 위치: `src/components/Card.tsx:12:5`
- 컴포넌트: Card (정의: `src/components/Card.tsx` 라인 미확인 / 호출부: `src/App.tsx:20:7`)
- 계층: App › Layout › Card
```

- 런타임 위치를 `source`로 대신 쓰는 경우(FR-6)의 `source` 채움 규칙은 §10 Q2에서 정한다.

## 7. 예외 · 엣지 케이스
- E-1 React가 아닌 페이지이거나 production 빌드라 fiber·debug 정보가 없다: 브리지가 `null`을 돌려주고 기존 동작(`위치 미확인`·코멘트 차단)을 유지한다.
- E-2 DevTools 익스텐션이 설치돼 있지만 renderer가 등록되지 않았다(주입 시점 차이): fiber 폴백으로 간다.
- E-3 브리지 미응답이나 CSP 등으로 주입에 실패했다: 타임아웃 후 런타임 정보 없음으로 처리하고 오류를 표시하지 않는다(상태 메시지 1줄 허용).
- E-4 스택 프레임 URL이 Vite 변환 모듈(`?t=`, `/@fs/`, `?v=` 쿼리)이다: 쿼리를 떼고 프로젝트 상대 경로로 정규화한다. 소스맵 보정을 하지 않으면 라인은 `line-unverified`로 표시한다.
- E-5 익명·화살표 컴포넌트라 이름이 없다: `Anonymous`로 표기한다. memo·forwardRef는 내부 타입 이름을 쓴다.
- E-6 선택 요소가 컴포넌트 루트가 아니라 내부 호스트 태그다: 가장 가까운 컴포넌트 fiber를 쓴다. 호스트 자신의 JSX 위치는 `hostSource`로 받는다.
- E-7 iframe 안 요소: 범위 밖이다. 최상위 문서 main world만 다룬다.
- E-8 플러그인 위치와 런타임 위치가 모두 있다: `source`는 플러그인 값을 쓰고, 런타임은 `component`에만 쓴다(FR-6). 둘이 달라도 경고하지 않는다.
- E-9 `data-domirror`가 없는 요소의 코멘트 핀 앵커: `sameSourceSelector`(`comment-ui.ts:259`)로 찾을 수 없다. 처리 방식은 §10 Q3에서 정한다.
- E-10 로컬 로그 복원(`normalizeLoaded`, `comment-log.ts:95-109`): 구버전 로그에 `component`가 없어도 정상 복원한다. `component`의 형식이 틀리면 필드만 버린다.
- E-11 페이지 스크립트가 같은 채널로 위조 응답을 보낸다: 요청 id가 일치하지 않으면 버린다. 응답 값은 표시·전송용 문자열로만 쓰고 실행하지 않는다.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-12): PoC 기록을 plan Step 1 산출로 남긴다. React 19.3.1 예제(플러그인 꺼짐)에서 DevTools 있음·없음 두 경우에 얻은 필드(name·definition·callSite·owners)와 라인 정확도가 담겨야 한다.
- AC-2 (FR-1~3): 플러그인을 끈 예제에서 `Card` 내부 요소를 선택하면 패널에 `컴포넌트: Card`와 `정의: src/components/Card.tsx…`가 표시된다. DevTools를 설치·미설치한 두 경우 모두 확인한다(`via` 값이 각각 `devtools`/`fiber`).
- AC-3 (FR-4·FR-7): 같은 선택에서 `호출부: src/App.tsx…`와 `계층:`이 표시된다.
- AC-4 (FR-5): 라인이 미검증이면 패널·프롬프트에 `라인 미확인`이 붙는다. 정확도 판정 순수 함수 단위 테스트가 통과한다.
- AC-5 (FR-6·NFR-1): 플러그인을 켠 예제에서 기존 동작과 출력이 같다. `pnpm test`가 기존 단언 수정 없이 통과한다.
- AC-6 (FR-8·FR-9): 플러그인을 끈 예제에서 코멘트를 작성·전송하면 `list_comments` 결과에 `component`가 포함된다. `component`가 없는 기존 페이로드도 `POST /comments`가 200으로 받는다(통합 테스트).
- AC-7 (FR-10): `buildPrompt` 단위 테스트로 확인한다. 런타임 정보가 있으면 컴포넌트명·정의·호출부·계층 줄이 들어가고, 없으면 기존 문자열과 같다.
- AC-8 (FR-11): `list_comments`·`mark_comments_resolved` 설명 문자열에 반영 흐름이 들어가고, README MCP 도구 표·사용법에 같은 흐름이 기술된다.
- AC-9 (NFR-3·E-11): 브리지 순수 로직 단위 테스트가 통과한다. 다른 채널·id 불일치 메시지는 무시한다.
- AC-10: `pnpm lint`·`pnpm typecheck`·`pnpm build`가 Exit 0이고, 브라우저 검증에서 콘솔 에러가 0건이다.

## 9. 가정과 리스크
- 결정
  - D-01 (intent): 공백 4종을 1개 intent로 병합했다. 근거: 모두 `packages/extension` 위치 탐색·패널 경로를 공유한다(분해 기준 ③ 경로 교집합 0 미충족). 폐기 대안: 4개로 분해.
  - D-02 (intent): React DevTools 연동, React만 지원, P2(모두 사용자 선택). 폐기 대안: DevTools 없이 fiber만 읽는 방식, React+Vue 동시 지원.
  - D-03 (intent 답변 1, 2026-11-19): DevTools가 있으면 연동하고, 없으면 `__reactFiber$` 직접 읽기로 폴백한다.
  - D-04 (intent 답변 2, 2026-11-19): 정확한 `파일:라인`이 없어도 컴포넌트명·파일만으로 전송을 허용하고 정확도 표시를 붙인다.
  - D-05 (intent 답변 3, 2026-11-19): 이번 범위는 MCP 도구 설명·README 안내까지다. 에이전트 스킬 자동화는 INT-003 소관이다.
  - D-06 (intent 답변 4, 2026-11-19): 1개 intent를 유지하고 plan에서 ①→②→③→④ 순서로 나눈다.
  - D-S1: main-world 진입은 `chrome.scripting.executeScript({ world: 'MAIN' })`로 한다. 근거: 현재 주입이 아이콘 클릭 시 `scripting`으로 이뤄진다(`service-worker.ts:16`). manifest에 content_scripts나 web_accessible_resources를 새로 선언하지 않아도 되고, 새 권한도 필요 없다. 폐기 대안: `<script src>` 태그 삽입(web_accessible_resources 공개 필요, 페이지 CSP 영향), manifest `content_scripts` `world: MAIN`(상시 주입으로 범위 확대).
  - D-S2: 요소 전달은 일회용 마커 속성으로 한다. 근거: postMessage로는 DOM 노드를 world 사이에 넘길 수 없고, DOM은 공유된다.
  - D-S3: 계약 확장은 `component` 선택 필드 1개로 묶는다. 근거: 하위 호환(NFR-2)을 지키고 변경 면적을 최소로 한다.
  - D-S4 (구현 확정, 2026-11-20): 플러그인 위치(`data-domirror`)가 있으면 브리지를 호출하지 않고 런타임 정보를 표시·전송에 더하지 않는다. 근거: AC-5·NFR-1이 플러그인 경로의 바이트 동일 출력을 요구하므로 FR-6의 "보강"보다 우선한다. 런타임의 폴백 용도(FR-6 후단)만 구현했고, 미구현인 보강은 README 한계에 명시한다. 폐기 대안: 항상 브리지를 호출해 `component`에만 보강(AC-5 위반).
  - D-S5 (구현 확정, 2026-11-20): `definition`은 "컴포넌트 정의 파일 안에서 선택 요소의 호스트 태그가 쓰인 위치"로 해석한다. React 19의 `_debugStack`은 요소를 만든 JSX 호출 지점을 담으므로 host fiber의 스택이 이 위치이고, `callSite`는 가장 가까운 composite fiber의 스택(그 컴포넌트를 쓴 JSX)이다. 플러그인 `data-domirror`가 host 태그를 가리키는 것과 의미가 같다.
  - D-S6 (구현 확정, 2026-11-20): NFR-4의 "선택 1회당 왕복 1회"는 최초 조회 기준이다. 응답이 null이거나 타임아웃이면 코멘트 제출 시점에 1회 더 요청할 수 있다(최대 2회).
  - D-S7 (구현 확정, 2026-11-20): 런타임에서 컴포넌트명만 얻고 위치(파일)를 얻지 못하면 패널에 `컴포넌트:`와 `라인 미확인`, 기존 `소스 위치 없음` 경고를 함께 표시하고 코멘트는 막는다(FR-5·FR-8).
  - D-S8 (구현 확정, 2026-11-20): `selectorHint` 재탐색(Q3(a))은 `component`가 있는 런타임 코멘트에만 적용한다. 플러그인 코멘트의 핀·`요소 없음` 판정은 바뀌지 않는다(NFR-1).
  - D-S9 (구현 확정, 2026-11-20): 중복 주입 방지를 위한 비열거·configurable 전역 마커 1개(`__domirrorBridgeInstalled`)는 NFR-3의 예외로 허용한다. hook·DOM 계약은 변경하지 않는다.
- 가정
  - React 19 dev 빌드의 fiber에는 `_debugStack`(Error)과 `_debugOwner`가 있고, 호스트 DOM 노드에는 `__reactFiber$<random>` 키가 있다(추측: React 19 내부 구현, PoC로 확인).
  - DevTools hook의 renderer 접근(`hook.renderers` 등)은 비공개 API다. 버전에 따라 깨질 수 있으므로 fiber 폴백을 1급 경로로 취급한다.
  - `examples/react-vite`는 `DOMIRROR` 미설정으로 띄우면 플러그인 주입이 꺼진다(`packages/plugin/src/vite.ts:13,21`).
- 리스크
  - R-1 (핵심): React 19 `_debugStack` 프레임 라인은 Vite 변환 코드 기준이라 원본 라인과 다를 수 있다. 완화: 정확도 `line-unverified`로 표시한다. 소스맵 보정 여부는 §10 Q1에서 정한다.
  - R-2: main world 주입이 아이콘 클릭 이후라 DevTools hook 등록 시점보다 늦다. 읽기만 하므로 문제없다고 보지만(추측) PoC로 확인한다.
  - R-3: 코멘트 `source` 필수 전제가 다섯 곳에 있다(`schema.ts:55-60`, `types.ts:70`, `comment-log.ts:105-109`, `comment-ui.ts:259`, `content.ts:760,765`). 런타임 경로 코멘트를 허용하려면 `source` 채움 규칙과 앵커를 함께 설계해야 한다(§10 Q2·Q3).
  - R-4: 공개 계약 변경이다. 대상은 schema·types·MCP 설명·README `:146`·`:151`, 통합 테스트 `:101-106`이다. §A 3호② 필수(하드)가 적용된다.
  - R-5: 페이지 스크립트가 브리지 응답을 위조할 수 있다. 영향은 표시·전송 값 오염에 그친다(E-11).
  - R-6: 작업 트리의 `docs/intent/INDEX.md` 수정과 INT-011 미추적 폴더는 이 intent 문서 커밋에만 포함한다.

### 인계 대조표 (11범주)
| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `## 배경` `- 원 요구:` | §1 | §2 Step 1 | 반영 |
| ② 문제·영향 | `## 문제` | §1·§2 | §5 | 반영 |
| ③ 제안 결과 | `## 제안 결과` | §4 FR-1~12·§8 AC-1~10 | §3 | 반영 |
| ④ 영향 시스템·`경로:라인` | `## 영향` + `- 참조:` | §3(드리프트 2건·1행 누락 1건 교정 기재) | §2 | 반영 |
| ⑤ 제약·불변 계약 | `## 제약` | §5 NFR-1~3·§7 | §5 | 반영 |
| ⑥ 결정 D-n·폐기 대안 | `- D-01`·`- D-02` | §9 D-01~D-06 | §5 | 반영 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 Out-of-scope | §5 | 반영 |
| ⑧ 용어·기각 접근 | `- D-02 … 폐기 대안` | §6·§7·§9 D-S1 폐기 대안 | §5 | 반영 |
| ⑨ 환경·재현 | `- 환경·재현:` | §5 NFR-5·§9 가정 | §2 Step 1·§4 | 반영 |
| ⑩ 미확정·가정 | `## 미해결 질문`(4/4 `[x]`)·`## 제약` | §9 가정·§10 Q1~Q3 | §5 | 반영 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:` | §1·§4 FR-12·아래 모의 독해 | §3·§6 | 반영 |
- 재실존: intent 인용 5곳과 §3의 `경로:라인`을 HEAD `178639c`에서 확인했다(researcher 실측 + 메인 sed 재확인). intent 인용 중 `mcp.ts:25-64`(실제 `:25-74`)와 `react.ts:132-167`(실제 블록 끝 `:171`)은 드리프트이고, `source-locator.ts:44-57`(실제 `:44-58`)은 1행 누락이다. §3에 실제 라인으로 기재했다.
- 원문 보존: 버전(`react` 19.3.1, `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0), 명령(`pnpm test`·`pnpm lint`·`pnpm typecheck`·`pnpm build`·`pnpm --filter example-react-vite exec vite`), 문자열(`위치 미확인`, `__REACT_DEVTOOLS_GLOBAL_HOOK__`, `__reactFiber$`)을 원문 그대로 옮겼다.
- 모의 독해: 조건부 통과. 새 세션은 §3·§4·§6·§7과 plan §2만으로 착수할 수 있다. 다만 §10 Q1~Q3 확정 전에는 Step 3·5의 세부 규칙이 비어 있다.

## 10. 미해결 질문 (Open questions)
- [x] Q1 React 19 `_debugStack` 라인 보정: 변환 코드 라인을 소스맵으로 원본 라인에 역매핑할지 정해야 한다. 선택지는 (a) 보정 없음 + `line-unverified` 표시만, (b) dev 서버 모듈을 fetch해 inline sourcemap을 직접 디코드(VLQ 자체 구현, 새 의존성 없음), (c) 소스맵 라이브러리 추가(새 의존성, 승인 필요)다. 권장: (a)로 시작하고, PoC에서 라인 오차가 크면 (b)를 후속 Step으로 추가한다. → 답변: (a) 보정 없음 + `line-unverified` 표시로 시작, PoC 오차가 크면 (b)를 후속 Step으로 추가 (자동승인: 권장안 — 근거: 기존 FR-5·NFR-7과 일치하고 요구·계약 변경이 없으며 PoC 후 되돌릴 수 있음) (2026-11-19)
- [x] Q2 플러그인 위치가 없을 때 코멘트 `source` 채움 규칙: 선택지는 (a) `source`를 런타임 호스트/정의 위치로 채우고, 라인이 없으면 `line: 1, column: 1` + `component.*.precision`으로 미확인을 표시(스키마 필수성 유지), (b) `source`를 optional로 바꿈(브레이킹 위험, 다섯 곳 수정)이다. 권장: (a). → 답변: (a) `source`를 런타임 호스트/정의 위치로 채우고, 라인이 없으면 `line: 1, column: 1` + `component.*.precision`으로 미확인 표시(스키마 필수성 유지) (2026-11-19)
- [x] Q3 `data-domirror`가 없는 코멘트의 화면 핀 앵커(`comment-ui.ts:259`): 선택지는 (a) `selectorHint`(CSS 셀렉터)로 재탐색하고 실패하면 핀 생략, (b) 런타임 코멘트는 핀을 표시하지 않고 목록에만 표시다. 권장: (a). → 답변: (a) `selectorHint`(CSS 셀렉터)로 재탐색하고 실패하면 핀 생략(목록에는 표시) (2026-11-19)
