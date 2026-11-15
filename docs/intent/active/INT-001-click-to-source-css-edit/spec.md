# Spec: 브라우저 클릭 CSS 수정의 소스 코드 반영 (프레임워크 무관 DOM→소스 매핑)

- Intent: [INT-001](intent.md) | Status: planned | 작성일: 2026-11-15
- Intent updated_at: 2026-11-15T22:38:35+09:00

## 1. 개요
- 원 요구: "리액트나 다른 프레임워크로 웹 구현하면 AI agent나 서브 agent로 내가 크롬웹사이트에서 클릭해서 css 수정하면 반영되는거 VisBug 익스텐션이나 locator.js나 (잡코리아 블로그 글) 참고" / "리액트 빌드되고서도 DOM에서 잘 찾아야할텐데 리액트 뿐만아니라 Vue, Angular 등 웹 프레임워크 싹다 그치?" (출처: 대화 요청, 2026-11-15)
- 문제: 브라우저에서 본 요소가 소스의 어느 파일·위치인지 개발자가 직접 찾아야 하고, 브라우저에서 바꾼 CSS는 DOM에만 머물러 소스에 남지 않으며, 빌드된 DOM에서는 원본 소스 위치를 찾기 어렵다.
- 목표: 사용자가 크롬에서 요소를 클릭해 CSS를 수정하면, 그 요소의 소스 위치와 변경 내역이 로컬 MCP 서버에 쌓이고, MCP 지원 AI 에이전트가 이를 가져가 소스 코드에 반영한다.
- 구성(intent 미해결 질문 1·3의 답변으로 확정): ① 번들러 플러그인(빌드 시 요소별 소스 위치 주입) ② 크롬 익스텐션(요소 선택·CSS 편집·간격 보기 UI) ③ 로컬 MCP 서버(변경 내역 수신·에이전트에 제공).
- 인계 지시 반영: intent의 인계 지시("spec 착수 시 첫 행동은 프레임워크별 dev/프로덕션 빌드에서 DOM→소스 위치 획득 수단의 사실 조사(`researcher` 위임)")는 2026-11-15에 수행 완료했고 결과는 §9 조사 사실표에 있다. 다음 단계는 §10 미해결 질문 확정 후 사용자 명시 지시에 따른 구현 착수다.

## 2. 범위 (In-scope / Out-of-scope)
### In-scope
- 빌드 시 React(JSX)·Vue 3(SFC 템플릿) 요소에 소스 위치를 주입하는 플러그인.
- dev server 화면과 "플러그인을 켜고 만든 프로덕션 모드 빌드"(스테이징·로컬 preview)에서의 요소→소스 위치 조회.
- 크롬 익스텐션: 요소 선택, 주요 CSS 속성(색·간격·크기·글꼴) 편집 패널, 변경 내역(요소·속성·이전값·새값) 기록, 간격 보기(D-03).
- 로컬 MCP 서버: 변경 내역 수신·보관, 에이전트용 MCP 도구 제공.
- 프레임워크 확장 구조: 프레임워크별 주입기를 추가하는 방식으로 Angular·Svelte 등을 후속 지원할 수 있는 구조.

### Out-of-scope
- 실제 운영 배포물에 위치 정보를 넣는 것(미해결 질문 2 답변: 넣지 않음), 플러그인 없이 배포된 사이트에서의 소스 추정.
- Angular·Svelte 주입기 구현(1차 검증 대상 아님. 구조만 확장 가능하게 둔다).
- 스타일 방식별(Tailwind·CSS Modules·CSS-in-JS) 변환 로직. 도구는 소스 위치와 변경 CSS만 전달하고 반영 방법은 에이전트가 판단한다(미해결 질문 4 답변).
- VisBug 등 기존 도구의 수정 결과 수집(미해결 질문 5 답변: 의존 없음).
- 블로그 기능 중 컴포넌트 이름 표시·화면 위 코멘트·프롬프트 복사·하네스(D-03, INBOX `IDEA-20261115-03`~`06`).
- zAgentSet용 스킬·서브에이전트 추가(INBOX `IDEA-20261115-01`·`02`).
- 전제: 블로그에서 가져온 요구는 간격 보기 1건뿐이며 DOM→소스 매핑·MCP 구조는 그 글이 근거가 아니다. "빌드 후에도 찾기"는 요구이지 실현 가능성이 확인된 사실이 아니다(§9 R-1).

## 3. 영향 시스템 · 모듈 · 데이터
- 코드베이스 부재: 저장소 `/Users/dev-juhee/dev-Joy/DOMirror`는 `.git`만 있는 빈 상태(커밋 0건)라 인용할 기존 `경로:라인`이 없다. intent 참조도 `(코드 조사 없음)`이다. 아래는 전부 신규 모듈이며 경로는 제안(초안)이다.

| 모듈(제안 경로) | 역할 | 실행 위치 |
| :--- | :--- | :--- |
| `packages/plugin` | 소스 변환으로 요소에 위치 속성 주입(React·Vue 주입기) | 대상 프로젝트의 번들러(Node) |
| `packages/extension` | 요소 선택·편집 패널·간격 보기·변경 내역 전송 | Chrome (MV3) |
| `packages/server` | 변경 내역 수신(로컬 HTTP)·MCP 도구 제공 | 사용자 로컬(Node) |
| `packages/shared` | 속성명·변경 내역 스키마·프로토콜 타입 | 위 3곳 공용 |
| `examples/react-vite`, `examples/vue-vite` | 검증용 예제 앱 | 로컬 |

- 외부 시스템: 대상 웹 앱의 번들러 설정(플러그인 등록 1건), Chrome, MCP 지원 에이전트(Claude Code 등)의 MCP 서버 등록 설정.
- 데이터: 변경 내역은 로컬 MCP 서버 프로세스 내 보관(영속 저장 여부는 §6 초안). 사용자 소스 경로가 주입된 빌드 산출물.

## 4. 기능 요구사항 (FR-n)
- FR-1 (위치 주입·React): 플러그인을 켠 빌드에서 JSX의 호스트 요소(HTML 태그)가 렌더링한 DOM 요소는 소스 파일 경로·라인·컬럼을 담은 속성을 가진다.
- FR-2 (위치 주입·Vue): 플러그인을 켠 빌드에서 Vue 3 SFC 템플릿의 요소가 렌더링한 DOM 요소는 FR-1과 같은 형식의 속성을 가진다.
- FR-3 (빌드 범위): FR-1·FR-2는 dev server와 프로덕션 모드 빌드 모두에서 성립한다. 플러그인을 켜지 않은 빌드의 산출물에는 해당 속성이 0건이다.
- FR-4 (확장 구조): 프레임워크별 주입기는 공통 인터페이스(§6) 뒤에 있고, 새 프레임워크 지원은 주입기 추가만으로 가능하며 익스텐션·서버 변경을 요구하지 않는다.
- FR-5 (요소 선택): 익스텐션을 켠 상태에서 사용자가 페이지 요소를 클릭하면 해당 요소가 선택되고 소스 위치(파일:라인:컬럼)가 패널에 표시된다. 위치 속성이 없는 요소는 가장 가까운 조상의 위치를 표시하고 "조상 위치"임을 구분 표기한다.
- FR-6 (CSS 편집): 선택한 요소의 색(글자색·배경색), 간격(margin·padding·gap), 크기(width·height), 글꼴(font-size·font-weight·line-height) 속성을 패널에서 바꾸면 페이지에 즉시 반영된다.
- FR-7 (변경 기록): 편집마다 요소의 소스 위치·속성명·이전값·새값이 변경 내역으로 기록된다. 같은 요소·같은 속성의 연속 편집은 최초 이전값과 최종 새값 1건으로 합쳐진다.
- FR-8 (되돌리기): 사용자는 전송 전 변경 내역을 개별 또는 전체 되돌릴 수 있고, 되돌리면 페이지 표시와 변경 내역이 함께 원복된다.
- FR-9 (전송): 사용자가 "에이전트에 보내기"를 누르면 변경 내역이 로컬 MCP 서버로 전송되고 성공·실패가 패널에 표시된다.
- FR-10 (MCP 제공): 로컬 MCP 서버는 대기 중인 변경 내역을 조회하는 도구와 반영 완료를 표시하는 도구를 제공한다. 에이전트가 조회한 내역에는 소스 위치·속성명·이전값·새값이 모두 들어 있다.
- FR-11 (간격 보기): 간격 보기를 켜고 요소에 마우스를 올리면 요소의 크기와 padding, gap이 표시되고, 기준 요소를 고정한 뒤 다른 요소에 마우스를 올리면 두 요소 사이의 거리가 표시된다.
- FR-12 (에이전트 비종속): MCP 서버는 표준 MCP transport만 사용하고 특정 에이전트 제품 전용 API를 요구하지 않는다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (보안·로컬 한정): 로컬 서버의 HTTP 리스너는 127.0.0.1에만 바인딩하고 `Origin` 헤더를 검증해 허용되지 않은 출처의 요청을 거부한다.
- NFR-2 (보안·경로 노출): 위치 속성 주입은 명시적으로 켠 빌드에서만 일어난다. 프로덕션 모드 빌드에서 주입이 켜져 있으면 빌드 로그에 경고 1줄을 출력한다. 주입 경로는 프로젝트 루트 기준 상대 경로다(절대 경로·사용자 홈 경로 미포함).
- NFR-3 (비침습): 익스텐션은 대상 페이지의 DOM에 자체 UI 외 영구 변경을 남기지 않으며, 익스텐션을 끄면 편집 표시와 오버레이가 제거된다.
- NFR-4 (빌드 영향): 플러그인은 주입 대상 파일의 소스맵을 유지한다. 주입으로 인한 빌드 실패 시 원인 파일·위치를 오류 메시지에 포함한다.
- NFR-5 (환경): 개발·검증 환경은 macOS(Darwin 25.6.0), zsh다. 실측 성능 수치·재현 명령은 intent에 없다(해당 사항 없음).
- NFR-6 (프레임워크 범용성 제약): React 전용 설계 금지(intent 제약). 익스텐션과 서버는 프레임워크를 알지 못하고 위치 속성만 읽는다.
- NFR-7 (기술 스택·일정·보안 정책): intent 기준 (제약 없음 또는 미확정).

## 6. 인터페이스 · 데이터 스키마
전 항목이 **제안(초안)**이다. 기존 코드가 없어 확정 사양은 없으며, 구현 단계 `code-planner`가 확정한다.

- 위치 속성(초안): `data-domirror="<상대경로>:<라인>:<컬럼>"`. 참고: LocatorJS는 `data-locatorjs`(값 `<projectPath><filePath>:<line>:<column>`), code-inspector는 `data-insp-path`를 쓴다(§9 조사 사실표).
- 주입기 인터페이스(초안):

```ts
interface Injector {
  name: string;                         // 'react' | 'vue' | ...
  test(id: string): boolean;            // 대상 파일 판별
  transform(code: string, id: string, ctx: { root: string }): { code: string; map: unknown } | null;
}
```

- 변경 내역 스키마(초안):

```ts
interface StyleChange {
  id: string;
  source: { file: string; line: number; column: number; inherited: boolean }; // inherited = 조상 위치
  selectorHint: string;        // 태그·class 등 요소 식별 보조 정보
  property: string;            // 예: 'padding-left'
  before: { authored: string | null; computed: string };
  after: string;
  pageUrl: string;
  createdAt: string;           // ISO 8601
  status: 'pending' | 'applied';
}
```

- 익스텐션 → 서버(초안): content script → service worker(`chrome.runtime` 메시지) → `POST http://127.0.0.1:<port>/changes`. content script의 직접 교차 출처 요청은 불가하므로 service worker 릴레이를 쓴다(§9).
- MCP 도구(초안): `list_pending_changes()` → `StyleChange[]`, `mark_changes_applied({ ids: string[] })`.
- 이전값 취득(초안): `before.authored`는 `element.style.getPropertyValue()` 또는 매칭된 `CSSStyleRule.style`에서, `before.computed`는 `getComputedStyle()`에서 얻는다(§9).

## 7. 예외 · 엣지 케이스
- E-1: 위치 속성이 없는 요소(서드파티 컴포넌트·런타임 생성 노드) → 가장 가까운 조상 위치 사용, `inherited: true`. 조상에도 없으면 선택은 되지만 전송 대상에서 제외하고 사유를 표시한다.
- E-2: 한 소스 위치가 여러 DOM 요소로 렌더링됨(리스트 반복) → 변경 내역은 소스 위치 1건으로 기록하고, 패널에 "같은 소스에서 나온 요소 N개"를 표시한다.
- E-3: 컴포넌트가 받은 속성을 루트 요소에 넘기지 않아 속성이 사라짐 → E-1과 동일 처리.
- E-4: 로컬 서버 미실행·포트 불일치 → 전송 실패 표시, 변경 내역은 익스텐션에 유지(유실 금지).
- E-5: 변경 후 소스가 이미 바뀌어 라인이 어긋남 → 서버는 검증하지 않는다. 에이전트가 `selectorHint`와 `before`로 대조한다(도구 책임 범위 밖, §9 R-4).
- E-6: 페이지 새로고침·HMR로 DOM 교체 → 전송 전 변경 내역은 유지하되 페이지 표시는 사라질 수 있음을 패널에 표시한다.
- E-7: Shadow DOM·iframe 내부 요소 → 1차 범위에서 선택 불가로 두고 안내한다.
- E-8: 대상 페이지 CSP가 익스텐션 UI 주입에 영향을 주는 경우 → 미조사(§10).
- E-9: MCP 에이전트 세션이 여러 개라 서버 프로세스가 여러 개 뜨는 경우의 포트 충돌 → §10 미해결 질문 3.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-1·3): Given `examples/react-vite`에 플러그인을 켜고, When dev server와 프로덕션 모드 빌드를 각각 띄우면, Then 두 경우 모두 화면의 호스트 요소가 실제 JSX 위치와 일치하는 `파일:라인:컬럼` 속성을 가진다.
- AC-2 (FR-2·3): Given `examples/vue-vite`에 플러그인을 켜고, When dev server와 프로덕션 모드 빌드를 각각 띄우면, Then 두 경우 모두 템플릿 요소가 실제 SFC 위치와 일치하는 속성을 가진다.
- AC-3 (FR-3·NFR-2): Given 플러그인을 끈 상태로, When 프로덕션 빌드를 하면, Then 산출물에서 위치 속성 문자열 검색 결과가 0건이다. 플러그인을 켠 프로덕션 모드 빌드에서는 경고 1줄이 출력되고 속성 값에 절대 경로가 없다.
- AC-4 (FR-4): Given 가짜 주입기 1개를 추가하는 테스트에서, When 플러그인을 실행하면, Then 익스텐션·서버 코드를 바꾸지 않고 새 주입기가 적용된다.
- AC-5 (FR-5): Given 익스텐션을 켠 예제 페이지에서, When 요소를 클릭하면, Then 패널에 그 요소의 `파일:라인:컬럼`이 표시되고, 속성 없는 요소는 조상 위치와 "조상 위치" 표기가 나온다.
- AC-6 (FR-6·7·8): Given 요소를 선택하고, When padding을 두 번 연속 바꾼 뒤 되돌리면, Then 바꾸는 동안 페이지에 즉시 반영되고 변경 내역은 1건(최초 이전값·최종 새값)이며, 되돌린 뒤 페이지와 내역이 원복된다.
- AC-7 (FR-9·10·12): Given 로컬 서버가 실행 중이고, When "에이전트에 보내기"를 누른 뒤 MCP 클라이언트로 `list_pending_changes`를 호출하면, Then 전송한 내역이 소스 위치·속성명·이전값·새값과 함께 반환되고, `mark_changes_applied` 후 재조회 시 대기 목록에서 빠진다.
- AC-8 (제안 결과 종단): Given React·Vue 예제 각각에서, When 사용자가 요소의 CSS를 바꿔 전송하고 MCP 지원 에이전트에게 반영을 지시하면, Then 에이전트가 해당 소스 파일을 수정하고 새로고침한 화면에 같은 변경이 보인다.
- AC-9 (FR-11): Given 간격 보기를 켜고, When 요소에 마우스를 올리면, Then 크기·padding·gap이 표시되고, 기준 요소를 고정한 뒤 다른 요소에 올리면 두 요소 간 거리(px)가 표시된다.
- AC-10 (NFR-1): Given 로컬 서버에, When 허용되지 않은 `Origin`으로 요청하면, Then 거부된다. 서버는 127.0.0.1 외 인터페이스에서 접속되지 않는다.
- AC-11 (E-4): Given 로컬 서버가 꺼진 상태에서, When 전송하면, Then 실패가 표시되고 변경 내역이 익스텐션에 남는다.

## 9. 가정과 리스크
### 결정 (intent D-n)
- D-01: 요구 원자 3개(DOM→소스 매핑 / 브라우저 클릭·CSS 수정 UI / 에이전트의 소스 반영)를 1개 intent로 병합. 폐기 대안: 3개 분해.
- D-02: 우선순위 P2.
- D-03: 블로그 기능 중 "간격 보기"만 요구에 추가(미해결 질문 6의 "글 없이 진행" 답변을 대체). 폐기 대안: 컴포넌트 이름 표시·코멘트·프롬프트 복사·하네스는 INBOX `IDEA-20261115-03`~`06`으로만 기록.

### 조사 사실표 (`researcher` 보고 인용, 2026-11-15)
| # | 사실 | 출처 | 확신도 |
| :--- | :--- | :--- | :--- |
| S-1 | facebook/react PR #28265가 요소의 `__self`/`__source`와 Fiber `_debugSource`를 제거. 현재 Fiber의 `__DEV__ only` 필드에 `_debugSource` 없음 | https://github.com/facebook/react/pull/28265 | 확인됨 |
| S-2 | `captureOwnerStack`은 "only exported in development builds. It will be `undefined` in production builds." | https://react.dev/reference/react/captureOwnerStack | 확인됨 |
| S-3 | `@vitejs/plugin-react` 6.0.0-beta.0: "babel is no longer a dependency of this plugin and the related features are removed." | vitejs/vite-plugin-react CHANGELOG | 확인됨 |
| S-4 | Next.js 16.0.0부터 Turbopack 기본. "Turbopack does not support webpack plugins", loader는 `turbopack.rules`로 지원 | https://nextjs.org/docs/app/api-reference/turbopack | 확인됨 |
| S-5 | Vue `@vue/compiler-core`에 `nodeTransforms?: NodeTransform[]`, 모든 AST 노드에 `loc`(`line`·`column`·`offset`) | vuejs/core `options.ts`, `ast.ts` | 확인됨 |
| S-6 | `@vitejs/plugin-vue`의 `template.compilerOptions`로 `nodeTransforms` 전달은 타입상 가능해 보이나 README 명시 없음, 실동작 미검증 | vitejs/vite-plugin-vue README | 부분확인 |
| S-7 | LocatorJS `@locator/babel-jsx` 주입 속성: `data-locatorjs-id`, `dataAttribute: "path"`일 때 `data-locatorjs`(값 `<projectPath><filePath>:<line>:<column>`). 예시는 development로 제한 | infi-pc/locatorjs | 확인됨·부분확인 |
| S-8 | `code-inspector-plugin`: 속성 `data-insp-path`, 번들러 webpack·vite·rspack/rsbuild·farm·esbuild·turbopack·mako, Angular 미지원, "only works in the development environment" | zh-lx/code-inspector | 확인됨 |
| S-9 | `vite-plugin-vue-inspector`는 `command === 'serve'`에서만 동작(프로덕션 빌드 미동작) | webfansplz/vite-plugin-vue-inspector | 확인됨 |
| S-10 | unplugin 지원: Vite, Rollup, webpack, esbuild, Rspack, Rsbuild, Rolldown, Farm, Bun. Turbopack 없음 | https://unplugin.unjs.io/guide/ | 확인됨 |
| S-11 | MV3 content script는 "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions." service worker는 `host_permissions` 선언 시 가능. match pattern `http://localhost/*`, `http://127.0.0.1/*` | developer.chrome.com network-requests, match-patterns | 확인됨 |
| S-12 | service worker는 30초 idle 시 종료. Chrome 116부터 열린 WebSocket이 수명 연장 | developer.chrome.com service-workers/lifecycle | 확인됨 |
| S-13 | MCP 표준 transport: "1. stdio 2. Streamable HTTP". stdio 서버는 stdout에 MCP 메시지 외 출력 금지. Streamable HTTP는 `Origin` 검증 MUST, 127.0.0.1 바인딩 SHOULD | modelcontextprotocol.io spec 2025-11-25 transports | 확인됨 |
| S-14 | MCP TypeScript SDK: v2는 `@modelcontextprotocol/server`·`@modelcontextprotocol/client`로 분할, `@modelcontextprotocol/sdk`는 v1(유지보수 모드) | modelcontextprotocol/typescript-sdk | 확인됨 |
| S-15 | Claude Code 등록: `claude mcp add [options] <name> -- <command> [args...]`, HTTP는 `claude mcp add --transport http <name> <url>`, 프로젝트 스코프는 `.mcp.json` | https://code.claude.com/docs/en/mcp | 확인됨 |
| S-16 | `getComputedStyle()`은 resolved value를 반환(작성 원문 아님). `element.style`은 인라인만. 규칙은 `CSSStyleRule.style`로 접근 | MDN getComputedStyle, HTMLElement/style, CSSStyleDeclaration | 확인됨 |
| S-17 | Angular: 템플릿 요소에 소스 위치를 주입하는 공식 훅을 찾지 못함 | (검색 결과만) | 미확인 |

### 가정
- A-1: React 주입은 Babel 플러그인이 아니라 번들러 중립 소스 텍스트 변환으로 한다(근거 S-3·S-4: Babel 의존 경로가 최신 Vite·Next에서 막힘). 사용할 파서는 구현 단계에서 정한다.
- A-2: Vue 주입은 `nodeTransforms` 또는 SFC 소스 텍스트 변환 중 하나로 하며, S-6이 미검증이라 plan Step에서 먼저 실증한다.
- A-3: 구현 언어는 TypeScript, 저장소는 모노레포로 한다. 패키지 매니저·테스트 도구는 미정이며 신규 도구 도입은 사용자 승인 대상이다.
- A-4: 조사한 기존 도구가 모두 dev 전용(S-8·S-9)이어도, 주입을 "빌드 모드와 무관한 소스 변환"으로 구현하면 프로덕션 모드 빌드에서도 속성이 남는다.

### 리스크
- R-1 (높음): 프로덕션 모드 빌드에서의 주입은 선행 사례를 찾지 못했다. 압축·트리셰이킹이 `data-*` 속성을 제거하지는 않을 것으로 보이나 실증 전이다. 대응: plan의 첫 구현 Step에서 React·Vue 프로덕션 빌드 실증을 수행하고 실패 시 `code-planner`로 회귀.
- R-2 (중간): Next.js(Turbopack)는 unplugin 지원 목록에 없어(S-10) 별도 loader 엔트리가 필요하다. 1차 범위 포함 여부는 §10 미해결 질문 1.
- R-3 (중간): MCP SDK v1/v2 선택(S-14)과 stdio 서버 + 로컬 HTTP 리스너 겸용 시 다중 세션 포트 충돌(§10 미해결 질문 2·3).
- R-4 (중간): 에이전트의 소스 반영 품질은 도구가 보장하지 못한다(스타일 방식 판단을 에이전트에 위임). AC-8은 에이전트 동작에 의존한다.
- R-5 (낮음): `ws://localhost`의 `host_permissions` 필요 여부, 대상 페이지 CSP 영향, Chrome 로컬 네트워크 접근 제한 정책은 미조사.
- R-6 (낮음): intent 제약의 LocatorJS 기술(지원 대상 React·Preact·SolidJS)은 웹 검색 요약 기준이며, 조사에서는 설치 가이드에 Svelte·Vue도 있음이 확인됐다. 요구에는 영향이 없다.

### 인계 대조표 (11범주)
| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` 2줄 | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1·§2 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과` | §4·§8 | §3 | 기록 |
| ④ 영향 시스템·`경로:라인` | `## 영향` + `- 참조: (코드 조사 없음)` | §3 | §2 | 해당 없음(코드베이스 부재 명시) |
| ⑤ 제약·금지·불변 계약 | `## 제약` | §5·§7 | §5 | 기록 |
| ⑥ 결정 `D-n`·근거·폐기 대안 | `D-01`~`D-03` | §9 | §5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·표기·사용자 선호·기각 접근 | `D-01`·`D-03` 폐기 대안, 미해결 질문 답변 | §2·§6 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:` | §5 | §2·§4 | 기록(재현 명령·실측 수치 없음) |
| ⑩ 미확정·가정 | `## 제약`(가정·미검증) | §9·§10 | §5 | 기록 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:` | §1 | §3·§6 | 기록 |

- 검사 ② `경로:라인` 재실존: 인용할 `경로:라인`이 intent에 0건(`(코드 조사 없음)`)이라 대조 대상 없음 — 통과.
- 검사 ③ 원문 보존: `updated_at`, 저장소 경로, OS 버전(Darwin 25.6.0), INBOX ID, 결정 문구, 미해결 질문 답변을 원문대로 옮김 — 통과.
- 검사 ④ 새 세션 모의 독해: spec §4·§6·§8과 plan §2만으로 Step 1(실증)부터 착수 가능하고 미확정 3건은 §10에 격리됨 — 통과.
- 레거시 규칙 해당 여부: INT-001은 번호상 레거시 구간(INT-001~INT-031)이지만 환경·재현·인계 지시를 모두 기록한 신형 형식이라 누락 기록 대상이 아니다.

## 10. 미해결 질문 (Open questions)
- [x] 1차 버전의 대상 번들러는 어디까지인가? (Vite만 / Vite + webpack / Next.js Turbopack 포함) → 답변: Vite만 먼저 — React·Vue 모두 Vite 예제에서 검증, webpack·Next.js(Turbopack)는 후속 (2026-11-15)
- [x] MCP TypeScript SDK는 v1(`@modelcontextprotocol/sdk`)과 v2(`@modelcontextprotocol/server`) 중 무엇을 쓰는가? → 답변: v2(`@modelcontextprotocol/server`) (2026-11-15)
- [x] 로컬 MCP 서버의 프로세스 구성은? (에이전트가 띄우는 stdio 서버가 로컬 HTTP 리스너를 겸함 / 상시 실행 데몬 + Streamable HTTP) → 답변: 상시 실행 서버 1개 + Streamable HTTP — 사용자가 서버를 켜 두고 익스텐션과 에이전트가 같은 주소로 접속, stdio 겸용 구성은 채택하지 않음 (2026-11-15)
