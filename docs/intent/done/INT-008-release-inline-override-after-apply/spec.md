# Spec: 소스 반영 확인 시 익스텐션 인라인 !important 값 해제·원복
- Intent: [INT-008](intent.md) | Status: planned | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T16:03:47+09:00

## 1. 개요
- 원 요구: IDEA-20261117-01 "전송 성공 후에도 익스텐션이 보낸 값을 인라인 !important로 페이지에 남겨(packages/extension/src/applier.ts:40, edit-tracker.ts:50) 소스 반영 실패를 가림 → 반영 확인 시 인라인 값 해제·원복 방법 검토". INT-002 spec 조사 중 발견했다(대화 2026-11-17).
- 문제: 전송에 성공해도 익스텐션은 요소 추적만 끝낸다(`forget`). 페이지에는 보낸 값이 인라인 `!important`로 남는다. 그래서 에이전트가 소스 반영에 실패해도 같은 탭에서는 실패가 보이지 않는다.
- 해결: 패널에 **반영 확인** 버튼을 추가한다. 버튼을 누르면 다음 순서로 동작한다.
  1. **전송한 항목만** 인라인 값을 해제·원복한다.
  2. 해제 후 computed 값을 보낸 값과 비교한다.
  3. 항목별로 일치·불일치·확인 불가를 표시한다.
  - 미전송 편집값은 유지한다. 서버 계약은 바꾸지 않는다.
- 인계: 새 세션은 이 문서와 `plan.md`만으로 구현에 착수할 수 있다(§9 대조표·모의 독해 참조). intent의 인계 지시는 "미해결 질문 확정 후 `z_skill_intent_to_specplan`"이었다. 미해결 질문 4건은 intent에서 모두 `[x]`로 확정됐다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `packages/extension/src/applier.ts`
    - 전송한 항목의 기록을 보관한다.
    - 해제 API를 추가한다.
    - `restoreAll`이 이 기록도 정리하게 한다.
  - `packages/extension/src/edit-tracker.ts`
    - `endSend`에서 `forget` 대신 전송 기록으로 옮긴다.
    - 반영 확인 진입점을 추가하고 전송 중 잠금을 적용한다.
  - 신규 `packages/extension/src/verify.ts`(이름은 초안): 해제 후 computed 비교 로직을 둔다. computed 읽기는 함수로 주입한다.
  - `packages/extension/src/content.ts`
    - 전송 행에 **반영 확인** 버튼을 추가하고 핸들러를 연결한다.
    - 상태 줄에 요약을 표시한다.
  - `packages/extension/src/panel.ts`: 항목별 확인 결과 목록을 렌더링한다.
  - `packages/extension/test/`: 위 변경의 단위 테스트(vitest).
  - `README.md`: `:170`, `:279`, 사용법 확인 단계, 수동 확인 체크리스트(`:290`~`:295`)를 갱신한다.
- Out-of-scope (intent 범위 밖·전제)
  - chrome-devtools-mcp 검증 워크플로(INT-002) 변경. README `:154` 이하 별도 브라우저 회피책은 유지한다.
  - 서버 HTTP 경로 추가. 항목별 applied 조회 경로를 만들지 않는다(intent 미해결 질문 2 답변).
  - MCP 도구 계약(`mark_changes_applied` 등)과 `packages/shared` 메시지 타입 변경.
  - 인라인 `!important` 즉시 적용 자체 제거(D-02 폐기 대안).
  - HMR·새로고침 자동 감지 트리거(intent 미해결 질문 1에서 패널 버튼으로 확정).

## 3. 영향 시스템 · 모듈 · 데이터
- 기준: 2026-11-17 HEAD `49319db`. researcher가 실측했고 intent 인용 줄 번호 불일치는 0건이다.
- `packages/extension/src/applier.ts`
  - `:1` "대상 요소에는 인라인 style 외에 아무것도 쓰지 않는다."
  - `:32` 인라인 `!important` 적용 이유
  - `:35` `applyStyle`, `:40` `el.style.setProperty(property, value, 'important');`, `:44` `restoreStyle(el, property, prev, options)`
  - `:21` `PrevInline { value; priority }`. 값이 `''`이면 인라인 선언이 없었다는 뜻이다(`:20`).
  - `:50` `ElementState { prev; original }`, `:57` `KeyRecord { property; elements: Map<StyledElement, ElementState> }`
  - `:66` `AppliedStyles` 필드
    - `:67` `#byKey`
    - `:69` `#originals`: 요소·속성별 최초 인라인 값. 전송 후에도 유지된다.
    - `:71` `#hadStyleAttribute`
  - `AppliedStyles` 메서드
    - `:82` `apply(key, el, property, value, original)`: `:84`·`:93`에서 그 시점 인라인 값을 `prev`로 잡는다.
    - `:106` `revert(key)`
    - `:117` `forget(key) { this.#byKey.delete(key); }`
    - `:125` `pruneDetached()`: `#byKey`만 정리한다.
    - `:139` `restoreAll()`: `#originals`로 원복한 뒤 Map 3개를 비운다(`:144`~`:146`).
- `packages/extension/src/edit-tracker.ts`
  - `:11` `EditTracker`, `:12` `#applied`, `:13` `#sending`
  - `:43`~`:59` 전송 잠금 구간
    - `:44` `beginSend`
    - `:50` 주석 "전송 성공 정산: 보낸 key의 요소 추적을 끝내고(페이지 표시는 보낸 값 그대로)"
    - `:51` `endSend(log, sent)`, `:52` `this.#applied.forget(key)`
    - `:57` `finishSend`
  - `:62` `pruneDetached`, `:66` `restoreAll`
- `packages/extension/src/change-log.ts`
  - `:18` `changeKey(c)`
    - 요소 자신의 위치이면 `` `${formatSourceLocation(c.source)}|${c.property}` ``다.
    - 그 밖에는 `` `${where}|${c.selectorHint}|${c.property}` ``다.
    - 한 key에 요소가 여럿 매달릴 수 있다.
  - `:67`~`:77` `settleSent`: 보낸 값과 같은 항목을 log에서 뺀다(`:74`).
- `packages/extension/src/content.ts`
  - 패널: `:91` `createPanel`(Shadow DOM, `:93`)
  - 전송 행: `:113`~`:126`(`:123` `sendButton`, `:125` `'에이전트에 보내기'`)
  - 상태 줄: `:128`~`:130`, `:139` `setStatus`
  - 버튼 스타일과 핸들러
    - `.send` CSS: `:53`~`:57`
    - `SendHandlers`: `:78`~`:85`
    - click 등록: `:205`, 해제: `:218`
  - 전송 흐름
    - `:172` collect, `:182` `chrome.runtime.sendMessage`
    - `:186` onSent → `:292`~`:294` `tracker.endSend`
    - `:196`~`:199` finally → `:297`~`:301` `finishSend`
  - 잠금 위반 문구: `:353`~`:355`
  - 편집 필드: `:398` `getComputedStyle(el)`
  - `:404`~`:411` `#renderChanges`, `:424`~`:428` 핸들러 연결
  - 끌 때 원복: `:307`~`:308` `dispose`에서 `restoreAll()`
- `packages/extension/src/panel.ts`
  - `:7`~`:8` "패널 셸(포트·전송·상태)은 content.ts에 있다"
  - `:143`~`:146` `ChangesHandlers`, `:148` `button(text, onClick, disabled)`, `:158` `renderChanges`
  - `.changes button` CSS: `:88`~`:89`
- `packages/extension/src/css-read.ts:244` `computed: getComputedStyle(el).getPropertyValue(property).trim()`. CSS 값 정규화 유틸은 없다. 비교는 `.trim()` 문자열 비교뿐이다.
- 테스트: `packages/extension/test/applier.test.ts`, `edit-tracker.test.ts`
  - 잠금: `:41`, L4 성공 정산: `:82`
  - `fake-element.ts:4` `FakeElement`에는 getComputedStyle 흉내가 없다.
- 서버(변경 없음)
  - `packages/server/src/http.ts:111` `GET /health`, `:115` `POST /changes`
  - `packages/server/src/mcp.ts:37` `mark_changes_applied`
- README(갱신 대상)
  - `:154` 자동 확인 섹션 제목
  - `:170` 별도 브라우저에서 비교하는 이유. 근거는 "전송 성공 후에도 유지"다.
  - `:206`~`:224` 검증 스니펫. 임시 요소로 정규화하고, 빈 값·shorthand는 `unverifiable`로 처리한다.
  - `:244` 끄면 원복, `:278` 적용 방식, `:279` 전송 후 표시, `:281` HMR
  - `:286` 수동 확인 체크리스트(`:290`~`:295`), `:297` `## 개발`
- 데이터: 전송 기록은 content script 메모리에만 둔다. 익스텐션 저장소에 영속화하지 않는다.

## 4. 기능 요구사항 (FR-n)
- FR-1 전송 기록 보관
  - `endSend`는 보낸 key를 `forget`하지 않는다. 그 `KeyRecord`(요소별 `prev`)를 전송 기록으로 옮기고, 보낸 값(`after`)과 표시용 정보(`selectorHint`·`source`·`property`)를 함께 보관한다.
  - 같은 key가 다시 전송되면 요소별 `prev`는 **먼저 보관된 값을 유지**하고 보낸 값만 갱신한다(D-S3).
  - 페이지 표시는 기존과 같다. 보낸 값이 인라인 `!important`로 남는다.
- FR-2 반영 확인 버튼
  - 패널 전송 행에 `반영 확인` 버튼을 추가한다.
  - 활성 조건: 전송 기록이 1건 이상이고 전송 중(`sending`)이 아닐 때.
  - 전송 중에는 비활성화한다. 잠금 위반 호출은 기존 잠금 문구 방식(`content.ts:353`~`:355`)으로 무시한다.
- FR-3 해제·원복 (전송 항목 한정)
  - 클릭하면 전송 기록의 각 요소를 `restoreStyle(el, property, prev)`로 원복한다. 미전송 편집 항목(`#byKey`)에는 손대지 않는다.
  - 예외: 같은 key가 미전송 상태로 다시 편집 중이면 그 요소의 인라인 값(미전송 편집값)을 해제하지 않는다. 대신 그 활성 record의 `prev`를 전송 기록의 `prev`로 바꾼다. 이후 되돌리면 소스 값으로 돌아간다(D-S2).
- FR-4 computed 비교. 연결된 요소마다 다음을 한 동기 구간에서 수행한다.
  - 측정 동안 대상 요소 인라인에 `transition: none !important`를 임시로 둔다(D-S4).
  - 해제 후 `actual = getComputedStyle(el).getPropertyValue(property).trim()`를 읽는다.
  - 같은 요소에 보낸 값을 인라인 `!important`로 잠시 적용해 `expected`를 읽는다. 읽은 즉시 해제 상태로 되돌린다(D-S1).
  - 끝나면 `transition` 인라인을 측정 전 상태로 원복한다.
  - 판정
    - `actual === expected`이면 `match`, 아니면 `mismatch`다.
    - 다음 경우는 `unverifiable`이다: 보낸 값이 빈 문자열, `actual`이나 `expected`가 빈 문자열, 요소 분리(`isConnected === false`), FR-3 예외로 해제하지 않은 요소.
  - computed 읽기는 주입 가능한 함수로 분리해 단위 테스트한다.
- FR-5 결과 표시
  - 패널에 항목(key)별 결과 목록을 렌더링한다. 각 행은 위치/선택자, 속성, 보낸 값, 확인 값, 판정을 보여준다.
  - 항목 판정은 요소 판정을 합쳐 정한다.
    - 요소 중 1개라도 `mismatch`이면 `mismatch`다.
    - 그 밖에 `unverifiable`이 있으면 `unverifiable`이다.
    - 나머지는 `match`다.
  - 상태 줄에 `반영 확인: 일치 n · 불일치 m · 확인 불가 k`를 표시한다.
  - 결과 목록은 다음 반영 확인, 전송, 익스텐션 끄기 때까지 유지한다.
- FR-6 수명
  - 반영 확인을 마치면 처리한 전송 기록을 비운다(1회성).
  - `restoreAll`(끄기, NFR-3)은 전송 기록도 비운다. `#originals` 기반 원복 동작은 바꾸지 않는다.
  - `pruneDetached`는 전송 기록을 지우지 않는다. 분리 요소는 확인 시 `unverifiable`로 보고한다.
- FR-7 README 갱신
  - `:279`: 전송 후 보낸 값이 유지되는 것은 반영 확인 전까지라고 고치고, 반영 확인 동작을 적는다.
  - `:170`: 같은 탭에서도 반영 확인 버튼으로 확인할 수 있다는 문장을 덧붙인다. 별도 브라우저 회피책은 유지한다.
  - 사용법 확인 단계에 반영 확인 버튼을 언급한다.
  - 수동 확인 체크리스트에 반영 확인 항목 1건을 추가한다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 비침습
  - 대상 요소에는 인라인 style 외에 아무것도 쓰지 않는다(`applier.ts:1`). 측정용 임시 `transition`과 보낸 값도 인라인 style만 쓰고, 측정이 끝나면 원복한다.
  - 페이지에 임시 요소를 삽입하지 않는다. README `:206`~`:217` 방식은 쓰지 않는다.
- NFR-2 기존 계약 유지
  - 전송 중 편집·되돌리기 잠금(`edit-tracker.ts:43`~`:59`)은 그대로 둔다.
  - 끌 때 원복(NFR-3, `restoreAll`, `content.ts:307`~`:308`)도 그대로 둔다.
  - 서버 HTTP·MCP 계약과 `packages/shared` 타입은 변경 0건이다.
- NFR-3 깜빡임 최소화: 해제·측정·복귀를 한 동기 구간에서 끝낸다. 그 사이에 렌더링 프레임이 끼지 않게 한다(`await` 금지).
- NFR-4 환경: macOS(Darwin 25.6.0), Chrome MV3 익스텐션. 재현은 README 예제에서 편집·전송한 뒤 소스를 반영하지 않고 같은 탭을 보면 보낸 값이 그대로 보이는 것이다(`README.md:279`). intent 작성 중 실측한 수치는 없다.
- NFR-5 품질: 루트 `pnpm test`(vitest run), `pnpm lint`(oxlint .), `pnpm typecheck`가 Exit 0이어야 한다.

## 6. 인터페이스 · 데이터 스키마
- 확정: 서버·shared 메시지 타입은 변경 없다(`types.ts:48` `ContentToWorkerMessage`, `:54`, `:56` 유지). 반영 확인은 content script 안에서 끝난다.
- 초안(구현 시 이름 조정 가능, 의미는 고정)
```ts
// applier.ts
interface SentRecord {
  property: string;
  after: string;                       // 보낸 값(마지막 전송)
  info: { selectorHint: string; source: StyleChangeInput['source'] };
  elements: Map<StyledElement, ElementState>; // prev = 최초 전송 이전 인라인 값
}
class AppliedStyles {
  markSent(key: string, after: string, info: SentRecord['info']): void; // forget 대체, FR-1
  get sentCount(): number;
  releaseSent(read: ReadComputed): VerifyItem[];                         // FR-3·FR-4, 처리 후 기록 비움(FR-6)
}
// verify.ts
type ReadComputed = (el: StyledElement, property: string) => string;
type VerifyStatus = 'match' | 'mismatch' | 'unverifiable';
interface VerifyItem {
  key: string; property: string; after: string; info: SentRecord['info'];
  status: VerifyStatus;                // 요소 합산 규칙 FR-5
  elements: { actual: string; expected: string; status: VerifyStatus; reason?: 'detached' | 'empty' | 'pending-edit' }[];
}
// edit-tracker.ts
class EditTracker {
  get sentCount(): number;
  verifySent(read: ReadComputed): VerifyItem[] | null; // sending 중이면 null(잠금)
}
```
- UI 문구
  - 버튼: `반영 확인`
  - 상태 줄: `반영 확인: 일치 n · 불일치 m · 확인 불가 k`
  - 판정 라벨: `일치` / `불일치` / `확인 불가`

## 7. 예외 · 엣지 케이스
- E-1 전송 중 클릭: 버튼이 비활성 상태다. 직접 호출되면 `null`을 반환하고 아무것도 바꾸지 않는다.
- E-2 한 key에 요소 여러 개: 요소별로 판정하고 FR-5 규칙으로 합산한다.
- E-3 전송 후 같은 key를 다시 편집(미전송): 미전송 값을 유지하고 해당 요소는 `unverifiable`(`pending-edit`)로 표시한다. 활성 record `prev`를 전송 기록 `prev`로 바꿔 이후 되돌리면 소스 값으로 간다(D-S2). README `:279` "되돌리면 페이지도 보낸 값으로 돌아갑니다"는 반영 확인 전까지만 성립한다고 갱신한다.
- E-4 같은 key 재전송: 요소별 `prev`는 최초값을 유지하고 `after`는 최신값으로 바꾼다(D-S3).
- E-5 요소 분리(HMR로 교체 등): `unverifiable`(`detached`). 교체된 새 요소에는 원래 인라인 값이 없으므로 해제할 것도 없다.
- E-6 보낸 값이 빈 문자열(선언 삭제), shorthand처럼 computed가 `''`인 경우: `unverifiable`(`empty`).
- E-7 페이지에 사용자 인라인 값이 원래 있었던 경우: `prev`(value·priority)로 원복한다. 비교 대상 `actual`은 그 인라인을 포함한 computed다. 이는 기존 `revert`와 같은 의미다.
- E-8 CSS 애니메이션이 같은 속성을 덮는 경우: `actual`·`expected`가 모두 애니메이션 값이면 거짓 일치가 날 수 있다. 이번 범위에서는 알려진 한계로 README에 적지 않고 §9 리스크로만 둔다.
- E-9 반영 확인 후 끄기: `restoreAll`이 `#originals`로 원복한다. 해제 결과와 값이 같으므로 충돌하지 않는다.
- E-10 전송 실패(E-4 기존): 전송 기록에 넣지 않는다. log도 그대로다.
- E-11 새로고침: content script 메모리가 초기화된다. 인라인 값도 사라지므로 확인할 대상이 없고 버튼은 비활성이다.

## 8. 수용 기준 (AC-n)
- AC-1 (FR-1) 단위: `endSend` 후 대상 요소 인라인 값은 보낸 값 `!important` 그대로다. `sentCount`는 보낸 key 수이고, 보낸 항목은 log에서 빠진다(기존 L4 유지).
- AC-2 (FR-3) 단위: `verifySent` 후 전송 요소 인라인이 `prev`로 원복된다. 원래 선언이 없으면 속성을 제거하고, 원래 인라인이 있으면 value·priority를 복원한다. `sentCount`는 0이 된다.
- AC-3 (FR-3) 단위: 다른 key의 미전송 편집 인라인 값은 `verifySent` 후에도 그대로다. 그 항목의 되돌리기도 기존처럼 동작한다.
- AC-4 (E-3) 단위: 전송 후 같은 key를 다시 편집하고 `verifySent`를 호출하면 인라인은 미전송 값이고 판정은 `unverifiable`이다. 이어서 되돌리면 인라인은 최초 `prev`가 된다. 보낸 값이 아니다.
- AC-5 (FR-4·FR-5) 단위: 주입 `ReadComputed`로 다음 판정을 검증한다.
  - `match`, `mismatch`, `unverifiable`(빈 값, 분리 요소)
  - 요소 2개 중 1개만 `mismatch`이면 항목은 `mismatch`다.
  - 측정 후 `transition` 인라인이 측정 전 상태와 같다.
- AC-6 (FR-2·FR-6·NFR-2) 단위
  - `sending` 중 `verifySent`는 `null`을 반환하고 상태 변경이 0건이다.
  - 반영 확인 후 `restoreAll`을 호출하면 `#originals` 값으로 원복하고 전송 기록이 비워진다.
  - 기존 `applier.test.ts`·`edit-tracker.test.ts` 전부 통과한다.
- AC-7 (FR-2·FR-5) 브라우저: `pnpm --filter example-react-vite dev`(5173)에서 다음을 확인한다.
  - (a) 편집·전송하고 소스는 수정하지 않는다. `반영 확인`을 누르면 페이지가 원래 값으로 돌아가고 패널에 `불일치`가 나온다.
  - (b) 편집·전송한 뒤 같은 값을 CSS 소스에 직접 반영한다(HMR). `반영 확인`을 누르면 `일치`가 나온다.
  - (c) 콘솔 에러 0건이다.
- AC-8 (NFR-5·FR-7) `pnpm test`·`pnpm lint`·`pnpm typecheck`가 Exit 0이다. README `:170`·`:279`·사용법·체크리스트에 반영 확인이 기술되어 있다.

## 9. 가정과 리스크
- 결정
  - D-01 (intent): 우선순위 P2. 근거는 사용자 미지정, 긴급 표현 없음이다.
  - D-02 (intent): 인라인 `!important` 즉시 적용은 유지하고 반영 확인 시점에만 해제한다. 폐기 대안은 인라인 적용 자체 제거다.
  - D-S1: 기대값은 **같은 요소**에 보낸 값을 잠시 인라인 적용해 computed로 정규화한다.
    - 근거: `#fff`→`rgb()`, `rem`, `var()` 해석을 같은 문맥에서 맞출 수 있다. 인라인 style만 쓰는 원칙(`applier.ts:1`)도 지킨다.
    - 폐기 대안: README `:206`~`:217`의 임시 형제 요소 삽입(페이지 DOM 변경), 문자열 `trim` 비교(정규화 차이로 거짓 불일치).
  - D-S2: 재편집 중인 요소는 해제하지 않고 활성 record `prev`를 전송 전 값으로 바꾼다.
    - 근거: intent 답변 "미전송 편집 값은 유지"를 지키면서, 이후 되돌리기가 소스 값을 보여주게 한다.
    - 폐기 대안: 재편집 값까지 해제(미전송 값 유실).
  - D-S3: 같은 key를 재전송하면 최초 `prev`를 유지한다. 근거: 두 번째 record의 `prev`는 보낸 값 `!important`이므로(`applier.ts:84`·`:93`) 그대로 쓰면 해제가 무의미하다.
  - D-S4: 측정 중 `transition: none !important`를 임시 인라인 적용한다. 근거: 해제 직후 읽으면 transition 시작값(=보낸 값)이 읽혀 거짓 일치가 날 수 있다.
  - D-S5: 전송 기록은 메모리에만 두고, 확인 후 비운다(1회성). 근거: 끄기·새로고침 시 인라인도 사라져 영속화 이득이 없다.
- 가정
  - `getComputedStyle`은 동기 style recalc를 하고, 같은 task 안의 인라인 변경 사이에 페인트가 일어나지 않는다(Chrome 표준 동작).
  - 패널 Shadow DOM 버튼 추가는 기존 `.send` 패턴으로 충분하다.
- 리스크
  - R-1 CSS 애니메이션·`!important` 페이지 규칙과 사용자 인라인이 섞여 판정이 모호하다(E-8). `unverifiable` 확장은 후속으로 둔다.
  - R-2 transition 인라인을 원복할 때 `transition` shorthand와 longhand가 섞여 있으면 원복이 어긋날 수 있다. `restoreStyle`과 같은 `PrevInline` 방식으로 `transition` 속성 하나만 저장·복원해 완화한다.
  - R-3 README `:279`의 기존 기술("되돌리면 보낸 값으로")과 행동이 달라진다. 반영 확인 이후에 한해서이며 FR-7로 문서를 갱신한다.
  - R-4 조사 시점 작업 트리에 무관한 수정 파일 `packages/extension/src/source-locator.ts`가 있었다. 작성 완료 시점에는 `content.ts`·`panel.ts`·`picker.ts`·`test/source-locator.test.ts`도 수정 상태로 관측됐다(다른 작업으로 추정). §3의 `content.ts`·`panel.ts` 줄 번호는 HEAD `49319db` 기준이다. 착수 시 재확인하고, 구현 커밋에 섞이지 않게 주의한다.

### 인계 대조표 (11범주)
| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `## 배경` `- 원 요구:` | §1 | §2 | 반영 |
| ② 문제·영향 | `## 문제` | §1·§2 | §5 | 반영 |
| ③ 제안 결과 | `## 제안 결과` | §4 FR-3~5·§8 | §3 | 반영 |
| ④ 영향 시스템·`경로:라인` | `## 영향` + `- 참조:` | §3(재실존 0건 불일치) | §2 | 반영 |
| ⑤ 제약·불변 계약 | `## 제약` | §5 NFR-1·2·§7 | §5 | 반영 |
| ⑥ 결정 D-n·폐기 대안 | `- D-01`·`- D-02` | §9 결정 | §5 | 반영 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 Out-of-scope | §5 | 반영 |
| ⑧ 용어·기각 접근 | `- D-02 … 폐기 대안` | §6 UI 문구·§7·§9 D-S1 폐기 대안 | §5 | 반영 |
| ⑨ 환경·재현 | `- 환경·재현:` | §5 NFR-4·§8 AC-7 | §2 Step 6·§4 | 반영 |
| ⑩ 미확정·가정 | `## 미해결 질문`(4/4 `[x]`) | §9 가정·§10 | §5 | 반영 |
| ⑪ 다음 단계·인계 지시 | `- 인계 지시:` | §1·§9 모의 독해 | §3·§6 | 반영 |
- 재실존: intent·spec이 인용한 `경로:라인`은 HEAD `49319db`에서 ±0행으로 확인했다(researcher 실측). `README.md:154`는 섹션 제목이며, 회피책 근거 문장 `:170`을 함께 인용했다.
- 원문 보존: 명령(`pnpm test`·`pnpm lint`·`pnpm typecheck`·`pnpm --filter example-react-vite dev`), 포트 5173, 코드 원문(`el.style.setProperty(property, value, 'important')`), 날짜를 원문 그대로 옮겼다.
- 모의 독해: 통과. 새 세션은 spec §3(위치)·§4(FR)·§6(시그니처 초안)·§7(엣지)과 plan §2(Step)만으로 대화 맥락 없이 구현·검증할 수 있다.

## 10. 미해결 질문 (Open questions)
- [x] intent 미해결 질문 4건(확인 시점·서버 경로·결과 표시·해제 대상)은 intent.md에서 확정됐다(2026-11-17).
- [x] 기대값 정규화·재편집 처리·재전송 `prev`·transition 처리·전송 기록 수명은 §9 D-S1~D-S5 권장안으로 확정했다. 사용자가 이의를 제기하면 해당 D-S를 갱신한다(2026-11-17).
