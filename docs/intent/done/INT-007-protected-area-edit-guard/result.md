# Result: 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스
- Intent: [INT-007](intent.md) | 완료일: 2026-11-18 | Tier: 3 (Strict, `plan.md` §1) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 플러그인이 보호 대상 정의 측 요소에 `data-domirror-protected`를 주입하고(React·Vue), 익스텐션이 `source.protected`로 서버에 전달하며, 서버 `list_pending_changes`가 선택 필드 `warning`(패턴·`node_modules` 사유 + 고정 안내 1줄)을 계산해 응답한다. 차단은 하지 않는다(spec §1 답변 3).
- 보호 영역은 옵션 `protected` 경로 패턴으로 정하고 미설정 시 `designSystem` 패턴으로 폴백하며 `node_modules`는 항상 포함한다(FR-1·FR-2, E-3).
- 구현 커밋 7건(`a678e76`→`76f26be`, base `0bb4c00`)으로 shared·plugin·extension·server·README를 갱신했고, Tier 3 전수 검증(26파일/317케이스)과 정합성 2-pass를 통과했다.

## 변경 산출물
`git diff --shortstat 0bb4c00..HEAD -- packages README.md`: **20 files changed, 491 insertions(+), 28 deletions(-)**

| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/shared/src/constants.ts`·`types.ts` | 수정 | `DOMIRROR_PROTECTED_ATTR` 상수, `InjectorContext.isProtected?`, `StyleChange.source.protected?`, `ProtectedAreaWarning`·`PendingChange` 타입 |
| `packages/plugin/src/core.ts`·`vite.ts` | 수정 | 옵션 `protected`·`designSystem` 폴백, `protectedPatterns` 도출, `isProtected` 판정 배선 |
| `packages/plugin/src/inject-utils.ts`·`injectors/react.ts`·`injectors/vue.ts` | 수정 | `protectedAttributeText` 주입 헬퍼, 정의 측 표식 주입·사용처 측 미주입·중복 방지 |
| `packages/extension/src/source-locator.ts`·`content.ts` | 수정 | `Located.protected`(위치 제공 요소 기준 판정), `POST /changes` 본문에 `source.protected` 전달 |
| `packages/server/src/schema.ts`·`protection.ts`·`mcp.ts` | 수정·신규 | zod `source.protected`·`ProtectedAreaWarning`·`PendingChange`, `withProtectionWarning`(신규 `protection.ts`), `outputSchema`·description·핸들러 |
| `packages/plugin/test/core.test.ts`·`react.test.ts`·`vue.test.ts`·`vite.integration.test.ts` | 수정 | AC-1~AC-3(보호 판정·정의 측 주입·사용처 미주입·`enabled:false` 0건 단언) |
| `packages/extension/test/source-locator.test.ts`·`prompt.test.ts` | 수정 | AC-4(`Located.protected` 판정), 프롬프트 픽스처 필드 정합 |
| `packages/server/test/protection.test.ts` | 신규 | AC-5(`warning` 생성 조건·레거시 본문 수용·동일 id 경고 소멸·`text`=`structuredContent`) |
| `README.md` | 수정 | 옵션 표·MCP 도구 표·`StyleChange` 필드·알려진 한계 4개 지점 |
| `packages/*/package.json` | 변경 없음 | 의존성 변경 0줄(AC-6) |

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 — `plan.md` §1 Tier 3 산정, §2 Step 1~7, §4 DoD·롤백 명세 | `plan.md`(2026-11-17 작성) |
| 정적 분석·린트 | Pass — `pnpm lint`(oxlint) Exit 0 | `code-tester` 원시 출력(Exit 0) |
| 타입 검사·빌드 | Pass — `pnpm typecheck`·`pnpm build` Exit 0 | `code-tester` 원시 출력(Exit 0) |
| 단위·통합 테스트 | Pass — `pnpm test` 26 files / 317 cases 통과 | `code-tester` 원시 출력 |
| AC-1~AC-7 | Pass — core 판정·주입기 정의/사용처·통합 0건 단언·위치 판정·서버 `warning`·전수 명령·README 문구 전건 충족 | `code-tester` 보고 + 커밋 `60b7dbb`·`faad444`·`a2c5e2c`·`40cbaa6`·`29a06ef` |
| AC-8 (종단) | Pass(대체 경로) — ego-browser 5173: `src/ds/Button.tsx` 요소에 `data-domirror-protected` 존재·`Card` 부재·콘솔 에러 0건, `POST /changes` → MCP `list_pending_changes` 실측에서 `pattern`·`node_modules` 우선·경고 부재·레거시 본문 200 수용·동일 id 재전송 시 경고 소멸·`text`와 `structuredContent` 일치 | `code-tester` 보고(익스텐션 실편집 미수행 — plan §4 허용 대체 확인) |
| 브라우저 검증(ego→Aside→Playwright) | Pass(부분) — ego-browser DOM 검증 수행, MV3 익스텐션 실제 클릭 편집 1구간 미수행(사유: ego-browser에서 MV3 익스텐션 로드 불가) | `code-tester` 원시 출력 |
| 전역 배포(sync/Status)·인코딩 | 해당 없음 — 이 저장소에 `[배포·계약 자산 경로]` 없음(`plan.md` §1 하드 게이트 후보: 해당 없음) | `plan.md` §1 |
| 정합성 게이트 | `필수(하드)` / 근거: ① Tier 3, ② 공개 계약 변경(MCP `outputSchema`·`InjectorContext`·`StyleChange.source`) / 방식: **2-pass** / 미검증: 해당 없음 | 아래 이력 |
| conformance-reviewer 1차(순방향) | `PASS_WITH_NOTES` — FR·NFR·AC 항목별 `파일:라인` 증거 대조, 완료를 막는 결함 0건 | 판정 리포트 요약 |
| conformance-reviewer 2차(반증 전용) | `PASS_WITH_NOTES` — 1차 리포트를 입력에서 배제하고 반증 시도, 신규 결함 0건 | 판정 리포트 요약 |

### conformance-reviewer NOTE (모두 비차단)
- spec §3의 `경로:라인`은 기록 시점 HEAD `27d42bc` 기준이라 현재 트리와 오프셋이 있다 — 문서 이력 인용이며 구현 판정에는 영향 없음.
- spec §4 FR-3 "위치 속성 바로 뒤" 문구가 §6 예시·구현(같은 주입 텍스트 말미)과 어긋난다 — 속성 존재·값 판정에는 영향 없음.
- 한국어 용어 "수정 금지 영역"/"보호 영역" 혼용 — 코드 식별자(`protected`)는 일관.
- 커밋 `a678e76`에 INT-009·INT-010 요구 문서가 함께 스테이징됨(전체 스테이징 동작) — 코드 영향 0건.
- AC-8의 익스텐션 실제 편집 1구간은 수동 확인 미수행 — plan §4가 허용한 대체 확인으로 대체.
- `docs/code-asset-index/COMPONENTS.md`에 신규 shared 타입 2종 미등재 — 인덱서 재실행 시 반영.

## 잔여 리스크 및 후속
- 후속 intent 후보: `docs/code-asset-index/COMPONENTS.md` 재인덱싱으로 `ProtectedAreaWarning`·`PendingChange` 등재, spec §4 FR-3 문구 정정(재구현 시).
- 알려진 제약: 보호 판정은 빌드 시점 패턴 기준이라 패턴 변경 시 재변환 필요(README 알려진 한계), 익스텐션·zAgentSet 경고 UI는 범위 밖(답변 1), 차단 없음(답변 3).
- 알려진 제약: 완료 전이에서 `intent.md` `updated_at`을 갱신(2026-11-18T00:27:27+09:00)했고 spec/plan의 `Intent updated_at`(2026-11-17T16:00:20+09:00)은 게이트 기록 보존을 위해 의도적으로 유지 — 두 문서는 요구 변경 시 `z_skill_intent_to_specplan` 재실행 대상.
- 롤백: `git revert 76f26be 29a06ef 40cbaa6 a2c5e2c faad444 60b7dbb a678e76` 또는 `git checkout 0bb4c00 -- packages README.md`.

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 워크로그: 미기록(사유: 저장소에 `docs/works/` 없음)
- 주요 커밋: `a678e76` shared 상수·타입 · `60b7dbb` plugin `protected` 옵션 · `faad444` React·Vue 정의 측 표식 · `a2c5e2c` 익스텐션 `source.protected` · `40cbaa6` 서버 `warning` · `29a06ef` README · `76f26be` 주입 헬퍼 주석 FR 참조 교정 (base `0bb4c00`)
