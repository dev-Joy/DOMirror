# Spec: 수정 금지 영역(공통 컴포넌트·디자인 시스템 원본) 수정 경고 하네스
- Intent: [INT-007](intent.md) | Status: planned | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T16:00:20+09:00

## 1. 개요
- 원 요구: IDEA-20261115-06 "에이전트가 고치면 안 되는 영역(공통 컴포넌트·디자인 시스템 원본) 수정 시 경고하는 하네스". 출처는 _ideas IDEA-20261115-06과 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 하네스이며, INT-001·IDEA-20261115-02와 연계된다.
- 문제: 브라우저에서 보낸 CSS 변경의 소스 위치가 공통 컴포넌트나 디자인 시스템 원본 파일을 가리키면, 에이전트가 그 원본을 그대로 고쳐 다른 화면까지 바뀔 수 있다. 서버는 위치를 검증하지 않고 반영 품질을 에이전트에 맡긴다(`README.md:283`).
- 목표: MCP `list_pending_changes` 응답의 변경 항목에 선택 필드 `warning`을 붙인다. 이 필드는 해당 위치가 수정 금지 영역이라는 사실과 고정 안내 1줄을 담는다. 차단은 하지 않는다.
- 확정된 intent 답변(2026-11-17)
  1. 위치: DOMirror MCP `list_pending_changes` 응답 항목의 선택 경고 필드. 하네스(zAgentSet)와 무관하게 동작한다. 익스텐션·zAgentSet 쪽 경고 UI는 범위 밖이다.
  2. 영역 정의: 플러그인 설정의 protected 경로 패턴. 미설정이면 INT-004 `designSystem` 패턴을 재사용한다. `node_modules`는 항상 포함한다.
  3. 수준: 경고만 한다. 반영 전 사용자 확인을 권하는 안내를 붙이고 판단은 에이전트·사용자에게 맡긴다.
  4. 대안 안내: 경고에 고정 안내 1줄(사용처 쪽 스타일 덮어쓰기 또는 원본 수정 여부를 사용자에게 확인)을 넣는다.
- 설계 쟁점(조사 결론): 서버는 플러그인 설정을 알 방법이 없다(§3 서버). 그래서 보호 판정 결과를 서버까지 전달하는 경로가 필요하다. 이 spec은 **플러그인이 DOM 속성으로 표시 → 익스텐션이 `source.protected`로 전달 → 서버가 `warning` 생성**(D-S1, 권장안)으로 작성했으며, 이 선택은 §10 Q1에서 확정한다.
- 인계: 이 문서와 `plan.md`만으로 새 세션이 구현과 검증을 수행할 수 있게 작성했다(§9 대조표).

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - 플러그인 옵션 `protected?: string[]` 추가와 `designSystem` 폴백
  - 정의 측 요소에 `data-domirror-protected` 속성 주입(React·Vue)
  - 익스텐션 `locate` 결과에 보호 여부를 담아 `source.protected`로 전송(UI 변경 없음)
  - shared 타입·서버 zod 스키마에 `source.protected?`와 응답 `warning?` 추가
  - 서버 `list_pending_changes` 응답 생성 시 `warning` 계산(패턴 표시 또는 `node_modules` 경로)
  - `list_pending_changes` 도구 description에 `warning` 안내 추가
  - README(옵션 표·MCP 도구 표·`StyleChange` 필드·알려진 한계) 갱신
- Out-of-scope (intent 범위 밖·전제)
  - 수정 차단·사용자 확인 대기(답변 3: 경고만)
  - 익스텐션 패널·호버의 보호 영역 경고 UI, zAgentSet 스킬·훅 경고(답변 1)
  - 디자인 시스템 컴포넌트 표시(INT-004 소관)와 스킬 구현(INT-003 소관)
  - `mark_changes_applied` 입출력 변경
  - 서버의 설정 파일·CLI 인자 추가(D-S1에서 기각, §10 Q1 확정 대상)

## 3. 영향 시스템 · 모듈 · 데이터
2026-11-17 HEAD `27d42bc` 실측 기준이다(researcher 보고 + 오케스트레이터 스팟 확인).

### 서버 (`packages/server`)
- MCP 도구: `packages/server/src/mcp.ts`
  - `jsonResult`: `:11-16`. `content` 텍스트(`:13`)와 `structuredContent`(`:14`)에 같은 값을 담는다.
  - `list_pending_changes` 이름 `:24`, description `:27-29`, `outputSchema: z.object({ changes: z.array(StyleChangeSchema) })` `:30`, 핸들러 `:33` `() => jsonResult({ changes: store.listPending() })`
  - `mark_changes_applied` 이름 `:37`, description `:40`, outputSchema `:42`
- zod 스키마: `packages/server/src/schema.ts`
  - `StyleChangeInputSchema` `:6-23`(`source` 객체 `:8-13`), `satisfies z.ZodType<StyleChangeInput>`
  - `StyleChangeSchema` `:25-27`, `PostChangesRequestSchema` `:29-31`
  - `z.object`는 모르는 키를 제거한다(zod 기본 동작, 추론). 따라서 `source.protected`를 스키마에 추가하지 않으면 저장 단계에서 사라진다.
- 저장소: `packages/server/src/store.ts:5` `Map<string, StyleChange>`(메모리), `listPending` `:15-17`
- HTTP: `packages/server/src/http.ts:115` `POST /changes` → `handlePostChanges`(`:68`) → `safeParse`(`:80`) → `store.upsert`(`:86`)
- 기동: `packages/server/src/cli.ts:23-28` `parseArgs` 옵션은 `port`·`extension-id`뿐이다. 설정 파일·cwd·루트 관련 입력은 0건이다. **서버는 Vite 루트와 플러그인 설정을 알 수 없다.**
- 의존성: `@domirror/shared`, MCP SDK, zod. `@domirror/plugin`에 의존하지 않는다.

### shared (`packages/shared`)
- `packages/shared/src/types.ts`
  - `InjectorContext` `:6-10`, `isDesignSystem?` `:9`
  - `StyleChange` `:19-29`, `source` `:21` `source: { file: string; line: number; column: number; inherited: boolean };`
  - `StyleChangeInput` `:31`
- `packages/shared/src/constants.ts:1-3` `DOMIRROR_ATTR`·`DOMIRROR_COMPONENT_ATTR`·`DOMIRROR_DS_ATTR`

### 플러그인 (`packages/plugin`)
- 옵션: `packages/plugin/src/core.ts:7-14` `DomirrorOptions`, `designSystem?: string[]` `:13`
- 판정 함수: `packages/plugin/src/design-system.ts`
  - `globToRegExp` `:13-35`(`*`·`**`, 전체 일치)
  - `createDesignSystemMatcher(patterns)` `:41-55`. `file`은 glob, `specifier`는 접두 일치. 빈 배열이면 `() => false`(`:47`).
- 연결: `packages/plugin/src/vite.ts:20-28` `configResolved`. `enabled`일 때만 `createTransformer`를 만들고 `:25`에서 `isDesignSystem`을 넘긴다.
- `node_modules` 제외: `packages/plugin/src/paths.ts:25`. 플러그인은 `node_modules` 파일에 위치를 주입하지 않는다.
- 정의 측 주입 지점
  - React: `packages/plugin/src/injectors/react.ts:133` `let text = attributeText(file, line, column);`, DS 속성 `:136`, 삽입 `:138`
  - Vue: `packages/plugin/src/injectors/vue.ts:155` `let text = attributeText(file, line, column);`, DS 속성 `:158`, 삽입 `:160`
- 속성 텍스트 헬퍼: `packages/plugin/src/inject-utils.ts` `attributeText` `:17-19`, `dsAttributeText` `:27-29`
- 테스트: `packages/plugin/test/core.test.ts:51-90` `describe('AC-1: designSystem 판정')`, `react.test.ts`, `vue.test.ts`, `vite.integration.test.ts`(`enabled:false` 0건 단언)

### 익스텐션 (`packages/extension`)
- 위치 해석: `packages/extension/src/source-locator.ts`
  - `Located` `:14-18`(`location`, `inherited`)
  - `locate` `:27-35`. `:31` `if (location) return { location, inherited: current !== el };`
  - `LocatableElement.getAttribute` `:10`
- 변경 생성: `packages/extension/src/content.ts:333` `const located = locate(el);`, `:336` `source: located ? { ...located.location, inherited: located.inherited } : null,`
- 로컬 변경 타입: `packages/extension/src/change-log.ts:6-8` `LocalChange.source: StyleChangeInput['source'] | null`. `sendable` `:50-55`는 `source`를 그대로 전송한다.
- 전송: `packages/extension/src/relay.ts` `postChanges` → `POST /changes`
- 테스트: `packages/extension/test/source-locator.test.ts`(`fake-element.ts`), `change-log.test.ts`

### README
- 플러그인 옵션 표 `README.md:76-77`(`designSystem` 행은 INT-004 Step 9에서 추가 예정)
- MCP 도구 표 `:138-141`(`list_pending_changes` 행 `:140`), `StyleChange` 주요 필드 `:143`
- 경로 노출 `:263` "위치 값은 Vite 루트 기준 상대 경로(`src/App.tsx:12:5`)이며 절대 경로·홈 경로는 들어가지 않습니다."
- 알려진 한계 `:270`, 위치 검증 없음 `:283`

### 테스트·명령
- 루트 `package.json`: `test`=`vitest run`, `lint`=`oxlint .`, `typecheck`=`pnpm --filter @domirror/shared build && pnpm -r typecheck`, `build`=`pnpm -r build`(pnpm@10.26.1)
- `vitest.config.ts:12` `include: ['packages/*/test/**/*.test.ts']`
- 서버 테스트: `packages/server/test/store.test.ts`, `http.integration.test.ts`(`:71` E2E 시나리오, `:84` `list_pending_changes` 호출)

## 4. 기능 요구사항 (FR-n)
- **FR-1 옵션**: `DomirrorOptions`에 `protected?: string[]`를 추가한다.
  - 유효 패턴 = `options.protected ?? options.designSystem ?? []`. `protected: []`를 명시하면 폴백하지 않는다(패턴 보호 없음).
  - 판정은 `createDesignSystemMatcher(유효 패턴)`의 `file` 판정만 쓴다(루트 기준 상대 경로 glob). specifier 항목은 파일 경로와 일치하지 않으므로 무시된다.
  - `enabled`가 false면 이 옵션은 무시하고 주입은 0건이다.
- **FR-2 주입기 컨텍스트**: `InjectorContext`에 선택 필드 `isProtected?: (file: string) => boolean`를 추가한다. 코어(`createTransformer`)와 `vite.ts`가 FR-1 판정 함수를 전달한다. 기존 커스텀 주입기와 호환되는 추가 변경이다.
- **FR-3 정의 측 속성 주입**: React·Vue 주입기가 `data-domirror`를 새로 주입하는 요소마다, `ctx.isProtected?.(file) === true`이면 `data-domirror-protected`를 값 없이 함께 넣는다.
  - 위치 속성 바로 뒤, 같은 `appendLeft` 텍스트에 포함한다.
  - `data-domirror-component` 존재 여부와 무관하게 판정한다.
  - 사용처 측(컴포넌트 태그) 주입에는 넣지 않는다.
  - 사용자가 직접 `data-domirror-protected`를 쓴 요소에는 중복 주입하지 않는다.
- **FR-4 shared 상수**: `packages/shared/src/constants.ts`에 `DOMIRROR_PROTECTED_ATTR = 'data-domirror-protected'`를 추가한다.
- **FR-5 익스텐션 전달**: `locate`가 찾은 요소(자신 또는 조상)에 `data-domirror-protected`가 있으면 `Located.protected = true`, 없으면 `false`를 반환한다. `content.ts:336`에서 `source.protected`로 넣어 기존 전송 경로로 보낸다. 익스텐션 UI는 바꾸지 않는다.
- **FR-6 계약 확장(입력)**: shared `StyleChange.source`에 `protected?: boolean`를 추가하고, 서버 `StyleChangeInputSchema.source`에 `protected: z.boolean().optional()`를 추가한다. 필드가 없는 기존 요청도 그대로 통과한다.
- **FR-7 경고 생성**: 서버는 `list_pending_changes` 응답을 만들 때 각 변경에 대해 아래 규칙으로 `warning`을 붙인다. 저장소에는 저장하지 않고 응답 시 계산한다.
  - `source.file`을 `/`로 나눈 세그먼트에 `node_modules`가 있으면 `reason: 'node_modules'`(우선)
  - 그 외 `source.protected === true`이면 `reason: 'pattern'`
  - 둘 다 아니면 `warning` 키를 넣지 않는다.
- **FR-8 경고 내용**: `warning`은 `{ code: 'protected-area', reason, message }`다. `message`는 고정 1줄(영문, D-S3)이며 아래 두 내용을 모두 담는다.
  - 원본 수정 시 다른 화면에도 영향이 간다는 사실
  - 사용처 쪽 스타일 덮어쓰기를 권하거나, 원본 수정 전 사용자에게 확인하라는 안내
- **FR-9 출력 스키마·설명**: `list_pending_changes` `outputSchema`를 `warning` 선택 필드가 있는 항목 스키마로 바꾼다. description에 "수정 금지 영역 항목에는 `warning`이 붙으며, 원본을 고치기 전에 사용자에게 확인하라"는 문장을 추가한다(영문). `mark_changes_applied`는 변경하지 않는다.
- **FR-10 README**: 아래를 갱신한다.
  - 옵션 표(`README.md:76-77` 부근)에 `protected` 행(기본값: `designSystem` 폴백)
  - MCP 도구 표(`:140`)·`StyleChange` 주요 필드(`:143`)에 `source.protected`·`warning`
  - 알려진 한계(`:270`)에 E-1·E-3·E-5 요지와 "경고만 하고 차단하지 않음"

## 5. 비기능 요구사항 (NFR-n)
- **NFR-1 비파괴 계약**: MCP 도구 이름·입력, `mark_changes_applied` 출력은 그대로다. 추가 필드는 모두 선택 필드다. 기존 `http.integration.test.ts` 단언은 변경 없이 통과한다(intent 제약).
- **NFR-2 enabled 일치**: `enabled:false`면 dev·프로덕션 빌드 산출물에 `data-domirror-protected`가 0건이다.
- **NFR-3 신규 의존성 0**: 판정은 기존 `createDesignSystemMatcher`를 재사용한다. `package.json` `dependencies`·`peerDependencies` 변경은 0건이다. 서버는 `@domirror/plugin`에 의존하지 않는다.
- **NFR-4 기존 주입 보존**: 기존 `data-domirror`·`data-domirror-component`·`data-domirror-ds`의 위치·개수·값이 바뀌지 않는다. 소스맵을 유지한다.
- **NFR-5 차단 없음**: 경고 유무와 관계없이 변경 저장·조회·`mark_changes_applied` 동작은 동일하다.
- **NFR-6 익스텐션 격리 유지**: ISOLATED world, manifest 권한 변경 0건, UI 변경 0건.

## 6. 인터페이스 · 데이터 스키마
- 확정: 플러그인 옵션
  ```ts
  interface DomirrorOptions { enabled?: boolean; injectors?: Injector[]; designSystem?: string[]; protected?: string[] }
  ```
- 확정: 속성
  ```html
  <button data-domirror="src/ds/Button.tsx:3:10" data-domirror-component="Button|src/ds/Button.tsx" data-domirror-ds data-domirror-protected>
  ```
- 확정: 응답 항목(예)
  ```json
  {
    "id": "…", "status": "pending",
    "source": { "file": "src/ds/Button.tsx", "line": 3, "column": 10, "inherited": false, "protected": true },
    "selectorHint": "button.btn", "property": "padding", "before": { "authored": "8px", "computed": "8px" }, "after": "12px",
    "pageUrl": "http://localhost:5173/", "createdAt": "…",
    "warning": { "code": "protected-area", "reason": "pattern", "message": "…" }
  }
  ```
- 초안: 타입
  ```ts
  // shared
  export interface StyleChange { …; source: { file: string; line: number; column: number; inherited: boolean; protected?: boolean }; … }
  export interface ProtectedAreaWarning { code: 'protected-area'; reason: 'pattern' | 'node_modules'; message: string }
  export type PendingChange = StyleChange & { warning?: ProtectedAreaWarning };
  export interface InjectorContext { root: string; isDesignSystem?: …; isProtected?: (file: string) => boolean }
  // server
  export const PendingChangeSchema = StyleChangeSchema.extend({ warning: ProtectedAreaWarningSchema.optional() });
  export function withProtectionWarning(change: StyleChange): PendingChange;
  ```
- 초안: 고정 문구(영문, 1줄)
  ```text
  Protected area (shared component / design system source): editing this file changes every screen that uses it. Prefer overriding the style at the usage site, or ask the user before editing the original.
  ```

## 7. 예외 · 엣지 케이스
- **E-1 조상 위치 상속**: 선택 요소에 위치가 없어 조상 위치를 쓰면(`inherited: true`), 보호 여부도 그 조상 요소의 속성으로 정한다. 반영 대상 파일이 그 조상의 파일이기 때문이다.
- **E-2 `protected: []` 명시**: 패턴 보호를 끈다. `node_modules` 규칙(서버)은 그대로 적용된다.
- **E-3 `node_modules` 규칙의 실효성**: 플러그인은 `node_modules`에 위치를 주입하지 않는다(`paths.ts:25`). 따라서 이 규칙은 커스텀 주입기나 다른 경로로 들어온 위치에 대한 방어 규칙이다. 판정은 `/` 세그먼트 기준이며 `node_modules_x` 같은 이름은 일치하지 않는다.
- **E-4 구버전 익스텐션·구 로컬 변경**: `source.protected`가 없는 요청과, 업그레이드 전에 저장된 로컬 변경은 패턴 경고가 붙지 않는다(`node_modules` 규칙만 적용). 오류는 0건이다.
- **E-5 패키지형 디자인 시스템**: `designSystem`의 specifier 항목(`@acme/ui`)은 파일 경로가 아니라 보호 판정에 쓰이지 않는다. 패키지 내부는 위치가 없어 사용처 위치로 들어오며, 이는 사용처 수정이라 경고 대상이 아니다.
- **E-6 같은 소스 재전송**: 서버 `upsert`로 같은 id가 갱신되면 최신 `source.protected` 값을 쓴다.
- **E-7 사용자가 직접 쓴 속성**: 요소에 `data-domirror-protected`가 이미 있으면 주입하지 않으며, 익스텐션은 그 속성을 보호 표시로 읽는다.
- **E-8 경고 미설정 프로젝트**: `protected`·`designSystem` 모두 없으면 패턴 경고 0건, 응답은 기존과 동일하다.

## 8. 수용 기준 (AC-n)
- **AC-1 (FR-1)**: core 단위 테스트에서 다음을 확인한다.
  - `protected` 미설정 + `designSystem: ['src/ds/**']` → `src/ds/Button.tsx` 보호, `src/components/Card.tsx` 비보호
  - `protected: []` + 같은 `designSystem` → 둘 다 비보호
  - `protected: ['src/shared/**']` → `src/shared/Box.tsx`만 보호, `src/ds/Button.tsx` 비보호
- **AC-2 (FR-2·FR-3·E-7)**: React·Vue 주입기 테스트에서 보호 파일의 정의 측 요소에 `data-domirror-protected`가 들어가고, 비보호 파일·사용처 측 컴포넌트 태그에는 들어가지 않는다. 기존 위치 단언은 그대로 통과한다(NFR-4).
- **AC-3 (NFR-2)**: `vite.integration.test.ts`의 `enabled:false` 0건 단언에 `data-domirror-protected`를 추가하고 통과한다.
- **AC-4 (FR-5·E-1)**: `source-locator.test.ts`에서 다음을 확인한다.
  - 자신에게 속성이 있으면 `protected: true`
  - 조상에서 위치와 속성을 물려받으면 `protected: true, inherited: true`
  - 속성이 없으면 `protected: false`
- **AC-5 (FR-6~FR-9·NFR-1·E-4)**: 서버 테스트(`http.integration.test.ts` 또는 신규 단위 테스트)에서 다음을 확인한다.
  - `source.protected: true` 변경 → `list_pending_changes` 항목에 `warning.code === 'protected-area'`, `reason === 'pattern'`, 고정 `message`
  - `source.file`에 `node_modules` 세그먼트 → `reason === 'node_modules'`
  - 보호 아님 → 항목에 `warning` 키 없음
  - `protected` 필드 없는 기존 요청 → 201(또는 기존 성공 코드)로 수용
  - `structuredContent`가 새 `outputSchema` 검증을 통과하고, 기존 E2E(`:71`) 단언이 변경 없이 통과한다.
- **AC-6 (NFR-3)**: `pnpm test`·`pnpm lint`·`pnpm typecheck`·`pnpm build`가 Exit 0이다. `git diff -- packages/*/package.json`에서 의존성 변경이 0줄이다.
- **AC-7 (FR-10)**: `rg -n "protected|warning" README.md`에 옵션 표·도구 표·알려진 한계 항목이 나온다.
- **AC-8 (종단)**: React 예제(5173, `designSystem: ['src/ds/**']` — INT-004 FR-12)에서 `src/ds/` 컴포넌트 요소를 편집해 보낸 뒤, `list_pending_changes` 결과에 `warning`이 있고 `Card` 요소 변경에는 없다. 브라우저 콘솔 에러 0건.

## 9. 가정과 리스크
- **A-1** INT-004(active)의 `designSystem` 옵션·매처는 커밋되어 있다(`ffcc083`). 예제의 `designSystem` 설정(INT-004 FR-12)과 README 옵션 표 `designSystem` 행(INT-004 FR-11)은 아직 없으므로 AC-8·FR-10은 INT-004 완료 후 수행한다.
- **A-2** zod `z.object`의 알 수 없는 키 제거 동작은 추론이다. FR-6으로 스키마에 명시하므로 동작과 무관하게 안전하다.
- **R-1** INT-004와 같은 파일(`react.ts`·`vue.ts`·`content.ts`·README)을 고친다. 동시 진행 시 충돌한다. plan에서 INT-004 완료 후 착수로 순서를 고정한다.
- **R-2** `InjectorContext`·`StyleChange.source`·`outputSchema` 확장은 공개 계약 변경이다. 모두 선택 필드라 비파괴다(NFR-1).
- **R-3** 경고는 에이전트가 응답을 읽어야 효과가 있다. 도구 description(FR-9)과 README로 완화하며, 무시를 막는 차단은 범위 밖이다(답변 3).
- **R-4** 보호 판정이 빌드 시점이라, 패턴을 바꾸면 dev 서버 재시작(또는 재변환) 전까지 기존 페이지에는 이전 판정이 남는다. README 알려진 한계에 적는다.
- **D-S1** 보호 판정 전달 경로: 플러그인 DOM 속성 → 익스텐션 `source.protected` → 서버 `warning`(권장안). 근거는 다음과 같다.
  - 답변 2가 "플러그인 설정"을 영역 정의 위치로 정했고, 서버는 그 설정을 알 수 없다(`cli.ts:23-28`).
  - 매처가 플러그인에 있어(`design-system.ts:41-55`) 서버로 옮기거나 의존시키지 않아도 된다(NFR-3).
  - 폐기 대안: (b) 서버 CLI 인자·설정 파일 — 설정 이중화·Vite 루트 불일치 위험. (c) 플러그인이 기동 시 서버로 패턴 POST — 플러그인에 네트워크 코드·포트 설정 추가.
  - 이 선택은 익스텐션 전송 데이터(필드 1개)를 바꾸지만 익스텐션 경고 UI는 추가하지 않으므로 답변 1과 충돌하지 않는다(해석). §10 Q1에서 확정한다.
- **D-S2** 경고는 저장하지 않고 응답 시 계산한다. 규칙 변경이 즉시 반영되고 저장소 타입이 바뀌지 않는다.
- **D-S3** 경고 문구는 영문 고정 1줄이다. MCP 도구 description(`mcp.ts:27-29`, `:40`)이 영문이기 때문이다. README 설명은 한국어로 둔다.
- **D-S4** `reason`은 단일 값이며 `node_modules`가 `pattern`보다 우선한다.
- **결정 계승**: intent D-01(P2), D-02(INT-001 범위 밖 블로그 기능을 별도 intent로 진행).
- **모의 독해**: 새 세션이 §3 위치, §4 FR, §6 계약, plan Step만으로 shared·plugin·extension·server·README를 수정하고 AC-1~AC-8을 검증할 수 있다. 판정: 가능(단, §10 Q1이 권장안과 다르게 확정되면 §4·§6을 재작성해야 한다).

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과`·미해결 질문 답변 1~4 | §1·§4·§8 | §3 | 기록 |
| ④ 영향 시스템·경로:라인 | `## 영향`(`mcp.ts:24`·`types.ts:15`·`README.md:263`)·`- 참조:`(`README.md:283`) | §3 | §2 | 기록(재실존 확인. intent의 `types.ts:15`는 현재 `:21`로 이동, `mcp.ts:24`·`README.md:263`·`:283`은 ±0 일치) |
| ⑤ 제약·불변 계약 | `## 제약`(도구 계약 유지, zAgentSet 위치) | §5(NFR-1)·§2 | §5 | 기록 |
| ⑥ 결정 D-n | `- D-01`·`D-02` | §9(D-S1~D-S4) | §5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:`(INT-004·INT-003) | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | 답변 1(익스텐션·zAgentSet 경고 범위 밖)·답변 3(차단 기각) | §2·§9(D-S1 폐기 대안) | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:`(해당 없음) | §3(명령)·§8(AC-8 포트) | §4 | 기록 |
| ⑩ 미확정·가정 | `## 제약`(경고 수준·영역 정의 미확정 → 답변 2·3으로 확정) | §9(A-1·A-2)·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:`(하네스 위치 확정 후 specplan, zAgentSet이면 INT-003 조율) | §1(답변 1: DOMirror MCP → INT-003 조율 불필요) | §2(Step 0 선행 조건) | 기록 |

## 10. 미해결 질문 (Open questions)
- [x] Q1 보호 판정을 서버까지 전달하는 경로는? 서버는 플러그인 설정을 알 수 없다(`packages/server/src/cli.ts:23-28`). 선택지: (a) 플러그인이 `data-domirror-protected` 속성 주입 → 익스텐션이 `source.protected`로 전송 → 서버가 `warning` 생성(권장, D-S1) / (b) 서버 CLI 인자·설정 파일로 패턴을 따로 받음(플러그인 설정과 이중화) / (c) 플러그인이 dev 서버 기동 시 패턴을 서버로 POST. 영향: (a) 외 선택 시 §4 FR-2~FR-6·§6·plan Step 재작성. → 답변: (a) DOM 속성 → 익스텐션 `source.protected` → 서버 `warning` (2026-11-17)
