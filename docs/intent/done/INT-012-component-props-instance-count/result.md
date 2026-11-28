# Result: 선택 컴포넌트의 props 표시와 화면 렌더 인스턴스 수(수정 영향 범위) 안내
- Intent: [INT-012](intent.md) | 완료일: 2026-11-25 | Tier: 3 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 선택한 컴포넌트의 props 요약(민감 키 마스킹, 예: `apiToken •••`)과 화면에 렌더된 같은 컴포넌트 인스턴스 수(예: "인스턴스: 화면에 4개")가 패널과 AI 프롬프트에 표시된다. 플러그인 켬·끔 두 경우 모두 동작한다.
- 변경 내역에 선택 필드 `instanceCount {count, capped}`를 추가해 `list_pending_changes`에서 유지된다. 코멘트 payload에는 props·instanceCount가 없고, `ScreenComment`·`ComponentRuntimeInfoSchema` diff는 0줄이다.
- 검증: `pnpm lint`·`typecheck`·`test`(36 files/458 tests, 이전 439건)·`build` 모두 exit=0, 브라우저 콘솔 에러 0건, 정합성 게이트 `필수(하드)` 2-pass + 재판정 1회 최종 `PASS_WITH_NOTES`(신규 결함 0건).

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/props-summary.ts` | 신규 | props 요약·민감 키 마스킹 |
| `packages/extension/src/instance-count.ts` | 신규 | fiber 기준 같은 컴포넌트 인스턴스 계수(`{count, capped}`) |
| `packages/extension/src/runtime-inspect.ts` | 신규 | 런타임 조사 로직 분리(테스트 가능하도록, plan 편차 ④) |
| `packages/extension/test/{props-summary,instance-count,runtime-inspect}.test.ts` | 신규 3개 | 위 3개 모듈 단위 테스트 |
| `packages/shared/src/types.ts` | 수정 | `instanceCount` 공유 타입(공개 계약, optional) |
| `packages/extension/src/{react-runtime,runtime-format,runtime-bridge,page-bridge}.ts` | 수정 4개 | 브리지 응답에 props·instanceCount 추가, 필드 정제 `toRuntimeBridgeResult`(편차 ③) |
| `packages/extension/src/{panel,content,prompt}.ts` | 수정 3개 | 패널 `props`·`인스턴스` 표시, 브리지 가드 `content.ts:509` 1곳 변경(편차 ①), 프롬프트 반영, props는 메모리 Map `#changeProps`에만 보관(편차 ⑦) |
| `packages/server/src/{schema,mcp}.ts` | 수정 2개 | 변경 내역 스키마 `instanceCount` optional, `list_pending_changes` 출력 반영 |
| `examples/react-vite/src/{App.tsx,components/Card.tsx}` | 수정 2개 | 인스턴스 수 검증용 예제 |
| `README.md` | 수정 | 사용법·계약 설명 갱신 |
| `packages/extension/test/{runtime-bridge,runtime-format,prompt,change-log,comment-log}.test.ts` | 수정 5개 | 브리지·형식·프롬프트·변경 내역·코멘트 테스트 확장 |
| `packages/server/test/http.integration.test.ts` | 수정 | `instanceCount` 전송·조회 통합 테스트 |

- 합계: 신규 6개 + 수정 19개(제품 코드 13개 + 테스트 6개). `change-log.ts` 코드는 수정하지 않았다(`LocalChange`가 `instanceCount`를 상속, 편차 ②).
- 계약 변경: 변경 내역 `instanceCount` optional 1개(하위 호환). `ScreenComment`·`ComponentRuntimeInfoSchema` diff 0줄.

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 3 산정·§2 Step 1~9 |
| 정적 분석·린트 | Pass | `code-tester` 원시 출력: `pnpm lint`·`pnpm typecheck`·`pnpm build` exit=0 (lint 로그에 oxlint 요약 줄은 없음) |
| 단위·통합 테스트 | Pass | `code-tester` 원시 출력: `pnpm test` exit=0 — 36 files / 458 tests(이전 439건) |
| 브라우저 검증(ego→Aside→Playwright) | Pass(부분) | `code-tester`: ego-browser에서 확장 실설치 불가로 빌드 번들 주입으로 대체. 플러그인 켬·끔 모두 props(`apiToken •••`)·"인스턴스: 화면에 4개" 표시, 콘솔 에러 0건(`ERRORS: []`). `list_pending_changes`에 `instanceCount {count:4,capped:false}` 유지, 코멘트 payload에 props·instanceCount 없음 |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 애플리케이션 저장소로 `~/.zAgentSet` sync 대상 아님) | 해당 없음 |
| 정합성 게이트 | `필수(하드)` / 근거: §A 3호 — ① Tier 3, ② 공개 계약 변경 / 방식: 2-pass + 재판정 1회 / 미검증: 해당 없음 | 오케스트레이터 게이트 판정 기록([plan.md](plan.md) §4) |
| conformance-reviewer | PASS_WITH_NOTES | 1차·2차 구현 결함 0건이나 AC-10 원시 증거(lint 종료 코드·콘솔 에러 로그) 부재로 `FAIL` → 증거 보강 후 재판정 `PASS_WITH_NOTES`, 신규 결함 0건. 수정 요청 루프 0회 |

### plan 대비 편차 (spec 취지 부합, 비차단)
- ① 브리지 가드는 3곳 중 `content.ts:509` 1곳만 변경 — `#ensureRuntime`·`#runtimeInfo` 가드를 유지해야 FR-1의 info 폐기와 FR-9가 보장된다.
- ② `LocalChange`가 `instanceCount`를 상속하므로 `change-log.ts` 코드는 수정하지 않았다.
- ③ 필드 정제는 `isBridgeResult`가 아니라 신규 `toRuntimeBridgeResult`가 수행한다.
- ④ `runtime-inspect.ts`를 분리해 테스트 가능하게 했다.
- ⑤ DevTools 경로도 return 체인 → HostRoot → `stateNode.current`를 쓴다. spec 문구는 "hook root 목록 재사용"이지만 같은 FiberRoot에 도달한다.
- ⑥ AC-8은 조립 재현 테스트와 diff 0줄로 대체했다.
- ⑦ props는 메모리 Map(`#changeProps`)에만 두고 `chrome.storage`에는 저장하지 않는다.

## 잔여 리스크 및 후속
- 미검증: React DevTools hook 경로는 브라우저 미실측(단위 테스트만), 확장 실설치 상태(isolated world·service worker) 미실측.
- 알려진 제약: `#changeProps` Map을 정리하지 않아, 같은 changeKey 재편집 중 브리지가 실패하면 이전 props가 프롬프트에 남을 수 있다. `HOST_ROOT=3` 상수가 `instance-count.ts`·`react-runtime.ts`에 중복돼 있다. lint 로그에 oxlint 요약 줄이 없다(exit=0은 확인).
- 후속 intent 후보: `z_skill_code_asset_indexer` 재실행으로 `InstanceCount`와 extension 자산을 인덱스에 반영(권고).
- 롤백: 커밋 전이므로 `git checkout -- <파일>`·신규 파일 삭제로 복귀, 커밋 후에는 `git revert <해시>`.

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음) · 커밋: `6d74461` — `feat: 선택 컴포넌트 props 표시와 인스턴스 수 안내 추가 (INT-012)`
