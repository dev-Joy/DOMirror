# Result: AI 프롬프트에 자가 점검 목록·반영 결과 확인 단계 추가
- Intent: [INT-010](intent.md) | 완료일: 2026-11-18 | Tier: 2 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- `buildPrompt` 출력 말미에 `## 자가 점검`·`## 반영 확인` 두 섹션을 붙여, 받는 에이전트가 과잉 수정·누락을 스스로 검출할 기준을 갖는다(내역 전체·선택 요소 두 모드 모두 적용).
- 섹션 문구는 DOM·chrome·location 미의존 순수 헬퍼 `changesFooter(count)`·`selectionFooter()`로 분리했고, 빈 내역에는 섹션을 붙이지 않아 기존 "머리만" 계약(D-S1)을 유지했다.
- `buildPrompt` 시그니처·`PromptInput`·`PromptSelection`·export·호출처 변경 0건, 신규 의존성 0건. 기존 19개 테스트 단언 수정 없이 신규 4케이스만 추가해 23케이스 전건 통과.

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/extension/src/prompt.ts` | 수정(111→146행) | 모듈 내부 `changesFooter(count: number): string[]`·`selectionFooter(): string[]` 추가(`## 자가 점검`·`## 반영 확인`), `changesPrompt`의 return 직전 `if (changes.length > 0) lines.push(...changesFooter(changes.length));`, `selectionPrompt` 배열에 `...selectionFooter(),` |
| `packages/extension/test/prompt.test.ts` | 수정(200→246행) | 신규 `describe('buildPrompt — 자가 점검·반영 확인 (AC-1~AC-4)')` 4케이스. 기존 19개 테스트 단언 수정 0건 |
| `README.md` | 수정(문서 정정 동반) | AI 프롬프트 복사 절에 두 섹션 설명 1문장 추가(출력과 문서 불일치 해소) |
| `docs/intent/**/INT-010-*/spec.md`·`intent.md` | 수정(스테일 정정) | `경로:라인` 참조 정정 — content.ts:287→333·467~471→519~524, README 161/163/177/179→162/164/178/180, prompt.ts:107/108→142/143 |

- 계약 경로(`packages/shared`·`packages/server`·`packages/extension/manifest.json`)·MCP·플러그인 diff 0건(FR·NFR-3).
- 코드 diff 합계: **2 files changed, +81 insertions, 0 deletions**(`prompt.ts`·`prompt.test.ts`).

## 요구 충족
| 구분 | 항목 | 결과 | 증거 |
| :--- | :--- | :--- | :--- |
| FR | FR-1 내역 모드 자가 점검(항목 수·`after` 일치·무관 diff 0건) | PASS | `prompt.ts` `changesFooter(count)` — 항목 수 삽입, `changes.length > 0` 조건 호출 / AC-1 테스트 |
| FR | FR-2 선택 모드 자가 점검 | PASS | `selectionFooter()` → `selectionPrompt` 배열 말미 / AC-3 테스트 |
| FR | FR-3 내역 모드 반영 확인(별도 브라우저·`after` 비교·같은 탭 금지 이유·도구 부재 폴백) | PASS | `changesFooter` 내 `## 반영 확인` 블록(chrome-devtools-mcp·별도 브라우저·`!important`·새로고침) / AC-2 테스트 |
| FR | FR-4 선택 모드 반영 확인(요청한 변경 기준) | PASS | `selectionFooter()` — `after` 비교 문구 없음 / AC-3 테스트 |
| FR | FR-5 빈 내역 두 섹션 미부착(기존 "머리만" 유지) | PASS | `if (changes.length > 0)` 가드 / AC-4 테스트 |
| FR | FR-6 단위 테스트 추가·기존 전건 통과 | PASS | `prompt.test.ts` 신규 describe 1개(4케이스), 23 passed |
| NFR | NFR-1 최소 변경(머리·항목 문구·순서 유지, 말미 추가) | PASS | 기존 19케이스 단언 수정 0건 통과 |
| NFR | NFR-2 순수 함수 유지(DOM·chrome·location 미의존) | PASS | 신규 헬퍼 2개 모두 인자→`string[]` 순수 |
| NFR | NFR-3 신규 의존성 0건·MCP 계약 변경 0건 | PASS | `package.json`·`packages/shared`·MCP diff 0건 |
| NFR | NFR-4 기존 단언 비충돌 문구 회피·`## ` 헤더 | PASS | 금지 토큰(`- 페이지: `·`### `·`- 위치: `·`- 주의:`·`조상 위치`·`직접 찾아`·`Vite 루트 기준`·`/Users`·`~/`·`file://`) 미사용, 헤더 `## ` |
| NFR | NFR-5 환경(macOS Darwin, Chrome MV3) 재현 | PASS | 재현: 패널 `AI 프롬프트 복사` 출력에 두 섹션 존재 |
| NFR | NFR-6 `pnpm test`·`pnpm lint`·`pnpm typecheck` Exit 0 | PASS | 아래 검증 결과 수치 |
| AC | AC-1 내역 2건 — 두 섹션 각 1회·순서·항목 수 `2` | PASS | 신규 케이스 1 |
| AC | AC-2 반영 확인 4개 문구 포함 | PASS | 신규 케이스 2 |
| AC | AC-3 선택 모드(위치 있음·없음) 두 섹션·`after` 문구 없음·`새로고침` 포함 | PASS | 신규 케이스 3 |
| AC | AC-4 빈 내역에 `## 자가 점검` 부재 | PASS | 신규 케이스 4 |
| AC | AC-5 기존 테스트 단언 수정 없이 전건 통과 | PASS | 기존 19케이스 무수정 23 passed |
| AC | AC-6 `pnpm test`·`lint`·`typecheck` Exit 0 | PASS | 아래 실측 |
| D-S | D-S1~D-S4(빈 내역 미부착·`## ` 헤더·URL 재기재 금지·선택 모드 `after` 미사용) | PASS | 구현·테스트 대조 |
| 불변 | `buildPrompt` 시그니처·타입·export·호출처(`content.ts`) 변경 0건 | PASS | diff 0건(NFR-1·plan §5) |

- conformance-reviewer 1-pass 대조: 요구 **28/28 항목 증거 충족**(FR 6 + NFR 6 + AC 6 + D-S 4 + 불변 계약 6), 판정 `PASS_WITH_NOTES`.

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 2 산정(`packages/extension/**`는 배포·계약 자산 경로 아님·하드 게이트 후보 아님)·§2 실행 순서 |
| 정적 분석·린트 | Pass | `pnpm lint`(oxlint .) Exit 0 · `pnpm typecheck` Exit 0 — code-tester 실측 |
| 단위·통합 테스트 | Pass | `pnpm vitest run packages/extension/test/prompt.test.ts` Exit 0 — **23 passed**(기존 19 + 신규 4) / `pnpm test` Exit 0 — **348 passed(29 files)** |
| 브라우저 검증(ego→Aside→Playwright) | 미수행(사유: Tier 2·출력이 순수 함수 문자열 — plan §4 "브라우저: 생략, 단위 테스트로 충분") | 해당 없음 |
| 전역 배포(sync/Status)·인코딩 | 인코딩 Pass / 배포 미수행(사유: 애플리케이션 저장소로 `sync` 대상 아님) | UTF-8·LF, `grep -c $'\r'` = 0/0(신규·수정 파일) |
| 정합성 게이트 | `조건부-실행` / 근거: §A 4호 — 저위험 조건 ③ 미충족(FR 6 + AC 6 = 12 > 3) / 방식: 1-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록 |
| conformance-reviewer | PASS_WITH_NOTES | 요구 28/28 증거 충족, 비차단 NOTE 3건(아래) |

### 정합성 게이트
- **등급**: `조건부-실행` — 1~3호 미해당(Tier 2, `[배포·계약 자산 경로]` 변경 0건, 브레이킹 체인지·보안 신호 없음)
- **판정 근거**: §A 4호(저위험 3조건 중 ③ FR+AC 12건 > 3 미충족, ①·②는 충족)
- **검증 방식**: 1-pass / **판정**: `PASS_WITH_NOTES` — 차단 NOTE 0건

### 비차단 NOTE (conformance-reviewer, 3건 → 조치)
1. spec §3 참조 라인 스테일 → 구현 중 `content.ts:333`·`:519~524`, `prompt.ts:142/143`, `README:162/164/178/180`으로 정정 완료(해소).
2. 선택 모드 문구의 "이 익스텐션" 표현 — spec §6 문구 조정 허용 범위 내, 판정 영향 없음.
3. `README.md:264` 두 섹션 미언급 → README AI 프롬프트 복사 절에 설명 1문장 반영 완료(해소).

## 잔여 리스크 및 후속
- 익스텐션 패널 클립보드 육안 확인 미실시 — plan §4가 순수 함수 문자열이라 단위 테스트로 대체를 명시(브라우저 도구 부재 아님, 계획상 생략).
- R-1 프롬프트 길이 증가(섹션당 3줄 안팎 유지로 완화) / R-2 받는 에이전트에 브라우저 도구가 없으면 확인은 사용자 몫(의도된 폴백).
- 후속: [INT-003](../../planned/INT-003-zagentset-domirror-skill/intent.md)(zAgentSet용 DOMirror 스킬·서브에이전트 연동) 등 `planned` 백로그.
- 롤백: `git checkout HEAD~1 -- packages/extension/src/prompt.ts packages/extension/test/prompt.test.ts README.md`(커밋 해시 확정 전 기준).

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(저장소에 `docs/works/` 없음) · 커밋: - (미확정, 별도 단계에서 수행)
