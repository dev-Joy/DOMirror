# Spec: 화면 위 코멘트 작성과 GitHub Issues·Slack 연동
- Intent: [INT-005](intent.md) | Status: active | 작성일: 2026-11-17
- Intent updated_at: 2026-11-17T21:12:37+09:00

## 1. 개요
- 원 요구: IDEA-20261115-04 "화면 위 원하는 자리에 코멘트를 남기고 GitHub Issues·Slack으로 연동". 출처는 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 코멘트 기능이며, INT-001에서 범위 밖으로 둔 기능을 이 intent로 따로 진행한다(intent D-02).
- 문제: 화면을 보며 발견한 수정 의견을 그 위치에 남길 방법이 없다. 현재 전달 모델은 CSS 변경 값만 담는 `StyleChange`(`packages/shared/src/types.ts:13`)라서 자유 서술 의견을 담지 못한다.
- MVP 목표(intent 미해결 질문 5건 답변으로 확정):
  - 사용자가 선택한 요소에 코멘트를 작성하고, 화면 위에 핀으로 표시한다.
  - 코멘트는 익스텐션 → 로컬 서버(127.0.0.1) 메모리에 저장한다.
  - 에이전트는 MCP 도구로 코멘트를 조회한다.
  - 코멘트의 고정 기준은 요소 소스 위치(`data-domirror`)·`selectorHint`·페이지 URL이다. 스크린샷은 첨부하지 않는다.
- GitHub Issues·Slack 연동과 자격 증명 보관은 후속 단계로 미룬다. intent 제목은 최종 목표를 가리키며, 이 spec은 MVP 범위만 다룬다.
- 인계 지시(intent): 미해결 질문 확정 후 `z_skill_intent_to_specplan` → 이 문서와 plan.md가 그 산출물이다.

## 2. 범위 (In-scope / Out-of-scope)
- In-scope
  - shared: 코멘트 타입 `ScreenComment`·`ScreenCommentInput`, 요청·응답 타입, 경로 상수 `COMMENTS_PATH`
  - server: `POST /comments` 라우트, zod 스키마, 메모리 저장소 `CommentStore`, MCP 조회 도구 `list_comments`
  - extension: 패널의 코멘트 입력 UI, 전송 메시지 타입·서비스 워커 가드, relay 전송, 화면 위 코멘트 핀 표시
  - README: 사용법과 보안·운영 섹션에 코멘트 항목 추가
  - 테스트: 서버 저장소·라우트·MCP 도구 통합 테스트, extension relay·메시지 가드 단위 테스트
- Out-of-scope
  - GitHub Issues·Slack 연동, 외부 API 호출, 토큰·웹훅 저장(intent 미해결 질문 1·3 답변)
  - 스크린샷 첨부(미해결 질문 4 답변)
  - 서버 영속 저장. 재시작 시 소실을 허용한다(미해결 질문 5 답변, `README.md:264`).
  - 에이전트가 코멘트를 읽고 소스를 자동 수정하는 기능(intent 범위 밖·전제)
  - 협업자 간 실시간 공유(intent는 전제하지 않음)
  - 코멘트 편집, 스레드·답글, 작성자 식별(D-S4)
  - 기각된 접근: INT-001 재개(intent D-02 폐기 대안)

## 3. 영향 시스템 · 모듈 · 데이터
- shared
  - `packages/shared/src/types.ts:13` `StyleChange`(14~22행 필드). 코멘트 타입은 이 파일에 `StyleChange`와 같은 형태로 추가한다.
  - `packages/shared/src/types.ts:27` `PostChangesRequest`, `:31` `PostChangesResponse`, `:36` `HealthResponse`, `:42` `ContentToWorkerMessage`(`type:'domirror:send'`), `:50` `SendResult`
  - `packages/shared/src/constants.ts:1` `DOMIRROR_ATTR='data-domirror'`, `:3` `CHANGES_PATH='/changes'`, `:4` `MCP_PATH`, `:5` `HEALTH_PATH`
  - `packages/shared/src/location.ts:2` `SourceLocation`(1부터 셈), `:11` `formatSourceLocation`
  - `packages/shared/src/index.ts:1`~`:3` 재내보내기(types는 `export type *`)
- server (`packages/server`)
  - `packages/server/src/http.ts:91` `createHttpServer(opts:{store; extensionId?})`. 라우트는 if 분기 체인이다: `:107` `/mcp`, `:111` `GET /health`, `:115` `POST /changes` → `:68` `handlePostChanges`, `:126` 404
  - 보안: `http.ts:93` `localhostHostValidation()`(`:99`에서 모든 경로 앞), `http.ts:100` `isOriginAllowed` → 403, `packages/server/src/origin.ts:9` 정의, `http.ts:22` CORS 헤더 미송출
  - 바디 제한: `http.ts:11` `MAX_BODY_BYTES = 1024*1024`, `:37` `readBody`(413), `:69`~`:70` 415, `:76`~`:78` 400(JSON 파싱), `:80`~`:82` 400(zod `issues`)
  - `packages/server/src/schema.ts:6` `StyleChangeInputSchema`(`zod/v4`), `:29` `PostChangesRequestSchema`
  - `packages/server/src/store.ts:4` `ChangeStore`(내부 `Map`, 3행 주석: 영속 저장 없음), `:8` `upsert`, `:15` `listPending`, `:20` `markApplied`, `:35` `pendingCount`
  - `packages/server/src/mcp.ts:19` `createMcpFactory(store)`, `:23`~`:34` `list_pending_changes`, `:36`~`:46` `mark_changes_applied`, `:11` `jsonResult()`
  - `packages/server/src/cli.ts:8` `HOST = '127.0.0.1'`, `:37` `createHttpServer({ store: new ChangeStore(), extensionId })`, `:46` `server.listen(port, HOST, …)`
- extension (`packages/extension`)
  - `packages/extension/manifest.json` MV3, `:7` permissions `activeTab`·`scripting`·`storage`, `:8` host_permissions `http://127.0.0.1/*`. 권한은 바꾸지 않는다(NFR-4).
  - 전송 경로: `content.ts:166` `onSend` → `:182` `chrome.runtime.sendMessage` → `service-worker.ts:6` `isSendMessage` → `service-worker.ts:32`~`:38` `onMessage` → `relay.ts:29` `postChanges`(`:36` URL, `:43` 10초 타임아웃, `:4` `RELAY_TIMEOUT_MS`)
  - 패널: `content.ts:91` `createPanel`(`:93` Shadow DOM, `:95` CSS 결합, `:106` 슬롯, `:113`~`:126` 포트 입력·전송 버튼), `panel.ts:106` `renderEditor`, `panel.ts:158` `renderChanges`, `panel.ts:205` `createSelectionHighlight`(rAF 추적 강조 — 핀 표시 재사용 후보)
  - 선택·위치: `picker.ts:17` `Picker`, `content.ts:268` `select(el)` → `:271` `locate(el)` → `:273` `selectorHint(el)`, `source-locator.ts:27` `locate`, `source-locator.ts:38` `sameSourceSelector`, `:44` `countSameSource`, `:49` `selectorHint`(`:48` 주석: 정확한 선택자 보장 없음)
  - 변경 생성 선례: `content.ts:333` `locate`, `:337` `selectorHint`, `:342` `pageUrl: location.href`
  - 로컬 보관 선례: `storage.ts:6` `changesKey(origin)`(`domirror:changes:<origin>`, `chrome.storage.local`), `:14` `loadEntries`, `:22` `saveEntries`
  - 생명주기: `content.ts:419` `activate`, `:445` `deactivate`
- 테스트: `packages/server/test/store.test.ts:18`, `packages/server/test/http.integration.test.ts:58`(실제 listen 후 MCP Client 호출, `:82` 툴 목록 정확 일치 단언), `packages/extension/test/*.test.ts`(`fake-element.ts` 사용)
- 데이터: 코멘트는 서버 프로세스 메모리에만 있다. 외부 전송 0건.

## 4. 기능 요구사항 (FR-n)
- FR-1 코멘트 작성: 요소를 선택한 상태(`content.ts:268` `select`)에서 패널에 코멘트 입력란과 '코멘트 남기기' 버튼이 보인다. 요소가 선택되지 않았으면 버튼이 비활성이다.
- FR-2 코멘트 고정 정보: 생성된 코멘트에는 `source`(`locate` 결과 file·line·column·inherited), `selectorHint`, `pageUrl`(`location.href`), `body`, `createdAt`(ISO 8601), `id`가 들어간다. 요소에 `data-domirror`가 없으면(`locate`가 `null`) 작성을 막고 이유를 표시한다.
- FR-3 서버 전송: '코멘트 남기기'를 누르면 즉시 content → service worker → `POST /comments`로 보낸다(D-S2). 메시지 타입은 `'domirror:send-comments'`이고 서비스 워커는 별도 가드로 검사한다. 성공·실패는 패널에 표시하며, 실패해도 예외로 화면이 멈추지 않는다(`relay.ts` `{ok:false}` 관례).
- FR-4 서버 저장: `POST /comments`는 `{comments: ScreenCommentInput[]}`를 받아 zod로 검증하고 `CommentStore`에 저장한 뒤 `{accepted, ids}`를 돌려준다. 같은 `id`를 다시 받으면 덮어쓴다(멱등 재전송).
- FR-5 MCP 조회: MCP 도구 `list_comments`(`readOnlyHint`)가 저장된 코멘트 전체를 `{comments: ScreenComment[]}`로 돌려준다(`jsonResult()` 재사용). 코멘트 처리 완료 표시 도구 포함 여부는 §10 Q2로 확정한다.
- FR-6 화면 핀 표시: 작성한 코멘트는 대상 요소 근처에 번호 핀으로 표시되고, 스크롤·레이아웃 변화에 따라 요소를 따라간다(`createSelectionHighlight`의 rAF 추적 방식 재사용). 핀을 누르면 코멘트 본문이 보인다.
- FR-7 패널 목록: 패널에 현재 페이지(`pageUrl` 일치)의 코멘트 목록(번호·소스 위치 `formatSourceLocation`·본문 앞부분·전송 상태)이 보인다.
- FR-8 새로고침 후 복원: 페이지를 다시 열었을 때 핀을 어떻게 복원할지는 §10 Q1로 확정한다.
- FR-9 README: 사용법(코멘트 작성·`list_comments` 조회)과 보안·운영 섹션(`README.md:253`~`:267`)에 "코멘트도 메모리 보관, 재시작 시 소실, 외부 전송 없음"을 추가한다.

## 5. 비기능 요구사항 (NFR-n)
- NFR-1 보안 불변: `POST /comments`도 기존 Host 검증(`http.ts:93`·`:99`)과 Origin 검증(`http.ts:100`)을 그대로 통과해야 한다. 127.0.0.1 바인딩(`cli.ts:8`)과 CORS 미송출(`http.ts:22`)을 바꾸지 않는다(intent 제약, `README.md:255`~`:257`).
- NFR-2 입력 상한: 바디 1MiB 상한(`http.ts:11`)을 공유한다. `body`는 1~2,000자, `selectorHint`·`pageUrl`은 2,048자 이하로 제한한다(D-S3). `CommentStore`는 최대 500건이며 초과 시 가장 오래된 것부터 버린다.
- NFR-3 자격 증명 0건: 토큰·웹훅을 저장·로그·커밋하지 않는다. 외부 네트워크 호출 코드 0건(intent 제약).
- NFR-4 권한 불변: `manifest.json` 권한·host_permissions 변경 0건.
- NFR-5 기존 계약 호환: `StyleChange`·`POST /changes`·`list_pending_changes`·`mark_changes_applied`의 입출력은 바꾸지 않는다. `HealthResponse.pending`은 계속 CSS 변경 수만 센다(D-S5).
- NFR-6 XSS 방지: 코멘트 본문은 `textContent`로만 렌더링한다(`innerHTML` 금지).
- NFR-7 인코딩: 새·수정 파일은 UTF-8(BOM 없음)·LF. 코드 주석·메시지는 기존처럼 한국어.

## 6. 인터페이스 · 데이터 스키마
- (초안) shared 타입 — `packages/shared/src/types.ts`
  ```ts
  export interface ScreenComment {
    id: string;
    source: { file: string; line: number; column: number; inherited: boolean };
    selectorHint: string;
    pageUrl: string;
    body: string;
    createdAt: string;
  }
  export type ScreenCommentInput = ScreenComment; // Q2에서 status를 두면 Omit<ScreenComment,'status'>
  export interface PostCommentsRequest { comments: ScreenCommentInput[] }
  export interface PostCommentsResponse { accepted: number; ids: string[] }
  export interface ContentToWorkerCommentsMessage { type: 'domirror:send-comments'; port: number; comments: ScreenCommentInput[] }
  ```
- (초안) 상수 — `packages/shared/src/constants.ts`: `COMMENTS_PATH = '/comments'`
- (확정) HTTP: `POST /comments`, Content-Type JSON 아니면 415, 파싱 실패 400, 스키마 실패 400+`issues`, 초과 413, Host·Origin 위반 403. 기존 `handlePostChanges`(`http.ts:68`)와 같은 처리 순서.
- (초안) MCP: `list_comments` 입력 없음, 출력 `{comments: ScreenComment[]}`, `annotations: { readOnlyHint: true }`. Q2가 B로 확정되면 `mark_comments_resolved` 입력 `{ids: string[] (min 1)}`, 출력 `{resolved, notFound}`, `idempotentHint`.
- (초안) 서버 구성: `createHttpServer(opts:{store; commentStore; extensionId?})`, `createMcpFactory(store, commentStore)`, `cli.ts:37`에서 `new CommentStore()` 주입.

## 7. 예외 · 엣지 케이스
- E-1 `data-domirror` 없는 요소: 작성 차단 + 안내(FR-2).
- E-2 같은 소스 위치에 요소 여러 개(`countSameSource` > 1): 작성 시에는 선택한 요소 참조에 핀을 단다. 요소 참조를 잃은 뒤 다시 찾을 때는 `sameSourceSelector`의 첫 일치 요소를 쓰고, 목록에 "같은 위치 요소 N개" 표시를 남긴다.
- E-3 조상 위치 상속(`inherited: true`): 그대로 저장하고 목록에 "상속" 표시(기존 `LocationView` 관례).
- E-4 대상 요소가 사라짐(조건부 렌더링·라우트 이동): 핀을 숨기고 목록 항목에 "요소 없음"을 표시한다.
- E-5 서버 미실행·포트 불일치·10초 타임아웃: 패널에 실패 표시, 코멘트는 화면에 남기고 재전송 버튼을 제공한다(같은 `id`로 재전송 → FR-4 멱등).
- E-6 서버 재시작: 서버 쪽 코멘트는 사라진다. 사용자가 다시 보내면 복구된다(Q1이 A면 로컬 보관분으로 재전송 가능).
- E-7 빈 본문·2,000자 초과: 익스텐션에서 막고, 서버 zod도 400으로 거부한다.
- E-8 웹 페이지 Origin의 직접 호출: 403(NFR-1).
- E-9 SPA 경로 변경: `pageUrl` 비교로 현재 페이지 목록만 보이게 한다.

## 8. 수용 기준 (AC-n)
- AC-1 `POST /comments` 정상 요청 → 200 `{accepted:1, ids:[...]}`, 이어서 MCP `list_comments`가 같은 코멘트(필드 6개 동일)를 돌려준다(통합 테스트).
- AC-2 `POST /comments`의 403(Origin·Host)·400(파싱·스키마, 빈 body·2,001자)·413·415가 `/changes`와 같은 방식으로 동작한다(통합 테스트).
- AC-3 `CommentStore` 같은 id 덮어쓰기와 500건 상한(가장 오래된 것 제거) 단위 테스트 통과.
- AC-4 MCP 툴 목록 단언(`http.integration.test.ts:82`)이 새 목록으로 갱신되어 통과하고, 기존 `list_pending_changes`·`mark_changes_applied` 테스트는 수정 없이 통과한다.
- AC-5 서비스 워커 가드가 `'domirror:send-comments'`만 코멘트 전송으로 처리하고, 기존 `'domirror:send'` 경로는 그대로 동작한다(extension 단위 테스트).
- AC-6 브라우저 실측(`examples/react-vite`): 요소 선택 → 코멘트 작성 → 핀 표시·스크롤 추적 → 서버 전송 성공 표시, 콘솔 에러 0건. `<script>` 문자열 본문이 텍스트로만 보인다.
- AC-7 `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build` Exit 0, `manifest.json` diff 0줄, 외부 호스트 호출 코드 0건(`rg -n "https?://(?!127\.0\.0\.1)" packages/*/src` 결과 0건 — PCRE 필요 시 `rg -P`).
- AC-8 README에 코멘트 사용법과 메모리 보관·재시작 소실 문구가 있다.

## 9. 가정과 리스크
- A-1 코멘트 고정 정확도는 `data-domirror` 소스 위치 수준이다. 같은 위치에서 여러 요소가 렌더링되면 재연결이 모호할 수 있다(E-2, `source-locator.ts:44`).
- A-2 `selectorHint`는 사람이 읽는 힌트일 뿐 선택자가 아니다(`source-locator.ts:48`). 재연결에는 쓰지 않는다.
- R-1 INT-004(active, T-01~T-08 미착수)가 `panel.ts:45` `renderLocation`, `picker.ts` 호버 라벨, `content.ts:271`~`:273` 선택 흐름, `content.ts:95` CSS 결합, `shared/constants.ts`를 수정할 예정이다. 같은 파일을 건드리므로 병렬 진행 시 충돌한다. INT-004 이후 착수를 권장하며, 먼저 착수하면 이 spec의 `content.ts` 라인이 밀린다(plan §5).
- R-2 INT-006(planned)과 `panel.ts:158` `renderChanges`·패널 슬롯을 공유한다. 기능 의존은 없다.
- R-3 MCP 툴 추가는 공개 계약 확장이다. 기존 단언(`http.integration.test.ts:82`)이 깨지므로 같은 Step에서 갱신한다.
- R-4 rAF 기반 핀 추적이 코멘트 수만큼 늘면 성능이 떨어질 수 있다. 핀들을 한 rAF 루프에서 갱신한다.
- D-S1 저장소 분리: `CommentStore`를 `ChangeStore`와 별도 클래스로 둔다 / 폐기 대안: `ChangeStore`에 유니온 타입으로 합치기(`listPending`·`markApplied` 의미가 섞임)
- D-S2 전송 시점: 작성 즉시 개별 전송 / 폐기 대안: CSS 변경과 함께 '에이전트에 보내기' 일괄 전송(전송 누락 시 코멘트 유실 인지가 어려움)
- D-S3 입력 상한: body 2,000자, 문자열 2,048자, 저장 500건 / 폐기 대안: 상한 없음(기존 `StyleChangeInputSchema`는 길이 제한 없음 — 자유 서술 필드는 커질 수 있어 상한을 둠)
- D-S4 편집·스레드·작성자 없음 / 폐기 대안: 편집 지원(서버 갱신 계약 추가 필요)
- D-S5 `/health` `pending`은 CSS 변경 수 유지 / 폐기 대안: 코멘트 합산(기존 의미 변경)
- 모의 독해: 새 세션이 §3 위치·§4 FR·§6 초안과 plan Step만으로 구현·검증을 수행할 수 있음 — 판정: 가능(§10 Q1·Q2 확정 후)

| 범주 | intent 기록 위치 | spec 반영 | plan 반영 | 판정 |
| :--- | :--- | :--- | :--- | :--- |
| ① 원 요구·출처 | `- 원 요구:` | §1 | §2 | 기록 |
| ② 문제·영향 | `## 문제` | §1 | §5 | 기록 |
| ③ 제안 결과 | `## 제안 결과` | §1·§4·§8 | §3 | 기록(MVP 축소는 미해결 질문 답변 근거) |
| ④ 영향 시스템·경로:라인 | `## 영향`·`- 참조:` | §3 | §2 | 기록(재실존 ±0 확인: types.ts:13·picker.ts:17·panel.ts:106·source-locator.ts:27·README.md:255~257·:264) |
| ⑤ 제약·불변 계약 | `## 제약` | §5·§7 | §5 | 기록 |
| ⑥ 결정 D-n | `- D-01`·`D-02` | §1·§2·§9(D-S1~D-S5) | §1·§5 | 기록 |
| ⑦ 범위 밖·전제 | `- 범위 밖·전제:` | §2 | §5 | 기록 |
| ⑧ 용어·기각 접근 | `- D-02` 폐기 대안 | §2·§9 | §5 | 기록 |
| ⑨ 환경·재현 | `- 환경·재현:` (해당 사항 없음) | §3·§8(AC-6 실측 환경) | §2·§4 | 기록 |
| ⑩ 미확정·가정 | `## 미해결 질문`(5건 답변)·`## 제약`(미확정) | §9·§10 | §5 | 기록 |
| ⑪ 인계 지시 | `- 인계 지시:` | §1 | §3·§6 | 기록 |

## 10. 미해결 질문 (Open questions)
- [x] Q1 페이지 새로고침·재방문 후 코멘트 핀을 어떻게 복원하는가? (A) 익스텐션 `chrome.storage.local`에 origin별 보관(기존 `storage.ts:6` `changesKey` 관례, 권장) / (B) 서버에 `GET /comments` 추가해 재조회(서버 재시작 시 함께 소실) / (C) 복원하지 않음(현재 세션 동안만 표시) → 답변: (A) 익스텐션 `chrome.storage.local` origin별 보관·활성화 시 복원 (2026-11-17)
- [x] Q2 에이전트가 코멘트를 처리 완료로 표시하는 MCP 도구(`mark_comments_resolved`)를 MVP에 포함하는가? (A) 미포함 — `list_comments`만 / (B) 포함 — `status: 'open'|'resolved'`와 표시 도구 추가, `list_comments`는 open만 반환(`mark_changes_applied` 대칭, 권장) → 답변: (B) 포함 — `status: 'open'|'resolved'`·`mark_comments_resolved` 추가, `list_comments`는 open만 반환 (2026-11-17)
