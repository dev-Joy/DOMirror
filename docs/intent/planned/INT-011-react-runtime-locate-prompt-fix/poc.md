# PoC: React 19 런타임 소스 위치 취득 실측 (INT-011 Step 1)

- Intent: [INT-011](intent.md) | Spec: [spec.md](spec.md) §4 FR-12·§8 AC-1 | Plan: [plan.md](plan.md) §2 Step 1
- 작성일: 2026-11-20 · 기준 커밋: `178639c` (+ 이번 작업 트리)
- 판정: **충족(부분)** — fiber 경로·패널·프롬프트·코멘트 전송은 브라우저 실측 완료. DevTools **설치** 환경의 hook DFS(`via: 'devtools'`)만 미검증(단위 테스트로 로직은 커버).

## 1. 환경

| 항목 | 값 |
| :--- | :--- |
| OS / 브라우저 | macOS / Ego Lite Chromium (ego-browser 2.2.1) |
| 예제 | `examples/react-vite` — `react` 19.3.1, `react-dom` 19.3.1, `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0 |
| 실행 | `pnpm --filter example-react-vite exec vite --port 5199 --strictPort` (`DOMIRROR` 미설정 → 플러그인 off) |
| React DevTools | 미설치(`hook.renderers.size === 0`, `hook.getFiberRoots === undefined`) |

측정 방법: (a) main world `page.evaluate`로 fiber 직접 읽기, (b) 빌드 산출물 `dist/page-bridge.js`를 페이지에 주입하고 `postMessage` 왕복으로 브리지 응답 확인, (c) `dist/page-bridge.js` + `dist/content.js`를 주입하고 `chrome` API를 스텁으로 대체해 패널·프롬프트·코멘트 전송까지 확인(익스텐션 주입 경로 자체는 미검증). 제품 코드는 수정하지 않았다.

## 2. 실측 필드

| 대상 요소 | `__reactFiber$` 키 | `name` | `definition`(호스트 스택) | `callSite`(composite 스택) | `owners`(가까운 순) | `via` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `section.card` (Card 루트) | 있음 (`__reactFiber$c6kamy7gki`) | `Card` | `src/components/Card.tsx:10:25` | `src/App.tsx:47:20` | `["Card","App"]` | `fiber` |
| `span.card-label` (createElement 요소) | 있음 | `RuntimeLabel` | `src/components/Card.tsx:6:9` | `src/components/Card.tsx:21:20` | `["RuntimeLabel","Card","App"]` | `fiber` |
| `h1.title` (App 내부 호스트) | 있음 | `App` | `src/App.tsx:16:20` | `src/main.tsx:9:94` | `["App"]` | `fiber` |

- `_debugSource`: **존재하지 않음**(`"_debugSource" in fiber === false`) → React 19는 `_debugStack`이 유일한 위치 근거다.
- `_debugOwner`: 존재 → owner chain을 `return` 대신 owner 기준으로 만들 수 있다.
- `__REACT_DEVTOOLS_GLOBAL_HOOK__`: 존재하지만 `renderers.size === 0`, `getFiberRoots` 없음 → 브리지는 즉시 포기하고 fiber로 폴백한다(E-2 경로 실측).
- 브리지 왕복 응답(실측): `{ channel, type: 'inspect:result', id, info: { name, via: 'fiber', definition, callSite, owners }, hostSource }`. `hostSource`는 `definition`과 같은 값이었다(호스트 태그가 정의 파일 안에 있음).

## 3. 라인 오차 (변환 코드 vs 원본)

| 대상 | 원본 위치 | 스택 위치 | 오차 |
| :--- | :--- | :--- | :--- |
| `section.card` | `Card.tsx:17` | `Card.tsx:10` | −7 |
| `createElement('span')` | `Card.tsx:12` | `Card.tsx:6` | −6 |
| `<RuntimeLabel/>` 사용 | `Card.tsx:19` | `Card.tsx:21` | +2 |
| `<h1 className="title">` | `App.tsx:11` | `App.tsx:16` | +5 |
| `<Card/>` 사용 | `App.tsx:20` | `App.tsx:47` | +27 |

오차가 방향·크기 모두 일정하지 않다(파일마다 Vite 변환 preamble이 다름). 소스맵 역매핑 없이는 라인을 신뢰할 수 없으므로 **모든 런타임 위치는 `precision: 'line-unverified'`**로 확정한다(S-Q1(a)).

## 4. AC-1 판정

- 필드 획득: `name`·`definition`·`callSite`·`owners`·`via` 모두 실측 ✓ (DevTools 있음/없음 중 **없음**만 확인)
- 라인 정확도: 측정·기록 완료(−7~+27), `line-unverified` 규칙 확정 ✓
- 미충족: **DevTools 설치 환경의 hook 경로(`via: 'devtools'`, `hook.getFiberRoots`) 미검증** — Ego Lite 프로필에 React DevTools가 없고 설치도 하지 않았다. hook DFS는 `packages/extension/src/devtools-hook.ts`로 분리해 가짜 hook 단위 테스트(renderer 0개·`getFiberRoots` 부재/예외·탐색 성공·상한)로 로직을 커버했고, 폴백 경로는 브라우저 실측으로 확인했다(E-2).

## 4-1. 클라이언트 end-to-end 실측 (AC-2·AC-3·AC-5·AC-6·AC-10)

`dist/page-bridge.js`·`dist/content.js`를 페이지에 주입하고 `chrome.runtime`·`chrome.storage.local`을 스텁으로 대체했다(익스텐션 `chrome.scripting` 주입 자체는 미검증).

| 시나리오 | 관측값 |
| :--- | :--- |
| 플러그인 **off** (`:5199`) · `section.card` 선택 | 패널: `컴포넌트: Card` · `라인 미확인` · `정의: src/components/Card.tsx:10:25 (라인 미확인)` · `호출부: src/App.tsx:47:20 (라인 미확인)` · `계층: App › Card` |
| 〃 · AI 프롬프트 복사(선택 모드) | `- 위치: 위치 미확인` / `- 컴포넌트: Card (정의: \`src/components/Card.tsx:10:25 (라인 미확인)\` / 호출부: \`src/App.tsx:47:20 (라인 미확인)\`)` / `- 계층: App › Card` |
| 〃 · 코멘트 작성 | 제출 가능(런타임 위치로 `source` 채움: `line 10, column 25`), 전송 payload에 `component`(name·definition·callSite·owners·via) 포함, `chrome.storage.local`에도 저장 |
| 〃 · 핀 | `selectorHint`(`section.card`) 재탐색으로 핀 1개 표시(숨김 아님), 목록에 `src/components/Card.tsx:10:25 (라인 미확인)` |
| 플러그인 **on** (`:5200`, `DOMIRROR=1`) · 같은 요소 | 패널: `src/components/Card.tsx:17:5` · `컴포넌트: Card` · `정의: src/components/Card.tsx` (런타임 줄 없음) |
| 〃 · AI 프롬프트 복사 | 기존과 같은 문자열(컴포넌트·계층 줄 없음) |
| 〃 · 코멘트 작성 | payload에 `component` **없음**, `source`는 플러그인 값(`17:5`) |
| 콘솔 | 두 시나리오 모두 `error`·`unhandledrejection` 0건 |
| 재검증(수정 후) | 플러그인 off: `호출부`·`계층`·`라인 미확인` 표시, 코멘트 제출 버튼 연속 2회 클릭에도 **1건만** 등록(중복 제출 차단). 플러그인 on: 런타임 줄·`component` 없음(회귀 없음). 두 경우 콘솔 에러 0건, 핀 1개 |

## 6. 정적·테스트 검증 (AC-10)

| 명령 | 결과 |
| :--- | :--- |
| `pnpm lint` (oxlint .) | Exit 0, 경고·오류 0건 |
| `pnpm typecheck` (shared build + `tsc --noEmit` 6개 패키지) | Exit 0 |
| `pnpm test` (vitest, node 환경) | Exit 0 — **33 files / 407 tests passed** (기존 테스트 단언 무수정) |
| `pnpm build` (전 패키지 + 예제) | Exit 0 (`dist/page-bridge.js` 생성 확인) |

브라우저 콘솔 에러: §4-1 시나리오 2건 모두 0건.

## 5. 미검증·잔여 리스크

- 미검증: DevTools 설치 환경의 hook DFS 실동작(`via: 'devtools'`), `chrome.scripting.executeScript({ world: 'MAIN' })` 주입 경로의 실기기 동작(스텁 대체로 클라이언트 로직만 검증), Chrome 실제 익스텐션 로드 상태의 회귀.
- 리스크 1: DevTools가 설치된 환경에서 hook의 비공개 API 형태가 다르면 DFS가 실패할 수 있다 → fiber 폴백으로 동작하며 표시만 `via: 'fiber'`가 된다(단위 테스트로 방어 확인).
- 리스크 2: `line-unverified` 라인이 실제 원본과 최대 수십 줄 어긋난다 → 프롬프트·패널·페이로드에 `라인 미확인`을 표시하고, 에이전트는 `selectorHint`·`component.name`으로 대조해야 한다(README 한계 절에 기재).
- 리스크 3: 플러그인 위치가 있는 요소에는 런타임 정보를 더하지 않는다(D-P1 = spec §9 D-S4: AC-5·NFR-1 회귀 금지가 FR-6 "보강"보다 우선). README 한계에 명시했다.
- 수정 반영(2차 반증 후): 위치 없는 런타임 정보에서 `라인 미확인`·`소스 위치 없음` 표시 복원(D-S7), `selectorHint` 재탐색을 런타임 코멘트로 한정(D-S8), 제출 중 중복 등록 차단.
