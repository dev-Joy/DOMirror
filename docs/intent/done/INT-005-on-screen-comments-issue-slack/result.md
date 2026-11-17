# Result: 화면 위 코멘트 작성과 GitHub Issues·Slack 연동
- Intent: [INT-005](intent.md) | 완료일: 2026-11-17 | Tier: 3 (자동 판정) | Spec/Plan: [spec.md](spec.md) · [plan.md](plan.md)

## 결과 요약
- 화면 요소를 골라 소스 위치(`data-domirror`) 기반 코멘트를 작성하고, 번호 핀으로 화면에 표시하며 `chrome.storage.local`로 재활성화 후 복원한다.
- 익스텐션 → 로컬 서버 `POST /comments`(`CommentStore` 500건 상한, 재시작 시 소실 허용) → MCP `list_comments`·`mark_comments_resolved`로 에이전트가 조회·완료 처리한다.
- GitHub Issues·Slack 실제 연동은 MVP 범위 밖으로 후속 이관(사용자 확정).

## 변경 산출물
| 경로 | 변경 | 핵심 내용 1줄 |
| :--- | :--- | :--- |
| `packages/shared/src/types.ts` | 수정 | `ScreenComment`·`ScreenCommentInput`(`Omit<ScreenComment,'status'>`)·`PostCommentsRequest/Response`·`ContentToWorkerCommentsMessage` 추가 |
| `packages/shared/src/constants.ts` | 수정 | `COMMENTS_PATH` 상수 추가 |
| `packages/server/src/comment-store.ts` | 신규 | upsert·list·markResolved와 500건 상한 메모리 저장소 |
| `packages/server/src/schema.ts` | 수정 | 코멘트 요청 zod 스키마 |
| `packages/server/src/http.ts` | 수정 | `POST /comments` 라우트(기존 Host·Origin 검증 유지) |
| `packages/server/src/cli.ts` | 수정 | `CommentStore` 생성·`createHttpServer` opts 주입 |
| `packages/server/src/mcp.ts` | 수정 | `list_comments`(open만)·`mark_comments_resolved` 도구 |
| `packages/extension/src/message-guard.ts` | 수정 | `isSendCommentsMessage` 가드 |
| `packages/extension/src/relay.ts` | 수정 | `postComments` 전송 |
| `packages/extension/src/service-worker.ts` | 수정 | `onMessage` 코멘트 분기 |
| `packages/extension/src/storage.ts` | 수정 | `commentsKey` 로컬 보관·복원 |
| `packages/extension/src/comment-log.ts` | 신규 | 코멘트 목록·전송 상태 관리 |
| `packages/extension/src/comment-ui.ts` | 신규 | 패널 입력·목록·상태 표시 |
| `packages/extension/src/panel.ts` | 수정 | 코멘트 UI 연결 |
| `packages/extension/src/content.ts` | 수정 | 번호 핀·단일 rAF 추적·activate 복원 |
| 테스트 3종(신규) | 신규 | `comment-store`·`POST /comments`·MCP 코멘트 도구 단위·통합 테스트 |
| `README.md` | 수정 | 코멘트 사용법·MCP 도구 목록·보안·운영 주의 |
| `git diff --shortstat 235df8e..HEAD -- packages examples README.md` | — | **21 files changed, 1606 insertions(+), 71 deletions(-)** |

## 검증 결과
| 항목 | 결과 | 증거(출처) |
| :--- | :--- | :--- |
| 설계 (`code-planner`) | 완료 | [plan.md](plan.md) §1 Tier 3 산정·§2 실행 순서 |
| 정적 분석·린트 | Pass | `pnpm typecheck` · `pnpm lint` Exit 0 |
| 단위·통합 테스트 | Pass | `pnpm test` Exit 0 — **24 files / 272 tests** |
| 빌드 | Pass | `pnpm build` Exit 0 |
| 수용 기준 | Pass | AC-1~AC-8 전건 PASS(spec §8 대조) |
| 브라우저 검증(ego-browser) | Pass(부분 한계) | 익스텐션 로드 미지원 → 빌드 `content.js` + `chrome` 셰임 주입: 선택→코멘트 작성→서버 저장→번호 핀→스크롤 추적→핀 클릭 본문→`<script>` 텍스트 처리(script 수 불변)→새로고침 후 재활성화 복원→콘솔 에러 0 |
| 회귀(기존 기능) | Pass | 색상 편집·변경 내역·전송 잠금 정상 / 핀 고정(`029c590`): 같은 소스 4개 중 3·4번째에 각각 고정, 재활성화 후 첫 일치 폴백 |
| 전역 배포(sync/Status)·인코딩 | 미수행(사유: 애플리케이션 저장소로 배포 자산 경로·`sync` 대상 아님) | 해당 없음 |
| 정합성 게이트 | 필수(하드) / 근거: ① Tier 3 + ② 공개 계약(`POST /comments`·MCP 도구) 확장 / 방식: 2-pass / 미검증: 해당 없음 | 오케스트레이터 §A 판정 기록 |

### conformance-reviewer NOTE (모두 비차단)
1. `intent.md` T-01 문구가 실제 확정 타입(`Omit<ScreenComment,'status'>`)과 불일치 — 본 전이에서 "status 제외"로 정정.
2. README 코멘트 복원 전제 문구가 실제 동작(재활성화 시 복원)과 어긋남 — `9c73f40`에서 정정.
3. README "수정" 표현 → "작성" — `9c73f40`에서 정정.
4. AC-7 grep 적중 2건은 기동 로그·주석으로 기능 위반 아님.
5. 2048자 초과 페이지는 전송 실패로 남음(스펙상 상한 규정대로 동작).
6. 501건 배치 요청의 `accepted`는 501로 응답하나 저장은 500건(스펙 허용 범위).

### 정합성 검증 이력
- 1차(순방향): **FAIL** — 스테일 주석 2곳(로직 결함 0건), FR·NFR·AC 24건은 PASS. → `66f53b1`로 주석 및 spec FR-5 정정.
- 2차(반증 전용, 1차 리포트 입력 배제): **PASS_WITH_NOTES** — 반증 25건 검토, 신규 결함 0건, NOTE 6건(모두 비차단).

### 사용자 결정·옵트아웃
- 사용자 결정: MVP 범위는 코멘트 작성·화면 표시까지, GitHub Issues·Slack 연동은 후속(intent 미해결 질문 5건 확정).
- 정합성 옵트아웃: 없음(필수(하드) 2-pass 전건 수행).

## 잔여 리스크 및 후속
- 서버 재시작 시 서버 사본 소실 — 익스텐션 사본(`chrome.storage.local`)으로 재전송 가능.
- 다중 탭에서 같은 코멘트를 편집하면 마지막 저장이 우선.
- 같은 소스 위치 요소가 여러 개면 재활성화 후 첫 일치 요소로 폴백(같은 위치 요소 N개에 배지 표시).
- 실제 Chrome에서 service-worker 실행 경로는 셰임 한계로 단위 테스트로만 검증 — README 수동 체크리스트에 항목 기재.
- 후속: GitHub Issues·Slack 연동, [INT-006](../../planned/INT-006-copy-ai-implementation-prompt/intent.md)(패널 목록 영역 공유), [INT-008](../../planned/INT-008-release-inline-override-after-apply/intent.md)(인라인 `!important` 원복).
- 롤백: `git revert` 또는 `git checkout 235df8e -- packages README.md`.

## 참조
- 요구: [intent.md](intent.md) · 명세: [spec.md](spec.md) · 계획: [plan.md](plan.md)
- 커밋: `235df8e`(착수 전이) · `3d7806e`(shared 타입) · `35df07b`(CommentStore) · `d83bb4c`(POST /comments) · `bf4fc00`(MCP 도구) · `bd2a27d`(전송 경로) · `4bee50e`(패널 UI·핀) · `869d5b5`(README) · `029c590`(핀 고정) · `66f53b1`(스테일 주석·spec FR-5 정정) · `9c73f40`(README 문구 정정)
- 워크로그: 미기록(저장소에 `docs/works/` 없음)
