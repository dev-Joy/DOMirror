# Result: 선택 요소·변경 내역을 AI 구현 프롬프트로 복사
- Intent: [INT-006](intent.md) | 완료일: 2026-11-17 | Tier: 2 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 변경 내역이 있으면 내역 전체, 없으면 현재 선택 요소의 위치 정보를 한국어 마크다운 구현 프롬프트로 만들어 클립보드에 복사한다(복사는 읽기 전용, MCP 전송과 병행).
- 프롬프트 생성은 순수 모듈 `packages/extension/src/prompt.ts`(`buildPrompt`)로 분리하고 단위 테스트 19케이스로 AC-1~AC-6을 고정했다.
- 패널 `AI 프롬프트 복사` 버튼은 `navigator.clipboard` → `execCommand('copy')` 폴백 순서로 쓰고, 실패 시 FR-8 오류 문구만 표시한다.

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/prompt.ts` | 신규 | 111줄 — `buildPrompt`·`PromptInput`·`PromptSelection`(위치·조상 위치·`위치 미확인` 표기, 인라인 코드 이스케이프, 대조 안내 지시문) |
| `packages/extension/test/prompt.test.ts` | 신규 | 200줄 — 19케이스(AC-1~AC-5, AC-6 후반 절대 경로 문자열 부재) |
| `packages/extension/src/content.ts` | 수정(+78/−2) | `SendHandlers.promptInput`·`copyText` 폴백(`navigator.clipboard`→`execCommand`)·복사 버튼·`onCopy` 상태 표시·`EditSession.promptInput`·`.send` flex-wrap |
| `README.md` | 수정(+2) | AI 프롬프트 복사 사용법 1단락(MCP 미사용 도구용, 내역 유지, 페이지 URL 포함 고지) |
| `git diff --shortstat 6d85bda..ee5125b` | — | **7 files changed, 405 insertions(+), 4 deletions(-)** — 버전 0.1.43→0.1.44 자동 범프(`CHANGELOG.md`·`VERSION_HISTORY.md`·`package.json`) 포함 |

- 계약 경로(`packages/shared`·`packages/server`·`packages/extension/manifest.json`)는 diff 0(AC-6).

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 2 산정·§2 실행 순서(구현 단계 `code-planner`·`code-tester` 교차 검증으로 Tier 2 유지) |
| 정적 분석·린트 | Pass | `pnpm lint` Exit 0 · `pnpm typecheck` Exit 0 |
| 단위·통합 테스트 | Pass | `pnpm test` Exit 0 — **25 files / 291 tests**(`prompt.test.ts` 19케이스 포함) |
| 빌드 | Pass | `pnpm build` Exit 0 |
| 수용 기준 | Pass | AC-1~AC-8 전건 PASS(spec §8 대조) |
| 브라우저 검증(ego→Aside→Playwright) | Pass(도구 폴백) | ego-browser는 언팩 MV3 익스텐션 로드 미지원, Aside MCP는 도구 미노출 → 캐시된 Chrome for Testing 145 + CDP. `examples/react-vite`(5199)·서버(47321)에서 ① 선택 요소 프롬프트 클립보드 확인 ② `padding-top 0px→17px` 내역 1건 복사·복사 후 건수 유지 ③ 무선택 시 FR-4 문구 ④ `전송 완료: 1건` 회귀 없음, 콘솔 에러 0건 |
| 회귀(기존 기능) | Pass | 기존 `에이전트에 보내기`·`renderChanges`·dispose 리스너 해제 정상(AC-7 ④ 실측) |
| 인코딩 | Pass | 신규·수정 파일 CR 0·BOM 없음 — `git ls-files --eol` = `i/lf w/lf` |
| 전역 배포(sync/Status) | 미수행(사유: 애플리케이션 저장소로 배포 자산 경로·`sync` 대상 아님) | 해당 없음 |
| 정합성 게이트 | `조건부-실행` / 근거: §A 4호(저위험 ①·③ 미충족) / 방식: 1-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록 |

## 정합성 게이트
- **등급**: `조건부-실행`
- **판정 근거**: §A 4호 — 1~3호 미해당(Tier 2, 배포·계약 자산 경로 변경 0, 브레이킹 체인지·보안 신호 없음)이며 저위험 3조건 중 ①(변경 파일 ≤3개·단일 모듈)·③(FR+AC ≤3건) 미충족
- **검증 방식**: 1-pass
- **판정**: `PASS_WITH_NOTES` — 차단 NOTE 0건
- **미검증(정합성)**: 해당 없음

### 비차단 NOTE (conformance-reviewer, 3건)
1. `execCommand('copy')` 폴백 경로는 실행 미확인 — 비보안 출처 한정 보조 경로이며, 코드상 호출 순서·`finally` 정리·실패 시 FR-8 문구 전환은 확인됨.
2. spec이 인용한 `README.md:263`·`:283`이 현재 `:274`·`:295`로 드리프트 — 인용 문장 자체는 실존하고 plan Step 1이 심볼 기준 재확인을 허용하므로 판정 영향 없음.
3. `(빈 값)` 판정이 `after.trim() === ''`으로 공백-only까지 확장 — E-3 요구를 충족하며 정보 손실 없음.

### 설계 이탈 판정 (1건)
- 인라인 코드 펜스 최소 길이를 "최소 2"로 본 구현자 보고는 오해이며, spec E-2 원문("최장 연속 백틱+1")과 구현이 일치한다 — **spec 위반 아님**.

## 잔여 리스크 및 후속
- `execCommand('copy')` 폴백의 비보안 http 출처 실측은 미수행(폴백 코드 경로·실패 문구 전환만 확인).
- 페이지 URL 쿼리 토큰이 프롬프트를 거쳐 외부 AI 도구로 전달될 수 있음 — README 1줄 고지 완료(spec R-3).
- 패널 폭이 좁으면 복사 버튼이 2행으로 랩(의도된 `.send` flex-wrap).
- 후속: [INT-008](../../planned/INT-008-release-inline-override-after-apply/intent.md)(인라인 `!important` 원복) 등 `planned` 백로그.
- 롤백: `git revert ee5125b` 또는 `git checkout 6d85bda -- packages/extension README.md`.

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 커밋: `ee5125b`(구현 — `6d85bda..ee5125b`, 7 files changed, 405 insertions(+), 4 deletions(-))
- 워크로그: 미기록(저장소에 `docs/works/` 없음)
