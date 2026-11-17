# Spec: 선택 요소·변경 내역을 AI 구현 프롬프트로 복사
- Intent: [INT-006](intent.md) | Status: planned | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T15:58:52+09:00

## 1. 개요
- 원 요구: IDEA-20261115-05 "선택한 요소·변경 내역을 AI에 붙여 넣을 구현 프롬프트로 복사". 출처는 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 "프롬프트 복사" 기능이다. INT-001에서 범위 밖으로 둔 기능을 이 intent로 따로 진행한다(intent D-02).
- 문제: 지금은 로컬 MCP 서버를 등록한 에이전트만 변경 내역을 받을 수 있다(`README.md:126` `## 4. Claude Code에 서버 등록`). MCP를 쓰지 않는 AI 도구(웹 채팅 등)에 같은 내용을 넘기려면 요소·소스 위치·변경 값을 사람이 다시 정리해 적어야 한다.
- 목표: 익스텐션 패널에 "AI 프롬프트 복사" 버튼을 추가한다. 버튼을 누르면 한국어 마크다운 구현 프롬프트를 클립보드에 복사한다. 내용은 intent 미해결 질문 4건의 답변으로 확정했다.
  - 변경 내역이 1건 이상이면 내역 전체를 복사한다. 위치 없는 항목도 "위치 미확인"으로 표시해 포함한다.
  - 변경 내역이 없으면 현재 선택 요소의 위치 정보만 복사한다.
  - 프롬프트에는 반영 지시문을 넣는다.
  - 복사는 읽기 전용이다. 내역은 그대로 두며, 기존 MCP 전송과 함께 쓴다(대체하지 않음).
- 인계 지시(intent): 미해결 질문 확정 후 `z_skill_intent_to_specplan` 실행. 이 문서와 plan.md가 그 산출물이다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - 프롬프트 텍스트를 만드는 순수 함수 모듈을 추가한다(`packages/extension/src/prompt.ts`, 신규).
  - 패널 전송 행(`packages/extension/src/content.ts:123`~`:126`)에 복사 버튼과 클립보드 쓰기를 추가한다. 결과는 기존 상태 표시줄(`content.ts:139` `setStatus`)로 알린다.
  - 프롬프트 생성 함수의 단위 테스트를 추가한다(`packages/extension/test/prompt.test.ts`, 신규).
  - README 사용법에 복사 기능 설명을 1단락 추가한다.
- Out-of-scope
  - 복사한 프롬프트를 AI에 자동으로 전달하거나 실행하는 기능(intent 「범위 밖·전제」: 클립보드 복사까지).
  - MCP 도구(`list_pending_changes`·`mark_changes_applied`, `packages/server/src/mcp.ts:24`·`:37`)와 서버·shared 계약의 변경(intent 제약). 서버 전송 흐름을 대체하는 대안은 미해결 질문 답변("병행")으로 기각했다.
  - 복사 후 변경 내역의 상태 변경(제거·applied 표시). 복사는 읽기 전용이다.
  - manifest 권한 추가(`clipboardWrite` 등). 근거는 D-S3을 참조한다.
  - 프롬프트 형식을 사용자가 고르는 옵션(영어·평문 등). 형식은 한국어 마크다운 1종으로 고정한다.
  - 컴포넌트 이름(INT-004 진행 중) 포함. INT-004가 완료된 뒤 후속으로 검토한다.

## 3. 영향 시스템 · 모듈 · 데이터
- 익스텐션 (변경 대상)
  - `packages/extension/src/content.ts:78` `interface SendHandlers`: 프롬프트 텍스트를 받는 핸들러를 추가한다.
  - `packages/extension/src/content.ts:123` `sendButton` 생성, `:125` 라벨 `'에이전트에 보내기'`, `:135` `panel.append(title, ...slots, sendRow, status)`: 같은 `sendRow`에 복사 버튼을 둔다.
  - `packages/extension/src/content.ts:139` `setStatus(kind, text)`: 복사 성공·실패를 표시한다.
  - `packages/extension/src/content.ts:166` `onSend`, `:205` 클릭 리스너 등록: 복사 버튼도 같은 방식으로 등록하고 dispose 때 해제한다.
  - `packages/extension/src/content.ts:235` `class EditSession`, `:244` `#selected: Element | null`, `:245` `#log: LocalChange[]`: 프롬프트의 입력 출처다.
  - `packages/extension/src/content.ts:268` `select(el)`, `:273` `selectorHint(el)`·`locate(el)` 계산: 선택 요소의 위치·요약은 필드로 보관하지 않는다. 복사 시점에 `#selected`에서 다시 계산한다.
  - `packages/extension/src/content.ts:342` `pageUrl: location.href`: 변경 항목의 페이지 URL 출처다.
  - `packages/extension/src/content.ts:224` 주석 "비보안 출처(http 스테이징 등)에서는 `crypto.randomUUID`가 없으므로": 비보안 출처 페이지도 대상이라는 근거다(클립보드 폴백 필요, NFR-3).
- 익스텐션 (재사용, 변경 없음)
  - `packages/extension/src/change-log.ts:6` `LocalChange`. `:8` `source: StyleChangeInput['source'] | null`이며 null은 위치 없음을 뜻한다. `stale: boolean` 필드도 있다.
  - `packages/extension/src/change-log.ts:25` `originalValue(c)`: `before.authored ?? before.computed`를 trim한 값이다.
  - `packages/extension/src/change-log.ts:50` `sendable(log)`: `:53` `if (c.source === null) continue;`로 위치 없는 항목을 뺀다. 프롬프트는 이 함수를 쓰지 않고 `#log` 전체를 쓴다.
  - `packages/extension/src/panel.ts:158` `renderChanges`, `:181` 위치 표기(`formatSourceLocation` + `' (조상 위치)'`): 프롬프트의 위치 표기 관례로 따른다.
  - `packages/extension/src/source-locator.ts:27` `locate(el)`, `:49` `selectorHint(el)`: 요약은 `tag#id.c1.c2.c3` 형식이며 정확한 선택자를 보장하지 않는다.
  - `packages/shared/src/location.ts:11` `formatSourceLocation(loc)`: `file:line:column` 형식이다.
- 공유 타입 (읽기 전용 참조)
  - `packages/shared/src/types.ts:19` `interface StyleChange`(source·selectorHint·property·before·after·pageUrl·createdAt·status), `:31` `StyleChangeInput`.
  - 드리프트 기록: intent는 `types.ts:13`을 인용했으나, INT-004 커밋 `32ecf55`("feat: shared에 컴포넌트 정보 속성·포맷 함수 추가") 이후 정의 위치가 `:19`로 옮겨졌다. 현재 `:13`은 `export interface Injector`다. intent 원문은 수정하지 않는다.
- 서버·manifest: 변경 없음. `packages/extension/manifest.json:7`은 `"permissions": ["activeTab", "scripting", "storage"]` 그대로 둔다.
- 데이터: 새 저장소 키나 메시지 타입은 추가하지 않는다. 클립보드에 쓰는 텍스트가 유일한 출력이다.
- 환경·재현: intent에 "(해당 사항 없음)"으로 기록되어 있다. 실측 환경은 plan §4에서 정한다(`examples/react-vite` + 빌드한 익스텐션).

## 4. 기능 요구사항 (FR-n)
- FR-1: 패널 전송 행에 `AI 프롬프트 복사` 버튼을 둔다. 전송 중(`#tracker.sending`)에도 누를 수 있다. 복사는 내역을 바꾸지 않기 때문이다.
- FR-2: 변경 내역이 1건 이상이면 `#log` 전체를 한 프롬프트로 만든다. 위치 없는 항목(`source === null`)도 포함한다. 순서는 내역 순서를 따른다.
- FR-3: 변경 내역이 0건이고 선택 요소가 있으면 선택 요소 프롬프트를 만든다. 포함 항목은 위치(`locate` 결과, 조상 위치 표기 포함, 없으면 "위치 미확인"), 요소 요약(`selectorHint`), 페이지 URL이다.
- FR-4: 변경 내역과 선택 요소가 모두 없으면 복사하지 않고 상태 표시줄에 `복사할 내용이 없습니다 — 요소를 선택하거나 값을 편집하세요`를 띄운다.
- FR-5: 변경 항목마다 다음을 넣는다.
  - 위치: `file:line:column`. 조상 위치면 `(조상 위치)`를 덧붙이고, 위치가 없으면 `위치 미확인`.
  - 요소 요약(`selectorHint`), 속성(`property`)
  - 이전 값(`originalValue`): `before.authored`가 null이면 `(계산값)`을 덧붙인다.
  - 새 값(`after`)
  - stale 항목이면 `페이지 표시가 바뀌었을 수 있음` 주의 줄
- FR-6: 프롬프트 머리에 반영 지시문을 넣는다. 다음 내용을 담는다.
  - 소스에 반영하라는 요청
  - 위치는 Vite 루트 기준 상대 경로이며 여는 태그 `<`를 가리킨다는 안내
  - 줄이 어긋날 수 있으니 요소 요약과 이전 값으로 대조하라는 안내(`README.md:283` 책임 원칙)
  - 조상 위치 항목이 있으면 그 의미 안내
  - 위치 미확인 항목이 있으면 요소 요약·값으로 직접 찾으라는 안내
- FR-7: 페이지 URL은 모든 항목이 같으면 머리에 1번만 적는다. 서로 다르면 항목마다 적는다.
- FR-8: 복사에 성공하면 상태 표시줄(`ok`)에 `프롬프트를 복사했습니다: 변경 N건(위치 미확인 M건)`을 띄운다. 선택 요소만 복사했으면 `프롬프트를 복사했습니다: 선택 요소 위치`를 띄운다. 실패하면 `error` 상태로 `복사 실패: <사유>`를 띄운다.
- FR-9: 복사 전후로 `#log`·저장소·전송 상태가 바뀌지 않는다. 복사 뒤 `에이전트에 보내기`를 눌러도 기존 동작과 같다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 (계약 불변): `packages/shared`·`packages/server`·`packages/extension/manifest.json`의 diff는 0줄이다.
- NFR-2 (경로 원칙): 프롬프트의 위치 값은 `LocalChange.source.file`을 그대로 쓴다. 따라서 Vite 루트 기준 상대 경로만 들어간다(`README.md:263`). 절대 경로·홈 경로를 조합해 만들지 않는다.
- NFR-3 (클립보드 호환): `navigator.clipboard.writeText`를 먼저 시도한다. 이 API가 없거나(비보안 출처) 거부되면 Shadow DOM 안의 임시 `textarea`와 `document.execCommand('copy')`로 폴백한다. 쓰기는 버튼 click 핸들러 안에서 시작한다(사용자 제스처).
- NFR-4 (테스트 가능성): 프롬프트 생성은 DOM·`chrome`·`location`에 의존하지 않는 순수 함수로 만든다. 선택 요소 정보는 호출 측이 계산해 넘긴다. 이렇게 해야 node 환경 vitest(`vitest.config.ts` include `packages/*/test/**/*.test.ts`, jsdom 없음)에서 검증할 수 있다.
- NFR-5 (문구 언어): UI 라벨·상태 문구·프롬프트는 한국어로 쓴다(기존 `content.ts:125`·`panel.ts:173` 관례). 코드 주석은 한국어로 쓰고 FR 식별자를 표기한다.
- NFR-6 (파일 규격): 신규·수정 파일은 UTF-8(BOM 없음)·LF로 둔다.

## 6. 인터페이스 · 데이터 스키마
- 확정 — 순수 함수 모듈 `packages/extension/src/prompt.ts`:
```ts
import type { LocalChange } from './change-log.js';
import type { Located } from './source-locator.js';

/** 변경 내역이 없을 때 복사할 선택 요소 정보(호출 측이 #selected에서 계산). */
export interface PromptSelection {
  hint: string;            // selectorHint(el)
  located: Located | null; // locate(el)
  pageUrl: string;         // location.href
}

export type PromptInput =
  | { kind: 'changes'; changes: readonly LocalChange[] }  // 1건 이상
  | { kind: 'selection'; selection: PromptSelection };

/** 한국어 마크다운 구현 프롬프트(FR-2~FR-7). */
export function buildPrompt(input: PromptInput): string;
```
- 확정 — `SendHandlers`(`content.ts:78`) 확장:
```ts
/** 복사할 프롬프트 입력. 변경 내역도 선택 요소도 없으면 null(FR-4). */
promptInput(): PromptInput | null;
```
  `EditSession`에 같은 이름의 메서드를 둔다. 처리 순서는 `#log.length > 0`이면 changes, 아니면 `#selected`가 있으면 selection, 그 외에는 null이다.
- 초안 — 프롬프트 출력 예(변경 내역 모드, 구현 시 문구 미세 조정 허용, 단 FR-5·FR-6 항목은 유지):
```markdown
# 화면 스타일 변경 반영 요청

아래 CSS 변경을 소스 코드에 반영해 주세요.

- 위치는 Vite 루트 기준 상대 경로(`파일:줄:열`)이며 요소 여는 태그 `<`를 가리킵니다.
- 편집 후 소스가 바뀌어 줄이 어긋났을 수 있습니다. `요소`와 `이전 값`으로 대조한 뒤 반영하세요.
- `(조상 위치)`는 해당 요소에 위치 표시가 없어 가장 가까운 조상 요소의 위치를 적은 것입니다.
- `위치 미확인` 항목은 `요소` 요약과 값으로 소스를 직접 찾아 주세요.
- 페이지: http://localhost:5173/

### 1. `padding`
- 위치: `src/App.tsx:12:5`
- 요소: `div.card`
- 이전 값: `8px`
- 새 값: `16px`

### 2. `color`
- 위치: 위치 미확인
- 요소: `span.label`
- 이전 값: `rgb(0, 0, 0)` (계산값)
- 새 값: `#333`
```
- 초안 — 선택 요소 모드:
```markdown
# 화면 요소 위치

아래 요소에 대한 수정 요청을 이어서 적겠습니다. 소스에서 이 요소를 찾아 요청을 반영해 주세요.

- 위치: `src/App.tsx:12:5` (Vite 루트 기준 상대 경로, 여는 태그 `<` 위치)
- 요소: `div.card`
- 페이지: http://localhost:5173/
```
- 조건부 안내 줄(조상 위치·위치 미확인)은 해당 항목이 있을 때만 넣는다.

## 7. 예외 · 엣지 케이스
- E-1: 위치 없는 항목만 있다. 모든 항목을 `위치 미확인`으로 표기하고 FR-6의 직접 찾기 안내를 넣는다. 복사는 정상 진행한다(전송과 달리 제외하지 않는다).
- E-2: 값에 백틱(`` ` ``)이 들어 있다. 인라인 코드 구분자는 값에 든 가장 긴 연속 백틱보다 1개 더 길게 잡는다. 값이 백틱으로 시작하거나 끝나면 앞뒤에 공백을 둬서 마크다운이 깨지지 않게 한다.
- E-3: `after`가 빈 문자열이다(속성 값 삭제). 새 값을 `(빈 값)`으로 표기한다.
- E-4: `navigator.clipboard`가 없거나 `writeText`가 거부된다. `execCommand('copy')` 폴백을 쓴다. 폴백도 `false`를 돌려주거나 예외가 나면 FR-8 실패 문구를 띄우고 내역은 바꾸지 않는다.
- E-5: 전송 중에 복사를 누른다. 복사 시점의 `#log` 스냅샷으로 만든다. 전송이 성공해 내역이 정산되어도 이미 복사한 텍스트에는 영향이 없다.
- E-6: 선택 요소가 DOM에서 사라졌다(HMR·새로고침). `locate`가 null을 돌려주면 `위치 미확인`으로 복사한다. 연결 해제 여부는 따로 검사하지 않는다.
- E-7: 패널이 dispose된 뒤의 비동기 결과는 `setStatus`가 `disposed` 검사로 무시한다(`content.ts:139`~ 기존 동작).
- E-8: 같은 요소·속성 중복은 `recordChange`가 키(`change-log.ts` `changeKey`)로 이미 하나로 합친다. 프롬프트에서 따로 병합하지 않는다.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-2·FR-5·FR-6): `buildPrompt({ kind: 'changes', ... })`에 위치 있는 항목 1건, 조상 위치 1건, 위치 없음 1건을 넣는다. 출력에 다음이 있어야 한다.
  - `src/...:L:C` 위치 1건, `(조상 위치)` 1건, `위치 미확인` 1건
  - 각 항목의 요소·속성·이전 값·새 값
  - 지시문의 대조 안내, 조상 위치 안내, 직접 찾기 안내 줄
- AC-2 (FR-5·FR-6 조건부): 위치 있는 항목만 넣는다. 조상 위치 안내와 직접 찾기 안내 줄이 출력에 없어야 한다. `before.authored === null` 항목에는 `(계산값)`이 붙고, `stale: true` 항목에는 주의 줄이 붙어야 한다.
- AC-3 (FR-7): pageUrl이 같은 2건이면 페이지 줄이 1번만 나온다. 서로 다른 2건이면 항목마다 나온다.
- AC-4 (FR-3): `buildPrompt({ kind: 'selection', ... })`로 위치 있음과 위치 없음 두 경우를 확인한다. 각각 위치(또는 `위치 미확인`)·요소·페이지와 지시문이 나와야 한다.
- AC-5 (E-2·E-3): 백틱이 든 값과 빈 `after`를 넣는다. 인라인 코드가 깨지지 않고 `(빈 값)`이 나와야 한다.
- AC-6 (NFR-1·NFR-2): `git diff --stat -- packages/shared packages/server packages/extension/manifest.json` 결과가 0줄이어야 한다. AC-1 출력에 `/Users`·`~/`·`file://` 문자열이 없어야 한다.
- AC-7 (FR-1·FR-4·FR-8·FR-9, 브라우저 실측): `examples/react-vite`에서 빌드한 익스텐션으로 다음 4가지를 확인한다. 콘솔 에러는 0건이어야 한다.
  - ① 요소만 선택하고 복사하면 선택 요소 프롬프트가 클립보드에 들어간다.
  - ② 값을 편집한 뒤 복사하면 내역 전체가 들어가고, 변경 내역 건수는 그대로다.
  - ③ 아무것도 선택하지 않고 복사하면 FR-4 문구가 뜬다.
  - ④ 복사한 뒤 `에이전트에 보내기`가 기존처럼 동작한다(서버를 띄운 경우).
- AC-8 (NFR-4·NFR-6): `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build`가 Exit 0이어야 한다. 신규·수정 파일은 CR 0건·BOM 없음이어야 한다.

## 9. 가정과 리스크
- 결정(spec 단계)
  - D-S1: 프롬프트 생성을 별도 순수 모듈 `prompt.ts`로 분리한다. 근거: panel·content에는 DOM 테스트 하네스가 없다(extension 테스트는 순수 함수만 다룬다). 폐기 대안: `content.ts` 안에 직접 작성.
  - D-S2: 버튼은 `sendRow`에 둔다. 근거: 전송과 같은 "내보내기" 동작이며 `renderChanges`는 내역이 0건이면 영역을 비운다(`panel.ts:158` 이하). 내역이 없을 때 쓰는 선택 요소 복사(FR-3)를 담을 수 없다. 폐기 대안: 변경 내역 머리(`panel.ts:173` 옆).
  - D-S3: manifest 권한은 추가하지 않는다. 근거: click 제스처 안의 `writeText`와 `execCommand('copy')`는 권한 없이 동작할 것으로 본다. 권한을 추가하면 기존 사용자에게 재승인 경고가 뜰 수 있고 NFR-1(계약 불변)에도 어긋난다. AC-7 실측에서 실패하면 Tier·게이트를 다시 산정하고 사용자 확인 후 권한 추가를 검토한다.
  - D-S4: 선택 요소 정보는 필드로 보관하지 않고 복사 시점에 `#selected`에서 다시 계산한다. 근거: `select()`(`content.ts:268`~`:275`)가 이미 매번 계산한다. INT-004가 같은 구간(`content.ts:271-273`)을 수정할 예정이라 상태 필드를 추가하면 충돌 면이 커진다.
- 가정
  - A-1: content script(isolated world)에서 Shadow DOM 안의 버튼을 클릭하면 사용자 제스처로 인정된다. AC-7로 실측한다(조사 단계 미확인).
  - A-2: 비보안 출처에서 `navigator.clipboard`는 undefined이고 `execCommand('copy')`는 동작한다. 웹 표준상 그렇다고 보며 실측은 미확인이다.
- 리스크
  - R-1: INT-004(active)가 `content.ts`·`panel.ts`·`shared/types.ts`를 수정 중이다(`32ecf55` 반영 완료, plan상 `content.ts:271-273`·`panel.ts:45` 추가 수정 예정). 순서를 바꿔 착수하면 라인 인용이 어긋나고 병합 충돌이 날 수 있다. 완화: INT-004 완료 후 착수하거나, 착수 시 `content.ts` 인용 라인을 재확인한다.
  - R-2: `execCommand('copy')`는 폐기 예정(deprecated) API다. 향후 브라우저에서 제거될 수 있다. 완화: 1순위 `navigator.clipboard`, 폴백 실패 시 명확한 오류 문구(E-4).
  - R-3: `pageUrl`에 쿼리 문자열(토큰 등)이 있으면 프롬프트를 거쳐 외부 AI 도구로 넘어간다. MCP 전송도 같은 값을 보내므로 새 노출 경로는 아니다. 다만 외부 웹 채팅에 붙여 넣는 점이 다르다. 완화: README 설명에 "페이지 URL이 그대로 포함됨"을 1줄 명시한다.
- 인계 충실성 대조표 (11범주)

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과` | §1·§4·§8 | §3 | 기록 |
| ④ 영향 시스템·경로:라인 | `## 영향`·`- 참조:` | §3 | §2 | 기록(재실존 ±0 확인: `panel.ts:158`·`change-log.ts:6`·`:50`·`mcp.ts:24`·`README.md:126`·`:263`·`:283`. `types.ts:13`은 INT-004 커밋 `32ecf55`로 `:19`로 드리프트되어 §3에 현재 라인과 드리프트를 함께 기록) |
| ⑤ 제약·불변 계약 | `## 제약` | §5(NFR-1·NFR-2)·§7 | §5 | 기록 |
| ⑥ 결정 D-n | `- D-01`·`D-02` | §1·§2·§9(D-S1~D-S4) | §1·§5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | `- D-02` 폐기 대안·미해결 질문 답변(대체 기각) | §2·§9 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:` (해당 사항 없음) | §3·§8(AC-7 실측 환경) | §2·§4 | 기록 |
| ⑩ 미확정·가정 | `## 미해결 질문`(4건 답변)·`## 제약`(형식 미확정 → 답변으로 확정) | §9·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:` | §1 | §3·§6 | 기록 |

- 모의 독해 판정: 새 세션이 spec·plan만으로 착수할 수 있다. 수정 파일·시그니처·출력 형식·검증 명령을 모두 명시했다. R-1에 따라 착수 시 `content.ts` 라인만 재확인하면 된다.

## 10. 미해결 질문 (Open questions)
- 없음 (intent 미해결 질문 4건 답변으로 확정, spec 단계 설계 선택은 §9 D-S1~D-S4에 근거와 함께 기록)
