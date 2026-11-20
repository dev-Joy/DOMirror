# Result: React 런타임·DevTools 연동 컴포넌트 위치 찾기와 프롬프트 기반 소스 수정
- Intent: [INT-011](intent.md) | 완료일: 2026-11-20 | Tier: 3 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 플러그인이 없는 React dev 앱에서도 페이지 main world 브리지(`page-bridge.js`)가 `__REACT_DEVTOOLS_GLOBAL_HOOK__`를 우선 읽고, 없으면 DOM 노드의 `__reactFiber$*`로 폴백해 컴포넌트명·정의/호출부 위치·owner chain(최대 8)·정확도를 얻는다.
- 선택 패널에 `컴포넌트:`·`정의:`·`호출부:`·`계층:`·`라인 미확인` 배지가 표시되고, 코멘트 payload의 선택 필드 `component`와 AI 프롬프트(내역·선택 두 모드)로 전달된다. 플러그인 위치가 있으면 브리지를 호출하지 않아 기존 출력이 바이트 동일하게 유지된다(D-S4).
- 코멘트 스키마는 `component` optional 1개만 확장해 하위 호환이 유지되고, MCP 도구 설명·README에 `list_comments` → 소스 수정 → `mark_comments_resolved` 흐름을 명시했다. 검증: `pnpm lint`·`typecheck`·`test`(33 files/407 tests)·`build` Exit 0, 예제 브라우저 실측 완료, 정합성 2-pass 최종 `PASS_WITH_NOTES`(요구 위반 0건). 커밋 `1bdcbd3`.

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/react-runtime.ts` | 신규(257행) | fiber 탐색(`fiberFromNode`·`nearestComponent`)·이름 해석(memo/forwardRef, 익명 `Anonymous`)·`_debugSource`/`_debugStack` 파싱·Vite URL 정규화·정확도 판정·`ownerChain`(상한 8)·`describeRuntime` |
| `packages/extension/src/devtools-hook.ts` | 신규(69행) | `findFiberByStateNode`(DFS, 방문 상한 20,000)·`fiberFromDevtools` — hook `renderers`에 등록된 root에서 대상 요소 fiber 역추적 |
| `packages/extension/src/page-bridge.ts` | 신규(82행) | MAIN world 진입점 — 일회용 마커(`data-domirror-probe`)로 요소 수신, hook 우선·fiber 폴백, `postMessage` 응답, 중복 주입 방지 전역 마커(D-S9) |
| `packages/extension/src/runtime-bridge.ts` | 신규(97행) | content 측 요청 — `isBridgeResult`(채널·id 검증), 단일 in-flight, 300ms 타임아웃 시 런타임 정보 없음 처리 |
| `packages/extension/src/runtime-format.ts` | 신규(80행) | `라인 미확인` 상수, `formatRuntimeRef`·`runtimeSourceLocation`·`runtimeSourceRefOf`(요소→정의 위치 순)·`ownerChainText`(바깥→안쪽), 응답·저장소 형식 검증 2종 |
| `packages/extension/src/content.ts` | 수정(+124/−16) | 플러그인 위치 없을 때만 브리지 조회(선택 seq로 늦은 응답 폐기), 패널·코멘트·프롬프트로 런타임 정보 전달, 제출 시 1회 재요청(D-S6)·중복 제출 차단, 런타임 위치만으로 코멘트 허용(FR-8) |
| `packages/extension/src/panel.ts` | 수정(+48/−2) | `runtimeLines` — 요소 위치·`컴포넌트:`·`정의:`·`호출부:`·`계층:`과 `라인 미확인` 배지, 위치(파일) 미확인 시 기존 경고 유지(D-S7) |
| `packages/extension/src/prompt.ts` | 수정(+18/−1) | `PromptSelection.component` 선택 필드 + `componentLines()` — 내역·선택 두 모드에 컴포넌트·정의/호출부·계층 줄, 정보 없으면 기존 문자열 그대로 |
| `packages/extension/src/comment-log.ts` | 수정(+14/−4) | `stripInvalidComponent`(형식 오류 시 필드만 제거), `commentWhere`에 `(라인 미확인)` 부착 |
| `packages/extension/src/comment-ui.ts` | 수정(+24/−2) | `resolveCommentTarget` — `component` 보유 코멘트만 `selectorHint` 재탐색(D-S8), 해석 실패 시 핀 생략·목록 유지 |
| `packages/extension/src/change-log.ts` | 수정(+5/−3) | `LocalChange.component`는 프롬프트 전용 로컬 값 — `sendable()`에서 제외해 `StyleChange` 전송 계약 불변 |
| `packages/extension/src/service-worker.ts` | 수정(+22/−8) | `page-bridge.js`를 `world: 'MAIN'`으로 먼저 주입한 뒤 `content.js` 주입, 브리지 주입 실패는 무시하고 진행(E-3) |
| `packages/extension/build.mjs` | 수정(+2) | `page-bridge.ts` → `page-bridge.js` 빌드 엔트리 추가 |
| `packages/shared/src/types.ts` | 수정(+26) | `LocationPrecision`·`RuntimeSourceRef`·`ComponentRuntimeInfo`·`ScreenComment.component?` |
| `packages/shared/src/constants.ts` | 수정(+8) | `BRIDGE_CHANNEL`·`BRIDGE_MARKER_ATTR`·`BRIDGE_TIMEOUT_MS`(300)·`BRIDGE_OWNER_MAX`(8) |
| `packages/server/src/schema.ts` | 수정(+21) | `RuntimeSourceRefSchema`·`ComponentRuntimeInfoSchema` 신설, `ScreenCommentInputSchema.component` optional 추가 |
| `packages/server/src/mcp.ts` | 수정(+6/−2) | `list_comments`·`mark_comments_resolved` 설명에 `component` 필드와 소스 수정 후 resolve 흐름 명시 |
| `packages/extension/test/{react-runtime,devtools-hook,runtime-bridge,runtime-format}.test.ts` | 신규 4개(+549행) | fiber/hook 탐색·프레임 파싱·정확도·owner chain, 브리지 채널·id 검증·타임아웃, 형식 검증 |
| `packages/extension/test/{prompt,comment-log,change-log}.test.ts`·`packages/server/test/http.integration.test.ts` | 확장 4개(+126행) | AC-7 프롬프트 줄, `component` 복원·라인 미확인 표기, `sendable` 제외, `component` 유·무 POST 200과 `list_comments` 포함 |
| `README.md` | 수정(+20/−5) | MCP 도구 표·`ScreenComment` 필드·코멘트 반영 예시·플러그인 없는 React 사용법·알려진 한계·수동 체크리스트 3항목 |
| `docs/intent/**/INT-011-*/{intent,spec,plan,poc}.md`·`INDEX.md`·`CHANGELOG.md`·`VERSION_HISTORY.md`·`package.json` | 신규·수정 | 요구 문서 4종과 PoC 실측, 인덱스·릴리스 노트·버전 반영 |

- 합계: **34 files changed, +2,093 / −45**(제품 코드 15개 파일 + 테스트 8개 + 문서 7개 등).
- 계약 변경: `ScreenCommentInputSchema.component` optional 1개(하위 호환), `StyleChange`·MCP 도구 이름·플러그인 주입 속성 diff 0건.

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 3 산정(4개 패키지·main world 실행 컨텍스트·공개 계약 변경)·§2 Step 1~9 |
| 정적 분석·린트 | Pass | `pnpm lint`(oxlint) Exit 0 · `pnpm typecheck` Exit 0 · `pnpm build` Exit 0 — `code-tester` 실측 |
| 단위·통합 테스트 | Pass | `pnpm test` Exit 0 — **407 passed(33 files)**, 런타임 모듈 신규 4파일 포함. 기존 `source-locator`·`prompt`·`comment-log`·`http.integration` 단언 수정 0건 통과(NFR-1) |
| 브라우저 검증(ego→Aside→Playwright) | Pass(부분) | ego-browser + 예제 `examples/react-vite`(React 19.3.1·Vite 8.3.8): 플러그인 off에서 `컴포넌트: Card`·`정의/호출부`·`계층`·`라인 미확인`, 코멘트 payload에 `component` 포함 / 플러그인 on은 기존 출력 그대로, 콘솔 에러 0건. DevTools 설치 환경(`via: 'devtools'`)·실제 익스텐션 로드 경로는 미실측(아래 미검증) |
| 전역 배포(sync/Status)·인코딩 | 배포 미수행(사유: 애플리케이션 저장소로 `~/.zAgentSet` sync 대상 아님) | 해당 없음 |
| 정합성 게이트 | `필수(하드)` / 근거: §A 3호 — ① Tier 3, ② 공개 계약 변경(코멘트 스키마·MCP 출력) / 방식: 2-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록([plan.md](plan.md) §4) |
| conformance-reviewer | PASS_WITH_NOTES | 2-pass 최종 판정, 요구(intent·spec FR/NFR/AC, D-S4~D-S9) 위반 0건. NOTE는 미검증 환경 제약 2건으로 차단 사유 아님 |

### 미검증 항목 (환경 제약, 코드 결함 아님)
- **`via: 'devtools'` 실측**: 검증 환경에 React DevTools가 없어 hook DFS 경로는 단위 테스트(`devtools-hook.test.ts` 7케이스)로만 커버했다. `hook.renderers.size === 0`이면 fiber 폴백으로 동작하는 경로는 브라우저에서 실측했다.
- **실제 Chrome 익스텐션 로드 시 콘솔 에러 0건**: `chrome.scripting.executeScript({ world: 'MAIN' })` 주입은 로드된 익스텐션에서 재현하지 못했고, PoC에서 `dist/page-bridge.js`를 직접 주입해 브리지 왕복을 확인했다(`poc.md` §1).

## 잔여 리스크 및 후속
- **R-1 라인 정확도**: React 19에 `_debugSource`가 없어 `_debugStack`(변환 코드 기준)을 쓰므로 모든 런타임 위치가 `precision: 'line-unverified'`이고 실측 오차는 −7~+27행이었다. 라인은 근사값이며 파일·컴포넌트명은 신뢰 가능하다(소스맵 역매핑은 NFR-7에 따라 범위 밖).
- **R-2 hook 비공개 API**: `__REACT_DEVTOOLS_GLOBAL_HOOK__`는 비공개이므로 버전 변동 시 fiber 폴백으로 동작한다.
- 후속 intent 후보: 소스맵 기반 라인 정확도 개선(선택), 플러그인 위치에도 런타임 정보를 보강하는 FR-6 후단(D-S4에서 미구현 확정), Vue 런타임 탐색, 에이전트 스킬 자동화(INT-003).
- 롤백: `git revert 1bdcbd3`(Step 4 주입 줄만 되돌리면 런타임 기능 전체가 비활성화되고 기존 플러그인 경로로 복귀).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md) · PoC: [poc.md](poc.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음) · 커밋: `1bdcbd3` — `feat: React 런타임 위치 탐색과 컴포넌트 정보 전송 추가 (INT-011)`
