---
id: INT-005
title: 화면 위 코멘트 작성과 GitHub Issues·Slack 연동
status: done
priority: P2
created: 2026-11-17
updated: 2026-11-17
updated_at: 2026-11-17T23:04:22+09:00
---

# Intent: 화면 위 코멘트 작성과 GitHub Issues·Slack 연동

## 문제 (Problem)
- 브라우저 화면을 보며 발견한 수정 의견을 그 위치에 남길 방법이 없다. 의견을 GitHub Issues나 Slack에 공유하려면 화면 캡처·요소 설명·소스 위치를 사람이 따로 옮겨 적어야 한다.
- DOMirror의 현재 전달 경로는 CSS 변경 값(속성·이전값·새 값)뿐이라 자유 서술 의견을 담지 못한다(`packages/shared/src/types.ts:13` `StyleChange`).
- 영향 대상: DOMirror로 화면을 점검하는 프런트엔드 개발자(요청자 본인). 의견을 받는 협업자 포함 여부는 미확정.

## 제안 결과 (Proposed outcome)
- 사용자가 화면 위 원하는 자리에 코멘트를 남길 수 있다.
- 남긴 코멘트가 GitHub Issues 또는 Slack으로 전달되어, 받는 쪽에서 코멘트와 해당 화면 위치(요소·소스 위치)를 확인할 수 있다.

## 영향 사용자 및 시스템 (Affected users and systems)
- 사용자: DOMirror 사용자, 코멘트를 받는 GitHub 저장소·Slack 채널 참여자(범위 미확정).
- 익스텐션: 요소 선택 `packages/extension/src/picker.ts:17`(`Picker`), 패널 `packages/extension/src/panel.ts:106`(`renderEditor`), 소스 위치 해석 `packages/extension/src/source-locator.ts:27`.
- 로컬 서버: `127.0.0.1` 전용 바인딩·Host/Origin 검증(`README.md:255`~`:257`), 변경 내역은 메모리 보관(`README.md:264`).
- 외부 서비스: GitHub Issues, Slack(연동 방식 미확정).

## 제약 (Constraints)
- 로컬 서버의 보안 원칙(127.0.0.1 전용, 웹 페이지 Origin 거부 — `README.md:255`~`:257`)을 약화하지 않는다.
- 외부 서비스 자격 증명(GitHub 토큰·Slack 웹훅 등)은 파일·로그·커밋에 노출하지 않는다(전역 보안 규칙).
- 연동 방식·저장 위치: (미확정 — 미해결 질문)

## 배경 · 결정 · 참조 (Context handoff)
- 원 요구: IDEA-20261115-04 "화면 위 원하는 자리에 코멘트를 남기고 GitHub Issues·Slack으로 연동" (출처: _ideas IDEA-20261115-04, 웍스피어 블로그 "피그마 대신 코드로 디자인하면 어떨까"의 코멘트 기능, INT-001 연계)
- D-01: 우선순위 P2 — 근거: 사용자 미지정, 긴급 표현 없음
- D-02: INT-001에서 범위 밖으로 둔 블로그 기능을 별도 intent로 진행 — 근거: INT-001 D-03 / 폐기 대안: INT-001 재개
- 참조: `README.md:264` 서버 재시작 시 대기 내역 소실(코멘트를 같은 저장소에 두면 같은 제약), `packages/shared/src/types.ts:13` 현재 전송 모델은 CSS 변경 전용
- 참조(외부): 블로그 기능 요약은 INT-001 `intent.md`의 「참조(외부)」 줄(화면 위 코멘트 → GitHub Issues·Slack)에만 근거하며 본문 재확인 없음
- 범위 밖·전제: 코멘트를 에이전트가 읽어 소스에 반영하는 자동 수정은 범위 밖(전달까지). 협업자 간 실시간 공유 여부는 전제하지 않음
- 환경·재현: (해당 사항 없음)
- 인계 지시: 미해결 질문(특히 MVP 범위·연동 방식·자격 증명 보관) 확정 후 `z_skill_intent_to_specplan`
- 관련 intent: INT-006

## 미해결 질문 (Open questions)
- [x] MVP 범위는? (코멘트 작성·화면 표시만 / GitHub Issues 연동까지 / Slack까지 모두) → 답변: 코멘트 작성·화면 표시만(GitHub Issues·Slack 연동은 후속 단계, MVP 범위 밖) (2026-11-17)
- [x] 연동 방식은? (익스텐션이 직접 API 호출 / 로컬 서버 경유 / MCP로 에이전트가 생성 / `gh` CLI, Slack은 Incoming Webhook / 앱 토큰) → 답변: MVP는 익스텐션 → 로컬 서버(127.0.0.1) 저장 → 에이전트가 MCP 도구로 조회(외부 서비스 연동 방식은 후속에서 결정) (2026-11-17)
- [x] 외부 서비스 자격 증명은 어디에 두고 누가 쓰는가? (익스텐션 저장소 / 로컬 서버 환경 변수 / 에이전트 측 설정) → 답변: MVP 범위 밖 — MVP에서는 토큰을 저장하거나 쓰지 않으며, 외부 연동 도입 시 결정 (2026-11-17)
- [x] 코멘트는 무엇에 고정하는가? (요소의 소스 위치 `data-domirror` / 화면 좌표·페이지 URL / 스크린샷 첨부 여부) → 답변: 요소 소스 위치(`data-domirror`)·`selectorHint` + 페이지 URL(스크린샷 첨부 없음) (2026-11-17)
- [x] 코멘트를 로컬에도 보관하는가? 보관한다면 서버 재시작 시 소실(`README.md:264`)을 허용하는가? → 답변: 서버 메모리 보관, CSS 변경 큐와 동일하게 재시작 시 소실 허용 (2026-11-17)

## 작업 (Tasks)
- [x] T-01 [P2] shared 타입·상수: `ScreenComment`·`ScreenCommentInput`(status 제외)·`PostCommentsRequest`·`PostCommentsResponse`·`ContentToWorkerCommentsMessage` 타입과 `COMMENTS_PATH` 상수, index 재내보내기 (plan Step 1) (2026-11-17)
- [x] T-02 [P2] server 저장소·라우트: `CommentStore`(upsert·list·markResolved·500건 상한)·zod 스키마·`POST /comments`·`createHttpServer` opts·cli 주입 (Step 2~3) (2026-11-17)
- [x] T-03 [P2] MCP 도구: `list_comments`(open만)·`mark_comments_resolved`·`createMcpFactory` 인자 확장·통합 테스트 툴 목록 갱신 (Step 4) (2026-11-17)
- [x] T-04 [P2] extension 전송: `relay.postComments`·service worker `isSendCommentsMessage` 가드·`onMessage` 분기·단위 테스트 (Step 5) (2026-11-17)
- [x] T-05 [P2] extension UI: 패널 코멘트 입력·목록·전송 상태, 화면 핀·단일 rAF 추적, `commentsKey` 로컬 보관·activate 복원, `content.ts` 연결 (Step 6) (2026-11-17)
- [x] T-06 [P2] README·종단 검증: 사용법·MCP 도구 목록·보안·운영 갱신 (Step 7, AC-6·AC-7) (2026-11-17)

## 결과
- 완료일: 2026-11-17.
- 빌드 시 요소 소스 위치 기반 코멘트 작성·화면 번호 핀·`chrome.storage.local` 복원, 서버 `POST /comments`·`CommentStore`(500건), MCP `list_comments`·`mark_comments_resolved` 구현.
- Tier 3 검증 Pass(AC-1~AC-8). 정합성 필수(하드) 2-pass: 1차 FAIL(스테일 주석) → 수정 후 2차 PASS_WITH_NOTES(비차단 NOTE 6).
- 상세: [result.md](result.md)
