# Spec: 3D 컴포넌트 레이어 분해도(Exploded 3D Layers) 시각화 및 편집 연동
- Intent: [INT-014](intent.md) | Status: planned | 작성일: 2026-11-28
- Intent updated_at: 2026-11-28T16:19:25+09:00

## 1. 개요
- **배경 및 문제**: 현재 DOMirror Chrome 익스텐션은 2D 평면 오버레이(`packages/extension/src/picker.ts`, `packages/extension/src/overlay.ts`)와 텍스트형 owner chain(`packages/extension/src/panel.ts`)만 제공한다. 이로 인해 컴포넌트가 깊게 중첩되거나 겹쳐 있는 React 화면에서 입체적 계층 구조를 한눈에 파악하거나 다른 요소에 가려진 래퍼(wrapper) 요소를 선택하기 어렵다.
- **목표**: React Anatomy의 3D 컴포넌트 레이어 분해도(Exploded 3D Layers)와 Pick-to-Inspect·Zero-config 핵심 기능을 DOMirror의 기존 `<domirror-panel>` Shadow DOM 오버레이/모달로 통합한다. 사용자는 순수 CSS 3D 기반 와이어프레임·라벨 레이어 카드로 페이지의 컴포넌트 계층을 입체적으로 탐색(회전·확대·깊이 간격 조절)하고, 원하는 레이어를 클릭해 즉시 DOMirror의 기존 CSS 편집·코멘트·MCP 전송 흐름으로 연결할 수 있다.
- **인계 맥락**: `intent.md`의 미해결 질문 2건(Shadow DOM 내 복제/투영 방식, React Fiber 기본 + 비-React DOM 폴백)이 확정되었으며, 본 명세와 `plan.md`는 구현 착수 전 Spec/Plan Gate의 유일한 통과 근거다.

## 2. 범위 (In-scope / Out-of-scope)
### In-scope
- `<domirror-panel>` Shadow DOM 내부에 3D 분해도(Exploded 3D Layers) 오버레이/모달 진입·종료 토글 및 뷰어 UI 추가
- Zero-config React Fiber 기반 컴포넌트 레이어 트리 스냅샷 수집(MAIN world `page-bridge.ts` 경유)
- 비-React 페이지 또는 Fiber 미탐지 영역에 대한 일반 DOM 요소 계층 폴백 레이어 수집
- 순수 CSS 3D(`perspective`, `transform-style: preserve-3d`, `rotateX`/`rotateY`, `scale`, `translateZ`) 기반 와이어프레임·라벨 레이어 카드 렌더링(대상 페이지 DOM 수정 0건)
- 3D 카메라 인터랙션: 드래그 회전(yaw/pitch), 휠/버튼 확대·축소(zoom), 깊이 간격(layer spacing) 슬라이더, 시점 초기화(Reset)
- 레이어 호버 하이라이트(컴포넌트명·깊이·크기 툴팁) 및 클릭(Pick-to-Inspect) 시 대응 DOM `Element`를 `EditSession.select(el)`로 전달하여 기존 위치 표시·CSS 편집·코멘트·프롬프트 복사·MCP 전송 흐름에 즉시 연결
- 3D 뷰 종료 및 익스텐션 비활성화(`deactivate`) 시 리스너·DOM·일회용 프로브 속성 완전 원복

### Out-of-scope
- Chrome DevTools 전용 패널 구현 및 이중 지원(`D-01` 기각)
- Three.js 등 외부 3D/렌더링 런타임 라이브러리 도입(`D-04` 기각)
- 좌측/우측 독립 컴포넌트 트리·서브트리 탐색 패널(`INT-015`로 분리)
- 실시간 Props/State 인스펙터 및 편집기(`INT-016`로 분리)
- iframe 및 타 Shadow DOM 내부 요소 탐색·선택(플랫폼 한계, 최상위 문서 기준 동작)
- `@domirror/shared` 공개 메시지/스키마 계약 변경(3D 스냅샷 프로토콜은 `packages/extension` 내부 전용으로 유지)

## 3. 영향 시스템 · 모듈 · 데이터
- **대상 사용자**: DOMirror Chrome 익스텐션으로 복잡한 React UI 구조를 파악하고 스타일을 수정하는 개발자
- **기존 영향 파일 (`경로:라인` ±0행 실측 기준)**:
  - `packages/extension/package.json:6-15`: `scripts`(`build`, `typecheck`), `dependencies`(`@domirror/shared` 단일 — 외부 런타임 의존성 0개), `devDependencies`(`@types/chrome`)
  - `packages/extension/build.mjs:9-14`: 3개 IIFE 번들 엔트리(`src/content.ts` → `content.js`, `src/service-worker.ts` → `service-worker.js`, `src/page-bridge.ts` → `page-bridge.js`)
  - `packages/extension/manifest.json:1-9`: Manifest V3 권한(`activeTab`, `scripting`, `storage`) 및 `service-worker.js` 주입 구조
  - `packages/extension/src/content.ts:56-121`: `HOST_TAG = 'domirror-panel'`(`:60`), `PANEL_CSS`(`:64-96`, `:host` `z-index: 2147483647`), `Panel` 인터페이스(`:100-121`)
  - `packages/extension/src/content.ts:182-243`: `createPanel` Shadow DOM 호스트 생성, `adoptedStyleSheets` 결합(`:185-187`), 패널 헤더·슬롯·버튼 DOM
  - `packages/extension/src/content.ts:528-538`: `EditSession.select(el)` — 선택 요소 하이라이트·런타임 조회·CSS 편집기·코멘트 폼·복사/MCP 전송 연동 진입점
  - `packages/extension/src/content.ts:970-1021`: `activate()`(`:975-1010`, `isOwn` `:1000`, `createMeasureOverlay` `:1001`, `createPicker` `:1003-1009`) 및 `deactivate()`(`:1012-1021`)
  - `packages/extension/src/page-bridge.ts:7-52`: `BridgeRequest`(`:7-12`), `isBridgeRequest`(`:26`), `respond(request)`(`:39-52`, `fiberFromDevtools` → `fiberFromNode` → `inspectFiber` → `window.postMessage`)
  - `packages/extension/src/runtime-bridge.ts:13-124`: `RuntimeBridgeResult`(`:13-22`), `isBridgeResult`(`:50-56`), `requestRuntimeInfo`(`:82-124`, `BRIDGE_MARKER_ATTR` 일회용 부여·제거)
  - `packages/extension/src/react-runtime.ts:7-78`: `FiberLike`(`:7-18`), `HOST_ROOT = 3`(`:38`), `COMPONENT_TAGS`(`:43-49`), `fiberFromNode`(`:63-78`)
  - `packages/extension/src/instance-count.ts:13-25`: `currentTreeRoot(fiber, limit)` — 현재 커밋된 Fiber 트리 루트 탐색 유틸(재사용 대상)
  - `packages/extension/src/devtools-hook.ts:17-69`: `FIBER_VISIT_LIMIT = 20_000`, `fiberFromDevtools`
  - `packages/extension/src/picker.ts:7-213`: `BlockedReason`(`:7`), `PICKER_CSS`(`:25-52`), `frameBlockedReason`(`:58-61`), `elementBlockedReason`(`:67-73`), `blockedReason`(`:75-79`), `createPicker`(`:81-213`). *(참고: `intent.md:27` 인용 `picker.ts:57-67`은 `INT-013` 반영 이전 기준이며, 현행 실측 라인은 `picker.ts:58-79`이다.)*
  - `packages/extension/src/overlay.ts:8-219`: `MEASURE_CSS`(`:8-30`), `createMeasureOverlay`(`:104-219`) — 패널 내 컨트롤 슬롯 + Shadow DOM 오버레이 라이프사이클 패턴 참조
  - `packages/extension/src/panel.ts:137-439`: `renderLocation`, `renderEditor`, `renderChanges`, `renderVerify`, `createSelectionHighlight` (기존 편집/표시 흐름 무변경 연계)
  - `packages/shared/src/constants.ts:11-17`: `BRIDGE_CHANNEL = 'domirror:bridge'`(`:11`), `BRIDGE_MARKER_ATTR = 'data-domirror-probe'`(`:13`), `BRIDGE_TIMEOUT_MS = 300`(`:15`)
  - `docs/intent/active/INT-013-react-runtime-fallback-prompt-ux/intent.md:26`: `INT-013` 대상 파일 명시(`content.ts`, `picker.ts`, `panel.ts` 등 — 워킹 트리에 이미 코드 반영됨)
- **신규 추가 모듈 (`packages/extension/src/` 내부)**:
  - `packages/extension/src/layer-model.ts`: 3D 레이어 타입, 좌표 정규화, 깊이(Z-level) 계산, 레이어 상한 필터링, 카메라 회전/줌/간격 클램핑 순수 함수(DOM 비의존, Vitest 단위 테스트 대상)
  - `packages/extension/src/layer-collect.ts`: MAIN world React Fiber 트리 스캔(컴포넌트 단위 레이어 + DOM 경로 인덱스 수집) 및 ISOLATED world 비-React DOM 폴백 레이어 수집기
  - `packages/extension/src/exploded-view.ts`: `<domirror-panel>` Shadow DOM 내부 3D 오버레이/모달 UI, CSS 3D 스테이지 렌더링, 포인터/휠/키보드 인터랙션, Pick-to-Inspect 콜백 및 `dispose()` 관리

## 4. 기능 요구사항 (FR-n)
- **FR-1 (3D 뷰 진입·종료 토글)**: `<domirror-panel>` 패널 UI에 `3D 레이어` 토글 버튼을 제공한다. 활성화 시 Shadow DOM 내부에 전체 뷰포트 기반 3D 분해도 오버레이/모달을 표시하고, 2D `picker`를 일시 정지(`picker.stop()`)해 포인터 이벤트 충돌을 차단한다. 닫기 버튼·`Escape` 키·재토글 시 3D 오버레이를 제거하고 `picker.start()`로 복귀한다.
- **FR-2 (React Fiber 컴포넌트 레이어 수집)**: 3D 뷰 진입(또는 새로고침) 시 `BRIDGE_CHANNEL` 확장 요청(`inspect-layers`)을 통해 MAIN world `page-bridge.ts`에서 현재 커밋된 React Fiber 트리를 스캔한다. 각 사용자 컴포넌트(`COMPONENT_TAGS` 기준)에 대해 대표 호스트 DOM 요소의 뷰포트 좌표(`rect`), 컴포넌트명(`name`), 계층 깊이(`depth`), 선택적 소스 파일 힌트(`file`), 그리고 ISOLATED world에서 대상 `Element`를 역조회할 수 있는 DOM 경로(`domPath`)를 수집한다.
- **FR-3 (비-React / 일반 DOM 폴백 레이어 수집)**: React Fiber가 탐지되지 않거나 수집된 React 컴포넌트 레이어가 0건인 페이지(또는 브리지 타임아웃 시)에서는 ISOLATED world에서 최상위 문서(`document.body` 하위, `<domirror-panel>` 자체 제외)의 가시적 구조 DOM 요소를 깊이 순으로 스캔해 폴백 레이어(태그명·`id`/대표 클래스 라벨)를 생성한다. 헤더에 현재 모드 배지(`React Fiber` 또는 `DOM Fallback`)를 표시한다.
- **FR-4 (순수 CSS 3D 와이어프레임·라벨 레이어 카드 렌더링)**: 수집된 레이어 목록을 `<domirror-panel>` Shadow DOM 내부 3D 스테이지에 복제/투영된 와이어프레임·라벨 레이어 카드로 렌더링한다. 각 카드는 정규화된 `(x, y, width, height)` 위치와 `translateZ(depth * spacing)` 깊이로 배치되며, 깊이별 색상/투명도 구분과 컴포넌트명 라벨을 표시한다. 대상 페이지 DOM의 스타일·클래스·구조는 일절 수정하지 않는다.
- **FR-5 (3D 카메라 인터랙션)**: 3D 스테이지에서 다음 조작을 지원한다:
  - 포인터 드래그: 수평 회전(`rotateY`, `-180°~180°`) 및 수직 기울기(`rotateX`, `-85°~85°`) 조절
  - 마우스 휠 / `+/-` 버튼: 확대·축소(`scale`, `0.3~2.5`) 조절
  - 깊이 간격 슬라이더: 레이어 간 Z축 간격(`spacing`, `0px~80px`, 기본 `24px`) 실시간 조절
  - 시점 초기화(`Reset`) 버튼: 기본 아이소메트릭 시점(`rotateX: 55°`, `rotateY: -25°`, `scale: 0.85`, `spacing: 24px`)으로 복원
  - 새로고침(`Refresh`) 버튼: 현재 페이지 레이어 스냅샷 재수집
- **FR-6 (레이어 호버 및 Pick-to-Inspect 편집 연동)**: 3D 레이어 카드에 마우스를 올리면 해당 카드를 강조하고 툴팁(컴포넌트명, 깊이, 크기 `W×H`, 소스 힌트)을 표시한다. 카드를 클릭(드래그 이동 거리 `<= 4px` 판별)하면 `domPath`로 최상위 문서의 실제 `Element`를 찾아 3D 오버레이를 닫고 `EditSession.select(el)`을 호출해 기존 DOMirror의 위치 표시·CSS 편집·코멘트·프롬프트 복사·MCP 전송 흐름에 즉시 연결한다.
- **FR-7 (활성 선택 요소 동기화 및 종료 정리)**: 3D 뷰를 열 때 이미 선택된 요소(`EditSession`의 현재 선택 요소)가 있으면 대응 레이어 카드를 강조 상태로 표시한다. `deactivate()` 호출 시 3D 오버레이 DOM·전역 키보드/포인터 리스너·대기 중인 브리지 요청을 모두 정리한다.

## 5. 비기능 요구사항 (NFR-n)
- **NFR-1 (외부 런타임 의존성 0개)**: `packages/extension/package.json:10-12`의 무의존성 원칙(`@domirror/shared` 외 0개)을 유지한다. Three.js 등 외부 3D 라이브러리를 추가하지 않으며 순수 CSS 3D 및 표준 DOM API만 사용한다.
- **NFR-2 (대상 페이지 무침습 — NFR-3 승계)**: 3D 분해도 진입·조작·종료 전 과정에서 대상 페이지 DOM에 영구 속성·인라인 스타일·클래스를 남기지 않는다. 모든 3D 렌더링은 `<domirror-panel>` Shadow DOM 내부에서만 수행하며, `domPath` 기반 요소 역조회로 페이지 DOM 변형을 0건으로 유지한다.
- **NFR-3 (성능 및 스캔 상한)**: Fiber 트리 순회는 기존 `FIBER_VISIT_LIMIT = 20_000`(`devtools-hook.ts:17`) 상한을 준수하고, 렌더링 레이어 수는 최대 `150`개(뷰포트 내 가시적·면적 상위·깊이 우선)로 제한하여 대규모 DOM에서도 60fps에 준하는 회전·슬라이더 응답성을 유지한다.
- **NFR-4 (브리지 안정성 및 격리)**: `page-bridge.ts`의 기존 `inspect` 프로토콜과 3D용 `inspect-layers` 프로토콜은 `type` 및 독립 `id`로 격리되어 동시/연속 호출 시 상호 간섭이 없어야 한다. 브리지 응답 타임아웃은 `500ms`로 두고 초과 시 자동 DOM 폴백으로 전환한다.
- **NFR-5 (실행 환경 및 빌드 호환)**: macOS / Node.js `>=22.12` / `pnpm@10.26.1` / Chrome Manifest V3 / 대상 React DOM `v18.2~v19.3`(Zero-config) 환경에서 `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`가 모두 Exit 0으로 통과해야 한다.

## 6. 인터페이스 · 데이터 스키마
> 아래 스키마는 `packages/extension/src/` 내부 전용 계약이다(`@domirror/shared` 공개 계약 무변경). 기존 심볼은 **확정**, 신규 심볼은 **초안**으로 표기한다.

### 6.1 기존 브리지·패널 연동 계약 (확정)
- `BRIDGE_CHANNEL = 'domirror:bridge'` (`packages/shared/src/constants.ts:11`)
- `EditSession.select(el: Element): void` (`packages/extension/src/content.ts:528-538`)
- `Picker` `{ start(): void; stop(): void }` (`packages/extension/src/picker.ts:20-23`)
- `currentTreeRoot(fiber: FiberLike, limit: number): FiberLike | null` (`packages/extension/src/instance-count.ts:13-25`)

### 6.2 3D 레이어 스냅샷 및 브리지 메시지 (초안)
```ts
// packages/extension/src/layer-model.ts
export type LayerSourceMode = 'react-fiber' | 'dom-fallback';

export interface LayerRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayerNode {
  readonly id: string;            // 스냅샷 내 고유 ID (예: "L-0")
  readonly name: string;          // React 컴포넌트명 또는 DOM 태그/셀렉터 요약
  readonly depth: number;         // 0-based 정규화 계층 깊이
  readonly rect: LayerRect;       // 뷰포트 기준 픽셀 좌표
  readonly domPath: readonly number[]; // document.documentElement 기준 children 인덱스 경로
  readonly isReact: boolean;
  readonly file?: string;         // 선택적 소스 파일명 힌트
}

export interface LayerSnapshot {
  readonly mode: LayerSourceMode;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly layers: readonly LayerNode[];
  readonly truncated: boolean;    // 상한(150개 또는 20,000 노드) 도달 여부
}

export interface CameraState {
  readonly rotateX: number;       // -85 ~ 85 (기본 55)
  readonly rotateY: number;       // -180 ~ 180 (기본 -25)
  readonly scale: number;         // 0.3 ~ 2.5 (기본 0.85)
  readonly spacing: number;       // 0 ~ 80 (기본 24)
}
```
```ts
// packages/extension/src/page-bridge.ts ↔ runtime-bridge.ts 확장 메시지 (초안)
export interface BridgeLayersRequest {
  readonly channel: typeof BRIDGE_CHANNEL;
  readonly type: 'inspect-layers';
  readonly id: string;
  readonly maxLayers: number;     // 기본 150
}

export interface BridgeLayersResponse {
  readonly channel: typeof BRIDGE_CHANNEL;
  readonly type: 'inspect-layers:result';
  readonly id: string;
  readonly snapshot: LayerSnapshot | null;
}
```

### 6.3 3D 뷰 컨트롤러 계약 (초안)
```ts
// packages/extension/src/exploded-view.ts
export interface ExplodedViewOptions {
  readonly overlayRoot: ShadowRoot;
  readonly collectLayers: () => Promise<LayerSnapshot>;
  readonly getSelectedElement: () => Element | null;
  readonly onPickElement: (el: Element) => void;
  readonly onOpenChange: (open: boolean) => void;
}

export interface ExplodedView {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}
```
- **용어·표기 규약**: UI 문구는 기존 DOMirror 패널 한글 톤에 맞추되 3D 개념 배지는 `3D 레이어`, `React Fiber`, `DOM Fallback`, `Reset`, `Refresh`로 통일한다. 기각된 대안(Three.js, DevTools 패널, 대상 페이지 일시 CSS 변형)은 구현하지 않는다.

## 7. 예외 · 엣지 케이스
- **비-React 페이지 또는 프로덕션 난독화 이름**: Fiber 미탐지 시 자동으로 `dom-fallback` 모드로 전환한다. React 컴포넌트 이름이 비어 있거나 익명인 경우 `Anonymous` 또는 호스트 태그명 폴백을 사용한다.
- **iframe / 타 Shadow DOM 경계**: `picker.ts:58-79`의 최상위 문서 한계와 동일하게 `document.documentElement` 기준 최상위 문서 요소만 수집·선택하며, iframe 내부나 외부 Shadow DOM 내부 요소는 스캔 대상에서 제외하고 안내 문구로 한계를 표시한다.
- **가시성 0 또는 뷰포트 밖 요소**: `width <= 0 || height <= 0`이거나 `display: none` / `visibility: hidden` / 뷰포트와 교차하지 않는 요소는 레이어에서 제외한다.
- **대규모 Fiber/DOM 트리**: 방문 노드 `20,000`건 초과 또는 레이어 `150`개 초과 시 수집을 중단하고 `truncated: true`를 설정해 3D 모달 헤더에 `상위 150개 레이어 표시(일부 생략)` 배지를 노출한다.
- **클릭 시점 요소 분리(Detached DOM) 또는 차단 요소**: 3D 스냅샷 생성 이후 페이지가 리렌더링되어 `domPath` 해석 결과가 `null`이거나 `<domirror-panel>` 자체/`html`/`body`/`iframe` 등 차단 요소(`elementBlockedReason`, `picker.ts:67-73`)인 경우 `panel.setStatus`로 안내 메시지를 표시하고 새로고침을 유도한다(크래시 금지).
- **드래그 vs 클릭 오인식**: 3D 스테이지 위에서 포인터 이동 거리가 `4px`를 초과한 경우 회전 드래그로 간주하고 클릭(Pick-to-Inspect) 이벤트를 발동하지 않는다.
- **브리지 미주입·타임아웃**: `page-bridge.js` 주입이 실패했거나 `500ms` 내 응답이 없으면 즉시 `dom-fallback`으로 폴백한다.
- **기존 `inspect` 브리지와의 병행**: `runtime-bridge.ts`의 기존 `requestRuntimeInfo` 단일 `inflight`와 3D용 `requestLayerSnapshot`은 서로 다른 응답 타입(`inspect:result` vs `inspect-layers:result`)으로 필터링해 충돌을 방지한다.
- **패널 z-index 및 `measure` 오버레이 충돌**: 3D 모달은 `panel.shadow` 내부 `z-index: 2147483647` 전체 화면 백드롭으로 배치하며, 열릴 때 `picker.stop()`을 호출해 2D 호버 윤곽선이 3D 모달 위로 겹치지 않게 한다.

## 8. 수용 기준 (AC-n)
- **AC-1 (3D 뷰 진입·종료)**: `<domirror-panel>`에서 `3D 레이어` 버튼 클릭 시 Shadow DOM 내부에 3D 분해도 모달이 열리고 2D 피커가 정지하며, 닫기/`Escape` 시 모달이 사라지고 2D 피커가 정상 복귀한다. (FR-1)
- **AC-2 (React Fiber 3D 분해 렌더링)**: React v18.2~v19.3 대상 페이지(예: `examples/react-vite`)에서 3D 뷰를 열면 `React Fiber` 모드로 컴포넌트 계층별 와이어프레임·라벨 레이어 카드가 Z축으로 분리되어 렌더링된다. (FR-2, FR-4)
- **AC-3 (비-React DOM 폴백)**: React가 없는 일반 HTML 페이지에서 3D 뷰를 열면 오류 없이 `DOM Fallback` 모드로 전환되어 DOM 계층 레이어 카드가 렌더링된다. (FR-3, FR-4)
- **AC-4 (카메라 인터랙션)**: 드래그 회전(`rotateX`/`rotateY`), 휠/버튼 줌(`scale`), 깊이 간격 슬라이더(`spacing`), `Reset`, `Refresh`가 모두 콘솔 에러 0건으로 실시간 반영된다. (FR-5)
- **AC-5 (Pick-to-Inspect → 편집·코멘트·MCP 연동)**: 3D 분해도에서 중첩/가려진 래퍼 레이어 카드를 클릭하면 모달이 닫히고 해당 `Element`가 선택되어 위치 표시·CSS 편집·코멘트 입력·프롬프트 복사·MCP 전송 버튼이 즉시 활성화·동작한다. (FR-6, FR-7)
- **AC-6 (무침습·무의존성)**: `packages/extension/package.json`의 외부 런타임 의존성이 0개로 유지되며, 3D 뷰 열기→조작→닫기 및 익스텐션 비활성화 후 대상 페이지 DOM에 추가된 속성·스타일·노드가 0건이다. (NFR-1, NFR-2)
- **AC-7 (단위 테스트 및 정적 검증)**: `layer-model.ts` 및 `layer-collect.ts` 핵심 로직에 대한 Vitest 단위 테스트가 추가되어 `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`가 모두 Exit 0으로 통과한다. (NFR-3, NFR-4, NFR-5)
- **AC-8 (엣지 케이스 안전성)**: 빈 화면·대규모 DOM(`truncated`)·클릭 전 DOM 제거(detached)·드래그 후 릴리즈 시 예외나 오선택 없이 정상 처리된다. (§7)

## 9. 가정과 리스크
- **주요 결정 승계 (`intent.md` D-01~D-04 및 확정 Q1·Q2)**:
  - `D-01`: 기존 `<domirror-panel>` Shadow DOM 오버레이/모달 통합 채택 (폐기: Chrome DevTools 전용 패널, 둘 다 지원)
  - `D-02`: 3D 분해도(`INT-014`)·트리/서브트리(`INT-015`)·실시간 Props(`INT-016`) 3개 독립 intent 유지 (폐기: 1개 통합 intent)
  - `D-03`: 3D 레이어 선택 시 기존 CSS 편집·코멘트·MCP 전송 즉시 연결 (폐기: 읽기 전용 시각화 한정)
  - `D-04`: 순수 CSS 3D / Canvas 무의존성 유지, 우선순위 `P2` (폐기: Three.js 도입)
  - 확정 Q1: Shadow DOM 내 복제/투영(와이어프레임·라벨 레이어 카드) 방식 채택 — 페이지 DOM 수정 0건, NFR-3 완전 준수
  - 확정 Q2: React Fiber 컴포넌트 기본 + 비-React/일반 DOM 폴백 레이어 지원
- **가정**:
  - `domPath`(`document.documentElement` 기준 `children` 인덱스 배열)는 3D 뷰가 열려 있는 짧은 시간 동안 대상 페이지 구조가 크게 변하지 않는 한 동일 `Element`를 정확히 역조회할 수 있다.
  - `INT-013`의 코드 변경이 이미 워킹 트리에 반영되어 있으므로, `content.ts`·`picker.ts`·`runtime-bridge.ts`는 현행 워킹 트리 기준으로 최소 diff 수정한다.
- **리스크 및 완화**:
  - *리스크 1 (브리지 메시지 충돌)*: `page-bridge.ts:26`의 `isBridgeRequest`가 `type === 'inspect'`만 허용하므로 `inspect-layers` 추가 시 타입 가드를 엄격히 분기하고 기존 `runtime-bridge.test.ts` 회귀를 검증한다.
  - *리스크 2 (React 18/19 Fiber 구조 차이)*: `currentTreeRoot`(`instance-count.ts:13-25`)와 `COMPONENT_TAGS`(`react-runtime.ts:43-49`)를 재사용해 기존 검증된 Fiber 순회 로직을 공유한다.
  - *리스크 3 (테스트 환경 DOM 부재)*: `vitest.config.ts`에 `jsdom`이 없으므로 좌표 정규화·깊이 계산·필터링·카메라 클램핑·`domPath` 해석 로직을 순수 함수/최소 인터페이스 주입으로 분리해 단위 테스트한다.
  - *리스크 4 (`INT-013` 병행 충돌)*: `content.ts` 수정 지점을 최소화(3D 토글 버튼 및 `createExplodedView` 연결 훅만 추가)하고 `panel.ts`·`picker.ts`는 무변경으로 유지해 충돌 면적을 줄인다.

### 맥락 인벤토리 11범주 인계 대조표
| 범주 | `intent.md` 기록 위치 | `spec.md` 반영 | `plan.md` 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` (대화 요청, React Anatomy 3D 분해도·Pick-to-Inspect·Zero-config) | §1 | §2 | 통과 |
| ② 문제·영향 | `## 문제` (2D 평면 오버레이·텍스트 owner chain 한계) | §1, §2 | §5 | 통과 |
| ③ 제안 결과 | `## 제안 결과` (3D 분해도 탐색 + Pick-to-Inspect 편집/코멘트/MCP 연동) | §4, §8 | §3 | 통과 |
| ④ 영향 시스템·`경로:라인` | `## 영향` + `- 참조:` (`content.ts`, `page-bridge.ts`, `picker.ts`, `overlay.ts`, `package.json`, `INT-013`) | §3 (±0행 실측 갱신) | §2 | 통과 |
| ⑤ 제약·금지·불변 계약 | `## 제약` (무의존성 0개, NFR-3 무침습, 최상위 문서 한계, `INT-013` 충돌 유의) | §5, §7 | §5 | 통과 |
| ⑥ 결정 `D-n`·근거·폐기 대안 | `- D-01` ~ `- D-04` | §9 | §5 | 통과 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` (DevTools 패널, 외부 3D, `INT-015`, `INT-016` 분리) | §2 | §5 | 통과 |
| ⑧ 용어·표기·선호·기각 접근 | `- D-01`~`- D-04` 폐기 대안 + 확정 Q1(Shadow DOM 와이어프레임·라벨 카드)·Q2(Fiber+DOM 폴백) | §6, §7 | §5 | 통과 |
| ⑨ 환경·재현 | `- 환경·재현:` (macOS / Node.js `>=22.12` / `pnpm@10.26.1` / Chrome MV3 / React DOM `v18.2~v19.3`) | §5, §9 | §2, §4 | 통과 |
| ⑩ 미확정·가정 | `## 미해결 질문` (2건 확정 `[x]`) · `## 제약` | §9, §10 | §5 | 통과 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:` (`spec.md`·`plan.md` 산출) + `- 관련 intent: INT-015, INT-016` | §1, §9 | §3, §6 | 통과 |

- **모의 독해 판정**: 통과 — 새 세션이 `spec.md`와 `plan.md`만으로 영향 파일(`경로:라인` ±0행), 브리지 확장 스키마, 순수 모듈 경계, 검증 명령 및 수용 기준을 추가 질문 없이 구현·검증할 수 있다.

## 10. 미해결 질문 (Open questions)
- 없음 (미확인 질문이 없습니다)
