# Spec: 화면에 컴포넌트 이름 표시 (디자인 시스템 컴포넌트 사용 여부 확인)
- Intent: [INT-004](intent.md) | Status: active | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T16:22:52+09:00

## 1. 개요
- 원 요구: IDEA-20261115-03 "화면에 컴포넌트 이름 표시(디자인 시스템 컴포넌트 사용 여부 확인)". 출처는 _ideas IDEA-20261115-03과 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 JDS 표시이며, INT-001과 연계된다.
- 문제: 익스텐션은 선택한 요소의 소스 위치(`파일:라인:컬럼`)만 보여 준다. 플러그인은 호스트·네이티브 요소에만 위치를 넣고 컴포넌트 태그에는 넣지 않는다(`README.md:272`). 그래서 DOM에 컴포넌트 단위 정보가 없다.
- 목표: 화면에서 다음을 확인할 수 있게 한다.
  - 요소 호버 시 오버레이 라벨에 컴포넌트 이름이 보인다.
  - 요소 선택 시 패널에 컴포넌트 이름과 정의 파일 경로가 보인다.
  - 디자인 시스템 컴포넌트인지가 색으로 구분된다.
  - React와 Vue를 동시에 지원한다.
- 방식(조사 결론): 빌드 시 data 속성을 주입한다. 런타임 프레임워크 객체는 읽지 않는다. 근거는 §9 D-S1에 있다.
- 인계: 이 문서와 `plan.md`만으로 새 세션이 구현과 검증을 수행할 수 있게 작성했다(§9 대조표).

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - 플러그인 옵션 `designSystem?: string[]` 추가
  - 정의 측 주입: 변환 대상 파일의 호스트·네이티브 요소에 컴포넌트 이름과 디자인 시스템 여부를 주입
  - 사용처 측 주입: 디자인 시스템 패턴에 맞는 import에서 온 컴포넌트 태그에 컴포넌트 정보를 주입. node_modules 패키지라 정의 측 주입이 불가능한 경우를 위한 것이다.
  - 익스텐션 호버 라벨과 선택 패널의 컴포넌트 줄, 디자인 시스템 색 구분
  - 프로덕션 경고 문구 갱신
  - README(옵션 표·주입 대상·알려진 한계·체크리스트) 갱신
  - 예제 앱에 로컬 디자인 시스템 컴포넌트 사용 사례 추가
- Out-of-scope (intent 범위 밖·전제)
  - 컴포넌트 이름을 바꾸거나 디자인 시스템 컴포넌트로 교체하는 수정 기능(표시만 한다)
  - 화면 전체 일괄 표시
  - MCP `StyleChange` 스키마·도구 계약 변경
  - 수정 금지 영역 경고(INT-007 소관). INT-007은 이 spec의 `designSystem` 패턴을 재사용한다.
  - 런타임 프레임워크 객체 조회: React fiber, Vue `__vueParentComponent`, MAIN world 브리지

## 3. 영향 시스템 · 모듈 · 데이터
2026-11-17 HEAD `4d6a01f` 실측 기준이다.

### 플러그인
- 옵션: `packages/plugin/src/core.ts:6` `DomirrorOptions`. 현재 필드는 `enabled`(`:8`)와 `injectors`(`:10`) 두 개다.
- 주입 대상 선택
  - `core.ts:24`에서 `?`·`#`가 붙은 id와 루트 밖 파일을 제외한다.
  - `core.ts:26`에서 첫 번째로 맞는 주입기 하나만 적용한다.
- `enabled` 판정과 경고: `packages/plugin/src/vite.ts`
  - `:12` `const enabled = options.enabled === true;`
  - `:20` `if (!enabled) return;`
  - `:8` `PRODUCTION_WARNING` — 문구가 "소스 위치"로 고정되어 있다.
  - `:25` `if (config.isProduction) config.logger.warn(PRODUCTION_WARNING);`
  - `:22` `config.root`
- 경로
  - `packages/plugin/src/paths.ts:17` `toRelativeFile`: Vite 루트 기준 posix 상대 경로를 반환한다.
  - `paths.ts:25`에서 `node_modules`를 제외한다. 그래서 패키지형 디자인 시스템의 내부는 변환되지 않는다.
- React 주입기: `packages/plugin/src/injectors/react.ts:11` `reactInjector`
  - `oxc-parser` 0.158.0의 `parseSync`(`:23`)와 `Visitor`를 쓴다.
  - 호스트 판정: `:34` `if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return;`
  - 삽입: `:42` `s.appendLeft(name.end, attributeText(file, line, column));`
  - 기존 속성 검사: `:38-41`
  - 지금의 Visitor는 `JSXOpeningElement`만 처리한다(`:31-48`).
  - Visitor는 `"<Node>:exit"` 콜백을 지원한다. 근거: `oxc-parser` `src-js/generated/visit/visitor.d.ts:8`
  - `parseSync` 결과의 정적 import는 `parsed.module.staticImports`(`src-js/index.d.ts:76`)에서 읽는다. 각 엔트리는 `{ moduleRequest: { value }, entries: [{ importName: { kind: 'Default'|'Name'|'NamespaceObject', name }, localName: { value }, isType }] }` 형태다. 지금은 쓰지 않는다.
- Vue 주입기: `packages/plugin/src/injectors/vue.ts:55` `vueInjector`
  - `@vue/compiler-sfc`를 동적으로 로드한다(`:32`).
  - `sfc.parse`: `:69`
  - 네이티브 요소 판정: `:82` `node.tagType === ELEMENT_NATIVE`. `ELEMENT_NATIVE = 0`(`:14`)이다. 컴포넌트는 ELEMENT_COMPONENT = 1, slot 2, template 3이다(@vue/compiler-core compiler-core.d.ts:182).
  - 삽입: `:88`
  - 컴포넌트·`<template>`·`<slot>`은 제외하되 자식 순회는 계속한다(`:95`).
- 속성 문자열: `packages/plugin/src/inject-utils.ts:7-9`
  - 형식은 `` ` ${DOMIRROR_ATTR}="${value}"` ``다.
  - `&`와 `"`를 이스케이프한다.
- import 출처를 해석하는 코드는 현재 `packages/plugin/src` 전체에 없다.

### shared
- `packages/shared/src/constants.ts:1` `export const DOMIRROR_ATTR = 'data-domirror';`
- `packages/shared/src/types.ts:7` `Injector`
  - `:10` `transform(code: string, id: string, ctx: { root: string }): InjectResult | null;`
- `packages/shared/src/location.ts:11` `formatSourceLocation`, `:16` `parseSourceLocation`
- re-export: `packages/shared/src/index.ts:1-3`

### 익스텐션
- 실행 world: `service-worker.ts:25`의 `chrome.scripting.executeScript`가 `world` 옵션 없이 호출된다. 따라서 ISOLATED world에서 실행되고, 페이지 JS 객체에는 접근할 수 없다.
- 호버
  - `packages/extension/src/picker.ts:53` `createPicker`
  - `.outline` div 생성: `:126-129`
  - 색 `#0969da`: `:26`
  - 라벨 요소는 없다.
- 라벨 선례: `packages/extension/src/overlay.ts:64`의 `label()`
  - 모듈 내부 함수라 export되어 있지 않다.
  - `.m-label` CSS: `:20-27`
  - `createMeasureOverlay`: `:104`
- 선택 흐름
  - `content.ts:436` `createPicker((el) => current.select(el), …)`
  - → `content.ts:268` `select(el)`
  - → `:271` `locate(el)`
  - → `:273` `renderLocation(…)`
- 패널
  - `packages/extension/src/panel.ts:45` `renderLocation`
  - `LocationView`: `:10-13`
  - `box.append(path)`: `:61`
  - 조상 위치 배지: `:57-58`
- CSS 결합: `content.ts:95` `PANEL_CSS + LOCATION_CSS + EDITOR_CSS + PICKER_CSS + MEASURE_CSS`
- 위치 해석
  - `packages/extension/src/source-locator.ts:27` `locate`
  - `:28` `el.closest(ATTR_SELECTOR)`
  - `:31` `inherited: current !== el`

### 예제
- `examples/react-vite/src/components/Card.tsx:15` `export function Card(…)`
- `examples/react-vite/src/components/Card.tsx:11` `RuntimeLabel`: `createElement` 사례다.
- `examples/vue-vite/src/components/Card.vue:1`: `script setup`만 쓰고 이름 옵션이 없다.
- 설정: `examples/react-vite/vite.config.ts:6` `domirror({ enabled: process.env.DOMIRROR === '1' })`. `examples/vue-vite/vite.config.ts:6`도 같은 형태다.
- 포트: react 5173(`examples/react-vite/vite.config.ts:7`), vue 5174(`examples/vue-vite/vite.config.ts:7`)

### 테스트
- `packages/plugin/test/react.test.ts:26`, `packages/plugin/test/vue.test.ts:44`
- `packages/plugin/test/vite.plugin.test.ts:141`은 경고 문구 `'프로덕션 모드 빌드에 소스 위치를 주입합니다'`를 단언한다.
- `packages/plugin/test/vite.integration.test.ts:82`, `:88`: `enabled:false`일 때 0건을 단언한다.
- `packages/extension/test/source-locator.test.ts`는 `fake-element.ts`를 쓴다.

### README
- `README.md:76` 옵션 표 `enabled` 행, `:77` `injectors` 행, `:79` 주입 대상
- `README.md:270` `## 알려진 한계`, `:272` 지원 범위
- `README.md:286` 수동 확인 체크리스트

## 4. 기능 요구사항 (FR-n)
- **FR-1 옵션**: `DomirrorOptions`에 `designSystem?: string[]`를 추가한다. 기본값은 `[]`다. 각 항목은 아래 두 방식 중 하나로 일치를 판정한다.
  - (a) 정의 파일의 루트 기준 상대 경로와 glob(`*`, `**`)으로 비교한다. 예: `src/ds/**`
  - (b) import specifier와 비교한다. specifier가 항목과 정확히 같거나, `항목 + '/'`로 시작하면 일치다. 예: `@acme/ui`, `@acme/ui/button`
  - 한 항목을 두 방식 모두로 검사하며, 항목 종류를 따로 구분하지 않는다.
  - `enabled`가 false면 이 옵션은 무시하고 속성 주입은 0건이다.
- **FR-2 주입기 컨텍스트**: `Injector.transform`의 `ctx`에 선택 필드 `isDesignSystem?: (target: { file?: string; specifier?: string }) => boolean`를 추가한다. 기존 커스텀 주입기와 호환되는 추가 변경이다. 코어는 FR-1 판정 함수를 이 필드로 전달한다.
- **FR-3 정의 측 주입 (React)**: `data-domirror`를 주입하는 모든 호스트 요소에 아래 두 속성을 함께 넣는다.
  - `data-domirror-component="<이름>|<정의 파일>"`
    - 정의 파일은 그 파일의 루트 기준 상대 경로다.
    - 이름은 요소를 감싼 가장 가까운 대문자 시작 함수 이름이다. 해당하는 함수 선언은 아래 셋이다.
      - `function X`
      - `const X = () =>` 또는 `function`
      - `const X = memo(...)`, `forwardRef(...)` 등 호출식으로 감싼 선언(이 경우 선언자 이름을 쓴다)
    - 가장 가까운 함수가 소문자 이름이면 바깥 함수로 계속 올라간다.
    - 대문자 이름을 찾지 못하면 파일 basename(확장자 제외)을 쓴다. 예: `export default () => …`
  - 정의 파일이 `designSystem` 패턴과 일치하면 `data-domirror-ds`를 값 없이 추가한다.
- **FR-4 정의 측 주입 (Vue)**: `data-domirror`를 주입하는 모든 네이티브 요소에 `data-domirror-component="<이름>|<정의 파일>"`를 넣는다.
  - 이름은 파일 basename(확장자 제외)이다. Vue 컴파일러의 `__name` 규칙과 같다.
  - `data-domirror-ds` 규칙은 FR-3과 같다.
- **FR-5 사용처 측 주입**: 다음 조건을 모두 만족하는 컴포넌트 태그에 `data-domirror-component="<태그 이름>|<import specifier>"`와 `data-domirror-ds`를 넣는다.
  - 태그 형태: React의 대문자 `JSXIdentifier`·`JSXMemberExpression`, 또는 Vue의 `tagType`이 컴포넌트인 태그
  - 태그의 로컬 이름이 정적 import에 매핑된다.
  - 그 specifier가 FR-1 (b)와 일치한다.
  - 매핑 방법
    - React: `parseSync` 결과의 `staticImports`를 쓴다. `UI.Button`이면 네임스페이스 로컬 이름 `UI`를 기준으로 매핑한다.
    - React의 JSXMemberExpression은 루트 로컬 이름으로 import를 찾고 태그 이름은 점 표기 그대로 쓴다(예: UI.Button).
    - Vue: `descriptor.scriptSetup`과 `script` 내용을 `oxc-parser`로 파싱한 정적 import를 쓴다. 태그 이름은 kebab-case를 PascalCase로 바꿔 매핑한다.
  - 이 조건에 맞지 않는 컴포넌트 태그에는 아무것도 넣지 않는다. 즉 `README.md:272`의 기존 동작을 유지한다.
  - 같은 이름 속성이 태그에 이미 있으면 건너뛴다.
- **FR-6 속성 상수**: `packages/shared/src/constants.ts`에 아래 두 상수를 추가하고 `index.ts`로 re-export한다.
  - `DOMIRROR_COMPONENT_ATTR = 'data-domirror-component'`
  - `DOMIRROR_DS_ATTR = 'data-domirror-ds'`
  - 값의 포맷과 파싱 함수 `formatComponentInfo`·`parseComponentInfo`도 shared에 둔다. 파싱은 첫 번째 `|`에서 나눈다.
- **FR-7 익스텐션 해석**: `locateComponent(el)`를 추가한다.
  - `el.closest('[data-domirror-component]')`로 정보를 찾는다.
  - 반환 형식: `{ name, source, designSystem: boolean } | null`. `designSystem`은 찾은 요소에 `data-domirror-ds`가 있는지로 정한다.
  - 값이 깨진 요소는 건너뛰고 상위로 올라간다. `locate`의 `:32` 규칙과 같다.
- **FR-8 호버 라벨**: picker 윤곽선 위쪽에 라벨을 붙인다. 공간이 없으면 아래쪽에 붙인다.
  - 내용
    - 디자인 시스템이면 `<이름> · DS`
    - 디자인 시스템이 아니면 `<이름>`
  - 색: 디자인 시스템이면 `#1a7f37`(초록), 아니면 `#57606a`(회색)이다. 둘 다 흰 글씨다.
  - 정보가 없으면 라벨을 숨긴다.
- **FR-9 선택 패널**: `renderLocation`의 경로 줄 다음에 컴포넌트 줄을 추가한다.
  - 내용: `컴포넌트: <이름>`, `정의: <source>`, DS 배지
  - 배지 색은 FR-8과 같다.
  - 정보가 없으면 `컴포넌트 정보 없음`을 흐리게 표시한다.
  - 선택 흐름 `content.ts:271-273`에서 `locateComponent` 결과를 `LocationView`의 `selected` 변형에 선택 필드로 전달한다.
  - located가 null이어도 컴포넌트 정보가 있으면 같은 줄을 표시한 뒤 기존 경고 문구를 붙인다(패키지형 DS 사용처 측 주입, E-1).
- **FR-10 경고 문구**: `vite.ts:8` `PRODUCTION_WARNING`을 "소스 위치·컴포넌트 정보"를 주입한다는 문구로 바꾼다.
  - `vite.plugin.test.ts:141`의 단언도 함께 갱신한다.
  - 경고 조건(`vite.ts:25`)은 바꾸지 않는다.
- **FR-11 README**: 아래 네 곳을 갱신한다.
  - 옵션 표(`README.md:76-77`)에 `designSystem` 행을 추가한다.
  - 주입 대상(`:79`)에 새 속성 두 개와 사용처 측 주입 조건을 적는다.
  - 알려진 한계(`:270`)에 E-1~E-5의 요지를 적는다.
  - 체크리스트(`:286`)에 호버 라벨·패널·DS 색 확인 1건을 추가한다.
- **FR-12 예제**: React와 Vue 예제 각각에 아래를 추가한다.
  - `src/ds/` 아래 디자인 시스템 컴포넌트 1개(예: `Button`)와 그 사용처
  - `vite.config.ts`의 `designSystem: ['src/ds/**']`

## 5. 비기능 요구사항 (NFR-n)
- **NFR-1 enabled 일치**: `enabled:false`면 dev와 프로덕션 빌드 모두에서 `data-domirror-component`·`data-domirror-ds`가 0건이다. INT-001 원칙과 intent 답변 4를 따른다.
- **NFR-2 절대 경로 비노출**: 속성 값의 경로는 루트 기준 posix 상대 경로나 import specifier만 쓴다. 절대 경로는 0건이다.
- **NFR-3 신규 의존성 0**: glob 비교는 내부 최소 구현(`*`, `**`)으로 처리한다. `package.json`의 `dependencies`·`peerDependencies` 변경은 0건이다.
- **NFR-4 프레임워크 범용**: 판정 함수(FR-1)와 속성 포맷(FR-6)은 주입기와 무관하게 core·shared에 둔다. React 전용 설계는 금지한다.
- **NFR-5 소스맵·기존 동작 보존**: magic-string 소스맵을 유지한다. 기존 `data-domirror` 주입 결과는 위치와 개수가 바뀌지 않는다. 기존 테스트도 그대로 통과해야 한다.
- **NFR-6 익스텐션 격리 유지**: ISOLATED world를 유지하고 manifest 권한 변경은 0건이다. 오버레이는 기존 shadow root CSS 결합(`content.ts:95`)에 포함한다.

## 6. 인터페이스 · 데이터 스키마
- 확정: 옵션
  ```ts
  interface DomirrorOptions { enabled?: boolean; injectors?: Injector[]; designSystem?: string[] }
  ```
- 확정: 속성
  ```html
  <section data-domirror="src/components/Card.tsx:17:5" data-domirror-component="Card|src/components/Card.tsx">
  <button data-domirror="src/ds/Button.tsx:3:10" data-domirror-component="Button|src/ds/Button.tsx" data-domirror-ds>
  <!-- 사용처 측(패키지형 DS, 컴포넌트가 props/attrs를 루트로 전달할 때만 DOM에 남음) -->
  <Button data-domirror-component="Button|@acme/ui" data-domirror-ds />
  ```
- 초안: 주입기 컨텍스트
  ```ts
  transform(code: string, id: string, ctx: { root: string; isDesignSystem?: (t: { file?: string; specifier?: string }) => boolean }): InjectResult | null
  ```
- 초안: shared 함수
  ```ts
  formatComponentInfo({ name, source }): string    // `${name}|${source}`
  parseComponentInfo(value: string): { name: string; source: string } | null  // 첫 '|' 분리, 빈 name·source면 null
  ```
- 초안: 익스텐션
  ```ts
  locateComponent(el: Element): { name: string; source: string; designSystem: boolean } | null
  // LocationView selected 변형에 component?: ComponentInfo | null 추가
  ```

## 7. 예외 · 엣지 케이스
- **E-1 패키지형 DS가 props·attrs를 루트로 전달하지 않음**: React 컴포넌트가 `...props`를 스프레드하지 않으면 사용처 측 속성이 DOM에 남지 않는다. Vue에서 `inheritAttrs: false`이거나 루트가 여러 개인 경우도 같다. 이때 내부 요소에는 가장 가까운 조상의 정보, 즉 사용처 컴포넌트 정보가 보인다. 이는 DS 미판별이 되는 알려진 한계로, README에 명시한다.
- **E-2 전역 등록·자동 import Vue 컴포넌트**: `app.component`나 unplugin-vue-components로 등록된 컴포넌트는 SFC 안에서 import 출처를 알 수 없다. 따라서 사용처 측 주입을 하지 않는다. 로컬 glob DS는 정의 측 주입으로 판별된다.
- **E-3 barrel 재export·경로 alias**: `@/ds` 같은 alias specifier는 FR-1 (b) 문자열 일치로만 판정하며 해석하지 않는다. 로컬 DS는 정의 측 glob이 판별하므로 영향이 없다.
- **E-4 React 이름 휴리스틱 한계**: 익명 default export는 파일 basename을 쓴다. HOC 내부 함수와 한 파일 안의 여러 컴포넌트에는 가장 가까운 대문자 함수 이름을 쓴다. 클래스 컴포넌트에는 `ClassDeclaration` 이름을 쓴다(추가 규칙).
- **E-5 런타임 생성 요소**: `createElement`로 만든 요소(`Card.tsx:11` `RuntimeLabel`)에는 속성이 없다. 그래서 조상 컴포넌트 정보가 보인다. 이는 기존 `inherited`와 같은 맥락이다.
- **E-6 이미 있는 속성**: 사용자가 직접 `data-domirror-component`를 쓴 요소에는 주입하지 않는다(기존 `react.ts:38-41` 규칙 확장).
- **E-7 파싱 실패**: 기존과 같이 `parsed.errors.length > 0`이면 null을 반환하고 주입은 0건이다. Vue script 파싱만 실패하면 정의 측 주입은 유지하고 사용처 측 주입만 생략한다.
- **E-8 값 이스케이프**: specifier에 `"`나 `&`가 있으면 `inject-utils.ts`와 같은 규칙으로 이스케이프한다.
- **E-9 구버전 플러그인 페이지**: `data-domirror`만 있고 컴포넌트 속성이 없는 페이지에서는 라벨을 숨기고 패널에 `컴포넌트 정보 없음`을 표시한다. 오류는 0건이어야 한다.
- **E-10 `designSystem` 미설정**: 모든 요소가 비DS 색(회색)으로 표시된다. 사용처 측 주입은 0건이다.

## 8. 수용 기준 (AC-n)
- **AC-1 (FR-1·FR-2)**: core 단위 테스트에서 다음을 확인한다.
  - `src/ds/**`는 `src/ds/Button.tsx`와 일치하고 `src/components/Card.tsx`와는 불일치한다.
  - `@acme/ui`는 `@acme/ui`, `@acme/ui/button`과 일치하고 `@acme/uikit`과는 불일치한다.
- **AC-2 (FR-3·E-4)**: React 주입기 테스트에서 다음을 확인한다.
  - `function Card`, `const Card = () =>`, `const Card = memo(() => …)`, 익명 default export 각각의 호스트 요소에 기대한 `data-domirror-component` 값이 들어간다.
  - DS 경로 파일에는 `data-domirror-ds`가 들어간다.
- **AC-3 (FR-4)**: Vue 주입기 테스트에서 `src/ds/Button.vue`의 네이티브 요소에 `Button|src/ds/Button.vue`와 `data-domirror-ds`가 들어간다.
- **AC-4 (FR-5·E-2)**: 다음을 확인한다.
  - React의 `import { Button } from '@acme/ui'`와 `<Button/>`, Vue의 `<acme-button>`(script setup import)에 사용처 측 속성이 들어간다.
  - DS가 아닌 import와 import가 없는 태그에는 들어가지 않는다.
- **AC-5 (NFR-1·NFR-2)**: `vite.integration.test.ts`의 `enabled:false` 0건 단언에 새 속성 두 개를 추가하고 통과한다. 산출물에서 절대 경로 검색 결과가 0건이다.
  - 절대 경로 0건은 data-domirror-component 값의 source 부분이 '/'·'C:\'로 시작하지 않고 빌드 루트 절대 경로를 포함하지 않는 것으로 단언한다.
- **AC-6 (FR-6·FR-7·E-9)**: shared의 format/parse와 `locateComponent` 단위 테스트(fake-element)가 통과한다. 대상은 정상값, 깨진 값 건너뛰기, 속성 없음 null이다.
- **AC-7 (FR-8·FR-9)**: React 예제(5173)와 Vue 예제(5174) dev 서버에서 브라우저 도구로 다음을 확인한다.
  - `src/ds/` 컴포넌트 요소 호버 시 초록 라벨 `Button · DS`가 보인다.
  - `Card` 요소 호버 시 회색 라벨 `Card`가 보인다.
  - 선택 시 패널에 `컴포넌트:`·`정의:` 줄이 보인다.
  - 콘솔 에러는 0건이다.
- **AC-8 (FR-10·NFR-5)**: `pnpm test`·`pnpm lint`·`pnpm typecheck`·`pnpm build`가 Exit 0이다. 기존 react·vue 주입 테스트의 위치 값(파일:라인:컬럼)은 그대로 유지되고, 새 속성이 사이에 들어가는 부분 문자열·개수 단언만 확장한다(`/data-domirror="/g` 기준).
- **AC-9 (FR-11·FR-12·NFR-3)**: 다음을 모두 확인한다.
  - README에 `designSystem`, `data-domirror-component`, `data-domirror-ds`가 있다(`rg -n`).
  - 예제 `vite.config.ts`에 `designSystem`이 있다.
  - `git diff -- packages/*/package.json`에서 의존성 변경이 0줄이다.

## 9. 가정과 리스크
- **A-1** 사용처 측 주입(FR-5)은 패키지형 DS가 props나 attrs를 루트로 전달할 때만 효과가 있다(E-1). Vue는 fallthrough 기본 동작으로 효과가 높다. React는 라이브러리에 따라 다르다(추론).
- **A-2** oxc-parser 0.158.0 Visitor의 `:exit` 콜백과 `staticImports`는 타입 정의로만 확인했다(researcher 보고). Step 1에서 실측한다.
- **R-1** 컴포넌트 태그에 data 속성을 넘기면, 받은 props를 엄격히 검증하거나 non-DOM으로 전달하는 컴포넌트에서 경고가 날 수 있다(추론). 영향을 줄이기 위해 주입을 DS 패턴과 일치하는 import로 한정했다(FR-5).
- **R-2** `Injector` ctx 확장은 공개 타입 변경이다. 선택 필드로 추가하므로 기존 구현은 깨지지 않는다(FR-2).
- **R-3** 모든 호스트 요소에 속성이 하나 더 붙어 DOM과 번들 크기가 증가한다. dev 전용 기본값(`enabled` 기본 false)으로 완화한다.
- **R-4** 경고 문구를 바꾸면 기존 테스트 단언(`vite.plugin.test.ts:141`)이 함께 바뀐다. FR-10에 포함했다.
- **D-S1** 주입 방식은 빌드 시 data 속성을 주입한다. 폐기한 대안은 런타임 객체 조회다.
  - 익스텐션은 ISOLATED world라 페이지 JS 객체를 읽을 수 없다(`service-worker.ts:25`).
  - Vue `__vueParentComponent`는 production에서 없다(`runtime-core.esm-bundler.js:5952-5954`, prod 빌드 0건).
  - Vue `__file`은 dev에서 절대 경로다(NFR-2 충돌).
  - React 19는 `_debugSource`를 제거했고, prod에서는 `type.name`이 minify된다.
  - 런타임 방식으로는 `enabled` 플래그 일치(NFR-1)를 보장할 수 없다.
- **D-S2** DS 판별은 정의 측 glob과 사용처 측 specifier를 함께 쓴다. 폐기한 대안은 정의 측 단독이다. node_modules가 변환되지 않아(`paths.ts:25`) 패키지명 패턴 `@acme/ui`를 판별할 수 없기 때문이다.
- **D-S3** 사용처 측 주입은 DS 패턴과 일치하는 import로만 한정한다. 폐기한 대안은 모든 컴포넌트 태그 주입이다. R-1의 영향을 최소화하고 `README.md:272`의 기존 동작을 유지하기 위해서다.
- **D-S4** 속성은 `data-domirror-component`(이름|정의) 1개와 `data-domirror-ds` 불리언 1개를 쓴다. 폐기한 대안은 `data-domirror` 값 확장이다. 위치 포맷(`location.ts:11`)과 MCP `source` 계약을 보존하기 위해서다.
- **모의 독해**: 새 세션이 spec §3의 위치, §4의 FR, §6의 계약과 plan의 Step만으로 플러그인·shared·익스텐션·README·예제를 수정하고 AC-1~AC-9를 검증할 수 있다. 판정: 가능.

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과`·미해결 질문 답변 1~3 | §4·§8 | §3 | 기록 |
| ④ 영향 시스템·경로:라인 | `## 영향`·`- 참조:` | §3 | §2 | 기록(재실존 ±0 확인, HEAD `4d6a01f`) |
| ⑤ 제약·불변 계약 | `## 제약`·답변 4 | §5·§7 | §5 | 기록 |
| ⑥ 결정 D-n | `- D-01`·`D-02` | §9(D-S1~D-S4) | §5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | `- D-02` 폐기 대안·답변 3(일괄 표시 제외) | §2·§9 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:`(해당 없음) | §3(예제 포트)·§8 | §2·§4 | 기록 |
| ⑩ 미확정·가정 | `## 제약`(미확정 → 답변 2·4로 확정) | §9·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:`(researcher 사실 조사 선행) | §1·§9(D-S1) | §2(Step 1)·§6 | 기록(조사 완료, 결론 D-S1·D-S2) |

## 10. 미해결 질문 (Open questions)
- 없음
