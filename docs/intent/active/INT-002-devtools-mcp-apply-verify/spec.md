# Spec: chrome-devtools-mcp로 소스 반영 결과 자동 확인 (워크플로 문서화)
- Intent: [INT-002](intent.md) | Status: planned | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T12:06:29+09:00

## 1. 개요
- 원 요구: "ChromeDevTools/chrome-devtools-mcp 이거 참조해봐. 새 프로젝트에 적용하려는 것과 연관성이 있어." (대화 요청, 2026-11-17). 질문 카드 3건으로 적용 대상 DOMirror, 방식 "반영 결과 자동 확인", 완료 형태 "README 워크플로 문서화(코드 변경 0건)"가 확정됐다(intent D-01·D-02).
- 문제: 현재 종단 흐름의 마지막 단계는 사람이 새로고침해 확인한다(`README.md:163`). 에이전트는 화면을 보지 않고 `mark_changes_applied`를 호출하므로 화면 값이 `after`와 달라도 반영 완료로 표시될 수 있다.
- 목표: README만 고쳐서, 에이전트가 chrome-devtools-mcp로 실제 화면의 계산값을 `after`와 비교하고 일치한 항목만 반영 완료로 표시하는 워크플로를 안내한다.
- 인계: 이 문서와 `plan.md`만으로 새 세션이 README 수정과 검증을 수행할 수 있게 작성했다(§9 대조표).

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - `README.md`의 `## 4. Claude Code에 서버 등록`(`README.md:126`)에 chrome-devtools-mcp 병행 등록 안내 추가
  - 검증 포함 프롬프트 예와 검증 스니펫(브라우저에서 실행할 JS) 추가
  - `## 사용법`(`README.md:154`) 8단계에 자동 확인 경로 병기
  - `## 보안·운영 주의`(`README.md:167`)에 chrome-devtools-mcp 관련 주의 추가
  - `## 수동 확인 체크리스트`(`README.md:196`)에 자동 확인 종단 항목 1건 추가
- Out-of-scope (intent 범위 밖·전제)
  - `packages/*`·`examples/*` 코드 변경, MCP 도구 계약·`StyleChange` 스키마 변경
  - 익스텐션 없이 위치 찾기, 수동 체크리스트 E2E 자동화, domirror-server 설계 참고(D-01 폐기 대안)
  - chrome-devtools-mcp를 DOMirror 의존성으로 추가하거나 설치·버전을 관리하는 일(사용자 몫)

## 3. 영향 시스템 · 모듈 · 데이터
- 변경 파일: `README.md` 1개.
- 참조 위치(변경 없음, 2026-11-17 HEAD `da24fd1` 실측)
  - `README.md:131` `claude mcp add --transport http domirror http://127.0.0.1:47321/mcp` (코드펜스 130-132)
  - `README.md:143` `StyleChange` 주요 필드 줄, `README.md:145` "에이전트에게 줄 프롬프트 예:", 프롬프트 코드펜스 147-152
  - `README.md:163` 사용법 8단계 "페이지를 새로고침해 소스 반영 결과를 확인합니다."
  - `README.md:189` "전송이 성공하면 … 페이지에는 보낸 값이 그대로 보입니다."
  - `packages/shared/src/types.ts:13` `StyleChange`(`id`·`source{file,line,column,inherited}`·`selectorHint`·`property`·`before{authored,computed}`·`after`·`pageUrl`·`createdAt`·`status`)
  - `packages/server/src/mcp.ts:24` `list_pending_changes`(입력 없음 → `{ changes }`), `packages/server/src/mcp.ts:37` `mark_changes_applied`(`{ ids }` 1개 이상 → `{ applied, notFound }`)
  - `packages/shared/src/constants.ts:1` `DOMIRROR_ATTR = 'data-domirror'`, `packages/shared/src/location.ts:12` 값 형식 `${file}:${line}:${column}`(Vite 루트 기준 posix 상대 경로)
  - `packages/extension/src/applier.ts:40` 편집값을 `el.style.setProperty(property, value, 'important')`로 적용, `packages/extension/src/edit-tracker.ts:50` 전송 성공 후에도 페이지 표시는 보낸 값 그대로
  - `examples/react-vite/vite.config.ts:7` dev 포트 5173, `examples/vue-vite/vite.config.ts:7` dev 포트 5174
- 외부: ChromeDevTools/chrome-devtools-mcp(Apache-2.0). 사용 도구 `new_page`·`navigate_page`·`wait_for`·`evaluate_script`·`take_screenshot`. 2026-11-17 README·docs 조회 기준.

## 4. 기능 요구사항 (FR-n)
- FR-1 등록 안내: README §4에 chrome-devtools-mcp를 domirror와 함께 등록하는 명령을 추가한다. 권장 플래그는 `--isolated`(임시 프로필, 종료 시 삭제), `--no-usage-statistics`, `--no-performance-crux`이며, 플래그별 이유를 1줄씩 적는다.
- FR-2 검증 컨텍스트: 비교는 chrome-devtools-mcp가 띄운 별도 브라우저(DOMirror 익스텐션 없음)에서 `pageUrl`을 새로 열어 수행하도록 안내한다. 근거: 익스텐션이 켜진 탭은 보낸 값이 인라인 `!important`로 남아(`applier.ts:40`, `edit-tracker.ts:50`) 소스 반영 실패를 가린다.
- FR-3 검증 프롬프트 예: 기존 프롬프트 예(`README.md:147-152`)를 대체하거나 그 아래에 "자동 확인 포함" 예를 추가한다. 순서: `list_pending_changes` → 소스 반영 → 파일 저장 후 `pageUrl` 열기(이미 열려 있으면 다시 불러오기) → 항목마다 검증 스니펫 실행 → 판정별 처리.
- FR-4 검증 스니펫: README에 `evaluate_script`로 실행할 JS 1개를 싣는다. 입력은 `source`(문자열 `file:line:column`)·`property`·`after`이고 출력은 `{ status, expected, actual[], count }`이다. 동작은 다음과 같다.
  - `[data-domirror="<source>"]` 요소를 모두 찾는다.
  - `after`를 임시 요소에 적용해 브라우저 정규화 값(`expected`)을 구한다.
  - 각 요소의 `getComputedStyle(...).getPropertyValue(property)`와 비교한다.
- FR-5 판정 규칙: 판정별 처리는 아래와 같다.
  - `match`: 모든 요소가 `expected`와 같다. 해당 id만 `mark_changes_applied`로 표시한다.
  - `mismatch`: 하나라도 다르다. 표시하지 않고, 기대값·실제값과 함께 사용자에게 보고한다.
  - `unverifiable`: 요소 0개이거나 `source.inherited === true`다. 표시하지 않고 사유와 함께 보고한다.
  - 불일치·검증 불가 항목은 대기 상태로 남는다.
- FR-6 사용법 갱신: `README.md:163` 8단계에 "chrome-devtools-mcp를 등록했다면 에이전트 보고로 확인(새로고침 생략 가능)"을 병기한다. 미등록 사용자의 기존 흐름은 그대로 둔다.
- FR-7 보안 주의: `## 보안·운영 주의`에 다음 3가지를 추가한다.
  - 페이지 내용·쿠키가 에이전트에 노출된다.
  - `--browser-url`·`--autoConnect`로 평소 쓰는 Chrome에 붙이지 말라는 권고. 디버깅 포트를 열면 같은 컴퓨터의 다른 프로그램도 브라우저를 조작할 수 있다.
  - 사용 통계·CrUX 전송은 기본으로 켜져 있으니 FR-1 플래그로 끈다.
- FR-8 체크리스트: `## 수동 확인 체크리스트`에 "chrome-devtools-mcp 등록 상태에서 에이전트가 일치 항목만 반영 완료로 표시하고 불일치 항목을 보고한다" 1건을 추가한다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 코드 무변경: `git diff --stat -- packages examples` 출력 0줄.
- NFR-2 문서 형식: README는 UTF-8(BOM 없음)·LF·CR 0건을 유지한다. 기존 섹션 순서와 헤딩 번호(`## 1.`~`## 4.`)를 유지한다.
- NFR-3 사실 정확성: chrome-devtools-mcp 도구명·플래그는 구현 시점에 upstream README·`docs/tool-reference.md`로 재확인하고, README에 "확인 기준일"을 1줄 남긴다.
- NFR-4 에이전트 중립: 등록 명령은 Claude Code 예를 들되 "MCP 지원 에이전트면 동일"을 유지한다(INT-001 원칙 계승).

## 6. 인터페이스 · 데이터 스키마
- 확정: 사용 데이터는 기존 `StyleChange` 필드(`id`·`source`·`property`·`after`·`pageUrl`)뿐이며 스키마 변경 0건.
- 초안(구현 시 upstream으로 재확인): 등록 명령
  ```sh
  claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --isolated --no-usage-statistics --no-performance-crux
  ```
- 초안: 검증 스니펫 출력 계약
  ```text
  { status: 'match' | 'mismatch' | 'unverifiable', expected: string, actual: string[], count: number, reason?: string }
  ```
- 초안: `source` 문자열 = `${file}:${line}:${column}` (`location.ts:12` 형식과 동일), 선택자 = `[data-domirror="<CSS.escape 처리한 source>"]`

## 7. 예외 · 엣지 케이스
- E-1 익스텐션 켜진 탭에서 비교: 인라인 `!important`가 남아 거짓 일치가 발생한다. FR-2로 별도 브라우저를 쓰게 하고 README에 이유를 명시한다.
- E-2 값 표기 차이(`#fff` ↔ `rgb(255, 255, 255)`, `1rem` ↔ `16px`): 임시 요소 정규화(FR-4)로 비교한다. 정규화해도 다른 경우는 `mismatch`로 보고한다(추론, 구현 시 예제로 확인).
- E-3 같은 소스의 여러 요소(`README.md` 알려진 한계 "같은 소스의 여러 요소"): 모든 요소가 같아야 `match`이고 `count`를 보고한다.
- E-4 `source.inherited === true`(조상 위치 사용): 요소를 특정할 수 없으므로 `unverifiable`로 처리한다.
- E-5 상태 의존 값(`:hover` 등)이나 로그인·앱 상태가 필요한 페이지: 별도 임시 프로필에서 재현되지 않으면 `unverifiable` 또는 `mismatch`가 될 수 있다. 보고만 하고 표시하지 않는다.
- E-6 HMR·저장 지연: 파일 저장 직후 `navigate_page`로 다시 불러오고 `wait_for`(또는 짧은 재시도 1회)를 쓴 뒤 비교하도록 안내한다.
- E-7 dev 서버 미실행·주입 꺼짐(`DOMIRROR` 미설정): 요소 0개 → `unverifiable`, 사유에 "주입 켠 dev 서버 필요"를 적는다.
- E-8 shorthand 속성(`padding` 등): `getPropertyValue`가 빈 문자열이면 `unverifiable`로 처리한다.
- E-9 chrome-devtools-mcp 미등록: 기존 흐름(새로고침 확인)을 그대로 쓴다(FR-6).

## 8. 수용 기준 (AC-n)
- AC-1 (FR-1·NFR-4): README §4에 `chrome-devtools-mcp`, `--isolated`, `--no-usage-statistics`, `--no-performance-crux`가 각 1회 이상 있다(`rg -n` 확인).
- AC-2 (FR-3·FR-5): README 프롬프트 예에 `list_pending_changes`·`evaluate_script`·`mark_changes_applied`와 "불일치·검증 불가는 표시하지 않고 보고" 규칙이 있다.
- AC-3 (FR-4·E-2·E-3): README의 검증 스니펫을 주입을 켠 React 예제 dev 서버(5173)에서 브라우저 도구로 실행했을 때 3가지 결과가 나온다.
  - 현재 값을 `after`로 주면 `match`(정규화 표기 `#fff`형 포함)
  - 다른 값을 주면 `mismatch`
  - 없는 `source`를 주면 `unverifiable`
- AC-4 (FR-2·E-1): 같은 페이지에서 익스텐션 방식처럼 인라인 `!important`를 설정한 상태와 새로 연 페이지의 결과 차이를 확인하고, README의 "별도 브라우저" 안내 근거를 실측 1줄로 남긴다(검증 보고에 기록).
- AC-5 (FR-6·FR-7·FR-8): README 사용법 8단계 병기, 보안 주의 3항목, 체크리스트 1건이 있다.
- AC-6 (NFR-1·NFR-2): `git diff --stat -- packages examples` 0줄, README CR 0건·BOM 없음.

## 9. 가정과 리스크
- A-1 chrome-devtools-mcp 도구명·플래그(`--isolated`·`--no-usage-statistics`·`--no-performance-crux`·`evaluate_script` 등)는 2026-11-17 조회 기준이다. 버전에 따라 바뀔 수 있다(NFR-3으로 완화).
- A-2 계산값 정규화 비교(E-2)는 추론이다. AC-3에서 실측한다.
- R-1 종단 실행(에이전트 + 두 MCP)은 이 환경에 chrome-devtools-mcp가 설치되어 있지 않아 자동 검증하지 못할 수 있다. AC-3은 동일 스니펫을 브라우저 도구로 실행해 대체하고, 종단은 FR-8 수동 체크리스트로 남긴다.
- R-2 익스텐션을 끈 뒤 전송 완료 항목이 원복되는지는 미확인이다(researcher 보고). 그래서 "같은 탭에서 끄고 비교"가 아닌 "별도 브라우저"를 권장안으로 정했다.
- D-S1 연결 방식 권장: 기본 실행 + `--isolated` / 폐기 대안: `--browser-url`·`--autoConnect`(평소 브라우저 노출, 익스텐션 인라인 값 오염)
- D-S2 반영 대기: `navigate_page` 재로딩 + `wait_for` / 폐기 대안: 고정 sleep
- 모의 독해: 새 세션이 spec §3 위치와 §4 FR, plan Step만으로 README 수정·AC-3 실측을 수행할 수 있음 — 판정: 가능

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과` | §4·§8 | §3 | 기록 |
| ④ 영향 시스템·경로:라인 | `## 영향`·`- 참조:` | §3 | §2 | 기록(재실존 ±0 확인) |
| ⑤ 제약·불변 계약 | `## 제약` | §5·§7 | §5 | 기록 |
| ⑥ 결정 D-n | `- D-01`~`D-03` | §9(D-S1·D-S2) | §5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | `- D-01`·`D-02` 폐기 대안 | §2·§9 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:` | §3·§8 | §2·§4 | 기록 |
| ⑩ 미확정·가정 | `## 제약`(가정) | §9·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:` | §1·§9 | §3·§6 | 기록 |

## 10. 미해결 질문 (Open questions)
- 없음
