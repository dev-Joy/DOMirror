# Plan: 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스
- Intent: [INT-007](intent.md) | Tier: 3 | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T16:00:20+09:00
- Spec: [spec.md](spec.md)

## 1. Tier 산정
- **Tier 3 (Strict)**. 근거는 다음과 같다.
  - shared·plugin·extension·server 4개 패키지와 README에 걸친 변경이다.
  - 공개 계약을 확장한다: `InjectorContext`, `StyleChange.source`, MCP `list_pending_changes` `outputSchema`·description(spec R-2).
  - 모든 보호 대상 요소에 새 속성을 주입한다.
  - 브라우저 → 서버 → MCP 종단 확인(AC-8)이 필요하다.
- 하드 게이트 후보: 이 저장소에는 `[배포·계약 자산 경로]`(`src/prompts/` 등)가 없다. MCP 응답 확장은 공개 계약 변경(선택 필드, 비파괴)이므로 §A 3호 ②에도 해당한다.

## 2. 실행 순서 (Steps)
0. **선행 조건 확인**
   - spec §10 Q1이 확정되어 있어야 한다. (a) 외로 확정되면 spec §4·§6과 이 plan을 다시 쓴다(`z_skill_intent_to_specplan`).
   - INT-004가 `done`이거나 최소한 React·Vue 주입기·익스텐션·예제·README 단계(INT-004 T-03~T-08)가 커밋되어 있어야 한다(spec R-1). 미충족이면 착수하지 않는다.
   - 인계 지시상 하네스를 zAgentSet에 두지 않으므로(답변 1) INT-003과의 순서 조율은 필요 없다.
   - 롤백: 해당 없음(확인만).
1. **shared**
   - `constants.ts`에 `DOMIRROR_PROTECTED_ATTR`를 추가한다(FR-4).
   - `types.ts`: `InjectorContext.isProtected?`(FR-2), `StyleChange.source.protected?`(FR-6), `ProtectedAreaWarning`·`PendingChange`(spec §6)를 추가한다.
   - 롤백: `git checkout -- packages/shared`.
2. **plugin core**
   - `core.ts` `DomirrorOptions.protected?`를 추가한다(FR-1).
   - `vite.ts:20-28`에서 `createDesignSystemMatcher(options.protected ?? options.designSystem ?? [])`의 `file` 판정으로 `isProtected`를 만들어 `createTransformer`에 넘기고, 코어가 ctx로 전달한다(FR-2).
   - `inject-utils.ts`에 `protectedAttributeText()`를 추가한다.
   - AC-1 테스트를 `core.test.ts`에 추가한다.
   - 롤백: `git checkout -- packages/plugin/src/core.ts packages/plugin/src/vite.ts packages/plugin/src/inject-utils.ts packages/plugin/test/core.test.ts`.
3. **주입기**
   - React(`react.ts:133-138`)와 Vue(`vue.ts:155-160`)의 정의 측 텍스트에 FR-3 속성을 붙인다. 사용처 측 분기는 건드리지 않는다.
   - AC-2 테스트(`react.test.ts`·`vue.test.ts`)와 AC-3 단언(`vite.integration.test.ts`)을 추가한다.
   - 롤백: 해당 파일과 테스트 checkout.
4. **익스텐션**
   - `source-locator.ts` `Located`에 `protected: boolean`을 추가하고 `locate`(`:31`)가 찾은 요소의 `DOMIRROR_PROTECTED_ATTR`로 정한다(FR-5·E-1).
   - `content.ts:336`에서 `source`에 `protected: located.protected`를 넣는다.
   - AC-4 테스트를 `source-locator.test.ts`에 추가한다. 기존 `change-log.test.ts`가 통과하는지 확인한다(E-4).
   - 롤백: `git checkout -- packages/extension`.
5. **서버**
   - `schema.ts:8-13` `source`에 `protected: z.boolean().optional()`(FR-6), `ProtectedAreaWarningSchema`·`PendingChangeSchema`를 추가한다.
   - `withProtectionWarning`(FR-7·FR-8)을 새 모듈(예: `packages/server/src/protection.ts`)에 둔다.
   - `mcp.ts:30` outputSchema를 `PendingChangeSchema`로, `:33` 핸들러를 `store.listPending().map(withProtectionWarning)`으로, `:27-29` description을 갱신한다(FR-9).
   - AC-5 테스트를 추가한다.
   - 롤백: `git checkout -- packages/server`.
6. **README**: 옵션 표·MCP 도구 표(`:140`)·`StyleChange` 필드(`:143`)·알려진 한계(`:270`)를 갱신한다(FR-10). 롤백: `git checkout -- README.md`.
7. **전수 검증**: §4의 명령과 AC-8 종단 확인을 실행한다. 롤백: 해당 없음.

## 3. Intent 태스크 매핑
- `intent.md`의 `T-01 [P2] (착수 시 분해 예정)`을 착수 시 아래처럼 분해한다(분해 기록은 착수 전이 때 `intent-manager`가 수행).
  - `T-01` shared 상수·타입 → Step 1
  - `T-02` plugin core 옵션·판정 → Step 2
  - `T-03` React·Vue 주입기 → Step 3
  - `T-04` 익스텐션 `source.protected` 전달 → Step 4
  - `T-05` 서버 스키마·`warning`·도구 description → Step 5
  - `T-06` README → Step 6
  - Step 0(선행 조건)과 Step 7(전수 검증)은 태스크가 아닌 게이트·검증 단계다.
- 제안 결과 매핑
  - "수정 금지 영역을 고치려 하면 경고가 나온다" → `T-05`(경고 생성), `T-03`·`T-04`(판정 전달)
  - "사용자가 수정 금지 영역을 정할 수 있다" → `T-02`(옵션·폴백), `T-06`(문서)
  - "경고를 보고 반영 여부를 판단" → `T-05`(고정 안내 1줄·description)

## 4. 검증 계획 (DoD)
- code-tester(Tier 3) 전수 확인
  - `pnpm build`, `pnpm typecheck`, `pnpm lint`(oxlint), `pnpm test`(vitest)가 모두 Exit 0이어야 한다(AC-6).
  - 신규 단위 테스트 AC-1~AC-5가 통과해야 한다.
  - 기존 `http.integration.test.ts` E2E(`:71`)와 react·vue 위치 단언이 변경 없이 통과해야 한다(NFR-1·NFR-4).
  - `rg -n "protected|warning" README.md`(AC-7)
  - `git diff -- packages/*/package.json` 의존성 변경 0줄(AC-6)
- 종단(AC-8)
  - 실행: `pnpm --filter @domirror/server` 빌드 후 서버 기동(기본 포트 47321), `DOMIRROR=1 pnpm --filter example-react-vite dev`(5173)
  - 확인: 익스텐션으로 `src/ds/` 요소와 `Card` 요소를 각각 편집해 보낸 뒤 MCP `list_pending_changes`(또는 동일 핸들러를 호출하는 통합 테스트)에서 `warning` 유무를 확인하고, 콘솔 에러 0건을 확인한다.
  - 도구 순서: ego-browser → Aside MCP → Playwright. 익스텐션 로드가 불가하면 `POST /changes`에 `source.protected: true` 본문을 직접 보내는 대체 확인과 미수행 사유를 보고한다.
- 게이트: 필수(하드) / 근거: ① Tier 3, ② 공개 계약 변경(MCP 응답·`InjectorContext` 확장) / 방식: 2-pass
- Tier 3 완료 조건: 전체 빌드·정적 분석(타입 검사·린트)·테스트 통과 + 브라우저 검증(콘솔 에러 0건, 정상 렌더링)

## 5. 리스크 · 파급
- **전달 경로 미확정**(spec §10 Q1): (a) 외로 확정되면 Step 2~5가 바뀐다. Step 0에서 차단한다.
- **INT-004와 파일 충돌**(spec R-1): Step 0에서 INT-004 진행 상태를 확인하고 완료 후 착수한다.
- **공개 계약 확장**(spec R-2): 모두 선택 필드다. 구버전 익스텐션 요청도 수용한다(E-4).
- **에이전트가 경고를 무시**(spec R-3): description·README로 안내한다. 차단은 범위 밖(답변 3).
- **빌드 시점 판정**(spec R-4): 패턴 변경 시 재변환이 필요하다는 점을 README에 적는다.
- **파급 범위**: shared·plugin·extension·server·README. 익스텐션 UI·`mark_changes_applied`·zAgentSet에는 영향이 없다.
- **결정 계승**: intent D-01(P2)·D-02(별도 intent)와 spec D-S1~D-S4. 범위 밖 항목은 차단, 익스텐션·zAgentSet 경고 UI, INT-003·INT-004 소관 기능이다.

## 6. 실행 흐름
```mermaid
flowchart TD
  S0[Step 0 선행 조건: §10 Q1 확정 · INT-004 완료] -->|미충족| W[(대기 또는 specplan 재실행)]
  S0 -->|충족| S1[Step 1 shared 상수·타입]
  S1 --> S2[Step 2 plugin core protected 옵션·폴백]
  S2 --> S3[Step 3 React·Vue 정의 측 data-domirror-protected]
  S1 --> S4[Step 4 익스텐션 locate → source.protected]
  S1 --> S5[Step 5 서버 스키마·warning·description]
  S3 --> S6[Step 6 README]
  S4 --> S6
  S5 --> S6
  S6 --> S7[Step 7 code-tester Tier 3 + 종단 확인]
  S7 --> S8[conformance-reviewer 필수(하드) 2-pass]
```
