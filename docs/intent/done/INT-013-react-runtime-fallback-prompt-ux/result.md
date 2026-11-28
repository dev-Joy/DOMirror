# Result: CRA·UI 라이브러리 환경 React 런타임 위치 폴백 및 AI 프롬프트 복사 개선
- Intent: [INT-013](intent.md) | 완료일: 2026-11-28 | Tier: 3 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- `node_modules` 라이브러리 컴포넌트를 선택하면 owners 체인의 가장 가까운 사용자 컴포넌트 위치로 폴백한다(`ancestorSourceRef`, `fallbackFrom` 표기, CRA/Webpack 번들 프레임 필터 `WEBPACK_BUNDLE_FRAME`).
- 플러그인이 없는 앱에서도 CSS 변경 `source`에 런타임 위치 폴백을 쓴다. 선택 필드 `StyleChange.source.precision`을 추가해 MCP 전송·프롬프트·패널에 정확도를 표기한다. 피커는 `html`/`body` 선택을 막고(`'root-element'`), 복사 버튼을 `선택 요소 복사`/`변경 내역 복사` 2개로 나눴다.
- 검증: `pnpm lint`·`typecheck`·`test`(36 files/488 passed)·`build` exit=0, Playwright 브라우저 AC-7~AC-10 Pass·콘솔 에러 0건, 정합성 게이트 `필수(하드)` 2-pass 최종 `PASS_WITH_NOTES`.

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/react-runtime.ts` | 수정 | 라이브러리 상위 사용자 컴포넌트 폴백 `ancestorSourceRef`, 번들 프레임 필터 `WEBPACK_BUNDLE_FRAME` |
| `packages/extension/src/{runtime-bridge,runtime-format}.ts` | 수정 2개 | `fallbackFrom` 표기 전달·형식화(익스텐션 내부 전용) |
| `packages/extension/src/{prompt,panel}.ts` | 수정 2개 | 프롬프트·패널 정확도(`precision`) 표기, 복사 버튼 2개 분리 |
| `packages/extension/src/change-log.ts` | 수정 | 런타임 폴백 source 전송 허용, `sendable`에서 `fallbackFrom` 제거 |
| `packages/extension/src/picker.ts` | 수정 | `html`/`body` 선택 차단(`'root-element'`) |
| `packages/extension/src/content.ts` | 수정 | `#edit` source 런타임 폴백(캐시만 사용, 폴백 source는 `inherited=true`) |
| `packages/shared/src/types.ts` | 수정 | `StyleChange.source.precision` 선택 필드(공개 계약, 하위 호환) |
| `packages/server/src/{schema,mcp}.ts` | 수정 2개 | zod 스키마 `precision` 선택 필드, `list_pending_changes` 설명 갱신 |
| `README.md` | 수정 | 런타임 폴백·정확도·복사 버튼·캐시 동작 안내 |
| `packages/extension/test/{change-log,picker,prompt,react-runtime,runtime-bridge,runtime-format}.test.ts`, `packages/server/test/http.integration.test.ts` | 수정 7개 | 테스트 추가만 수행(기존 단언 수정 0건, 삭제는 import 3줄) |

- 계약 변경: `StyleChange.source.precision` 선택 필드 1개(하위 호환). `fallbackFrom`은 서버로 보내지 않는다.
- 설계 결정: ① `#edit`는 런타임 결과를 기다리지 않고 캐시만 쓴다. ② 번들 URL 필터는 실측으로 필요성을 확인해 추가했다. ③ 폴백 위치로 만든 변경 source는 `inherited=true`다. ④ spec D-S7: callSite 상위 탐색은 호스트 폴백일 때만 한다(기존 단언 보존). 1차 정합성 검증 뒤 spec FR-2를 이렇게 정정했다.

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 3 산정·§2 Step 1~9(구현 Step 1~8, Step 9 전수 검증) |
| 정적 분석·린트 | Pass | `code-tester` 원시 출력: `pnpm lint`·`pnpm typecheck`·`pnpm build` exit=0 (AC-11 lint 로그 재제출) |
| 단위·통합 테스트 | Pass | `code-tester` 원시 출력: `pnpm test` exit=0 — 36 files / 488 passed |
| 브라우저 검증(ego→Aside→Playwright) | Pass | `code-tester`: ego-browser·Aside는 익스텐션 로드 불가로 Playwright 폴백, `examples/react-vite`. 플러그인 끔: AC-7·AC-8·AC-9 Pass(편집 source `src/App.tsx:16:20` precision `line-unverified` 전송, 코멘트 작성 Pass). 플러그인 켬: AC-10 Pass(HEAD와 바이트 동일, `precision` 키 없음). 콘솔 에러 0건, 4xx/5xx 0건 |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 애플리케이션 저장소로 `~/.zAgentSet` sync 대상 아님) | 해당 없음 |
| 정합성 게이트 | `필수(하드)` / 근거: §A 3호 — ① Tier 3, ② 공개 계약 변경 / 방식: 2-pass / 미검증: 해당 없음 | 오케스트레이터 게이트 판정 기록([plan.md](plan.md) §4) |
| conformance-reviewer | PASS_WITH_NOTES | 1차 `FAIL`(FR-2 spec 상충, AC-11 lint 원시 증거 부재) → spec 정정·로그 재제출로 해소. 2차 반증 `PASS_WITH_NOTES`(반증 15건, 신규 결함 0건). 수정 요청 카운터 1/3 |

### NOTE (비차단)
- ① 호스트 위치가 없는 프로젝트 컴포넌트도 "라이브러리 컴포넌트 X"로 표기될 수 있다. spec 원문과 일치하며 문구는 후속 개정 후보다.
- ② 같은 폴백 위치인데 코멘트 source는 `inherited:false`, 변경 source는 `true`다. 코멘트 계약은 범위 밖이다.
- ③ 플러그인을 끈 상태에서 선택 요소 복사의 위치 줄은 기존처럼 "위치 미확인"이다. 위치는 컴포넌트 정의 줄에 있다.
- ④ 변경 프롬프트 머리말의 Vite 기준 문장이 런타임 항목에도 붙는다. FR-9 안내 줄이 이를 보정한다.
- ⑤ `WEBPACK_BUNDLE_FRAME`은 Vite 루트 바로 아래 `static/js/`에서 오탐할 수 있다. 오탐돼도 결과는 기존과 같은 "위치 없음"이다.

## 잔여 리스크 및 후속
- 미검증: CRA+MUI 실제 환경 실측은 하지 않았다(plan 선택 항목, R-1). AC-1 가짜 fiber 테스트로 대체했다.
- 알려진 제약: 런타임 응답 전에 편집했다가 응답 뒤 다시 편집하면 changeKey가 달라 2건이 생길 수 있다(실행 미확인). 캐시만 쓰는 의도된 결정이며 README에 적었다.
- 후속 intent 후보: `IDEA-20261128-01`(React 런타임 절대경로를 프로젝트 상대경로로 정규화, 우선순위 높음) INBOX 등록. NOTE ①의 폴백 표기 문구 개정.
- 롤백: 커밋 전이므로 `git checkout -- <파일>`로 복귀, 커밋 후에는 `git revert <해시>`. Step 3을 되돌리면 Step 4·5도 함께 되돌린다(plan §5).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음) · 커밋: `d808cf7` — `feat: CRA·UI 라이브러리 환경 React 런타임 위치 폴백과 프롬프트 복사 개선 (INT-013)`
