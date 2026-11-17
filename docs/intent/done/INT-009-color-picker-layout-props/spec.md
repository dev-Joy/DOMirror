# Spec: CSS 편집 패널 확장 — 컬러 피커와 flex/grid 레이아웃 속성 편집
- Intent: [INT-009](intent.md) | Status: planned | 작성일: 2026-11-18
- Intent updated_at: 2026-11-17T23:59:16+09:00

## 1. 개요
- 원 요구: INT-006 프롬프트 복사 결과(`p.lead` padding-top 0px→17px, `src/App.tsx:12:7`)를 본 사용자의 피드백이다. 원문: "컬러 picker가 있으면 좋겠고 너무 한정적인 것 같은데, display:grid나 flex로 잡힌 것들은 어떻게 처리할 거냐? 프롬프트로?"
- 문제
  - 편집 가능한 속성이 고정 16개뿐이다(`packages/extension/src/properties.ts:19-30` `EDITABLE_PROPERTIES`).
  - 모든 필드가 텍스트 입력이라 색상을 직접 타이핑해야 한다(`packages/extension/src/panel.ts:157` `input.type = 'text'`).
  - flex/grid 컨테이너 속성을 편집할 수 없고, 선택 요소의 `display`를 판정하는 로직도 없다. 지금은 레이아웃 변경을 프롬프트에 사람이 직접 적어야 한다.
- 목표: 편집 패널을 두 방향으로 확장한다. 변경은 모두 기존 `StyleChange` 경로(MCP 전송·프롬프트 복사)로 그대로 나간다(intent D-03).
  - 색 속성(`color`·`background-color`) 필드에 네이티브 `<input type="color">`를 기존 텍스트 입력과 나란히 붙인다.
  - 레이아웃 그룹을 추가한다. `display` 필드는 항상 표시하고, 컨테이너 속성은 계산된 `display`가 `flex`·`inline-flex`·`grid`·`inline-grid`일 때만 표시한다. 키워드 속성은 선택지(`<select>`)로 고른다.
- 인계 지시(intent): 미해결 질문 확정 후 `z_skill_intent_to_specplan` 실행. 이 문서와 plan.md가 그 산출물이다. intent 미해결 질문 4건은 모두 답변 완료(2026-11-17)다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `properties.ts`: `PropertyGroup`에 `'layout'` 추가, `EditableProperty`에 선택 메타데이터(`options`·`containers`) 추가, 레이아웃 속성 10개 추가, display→컨테이너 판정 함수 추가.
  - `panel.ts` `renderEditor`: 색 그룹 필드에 컬러 피커 병행, `options`가 있는 필드는 `<select>`, `containers`가 있는 필드는 현재 display에 따라 표시/숨김.
  - 색 변환 순수 모듈 신규(`packages/extension/src/color.ts`): 계산값(`rgb()`/`rgba()`/hex)을 피커용 `#rrggbb`로 변환.
  - 단위 테스트 신규: `packages/extension/test/color.test.ts`, `packages/extension/test/properties.test.ts`.
  - 패널 CSS(`panel.ts:98-104` `EDITOR_CSS`)에 피커·select 배치 스타일 추가.
  - `content.ts` `#edit`: display 편집 성공 시 `#renderEditor()` 재호출(FR-8).
- 레이아웃 속성 범위(intent 미해결 질문 답변 "컨테이너만"): `display`·`flex-direction`·`flex-wrap`·`justify-content`·`align-items`·`align-content`·`grid-template-columns`·`grid-template-rows`·`row-gap`·`column-gap`.
- Out-of-scope
  - 자식 아이템 속성(`align-self`·`flex-grow/shrink/basis`·`order`·`grid-column/row`) — 미해결 질문 답변 "컨테이너만".
  - 목록 외 속성 이름 자유 입력 — 미해결 질문 답변 "자유 입력 제외(필요 시 INBOX 아이디어)".
  - 자체 구현 컬러 피커(알파·CSS 변수 지원) — 미해결 질문 답변 "네이티브 피커 + 텍스트 병행". 알파·`rgba()`·`var()`는 텍스트 입력으로 받는다.
  - 레이아웃 전용 프롬프트 형식 — intent D-03 폐기 대안. `prompt.ts` `changesPrompt`는 변경하지 않는다.
  - `StyleChange`(`packages/shared/src/types.ts:19-29`)·MCP 도구(`list_pending_changes`·`mark_changes_applied`)·서버·manifest 변경.
  - 컬러 피커와 레이아웃의 intent 분해 — 미해결 질문 답변 "분해 없이 1개 유지"(intent D-02).
  - 붙여 넣은 `p.lead` padding-top 17px 변경 자체의 소스 반영(intent 「범위 밖·전제」).
  - 기존 `gap` 항목 제거·정리(최소 변경 원칙, R-2 참조).

## 3. 영향 시스템 · 모듈 · 데이터
- 익스텐션 (변경 대상)
  - `packages/extension/src/properties.ts:1` 원칙 주석 "간격은 롱핸드로만 다룬다(소스 반영 시 속성 단위로 대조하기 위함)." — 유지한다. 신규 `row-gap`·`column-gap`은 롱핸드라 원칙에 맞는다.
  - `packages/extension/src/properties.ts:3` `export type PropertyGroup = 'color' | 'spacing' | 'size' | 'font';` — `'layout'` 추가.
  - `packages/extension/src/properties.ts:5-8` `export interface EditableProperty { readonly name: string; readonly group: PropertyGroup; }` — 선택 필드 추가(§6). import 지점은 `panel.ts:4`·`content.ts:46`.
  - `packages/extension/src/properties.ts:10-15` `PROPERTY_GROUP_LABELS` — `layout: '레이아웃'` 추가.
  - `packages/extension/src/properties.ts:19-30` `EDITABLE_PROPERTIES` — 배열 끝에 layout 그룹 10개를 연속 배치한다.
  - `packages/extension/src/panel.ts:127-130` `EditorHandlers { onEdit(property, value) }` — 변경 없음(피커·select도 `onEdit`으로 보낸다).
  - `packages/extension/src/panel.ts:131-136` `renderEditor(container, values, handlers, disabled = false)` — 시그니처 유지.
  - `packages/extension/src/panel.ts:145-155` 그룹 순회. 그룹이 바뀔 때 `line('group', PROPERTY_GROUP_LABELS[g])` 헤더와 `div.grid`를 새로 만든다. 같은 그룹이 배열에서 떨어져 있으면 헤더가 두 번 생기므로 layout 항목은 연속 배치해야 한다.
  - `packages/extension/src/panel.ts:156-162` 필드 생성. `:157` `input.type = 'text'`, `:162` `input.addEventListener('change', () => handlers.onEdit(name, input.value));`.
  - `packages/extension/src/panel.ts:172` `container.replaceChildren(box)` — 다시 그릴 때마다 편집기 전체를 교체한다(R-1).
  - `packages/extension/src/panel.ts:98-104` `EDITOR_CSS` (`.editor .group/.grid` 2열 grid/label/input).
- 익스텐션 (재사용, 변경 없음 예상)
  - `packages/extension/src/content.ts:592-600` `#renderEditor()`. `:596` `const cs = getComputedStyle(el);`, `:597` `values = Object.fromEntries(EDITABLE_PROPERTIES.map(({ name }) => [name, cs.getPropertyValue(name)]));`. `display`를 목록에 넣으면 `values.display`로 계산값이 자동 전달된다. display 값 수신은 기존 `#renderEditor`(:597) 경로를 쓰되, `#edit` 성공 경로에 재렌더가 없어 FR-8용 1줄을 추가한다(D-S2).
  - `packages/extension/src/content.ts:509-548` `#edit`. `:526` `CSS.supports(property, value)` 검증, `:538` `readBefore(el, property)`, `:545` `this.#tracker.edit(...)`. 적용은 `edit-tracker.ts:24` → `applier.ts:40` `el.style.setProperty(property, value, 'important')`. 속성 이름 무관 경로다.
  - `packages/extension/src/css-read.ts:228` `export function readBefore(el: Element, property: string): BeforeValue` (본문 :229-245, 종료 :246). 속성 이름 무관.
  - `packages/extension/src/prompt.ts:54` `function changesPrompt(changes: readonly LocalChange[]): string` (본문 :54-89). 속성 이름 분기 없음.
- 공유 타입 (읽기 전용 참조): `packages/shared/src/types.ts:19-29` `interface StyleChange` — `property: string`이라 새 속성 추가에 계약 변경이 필요 없다. `:31` `StyleChangeInput = Omit<StyleChange, 'status'>`.
- 드리프트 기록(intent 원문은 수정하지 않음)
  - intent `panel.ts:156` 인용: `:156`은 `createElement('input')`, `type='text'` 지정은 `:157`이다.
  - intent `css-read.ts:227-244` 인용: `:227`은 주석, 함수는 `:228-246`이다.
  - intent `prompt.ts:54-90` 인용: 함수는 `:54-89`다.
- 데이터: 새 저장소 키·메시지 타입 없음. 패널은 content script 내부 Shadow DOM(`content.ts:164` `attachShadow`)에서 그려지므로 패널↔content 메시징 변경도 없다.
- 외부 의존성: 추가 없음. `packages/extension/package.json` dependencies는 `@domirror/shared`뿐이고 네이티브 `<input type="color">`만 쓴다(intent 제약 충족).
- 환경·재현(intent): 예제 페이지 http://127.0.0.1:5199/ 에서 요소 선택 후 편집 패널 확인.
  - 설정상 포트는 `examples/react-vite/vite.config.ts:7` `server: { port: 5173, strictPort: true }`다. 5199는 INT-006 실측 기록(`docs/intent/done/INT-006-copy-ai-implementation-prompt/result.md:28`)에서 CLI 오버라이드로 띄운 것으로 보인다(실행 명령 미확인).
  - flex 컨테이너: `examples/react-vite/src/styles.css:24-30` `.list { display: flex; gap: 12px; ... }`. grid 컨테이너는 예제에 없다 → AC-7에서 `.list`의 display를 패널로 `grid`로 바꿔 확인한다.

## 4. 기능 요구사항 (FR-n)
- FR-1 (컬러 피커): `group === 'color'`인 필드(`color`·`background-color`)는 텍스트 입력 옆에 `<input type="color">`를 함께 둔다.
  - 피커 초기값은 텍스트 값을 `parsePickerColor`로 변환한 `#rrggbb`다. 변환할 수 없으면(`var()`·`currentcolor` 등) 피커는 `#000000`으로 두고 텍스트 값은 그대로 둔다.
  - 피커에서 고른 값은 `#rrggbb`로 `handlers.onEdit(name, value)`에 보내고, 같은 값을 텍스트 입력에도 반영한다. 미리보기 시점은 §10 Q-1 답변에 따른다.
- FR-2 (텍스트 병행): 색 필드의 텍스트 입력은 기존과 같이 동작한다(`change` → `onEdit`). 알파·`rgba()`·`hsl()`·`var()` 값은 텍스트로 입력한다.
- FR-3 (알파 표시): 현재 색의 알파가 1 미만이면 피커에 `title="알파 값은 텍스트로 편집하세요(피커는 불투명 색만 지원)"`를 단다. 피커로 고르면 불투명 hex가 적용된다(알파 손실은 사용자 선택).
- FR-4 (레이아웃 그룹): `PropertyGroup`에 `'layout'`(라벨 `레이아웃`)을 추가하고 §2 레이아웃 속성 10개를 배열 끝에 연속 배치한다.
- FR-5 (display 항상 표시): `display` 필드는 선택 요소의 display와 상관없이 항상 표시한다.
- FR-6 (컨테이너 조건부 표시): `display` 외 레이아웃 속성은 `containerOf(values.display)`가 해당 컨테이너 종류일 때만 표시한다(D-S3).
  - flex·grid 공통: `justify-content`·`align-items`·`align-content`·`row-gap`·`column-gap`
  - flex 전용: `flex-direction`·`flex-wrap`
  - grid 전용: `grid-template-columns`·`grid-template-rows`
  - `values`가 null(선택 요소 없음)이면 기존대로 편집기를 비운다.
- FR-7 (키워드 선택지): `options`가 정의된 속성은 `<select>`로 그린다(§6 선택지 목록).
  - 현재 계산값이 선택지에 없으면(예: `safe center`, `normal`) 그 값을 맨 앞 옵션으로 추가하고 선택 상태로 둔다.
  - `change` 시 `handlers.onEdit(name, select.value)`를 호출한다.
  - `grid-template-*`·`row-gap`·`column-gap`은 자유 값이므로 텍스트 입력을 유지한다.
- FR-8 (display 변경 반영): `display`를 바꾸면 `#edit` 성공 시 property가 display이면 `#renderEditor` 재호출로 레이아웃 그룹 표시가 즉시 갱신된다(예: `block`→`flex` 시 flex 속성 등장).
- FR-9 (기록·전송 경로 불변): 피커·select·레이아웃 속성의 변경도 기존 `#edit`(`CSS.supports` 검증 → `readBefore` → tracker)로 `LocalChange`에 기록되고, `property`/`before`/`after` 형식 그대로 MCP 전송과 프롬프트 복사에 실린다.
- FR-10 (disabled 일관성): `renderEditor`의 `disabled`(전송 중)일 때 피커·select도 비활성화한다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (계약 불변): `packages/shared`·`packages/server`·`packages/extension/manifest.json`·`packages/extension/src/prompt.ts` diff 0줄.
- NFR-2 (의존성): 신규 외부 의존성 0건(`package.json`·`pnpm-lock.yaml` diff 0줄). 신규 의존성이 필요해지면 사용자 승인 후 진행(intent 제약).
- NFR-3 (롱핸드 원칙): 신규 속성은 롱핸드만 추가한다(`properties.ts:1`). `gap`·`flex-flow`·`grid-template`·`place-*` 단축 속성은 추가하지 않는다.
- NFR-4 (테스트 가능성): 색 변환과 컨테이너 판정은 DOM·`chrome`에 의존하지 않는 순수 함수로 둔다. vitest는 node 환경(`vitest.config.ts` include `packages/*/test/**/*.test.ts`, jsdom 없음)이며 panel 테스트 하네스는 없다.
- NFR-5 (문구 언어): UI 라벨·툴팁은 한국어, 코드 주석은 한국어 + FR 식별자 표기(기존 관례).
- NFR-6 (파일 규격): 신규·수정 파일 UTF-8(BOM 없음)·LF. 저장소에 `AGENTS.md`가 없어 `§2.4`는 미확인이며 이 규격으로 갈음한다.

## 6. 인터페이스 · 데이터 스키마
- 확정 — `properties.ts` 타입 확장(익스텐션 내부 타입, 공개 계약 아님):
```ts
export type PropertyGroup = 'color' | 'spacing' | 'size' | 'font' | 'layout';

/** 레이아웃 컨테이너 종류(FR-6). */
export type LayoutContainer = 'flex' | 'grid';

export interface EditableProperty {
  readonly name: string;
  readonly group: PropertyGroup;
  /** 키워드 선택지. 있으면 <select>로 그린다(FR-7). */
  readonly options?: readonly string[];
  /** 지정 시 선택 요소 display가 이 컨테이너일 때만 표시(FR-6). */
  readonly containers?: readonly LayoutContainer[];
}

/** 계산된 display 값 → 컨테이너 종류. flex·inline-flex → 'flex', grid·inline-grid → 'grid', 그 외 null. */
export function containerOf(display: string | undefined): LayoutContainer | null;
```
- 확정 — 신규 `packages/extension/src/color.ts`:
```ts
/** 피커용 색 정보. 변환 불가면 null(FR-1). */
export interface PickerColor { hex: string; alpha: number } // hex는 소문자 #rrggbb, alpha 0~1

/** `rgb(r, g, b)`·`rgba(r, g, b, a)`·`rgb(r g b / a)`·`#rgb`·`#rrggbb` 지원. 그 외(var(), 키워드 등) null. */
export function parsePickerColor(value: string): PickerColor | null;
```
- 초안 — 레이아웃 속성 선택지(구현 시 키워드 추가 허용, `CSS.supports`가 거부하는 값은 넣지 않음):

| 속성 | 입력 | containers | options |
| :--- | :--- | :--- | :--- |
| `display` | select | (없음, 항상) | `block`·`inline`·`inline-block`·`flex`·`inline-flex`·`grid`·`inline-grid`·`none` |
| `flex-direction` | select | flex | `row`·`row-reverse`·`column`·`column-reverse` |
| `flex-wrap` | select | flex | `nowrap`·`wrap`·`wrap-reverse` |
| `justify-content` | select | flex, grid | `normal`·`flex-start`·`flex-end`·`start`·`end`·`center`·`space-between`·`space-around`·`space-evenly`·`stretch` |
| `align-items` | select | flex, grid | `normal`·`stretch`·`flex-start`·`flex-end`·`start`·`end`·`center`·`baseline` |
| `align-content` | select | flex, grid | `normal`·`flex-start`·`flex-end`·`start`·`end`·`center`·`space-between`·`space-around`·`space-evenly`·`stretch` |
| `grid-template-columns` | text | grid | — |
| `grid-template-rows` | text | grid | — |
| `row-gap` | text | flex, grid | — |
| `column-gap` | text | flex, grid | — |

- `StyleChange`·`EditorHandlers`·`renderEditor` 시그니처는 변경 없음(확정).

## 7. 예외 · 엣지 케이스
- E-1: 색 계산값이 `rgba(0, 0, 0, 0)`(투명, `background-color` 기본값). 피커 hex `#000000`, alpha 0 → FR-3 툴팁 표시.
- E-2: 텍스트에 `var(--brand)`·`currentcolor`를 입력. `parsePickerColor` null → 피커 `#000000` 유지, 텍스트 값과 적용은 기존 경로대로.
- E-3: `display: none` 적용. 요소가 사라져 선택 오버레이·측정이 어긋날 수 있다. 되돌리기는 기존 변경 원복 경로(applier 원복)로 한다. 별도 차단은 하지 않는다.
- E-4: `display`를 flex→block으로 변경. 레이아웃 그룹의 flex 속성 필드가 숨겨진다. 이미 기록된 flex 속성 변경 내역은 그대로 유지·전송된다(숨김 ≠ 삭제).
- E-5: 계산값이 선택지 밖 값(`safe center`, `anchor-center` 등). FR-7대로 맨 앞 옵션으로 추가해 보존한다.
- E-6: `gap`(spacing 그룹)과 `row-gap`/`column-gap`을 함께 편집. 두 변경이 각각 기록된다. 반영 순서·충돌 판단은 에이전트 몫이다(R-2).
- E-7: `inline-flex`·`inline-grid` 요소. 각각 flex·grid로 판정해 그룹을 표시한다(intent 미해결 질문 답변).
- E-8: 피커 조작 중 패널 재렌더(`panel.ts:172` `replaceChildren`)로 피커가 닫히거나 포커스를 잃음. Q-1 답변 방식으로 회피하고 AC-7에서 실측한다(R-1).
- E-9: 전송 중(`disabled`) 상태. 피커·select도 비활성(FR-10).

## 8. 수용 기준 (AC-n)
- AC-1 (FR-1·FR-3·E-1·E-2): `color.test.ts`에서 `parsePickerColor`가 다음을 만족한다.
  - `rgb(255, 0, 128)` → `{ hex: '#ff0080', alpha: 1 }`, `rgba(0, 0, 0, 0)` → `{ hex: '#000000', alpha: 0 }`, `rgb(10 20 30 / 0.5)` → alpha 0.5
  - `#abc` → `#aabbcc`, `#AABBCC` → `#aabbcc`
  - `var(--x)`·`currentcolor`·빈 문자열 → null
- AC-2 (FR-4·FR-6·E-7): `properties.test.ts`에서
  - `containerOf`: `flex`·`inline-flex` → `'flex'`, `grid`·`inline-grid` → `'grid'`, `block`·`''`·`undefined` → null
  - `EDITABLE_PROPERTIES`에 §2 레이아웃 10개가 `group: 'layout'`으로 존재하고 배열 끝에 연속 배치되어 있다(그룹 헤더 중복 방지).
  - `display`는 `containers`가 없고, 나머지 9개는 §6 표대로 `containers`를 가진다.
- AC-3 (NFR-3): 신규 속성에 단축 속성(`gap`·`flex-flow`·`grid-template`·`place-*`)이 없다. `options`의 모든 값이 `CSS.supports` 유효 키워드다(브라우저 실측 또는 테스트 대체 불가 시 AC-7에서 확인).
- AC-4 (NFR-1·NFR-2): `git diff --stat -- packages/shared packages/server packages/extension/manifest.json packages/extension/src/prompt.ts package.json packages/extension/package.json pnpm-lock.yaml` 0줄.
- AC-5 (FR-9): AC-7 ③에서 피커·select로 만든 변경이 변경 내역에 `property`/이전 값/새 값으로 나타나고, `AI 프롬프트 복사` 결과에 `### n. \`justify-content\`` 형식으로 실린다.
- AC-6 (NFR-4·NFR-6): `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build` Exit 0. 신규·수정 파일 CR 0건·BOM 없음.
- AC-7 (브라우저 실측, `examples/react-vite` + 빌드한 익스텐션, 콘솔 에러 0건)
  - ① `p.lead` 등 일반 요소 선택: 레이아웃 그룹에 `display` select만 보이고 컨테이너 속성은 없다. 색 필드 2개에 피커가 보인다.
  - ② 피커로 `color`를 고르면 화면에 반영되고 텍스트 필드·변경 내역에 `#rrggbb`가 기록된다(Q-1 답변 방식대로 미리보기 시점 확인).
  - ③ `.list`(flex) 선택: 공통 5개 + flex 전용 2개가 보이고 grid 전용은 없다. `justify-content`를 select로 `center`로 바꾸면 반영·기록된다.
  - ④ `.list`의 `display`를 `grid`로 바꾸면 그룹이 즉시 grid 구성으로 바뀐다(flex 전용 숨김, `grid-template-*` 등장). `grid-template-columns`에 `1fr 1fr` 입력 시 반영·기록된다.
  - ⑤ 전송 중 피커·select가 비활성이다(서버 기동 시, 불가하면 미수행 사유 기록).

## 9. 가정과 리스크
- 결정(spec 단계)
  - D-S1: 입력 종류는 별도 `kind` 필드 대신 `group === 'color'` → 피커, `options` 유무 → select로 판정한다. 근거: 최소 변경(기존 그룹 구분 재사용), 메타데이터 중복 방지. 폐기 대안: `input: 'text' | 'color' | 'select'` 필드.
  - D-S2: display 계산값은 `display`를 `EDITABLE_PROPERTIES`에 넣어 `content.ts:597` 기존 경로로 받는다. 근거: content.ts는 값 수신 경로 무변경, display 재렌더 1줄만 추가. `renderEditor` 시그니처 무변경. 폐기 대안: `renderEditor`에 display 인자 추가.
  - D-S3: 컨테이너 속성을 flex/grid 종류별로 나눠 표시한다(§6 표). 근거: flex 컨테이너에 `grid-template-*`는 효과가 없어 잘못된 편집을 유도한다. intent 답변("flex/grid일 때만")을 속성 단위로 세분화한 것이며 표시 조건 자체는 동일하다. 폐기 대안: flex/grid면 10개 모두 표시.
  - D-S4: 색 변환은 별도 순수 모듈 `color.ts`로 둔다. 근거: panel에는 DOM 테스트 하네스가 없고 저장소에 hex/rgb 변환 유틸이 0건이다(`packages/*/src` grep).
- 가정
  - A-1: Chrome `getComputedStyle`의 색 계산값은 `rgb()`/`rgba()` 형식이다(브라우저 규격, 코드 근거 미확인 → AC-7에서 실측).
  - A-2: 예제 페이지는 `examples/react-vite`를 포트 5199로 띄운 것이다(설정 기본 5173, 실행 명령 미확인 → plan Step 6에서 확정).
- 리스크
  - R-1 (재렌더와 피커): `#edit` 후 `#renderEditor`가 `replaceChildren`(`panel.ts:172`)으로 편집기를 통째로 교체한다. 피커 `input` 이벤트마다 `onEdit`을 부르면 드래그 중 피커가 닫힐 수 있다. 완화: §10 Q-1 결정 + AC-7 ② 실측.
  - R-2 (`gap` 중복): 기존 spacing 그룹의 `gap`(`properties.ts:24`)은 단축 속성으로 롱핸드 원칙(`:1`)과 어긋난다. 신규 `row-gap`/`column-gap`과 동시 편집 시 변경이 겹친다. 이번 범위에서는 최소 변경으로 유지하고, 정리는 후속 INBOX 아이디어 후보로 남긴다.
  - R-3 (grid 예제 부재): 예제에 grid 컨테이너가 없어 AC-7 ④는 display 변경으로 대체 검증한다.
  - R-4 (`display: none`): 요소가 사라져 선택·측정이 어긋날 수 있다(E-3). 선택지에서 빼지 않는 이유는 실제 반영 대상 값이기 때문이다.
- 인계 충실성 대조표 (11범주)

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과` | §1·§4·§8 | §3 | 기록 |
| ④ 영향 시스템·경로:라인 | `## 영향`·`- 참조:` | §3 | §2 | 기록(재실존 ±0 확인: `properties.ts:1`·`:3`·`:19-30`, `content.ts:596-597`, `types.ts:19-29`. 드리프트 3건(`panel.ts:156`→`:157`, `css-read.ts:227-244`→`:228-246`, `prompt.ts:54-90`→`:54-89`)은 §3에 현재 라인과 함께 기록) |
| ⑤ 제약·불변 계약 | `## 제약` | §5(NFR-1~3) | §4·§5 | 기록 |
| ⑥ 결정 D-n | `- D-01`~`D-03` | §1·§2·§9(D-S1~D-S4) | §1·§5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | D-03 폐기 대안·미해결 질문 답변(자체 피커·자유 입력·아이템 속성·분해 기각) | §2·§9 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:` (http://127.0.0.1:5199/) | §3·§8(AC-7)·§9(A-2) | §2(Step 6)·§4 | 기록(포트 5199 실행 명령 미확인 → Step 6에서 확정) |
| ⑩ 미확정·가정 | `## 미해결 질문`(4건 답변)·`## 제약`(피커 방식 → 답변 확정) | §9·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:` | §1 | §3·§6 | 기록 |

- 모의 독해 판정: 새 세션이 spec·plan만으로 착수할 수 있다. 수정 파일·타입 시그니처·선택지 표·검증 명령·실측 시나리오를 모두 명시했다. Q-1 답변만 FR-1 미리보기 시점에 반영하면 된다.

## 10. 미해결 질문 (Open questions)
- [x] Q-1: 컬러 피커 미리보기 시점은? (a) 피커 `change`(피커를 닫거나 확정할 때 1회 `onEdit`) — 구현 단순, 재렌더 충돌 없음, 드래그 중 실시간 미리보기 없음 / (b) 피커 `input`마다 요소에 임시 미리보기(재렌더·기록 없이 `el.style` 직접 적용) + `change`에서 `onEdit` 1회 기록 — intent "즉시 미리보기"에 가장 가깝지만 미리보기 전용 핸들러(`EditorHandlers.onPreview`)와 취소 시 원복 처리가 추가됨 / 권장: (a), 사유: R-1 재렌더 위험 회피·`EditorHandlers` 무변경, Chrome 피커는 닫을 때 `change`가 오므로 체감 지연이 작다. → 답변: (a) 피커 `change` 시 1회 `onEdit` (2026-11-18)
